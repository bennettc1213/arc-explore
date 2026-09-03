import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { jitter, resolution } from "./evidence";
import { rotationRank } from "./rotation";

describe("resolution", () => {
  test("is zero when the shrink moved nothing, so a confident ranking is left exact", () => {
    // The guarantee that made this safe to ship: at full confidence every
    // mechanism downstream switches itself off and the feed is bit-for-bit
    // what it was before any of this existed.
    const rows = [
      { raw: 100, shrunk: 100 },
      { raw: 42, shrunk: 42 },
      { raw: 0, shrunk: 0 },
    ];
    assert.equal(resolution(rows), 0);
  });

  test("is the mean distance the shrink actually moved these rows", () => {
    // 20 + 0 + 10 over three rows. Stated as the arithmetic rather than a
    // remembered constant, because the point of this quantity is that it is
    // measured off the result set rather than chosen.
    const rows = [
      { raw: 100, shrunk: 80 },
      { raw: 50, shrunk: 50 },
      { raw: 30, shrunk: 40 },
    ];
    assert.equal(resolution(rows), (20 + 0 + 10) / 3);
  });

  test("skips rows the scorer could not score at all", () => {
    // They sit on a negative sentinel below everything scored and never enter
    // the region this resolution describes. Counting them would set the
    // resolution of a place they do not occupy — and, because their `shrunk`
    // is a sentinel rather than a score, would corrupt the mean outright.
    const scored = [{ raw: 100, shrunk: 80 }];
    const withUnscoreable = [...scored, { raw: null, shrunk: -1 }];
    assert.equal(resolution(withUnscoreable), resolution(scored));
  });

  test("an empty set has nothing to blur", () => {
    assert.equal(resolution([]), 0);
  });

  test("survives a NaN without poisoning the whole ranking", () => {
    // A single bad row must not make the resolution NaN: NaN propagates into
    // every sort key and makes the comparator incoherent, at which point
    // `Array.prototype.sort` is entitled to produce any order at all.
    const rows = [{ raw: 100, shrunk: 80 }, { raw: Number.NaN, shrunk: 50 }];
    assert.equal(Number.isFinite(resolution(rows)), true);
  });
});

describe("jitter", () => {
  test("stays inside half the resolution, in both directions", () => {
    // This is the bound the whole safety argument rests on. Checked across the
    // full seed range rather than at a convenient value.
    const res = 30;
    for (let i = 0; i <= 100; i++) {
      const j = jitter(i / 100, res);
      assert.ok(Math.abs(j) <= res / 2 + 1e-9, `seed ${i / 100} produced ${j}`);
    }
  });

  test("is centred, so it neither inflates nor deflates the ranking overall", () => {
    // Drawn from real posting-shaped ids through the same seed source the feed
    // uses, not from a uniform sweep — a hash that clustered would show here.
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += jitter(rotationRank(`posting-${i}`, 20_000), 30);
    assert.ok(Math.abs(sum / n) < 0.5, `mean displacement ${sum / n} is not centred`);
  });

  test("does nothing at all when the resolution is zero", () => {
    assert.equal(jitter(0.9, 0), 0);
    assert.equal(jitter(0.1, 0), 0);
  });

  test("NEVER reorders two rows further apart than the resolution", () => {
    /*
     * The load-bearing property, and the one that distinguishes this from the
     * two designs it replaced. A resolution limit is allowed to shuffle rows it
     * cannot tell apart; the moment it reverses two rows it *can* tell apart it
     * has stopped being a limit and become an opinion.
     *
     * The per-row-width design this replaced failed exactly here — a row at
     * key 60.0 was promoted above a row at key 66.7 by its own rounding — so
     * this is checked over many real seeds rather than asserted once.
     */
    const res = 30;
    const ids = Array.from({ length: 120 }, (_, i) => `posting-${i}`);
    let checked = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const ka = 50 + (i % 17) * 4;
        const kb = 50 + (j % 17) * 4;
        if (Math.abs(ka - kb) <= res) continue; // may legitimately swap
        const a = ka + jitter(rotationRank(ids[i], 20_000), res);
        const b = kb + jitter(rotationRank(ids[j], 20_000), res);
        assert.equal(
          Math.sign(a - b),
          Math.sign(ka - kb),
          `rows ${ka} and ${kb} (gap > ${res}) were reordered`,
        );
        checked++;
      }
    }
    // Guard against the assertions above silently never running.
    assert.ok(checked > 500, `only ${checked} pairs were actually compared`);
  });

  test("the same posting on the same day is displaced identically", () => {
    // "Show more" must page consistently and a refresh must not reshuffle
    // under the reader. Same contract rotationRank already carries.
    const a = jitter(rotationRank("abc-123", 20_000), 30);
    const b = jitter(rotationRank("abc-123", 20_000), 30);
    assert.equal(a, b);
  });

  test("and differently on the next day, or nothing turns over", () => {
    const today = jitter(rotationRank("abc-123", 20_000), 30);
    const tomorrow = jitter(rotationRank("abc-123", 20_001), 30);
    assert.notEqual(today, tomorrow);
  });
});
