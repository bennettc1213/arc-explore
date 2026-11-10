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
 * How many ranked matches the free plan shows, per search/filter combination.
 *
 * A RANKED-DEPTH LIMIT, NOT A VIEW COUNTER. Free sees the top twenty of
 * whatever it searched for; changing the filters ranks a different set, and
 * opening listings is never counted. Nothing resets at midnight and no
 * number of new rows per day is promised: the set moves when ingestion adds
 * rows and when timing changes, which is what the copy must say. Every
 * surface (list, Funding Plan, Scout, API, pricing, landing, portal, emails)
 * reads this constant. Twenty since 2026-11-03, the approved Free/Pro matrix.
 */
export const FREE_RANKED_RESULTS = 20;

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
 * as a known latent bias. Cutting the free plan to a short window would stop
 * hiding it, and a free user could open the product to a full window of
 * scholarships and no internships at all. The weekly digest hit exactly this and answered it
 * the same way, with reserved slots per kind.
 */
export const FEED_MIN_PER_KIND = 5;

/**
 * The share of any capped window each kind is guaranteed, when it has the rows
 * to fill it.
 *
 * A PROPORTION, BECAUSE A FIXED COUNT PUT THE PAID FEED BEHIND THE FREE ONE.
 * `FEED_MIN_PER_KIND` was applied only to the free window — `page.tsx` passed
 * `reservePerKind: dailyCapped ? FEED_MIN_PER_KIND : 0` — so a paying
 * subscriber got the raw ranking and therefore the full force of the
 * cross-kind bias the reservation exists to answer. Measured on a real
 * profile: free showed 15 scholarships / 5 internships, **paid showed 46 / 4**.
 * The tier that pays was strictly worse mixed than the one that does not.
 *
 * A fixed five cannot fix that by simply being applied to both, because five
 * of ten is a floor of 50% while five of fifty is 10% — the same constant
 * means something different at every window size, which is precisely how the
 * two tiers drifted apart. A quarter of the window to each kind holds the same
 * promise at any depth, and still leaves half the list to the global ranking.
 */
export const FEED_KIND_FLOOR = 0.25;

/** Slots to reserve per kind for a window of `limit` rows. */
export function reservationFor(limit: number): number {
  return Math.max(1, Math.round(limit * FEED_KIND_FLOOR));
}

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

/**
 * The most rows one sponsor or employer may hold in a browsed window.
 *
 * Decided 2026-11-10 after OSAC: one state catalogue's 602 awards took 14 of
 * the top 20 scholarships for every profile, because every row carried a
 * known deadline and the eligibility that would have ruled most students out
 * is unknown, and unknown is dropped rather than scored as a miss. A share
 * rather than a constant, for the reason `FEED_KIND_FLOOR` gives: 3 of 20 and
 * 3 of 100 are different promises.
 */
export const FEED_SOURCE_SHARE = 0.15;

export function sourceCapFor(limit: number): number {
  return Math.max(3, Math.ceil(limit * FEED_SOURCE_SHARE));
}

/**
 * Each source keeps its first `cap` rows where the ranking put them; every
 * row after that moves to the end of the list, in rank order. Nothing is
 * dropped, so if nothing else qualifies the window still fills. `getFeed`
 * sizes `cap` to the request's window (`sourceCapFor`), so this reads as
 * "at most a share of what you are shown".
 *
 * Over the whole list rather than only the first window, because
 * `trimWithReservation` runs afterwards and pulls a kind's next-best rows from
 * below the window. Capping only the window left the overflow sitting right
 * there, and the reservation promoted it: measured, 5 OSAC rows in a capped
 * mixed top 20. Rows with no source name are never capped. Only for browsing;
 * a typed search for one employer must still show that employer.
 */
export function capPerSource<T>(ranked: T[], cap: number, sourceOf: (item: T) => string | null): T[] {
  if (cap <= 0 || ranked.length <= cap) return ranked;
  const kept: T[] = [];
  const deferred: T[] = [];
  const counts = new Map<string, number>();
  for (const item of ranked) {
    const key = sourceOf(item)?.trim().toLowerCase();
    const n = key ? counts.get(key) ?? 0 : 0;
    if (!key || n < cap) { if (key) counts.set(key, n + 1); kept.push(item); } else deferred.push(item);
  }
  return deferred.length ? [...kept, ...deferred] : ranked;
}
