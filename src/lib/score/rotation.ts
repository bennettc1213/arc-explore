/**
 * The last tiebreaker in the feed ranking: a deterministic daily rotation.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Reported as "every time I log on I'm getting the same scholarships and
 * internships in order, no new ones", and measured before anything was
 * written. Against the live corpus, for the most-filled profile on the account:
 *
 *   · 1,607 of 4,012 open rows score a **perfect fit of 100**, because a row
 *     known on one dimension that happens to match is a 100 — that is the
 *     "unknown is dropped, never scored as a miss" rule working as designed.
 *   · `rankingScore` correctly shrinks those toward the neutral prior, but they
 *     all shrink to the *same place*: **1,529 rows share the single sort key
 *     68.4** — fit 100 at 1-of-3 confidence, timing 63 at 1-of-3.
 *   · Even in the well-differentiated head, **37 of the first 50 ranks sit
 *     inside a tie group larger than one**.
 *
 * `Array.prototype.sort` is stable in V8, so every one of those ties resolved
 * to the order the rows came back from Postgres — which does not change. The
 * feed was therefore frozen in place, and would have stayed frozen even after
 * new rows arrived, because a new row lands wherever its score puts it and the
 * plateau above it never moves.
 *
 * ── WHY ROTATING IS THE HONEST ANSWER, NOT A GIMMICK ────────────────────────
 *
 * Inside a tie group we hold *no evidence whatsoever* for preferring one row to
 * another — that is precisely what the tie means, and the confidence marker on
 * each row already says so out loud. A fixed database order is therefore not
 * more principled than a rotating one; it is equally arbitrary and it is also
 * stale. Rotating shows a student more of a corpus we genuinely cannot rank
 * further, instead of the same 50 rows of it forever.
 *
 * It also makes an existing product claim true. The free tier is sold as its
 * "20 highest-ranked matches, re-ranked daily", and the roadmap justifies the
 * "daily" on the grounds that timing moves every day. For the 1,529-row
 * plateau that was false: their timing is identical, so it moves identically,
 * and the *order* never changed.
 *
 * ── THE TWO PROPERTIES THAT MAKE IT SAFE ────────────────────────────────────
 *
 * **It can only ever break a tie.** It is the final comparison in `makeRank`,
 * reached only when blocked status, the fit/timing sort key and the timing
 * score are all equal. It can never promote a worse-matching posting above a
 * better one — the same bound the timing bonus was given for the same reason.
 *
 * **It is stable within a UTC day.** The seed is the day index, so every
 * request on the same day produces the same order: "show more" pages
 * consistently, a refresh does not reshuffle under the reader, and a student
 * can go back to a row they saw an hour ago. It changes at midnight UTC, once.
 */

/** Whole UTC days since the epoch. The rotation's seed. */
export function dayIndex(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/**
 * A stable pseudo-random value in [0, 1) for one posting on one day.
 *
 * FNV-1a over `id:day` — a few lines rather than a dependency, per this
 * codebase's standing refusal, and it needs no cryptographic strength: the
 * only requirement is that it spreads ids evenly and changes with the day.
 * `Math.imul` keeps the multiply in 32-bit, which plain `*` would not.
 */
export function rotationRank(postingId: string, day: number): number {
  let h = 0x811c9dc5;
  const seed = `${postingId}:${day}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4_294_967_296;
}
