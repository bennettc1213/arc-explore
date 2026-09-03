/**
 * How finely may a ranking be ordered, given how little it knows?
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Reported for the third time as "every single time that we hop onto the site,
 * it's the same scholarships and internships list", and the two previous
 * attempts did not move it because they treated the symptom. Measured against
 * the live corpus for a signed-out visitor before anything here was written:
 *
 *   · 5,164 open rows reach the ranker.
 *   · A signed-out visitor saw **14 distinct rows over 30 days**. The free
 *     window of 10 turned over about one row a day, and the top 20 was
 *     *identical* a week later.
 *   · 45 of the first 50 ranks already sat in a tie group larger than one.
 *
 * That last line is the paradox, and it is why the existing daily rotation
 * (`score/rotation.ts`) could not help on its own. The rotation is correctly
 * bounded to **exact** ties. But the head was not separated by evidence, it was
 * separated by arithmetic noise:
 *
 *   rank 0-2   fit 100 (2 of 3 known) -> key 83.3333, timing 51
 *   rank 3-4   fit 100 (2 of 3 known) -> key 83.3333, timing 50
 *   rank 5-9   fit  92 (2 of 3 known) -> key 78.0000, timing 51
 *
 * Rows 0 and 3 were ordered by **one point of a timing score that itself rests
 * on 2 of 3 signals**. Rows 2 and 5 by a 5.3-point fit gap that existed only
 * because a different one of three dimensions happened to be the computable
 * one. Neither is a preference anybody could defend, and a stable sort pinned
 * both in place forever.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * **Ranking precision may not exceed the evidence the ranking rests on.**
 *
 * Not a new doctrine — the existing one carried one step further. The project
 * already refuses to score an unknown dimension as a miss, already shrinks a
 * thin score toward a neutral prior, and already prints an `N of M` marker so
 * nobody reads a thin score as a confident one. What it did not do was stop
 * *sorting* on the digits that marker exists to disown. `rankingScore` hands
 * back a float and the comparator spent every one of them.
 *
 * ── THE MEASUREMENT: WHAT ONE POINT OF THIS SCALE IS WORTH ──────────────────
 *
 * `resolution()` answers that, and it answers it by looking rather than by
 * bounding. Two earlier derivations were tried against the live corpus and both
 * failed in ways no unit test written from the same assumption would have
 * caught:
 *
 *   **Per-row width, from each row's own confidence.** Not order-preserving.
 *   A row at 1 of 5 dimensions (key 60.0, width 40) banded to 80.0 while a row
 *   at 2 of 3 (key 66.7, width 16.7) stayed at 66.7 — the row we knew *less*
 *   about was promoted above the row we knew more about, by the rounding
 *   alone. A resolution limit may merge neighbours; the moment it reverses them
 *   it has stopped being a limit and become an opinion.
 *
 *   **Worst-case width, `(100 - prior) x (1 - confidence)`.** A bound describes
 *   a score that could have been anywhere in [0, 100]; these scores are not
 *   anywhere, they are where they are. For timing it returned 28.9 points,
 *   which collapsed **196 of the top 200 rows onto a single level** and left
 *   the paid timing entitlement completely inert — free and paid feeds came
 *   back byte-identical.
 *
 * So the resolution is the mean distance the confidence correction **actually
 * moved this result set**. It needs no constant of its own to say what it says:
 * *we will not resolve differences smaller than the amount our own confidence
 * correction is already moving these rows around.* Live: 30.1 points signed
 * out, 18.5 for a filled CS profile, and it goes to 0 as a ranking approaches
 * full confidence — at which point everything below switches itself off.
 *
 * ── WHY A JITTER AND NOT A GRID ─────────────────────────────────────────────
 *
 * The obvious way to spend a resolution limit is to quantize onto a grid of
 * that spacing and let equal cells tie. That was built, and the corpus rejected
 * it: **the top band came out holding exactly 12 rows** while the next held
 * 1,989. The grid line landed at 75.15, so a 2.5-point difference decided
 * membership of a band whose whole meaning was "we cannot resolve 30 points".
 * A dozen rows owned the signed-out feed forever, for no reason anyone could
 * state. Boundary artifacts are not a tuning problem; they are what grids are.
 *
 * A jitter has no boundaries. Each row is displaced by a deterministic amount
 * inside +/- half the resolution, so:
 *
 *   · two rows swap **only** when their true keys differ by less than the
 *     resolution — exactly the region we have admitted we cannot resolve, and
 *     never further;
 *   · nothing sits on a cliff, because a row near any given value is as likely
 *     to move up as down;
 *   · every row still maps to a single number, so the comparator stays
 *     transitive — the trap `getFeed`'s one-`day`-per-request rule exists to
 *     avoid;
 *   · at full confidence the resolution is 0, the displacement is 0, and the
 *     ranking is bit-for-bit what it was before any of this existed.
 *
 * The displacement is drawn from the same daily seed the rotation already uses,
 * so it is stable within a UTC day — "show more" pages consistently, a refresh
 * does not reshuffle under the reader, and a student can go back to a row they
 * saw an hour ago. It changes at midnight UTC, once.
 */

/** A score before and after the confidence shrink was applied to it. */
export interface Shrunk {
  /** What the scorer measured, or null when it could not score the row. */
  raw: number | null;
  /** What `rankingScore` / `rankingTiming` handed back for it. */
  shrunk: number;
}

/**
 * How many points of this ranking scale are actually meaningful, per request.
 *
 * Rows the scorer could not score at all are skipped rather than counted as
 * maximally uncertain. They carry no position on this scale — `rankingScore`
 * gives them a negative sentinel and they sort below everything scored — so
 * folding them in would set the resolution of a region they never enter.
 *
 * Returns 0 for an empty set: nothing to rank is nothing to blur.
 */
export function resolution(rows: Shrunk[]): number {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (r.raw === null || !Number.isFinite(r.raw) || !Number.isFinite(r.shrunk)) continue;
    sum += Math.abs(r.raw - r.shrunk);
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * The displacement to add to a ranking key, in points.
 *
 * `seed` is a stable value in [0, 1) for this row on this day — `rotationRank`
 * from score/rotation.ts, reused rather than reimplemented so there is one
 * definition of the daily shuffle.
 *
 * Centred, so the displacement neither inflates nor deflates the ranking as a
 * whole: a row is as likely to be pushed down as up, and the mean key across
 * the feed is unchanged. Amplitude is half the resolution, which makes the
 * *total* swing between two rows exactly one resolution — the largest gap we
 * have said we cannot see.
 */
export function jitter(seed: number, res: number): number {
  if (!Number.isFinite(seed) || !(res > 0)) return 0;
  return (seed - 0.5) * res;
}
