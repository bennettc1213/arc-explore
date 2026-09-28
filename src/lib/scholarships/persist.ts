/**
 * Turns parsed scholarship listings into database writes.
 *
 * Scholarship sources provide full snapshots rather than incremental polls,
 * but the close/reopen lifecycle is the same as the ATS path: a row must be
 * absent on two consecutive successful scrapes before it is closed, and
 * `closed_at` is the first-miss time. A completely empty snapshot suppresses
 * closes and misses because it almost always means the scrape broke.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { timestamptz } from "@/db/fragments";
import { postingSources, postings } from "@/db/schema";
import { canonicalHash, normalizeTitle } from "../ingest/normalize";
import { recordEvent } from "../analytics/record";

import { isContentMarketing } from "./classify";
import { selectPostingsToClose, type CloseCandidate } from "./close";
import type { ScholarshipListing, ScholarshipSource } from "./types";
import {
  assessTrust,
  lotteryReasonsForStorage,
  trustReasonsForStorage,
  type TrustInput,
} from "./trust";

export interface ScholarshipPersistResult {
  inserted: number;
  updated: number;
  closed: number;
  reopened: number;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const POSTINGS_BATCH = 500;

/**
 * Upsert one source's full listing snapshot.
 *
 * Runs in a transaction so a failure partway through never leaves some
 * listings updated and the close-on-removal step un-run against a half
 * applied set.
 */
