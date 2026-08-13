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

import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { db } from "@/db/client";
import { postingSources, postings } from "@/db/schema";
import { canonicalHash, normalizeTitle } from "../ingest/normalize";
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

    for (const l of listings) {
      const hash = canonicalHash({
        companyName: l.sponsorName,
        title: l.title,
        locations: [],
        term: null,
      });
      seenHashes.push(hash);

      const [row] = await tx
        .insert(postings)
        .values({
          kind: "scholarship",
          freshnessTier: "periodic_check",
          canonicalHash: hash,
          title: l.title,
          normalizedTitle: normalizeTitle(l.title),
          url: l.url,
          sponsorName: l.sponsorName,
          amountMin: l.amountMin,
          amountMax: l.amountMax,
          eligibility: l.eligibility.length > 0 ? { criteria: l.eligibility } : null,
          deadlineAt: l.deadlineAt,
          // Set explicitly rather than relying on the column default: the
          // insert-vs-update check below compares this against `now`, and a
          // DB-side `now()` would be a different clock capture than this
          // JS Date, so equality could never hold even on a genuine insert.
          createdAt: now,
          firstSeenAt: now,
          lastSeenAt: now,
          closedAt: l.isOpen ? null : now,
        })
        .onConflictDoUpdate({
          target: postings.canonicalHash,
          set: {
            title: l.title,
            normalizedTitle: normalizeTitle(l.title),
            url: l.url,
            amountMin: l.amountMin,
            amountMax: l.amountMax,
            eligibility: l.eligibility.length > 0 ? { criteria: l.eligibility } : null,
            deadlineAt: l.deadlineAt,
            lastSeenAt: now,
            // A source that flips a listing back to open after a closed
            // reading (a new cycle opening) has to be able to clear this.
            closedAt: l.isOpen ? null : now,
          },
        })
        .returning({ id: postings.id, createdAt: postings.createdAt });

      if (row.createdAt.getTime() === now.getTime()) inserted++;
      else updated++;

      await tx
        .insert(postingSources)
        .values({
          postingId: row.id,
          source,
          sourceId: l.sourceId,
          sourceUrl: l.url,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [postingSources.source, postingSources.sourceId],
          set: { lastSeenAt: now, postingId: row.id },
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
  const priorSources = await tx
    .select({ postingId: postingSources.postingId })
    .from(postingSources)
    .where(eq(postingSources.source, source));
  if (priorSources.length === 0) return 0;

  const priorPostingIds = priorSources.map((r) => r.postingId);

  // An empty scrape (the page returned nothing parseable) must not close
  // every scholarship this source has ever recorded — that would read a
  // transient fetch/parse failure as "every fund on the page shut down."
  if (seenHashes.length === 0) return 0;

  const conditions = [
    inArray(postings.id, priorPostingIds),
    notInArray(postings.canonicalHash, seenHashes),
    eq(postings.kind, "scholarship"),
    // Only rows still open. Without this the same absent listings are
    // re-closed on every run and counted again, so the reported "closed"
    // figure means "absent from the page" rather than "closed by this run" —
    // a permanent non-zero number that reads as continuous churn and would
    // also keep bumping closed_at away from the date it actually closed.
    isNull(postings.closedAt),
  ];

  const toClose = await tx
    .select({ id: postings.id })
    .from(postings)
    .where(and(...conditions));
  if (toClose.length === 0) return 0;

  await tx
    .update(postings)
    .set({ closedAt: now })
    .where(inArray(postings.id, toClose.map((r) => r.id)));

  return toClose.length;
}
