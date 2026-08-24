import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { NEUTRAL_PRIOR } from "./fit";
import { rankingTiming, type TimingResult } from "./timing";

function timing(score: number, known: number, total = 3): TimingResult {
  return {
    score,
    knownSignals: known,
    totalSignals: total,
  } as TimingResult;
}

describe("rankingTiming", () => {
  test("a fully-known timing score is used as-is", () => {
    assert.equal(rankingTiming(timing(90, 3)), 90);
    assert.equal(rankingTiming(timing(20, 3)), 20);
  });

  test("shrinks toward the neutral prior by how little it rests on", () => {
    /*
     * The same correction `rankingScore` applies to fit, and for the same
     * reason: unknown signals are dropped rather than penalised, so a row
     * knowing 1 of 3 things can score as high as one knowing all 3. Sorting on
     * the displayed number would put the rows we understand *least* on top.
     */
    const confident = rankingTiming(timing(90, 3));
    const speculative = rankingTiming(timing(90, 1));
    assert.ok(confident > speculative, "a confident 90 must outrank a speculative 90");
    // Tolerance rather than equality: the two sides associate the same
    // floating-point multiply differently and land 7e-15 apart.
    assert.ok(Math.abs(speculative - (90 / 3 + NEUTRAL_PRIOR * (2 / 3))) < 1e-9);
  });

  test("a speculative low score is pulled UP, not down", () => {
    // Shrinking toward neutral is not a penalty — it is an admission. A row we
    // know one bad thing about is not thereby a bad row.
    assert.ok(rankingTiming(timing(10, 1)) > 10);
  });

  test("shrinks toward the same prior fit shrinks toward", () => {
    // Two scales pulling toward two different neutrals would not add up to
    // anything when the feed blends them. Knowing nothing means the prior.
    assert.equal(rankingTiming(timing(99, 0)), NEUTRAL_PRIOR);
    assert.equal(rankingTiming(timing(1, 0)), NEUTRAL_PRIOR);
  });

  test("stays on the 0–100 scale, so the feed's bonus is genuinely bounded", () => {
    /*
     * `feed.ts` computes `points * (rankingTiming - 50) / 50` and relies on
     * this range to guarantee the bonus never exceeds ±points. If this ever
     * returned something outside 0–100, a paid tier could promote a posting
     * arbitrarily far past a better-fitting one.
     */
    for (const score of [0, 1, 37, 50, 99, 100]) {
      for (const known of [0, 1, 2, 3]) {
        const r = rankingTiming(timing(score, known));
        assert.ok(r >= 0 && r <= 100, `${score}@${known}/3 produced ${r}`);
      }
    }
  });

  test("a zero-signal shape does not divide by zero", () => {
    assert.equal(rankingTiming(timing(42, 0, 0)), 42);
  });
});
