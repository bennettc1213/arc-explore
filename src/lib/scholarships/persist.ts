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

    for (const l of listings) {
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

      /**
       * Stamp `closed_at` once, on the first run that saw it closed.
       *
       * Writing `now` unconditionally would move the timestamp forward on
       * every run for as long as the listing stays closed, so "closed 3
       * months ago" would render as "closed today" forever. `coalesce` keeps
       * whatever the first close wrote. A source that flips a listing back to
       * open (a new cycle) still clears it outright — that path is `null`.
       */
      // ISO string with an explicit cast, not the Date: a JS Date inside a
      // raw `sql` fragment is bound by its `toString()`, which is a locale
      // string ("Thu Aug 13 2026 ... Pacific Daylight Time") that Postgres
      // rejects. The typed column paths below convert it properly; this one
      // does not.
      const closedAt = l.isOpen
        ? null
        : sql`coalesce(${postings.closedAt}, ${now.toISOString()}::timestamptz)`;

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
          amountNeedsReview: l.amountNeedsReview,
          isContentMarketing: contentMarketing,
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
            amountNeedsReview: l.amountNeedsReview,
            isContentMarketing: contentMarketing,
            eligibility: l.eligibility.length > 0 ? { criteria: l.eligibility } : null,
            deadlineAt: l.deadlineAt,
            lastSeenAt: now,
            closedAt,
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
