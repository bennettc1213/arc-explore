import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { dayIndex, rotationRank } from "./rotation";

describe("dayIndex", () => {
  test("is constant through a UTC day and increments at midnight", () => {
    const morning = new Date("2026-08-21T00:00:01Z");
    const night = new Date("2026-08-21T23:59:59Z");
    const next = new Date("2026-08-22T00:00:01Z");
    assert.equal(dayIndex(morning), dayIndex(night));
    assert.equal(dayIndex(next), dayIndex(morning) + 1);
  });
});

describe("rotationRank", () => {
  test("is stable for the same posting on the same day", () => {
    // The property the whole design rests on: "show more" must page
    // consistently and a refresh must not reshuffle under the reader.
    const a = rotationRank("abc-123", 20_000);
    const b = rotationRank("abc-123", 20_000);
    assert.equal(a, b);
  });

  test("changes for the same posting on a different day", () => {
    // Without this the feed stays frozen, which is the reported bug.
    assert.notEqual(rotationRank("abc-123", 20_000), rotationRank("abc-123", 20_001));
  });

  test("always lands in [0, 1)", () => {
    for (let i = 0; i < 500; i++) {
      const v = rotationRank(`posting-${i}`, 20_000 + (i % 7));
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
  });

  test("spreads ids across the range rather than clumping", () => {
    // A hash that bucketed badly would leave the tie group nearly as frozen
    // as it was — the failure this function exists to prevent, quietly.
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 5_000; i++) {
      buckets[Math.floor(rotationRank(`id-${i}`, 20_000) * 10)]++;
    }
    for (const [n, count] of buckets.entries()) {
      assert.ok(count > 300 && count < 700, `decile ${n} held ${count} of 5000`);
    }
  });

  test("a day's ordering of one tie group differs from the next day's", () => {
    // The end-to-end property, expressed the way the comparator uses it.
    const ids = Array.from({ length: 60 }, (_, i) => `tied-${i}`);
    const order = (day: number) =>
      [...ids].sort((x, y) => rotationRank(x, day) - rotationRank(y, day)).join(",");
    assert.notEqual(order(20_000), order(20_001));
    assert.equal(order(20_000), order(20_000));
  });
});
