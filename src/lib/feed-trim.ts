/**
 * Trimming a ranked feed down to a capped window.
 *
 * Free of database imports, exactly like `feed-search.ts` beside it and for
 * the same reason: this is a rule about ordering, it needs no connection to
 * decide anything, and keeping it here means it can be tested without one.
 * `feed.ts` imports it; nothing here imports `feed.ts`.
 */

import { POSTING_KINDS, type PostingKind } from "@/db/schema";

/**
 * How many ranked matches the free plan shows.
 *
 * Twenty is a set someone actually reads to the bottom, which is the point:
 * the free plan exists to prove the ranking is worth trusting, and a student
 * who scrolls fifty rows without reaching the end learns nothing about
 * whether the top of the list was any good.
 */
export const FREE_DAILY_RESULTS = 20;

/**
 * Slots held for each kind inside a capped list.
 *
 * NOT ARBITRARY, AND ONLY NEEDED ONCE THE FEED IS CAPPED. Scholarships
 * structurally outrank internships here: `scoreScholarshipFit` has three
 * dimensions and can be known on all three, reaching a confident 100, while
 * `scoreFit` has five with `term` and `skills` routinely unstated, so a strong
 * internship sits at 3-of-5 and `rankingScore` correctly shrinks it toward the
 * neutral prior. Measured on a live digest run: best scholarship 100.0, best
 * internship 82.0 — no internship could outrank any of the top scholarships.
 *
 * The uncapped feed hides that by showing everything, which FIXES.md records
 * as a known latent bias. Cutting the free plan to twenty rows would stop
 * hiding it, and a free user could open the product to twenty scholarships and
 * no internships at all. The weekly digest hit exactly this and answered it
 * the same way, with reserved slots per kind.
 */
export const FEED_MIN_PER_KIND = 5;

/**
 * Trim a ranked list to `limit`, guaranteeing each kind a minimum first.
 *
 * Rank order is preserved throughout: this promotes the best few of a
 * crowded-out kind into the window, and never reorders what was already in
 * it. With no reservation, or a list already shorter than the limit, it is a
 * plain slice.
 */
export function trimWithReservation<T extends { kind: PostingKind }>(
  ranked: T[],
  limit: number,
  reservePerKind = 0,
): T[] {
  if (limit <= 0) return [];
  if (ranked.length <= limit) return ranked;
  if (reservePerKind <= 0) return ranked.slice(0, limit);

  const keep = new Set<T>();

  // Each kind's own best, up to the reservation. Taken first so a kind the
  // global ranking buried still gets its floor — and taken in rank order, so
  // what gets promoted is that kind's strongest, never an arbitrary few.
  for (const kind of POSTING_KINDS) {
    let taken = 0;
    for (const item of ranked) {
      if (taken >= reservePerKind || keep.size >= limit) break;
      if (item.kind !== kind) continue;
      keep.add(item);
      taken++;
    }
  }

  // Then fill the remaining slots from the top of the global ranking.
  for (const item of ranked) {
    if (keep.size >= limit) break;
    keep.add(item);
  }

  // Emitted in the original rank order — the reservation decides *membership*,
  // never position. A promoted internship still sits where its rank puts it.
  return ranked.filter((i) => keep.has(i));
}
