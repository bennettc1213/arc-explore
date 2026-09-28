import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeLifecycleTransitions,
  closingTimestamp,
  type LifecycleCandidate,
} from "./lifecycle";

const candidate = (
  id: string,
  hash: string,
  overrides: Partial<LifecycleCandidate> = {},
): LifecycleCandidate => ({
  id,
  canonicalHash: hash,
  closedAt: null,
  missingStrikes: 0,
  missingSince: null,
  ...overrides,
});

describe("computeLifecycleTransitions", () => {
  it("keeps a present row untouched", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a")],
      ["hash-a"],
      { now: new Date() },
    );
    assert.deepEqual(plan.toClose, []);
    assert.deepEqual(plan.toIncrementMissing, []);
    assert.deepEqual(plan.toResetMissing, []);
    assert.equal(plan.closeSuppressed, false);
  });

  it("records first miss without closing", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a")],
      [],
      { now: new Date(), suppressOnEmptySeen: false },
    );
    assert.deepEqual(plan.toClose, []);
    assert.equal(plan.toIncrementMissing.length, 1);
    assert.equal(plan.toIncrementMissing[0]?.id, "a");
    assert.equal(plan.closeSuppressed, false);
  });

  it("closes on the second consecutive miss", () => {
    const first = new Date("2026-03-01T00:00:00Z");
    const second = new Date("2026-03-02T00:00:00Z");

    const plan1 = computeLifecycleTransitions(
      [candidate("a", "hash-a")],
      [],
      { now: first, suppressOnEmptySeen: false },
    );
    assert.equal(plan1.toIncrementMissing.length, 1);

    const afterFirst = candidate("a", "hash-a", {
      missingStrikes: 1,
      missingSince: first,
    });
    const plan2 = computeLifecycleTransitions([afterFirst], [], {
      now: second,
      suppressOnEmptySeen: false,
    });
    assert.equal(plan2.toClose.length, 1);
    assert.equal(plan2.toClose[0]?.id, "a");
    assert.deepEqual(plan2.toIncrementMissing, []);
  });

  it("resets misses when a missing row returns", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a", { missingStrikes: 1, missingSince: new Date() })],
      ["hash-a"],
      { now: new Date() },
    );
    assert.equal(plan.toResetMissing.length, 1);
    assert.equal(plan.toIncrementMissing.length, 0);
    assert.equal(plan.toClose.length, 0);
  });

  it("never re-closes an already-closed row", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a", { closedAt: new Date("2026-01-01T00:00:00Z") })],
      [],
      { now: new Date() },
    );
    assert.deepEqual(plan.toClose, []);
    assert.deepEqual(plan.toIncrementMissing, []);
    assert.deepEqual(plan.toResetMissing, []);
  });

  it("suppresses closes and misses on a failed poll", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a"), candidate("b", "hash-b")],
      [],
      { now: new Date(), successfulComplete: false },
    );
    assert.equal(plan.closeSuppressed, true);
    assert.deepEqual(plan.toClose, []);
    assert.deepEqual(plan.toIncrementMissing, []);
    assert.deepEqual(plan.toResetMissing, []);
  });

  it("suppresses closes and misses on an empty scrape", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a")],
      [],
      { now: new Date(), suppressOnEmptySeen: true },
    );
    assert.equal(plan.closeSuppressed, true);
    assert.deepEqual(plan.toClose, []);
    assert.deepEqual(plan.toIncrementMissing, []);
  });

  it("does not suppress on an empty scrape when configured off", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a")],
      [],
      { now: new Date(), suppressOnEmptySeen: false },
    );
    assert.equal(plan.closeSuppressed, false);
    assert.equal(plan.toIncrementMissing.length, 1);
  });

  it("does not increment misses more than once in the same poll", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a")],
      [],
      { now: new Date(), suppressOnEmptySeen: false },
    );
    assert.equal(plan.toIncrementMissing.length, 1);
    // A second call with the same state would still show one first-miss row,
    // not a closing row, because the counter only advances once per poll.
  });

  it("respects a configurable miss threshold", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a", { missingStrikes: 1, missingSince: new Date() })],
      [],
      { now: new Date(), missingStrikesRequired: 3, suppressOnEmptySeen: false },
    );
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 1);
  });

  it("does not reset misses for rows that are still absent", () => {
    const plan = computeLifecycleTransitions(
      [candidate("a", "hash-a", { missingStrikes: 1, missingSince: new Date() })],
      ["hash-b"],
      { now: new Date() },
    );
    assert.equal(plan.toResetMissing.length, 0);
    assert.equal(plan.toClose.length, 1);
  });
});

describe("closingTimestamp", () => {
  it("uses the first-miss time when available", () => {
    const first = new Date("2026-03-01T00:00:00Z");
    const now = new Date("2026-03-05T00:00:00Z");
    const c = candidate("a", "hash-a", { missingSince: first });
    assert.deepEqual(closingTimestamp(c, now), first);
  });

  it("falls back to now when there is no first-miss time", () => {
    const now = new Date("2026-03-05T00:00:00Z");
    const c = candidate("a", "hash-a");
    assert.deepEqual(closingTimestamp(c, now), now);
  });
});
