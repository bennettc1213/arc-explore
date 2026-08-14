/**
 * Turns parsed scholarship listings into database writes.
 *
 * Deliberately not a reuse of `ingest/persist.ts`. That module's
 * insert/touch/reopen/close plan exists to reconcile *incremental* polls of
 * one company's ATS board — org-scoped, poll-interval-aware, tuned for a
 * board returning a partial result being a red flag. A scholarship scrape is
 * a full snapshot of one page, and the source states open/closed directly
 * (`isOpen` on `ScholarshipListing`) rather than requiring us to infer it
 * from absence — so this is a plain upsert plus "no longer on the page at
 * all", not a diff against poll history.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { postingSources, postings } from "@/db/schema";
import { canonicalHash, normalizeTitle } from "../ingest/normalize";
import { isContentMarketing } from "./classify";
import { selectPostingsToClose } from "./close";
import type { ScholarshipListing } from "./types";

export interface ScholarshipPersistResult {
  inserted: number;
  updated: number;
  closed: number;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Upsert one source's full listing snapshot.
 *
 * Runs in a transaction so a failure partway through never leaves some
 * listings updated and the close-on-removal step un-run against a half
 * applied set.
 */
export async function persistScholarships(
  source: ScholarshipListing["source"],
  listings: ScholarshipListing[],
): Promise<ScholarshipPersistResult> {
  return db.transaction(async (tx) => {
    let inserted = 0;
    let updated = 0;
    const now = new Date();
    const seenHashes: string[] = [];
    const idByHash = new Map<string, string>();

    const rows = listings.map((l) => {
      const hash = canonicalHash({
        companyName: l.sponsorName,
        title: l.title,
        locations: [],
        term: null,
      });
      seenHashes.push(hash);

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

    // Batching matters here: a scholarship source's snapshot can be thousands
    // of rows, and thousands of sequential upserts inside one transaction is
    // how a Supabase pooler connection gets dropped mid-write (we watched it
    // happen). Chunked so a batch never brushes Postgres's 65,535-parameter
    // ceiling — at 17 columns that means ≤ ~3,500 rows per statement, and
    // 500 keeps plenty of headroom.
    //
    // Governs both writes below. The `posting_sources` insert went unbatched
    // until 2026-08-14 and sent every row in one statement, which is the same
    // failure shape this constant exists to prevent.
    const POSTINGS_BATCH = 500;

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
            isContentMarketing: sql`excluded.is_content_marketing`,
            eligibility: sql`excluded.eligibility`,
            deadlineAt: sql`excluded.deadline_at`,
            lastSeenAt: now,
            // The open/closed intent is on the incoming row, not on what the
            // table already holds. An open listing must clear any previous
            // close outright (a new cycle); a closed one keeps its first close
            // time rather than re-stamping "closed today" forever. `excluded`
            // is null for open rows and `now` for closed ones, so CASE is what
            // distinguishes the two — coalesce alone would freeze an open row
            // shut on the first run that saw it closed.
            closedAt: sql`case when excluded.closed_at is null then null
                                else coalesce(postings.closed_at, excluded.closed_at) end`,
          },
        })
        .returning({ id: postings.id, canonicalHash: postings.canonicalHash, createdAt: postings.createdAt });

      for (const row of returned) {
        if (row.createdAt.getTime() === now.getTime()) inserted++;
        else updated++;
        idByHash.set(row.canonicalHash, row.id);
      }
    };

    for (let i = 0; i < rows.length; i += POSTINGS_BATCH) {
      await processChunk(rows.slice(i, i + POSTINGS_BATCH));
    }

    // Batched for exactly the reason the postings upsert above is, which this
    // statement was originally missed out of: it grows with the snapshot, and
    // a source like ScholarshipPortal hands us thousands of rows at once. One
    // statement carrying every row is the shape that got a pooler connection
    // dropped mid-write.
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

    // Anything previously scraped from this source but absent from today's
    // snapshot entirely (not just marked closed — genuinely gone from the
    // page) is the fund being retired, not a cycle ending.
    const closed = await closeRemoved(tx, source, seenHashes, now);

    return { inserted, updated, closed };
  });
}

async function closeRemoved(
  tx: Tx,
  source: ScholarshipListing["source"],
  seenHashes: string[],
  now: Date,
): Promise<number> {
  const candidates = await tx
    .select({
      id: postings.id,
      canonicalHash: postings.canonicalHash,
      closedAt: postings.closedAt,
    })
    .from(postings)
    .innerJoin(postingSources, eq(postingSources.postingId, postings.id))
    .where(and(eq(postingSources.source, source), eq(postings.kind, "scholarship")));

  const ids = selectPostingsToClose(candidates, seenHashes);
  if (ids.length === 0) return 0;

  await tx.update(postings).set({ closedAt: now }).where(inArray(postings.id, ids));

  return ids.length;
}