export async function persistScholarships(
  source: ScholarshipSource,
  listings: ScholarshipListing[],
): Promise<ScholarshipPersistResult> {
  return db.transaction(async (tx) => {
    let inserted = 0;
    let updated = 0;
    const now = new Date();
    const seenHashes: string[] = [];
    const openHashes = new Set<string>();
    const idByHash = new Map<string, string>();

    const rows = listings.map((l) => {
      const hash = canonicalHash({
        companyName: l.sponsorName,
        title: l.title,
        locations: [],
        term: null,
      });
      seenHashes.push(hash);
      if (l.isOpen) openHashes.add(hash);

      const contentMarketing = isContentMarketing({
        sponsorName: l.sponsorName,
        amountMin: l.amountMin,
        amountMax: l.amountMax,
      });

      return {
        hash,
        listing: l,
        contentMarketing,
        closedAt: l.isOpen ? null : now,
      };
    });

    // Lifecycle first: existing rows that are absent from the snapshot need
    // misses tracked or closing, and existing closed rows that reappeared as
    // open need reopening. We do this before the upsert so a row that is
    // closing on this run keeps its first-miss timestamp and is not re-touched
    // by the upsert's closedAt logic.
    const lifecycle = await applyScholarshipLifecycle(tx, source, openHashes, now);

    const hashById = new Map<string, string>();

    const processChunk = async (chunk: typeof rows) => {
      const returned = await tx
        .insert(postings)
        .values(
          chunk.map((r) => ({
            kind: "scholarship" as const,
            freshnessTier: "periodic_check" as const,
            canonicalHash: r.hash,
            title: r.listing.title,
            normalizedTitle: normalizeTitle(r.listing.title),
            url: r.listing.url,
            sponsorName: r.listing.sponsorName,
            amountMin: r.listing.amountMin,
            amountMax: r.listing.amountMax,
            amountNeedsReview: r.listing.amountNeedsReview,
            amountStatus: r.listing.amountStatus,
            programTotal: r.listing.programTotal,
            awardsCount: r.listing.awardsCount,
            amountIsEstimated: r.listing.amountIsEstimated,
            isContentMarketing: r.contentMarketing,
            eligibility:
              r.listing.eligibility.length > 0 ? { criteria: r.listing.eligibility } : null,
            deadlineAt: r.listing.deadlineAt,
            createdAt: now,
            firstSeenAt: now,
            lastSeenAt: now,
            closedAt: r.closedAt,
          })),
        )
        .onConflictDoUpdate({
          target: postings.canonicalHash,
          set: {
            title: sql`excluded.title`,
            normalizedTitle: sql`excluded.normalized_title`,
            url: sql`excluded.url`,
            amountMin: sql`excluded.amount_min`,
            amountMax: sql`excluded.amount_max`,
            amountNeedsReview: sql`excluded.amount_needs_review`,
            amountStatus: sql`excluded.amount_status`,
            programTotal: sql`excluded.program_total`,
            awardsCount: sql`excluded.awards_count`,
            amountIsEstimated: sql`excluded.amount_is_estimated`,
            isContentMarketing: sql`excluded.is_content_marketing`,
            eligibility: sql`excluded.eligibility`,
            deadlineAt: sql`excluded.deadline_at`,
            lastSeenAt: now,
            // The open/closed intent is on the incoming row. An open listing
            // clears any previous close outright (a new cycle); a closed one
            // keeps its first close time rather than re-stamping "closed today".
            closedAt: sql`case when excluded.closed_at is null then null
                                else coalesce(postings.closed_at, excluded.closed_at) end`,
          },
        })
        .returning({ id: postings.id, canonicalHash: postings.canonicalHash, createdAt: postings.createdAt });

      for (const row of returned) {
        if (row.createdAt.getTime() === now.getTime()) inserted++;
        else updated++;
        idByHash.set(row.canonicalHash, row.id);
        hashById.set(row.id, row.canonicalHash);
      }
    };

    for (let i = 0; i < rows.length; i += POSTINGS_BATCH) {
      await processChunk(rows.slice(i, i + POSTINGS_BATCH));
    }

    for (let i = 0; i < rows.length; i += POSTINGS_BATCH) {
      const chunk = rows.slice(i, i + POSTINGS_BATCH);
      await tx
        .insert(postingSources)
        .values(
          chunk.map((r) => ({
            postingId: idByHash.get(r.hash)!,
            source,
            sourceId: r.listing.sourceId,
            sourceUrl: r.listing.url,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [postingSources.source, postingSources.sourceId],
          set: { lastSeenAt: now, postingId: sql`excluded.posting_id` },
        });
    }

    // Compute corroboration counts and v1 trust signals for every row this
    // source touched. We do this after postingSources are written so the count
    // reflects the latest source graph.
    for (let i = 0; i < rows.length; i += POSTINGS_BATCH) {
      const chunk = rows.slice(i, i + POSTINGS_BATCH);
      await refreshTrustForChunk(tx, chunk, idByHash, hashById);
    }

    return {
      inserted,
      updated,
      closed: lifecycle.closed,
      reopened: lifecycle.reopened,
    };
  });
}

async function refreshTrustForChunk(
  tx: Tx,
  chunk: Array<{ hash: string; listing: ScholarshipListing; contentMarketing: boolean; closedAt: Date | null }>,
  idByHash: Map<string, string>,
  hashById: Map<string, string>,
): Promise<void> {
  const ids = chunk.map((r) => idByHash.get(r.hash)!).filter(Boolean);
  if (ids.length === 0) return;

  const counts = await tx
    .select({ postingId: postingSources.postingId, n: sql<number>`count(distinct ${postingSources.source})::int` })
    .from(postingSources)
    .where(inArray(postingSources.postingId, ids))
    .groupBy(postingSources.postingId);

  const countById = new Map(counts.map((c) => [c.postingId, c.n]));

  for (const r of chunk) {
    const id = idByHash.get(r.hash);
    if (!id) continue;
    const corroborationCount = countById.get(id) ?? 1;
    const trustInput: TrustInput = {
      sponsorName: r.listing.sponsorName,
      title: r.listing.title,
      eligibility: r.listing.eligibility,
      amountMin: r.listing.amountMin,
      amountMax: r.listing.amountMax,
      corroborationCount,
    };
    const assessment = assessTrust(trustInput);

    await tx
      .update(postings)
      .set({
        trustScore: assessment.score,
        trustReasons: trustReasonsForStorage(assessment.reasons),
        isLottery: assessment.isLottery,
        lotteryReasons: lotteryReasonsForStorage(assessment.lotteryReasons),
        corroborationCount,
      })
      .where(eq(postings.id, id));
  }
}

async function applyScholarshipLifecycle(
  tx: Tx,
  source: ScholarshipSource,
  openHashes: Set<string>,
  now: Date,
): Promise<{ closed: number; reopened: number }> {
  const candidates = await tx
    .select({
      id: postings.id,
      canonicalHash: postings.canonicalHash,
      closedAt: postings.closedAt,
      missingStrikes: postings.missingStrikes,
      missingSince: postings.missingSince,
    })
    .from(postings)
    .innerJoin(postingSources, eq(postingSources.postingId, postings.id))
    .where(and(eq(postingSources.source, source), eq(postings.kind, "scholarship")));

  const lifecycleCandidates: CloseCandidate[] = candidates.map((c) => ({
    id: c.id,
    canonicalHash: c.canonicalHash,
    closedAt: c.closedAt ?? null,
    missingStrikes: Number(c.missingStrikes ?? 0),
    missingSince: c.missingSince ?? null,
  }));

  const plan = selectPostingsToClose(lifecycleCandidates, Array.from(openHashes), now);

  if (plan.toIncrementMissing.length > 0) {
    const ids = plan.toIncrementMissing.map((c) => c.id);
    await tx
      .update(postings)
      .set({
        missingStrikes: sql`${postings.missingStrikes} + 1`,
        missingSince: sql`COALESCE(${postings.missingSince}, ${timestamptz(now)})`,
      })
      .where(inArray(postings.id, ids));
  }

  if (plan.toClose.length > 0) {
    const ids = plan.toClose.map((c) => c.id);
    await tx
      .update(postings)
      .set({
        closedAt: sql`COALESCE(${postings.missingSince}, ${timestamptz(now)})`,
        missingStrikes: 0,
        missingSince: null,
      })
      .where(inArray(postings.id, ids));
  }

  if (plan.toResetMissing.length > 0) {
    const ids = plan.toResetMissing.map((c) => c.id);
    await tx
      .update(postings)
      .set({ missingStrikes: 0, missingSince: null })
      .where(inArray(postings.id, ids));
  }

  // Reopen closed rows that the source now lists as open.
  const toReopen = lifecycleCandidates.filter(
    (c) => c.closedAt && openHashes.has(c.canonicalHash),
  );

  if (toReopen.length > 0) {
    const ids = toReopen.map((c) => c.id);
    await tx
      .update(postings)
      .set({
        closedAt: null,
        lastSeenAt: now,
        missingStrikes: 0,
        missingSince: null,
      })
      .where(inArray(postings.id, ids));

    for (const c of toReopen) {
      void recordEvent("listing_reopened", {
        kind: "scholarship",
        source,
        hash: c.canonicalHash,
      });
    }
  }

  return { closed: plan.toClose.length, reopened: toReopen.length };
}
