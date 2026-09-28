import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { closingTimestamp, type CloseCandidate, selectPostingsToClose } from "./close";

const row = (id: string, canonicalHash: string, overrides: Partial<CloseCandidate> = {}): CloseCandidate => ({
  id,
  canonicalHash,
  closedAt: null,
  missingStrikes: 0,
  missingSince: null,
  ...overrides,
});

function applyLifecycle(candidates: CloseCandidate[], plan: ReturnType<typeof selectPostingsToClose>, now: Date): CloseCandidate[] {
  const closing = new Set(plan.toClose.map((c) => c.id));
  const incrementing = new Set(plan.toIncrementMissing.map((c) => c.id));
  const resetting = new Set(plan.toResetMissing.map((c) => c.id));

  return candidates.map((c) => {
    if (closing.has(c.id)) {
      return { ...c, closedAt: closingTimestamp(c, now), missingStrikes: 0, missingSince: null };
    }
    if (resetting.has(c.id)) {
      return { ...c, missingStrikes: 0, missingSince: null };
    }
    if (incrementing.has(c.id)) {
      return {
        ...c,
        missingStrikes: c.missingStrikes + 1,
        missingSince: c.missingSince ?? now,
      };
    }
    return c;
  });
}

describe("selectPostingsToClose", () => {
  it("closes rows that are no longer on the page after two misses", () => {
    const first = new Date("2026-03-01T00:00:00Z");
    const second = new Date("2026-03-02T00:00:00Z");

    const initial = [row("a", "hash-a"), row("b", "hash-b"), row("c", "hash-c")];
    const stillListed = ["hash-a", "hash-c"];

    const firstRun = selectPostingsToClose(initial, stillListed, first);
    assert.equal(firstRun.toClose.length, 0);
    assert.equal(firstRun.toIncrementMissing.length, 1);
    assert.equal(firstRun.toIncrementMissing[0]?.id, "b");

    const afterFirst = applyLifecycle(initial, firstRun, first);
    const secondRun = selectPostingsToClose(afterFirst, stillListed, second);
    assert.equal(secondRun.toClose.length, 1);
    assert.equal(secondRun.toClose[0]?.id, "b");
    assert.deepEqual(closingTimestamp(secondRun.toClose[0]!, second), first);
  });

  it("closes nothing when every prior row is still listed", () => {
    const candidates = [row("a", "hash-a"), row("b", "hash-b")];
    const plan = selectPostingsToClose(candidates, ["hash-a", "hash-b"]);
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 0);
    assert.equal(plan.toResetMissing.length, 0);
    assert.equal(plan.closeSuppressed, false);
  });

  it("sets closed_at exactly once and never moves it", () => {
    const first = new Date("2026-03-01T00:00:00Z");
    const later = new Date("2026-08-13T00:00:00Z");

    const initial = [row("a", "hash-a"), row("b", "hash-b"), row("c", "hash-c")];
    const stillListed = ["hash-a"];

    const firstRun = selectPostingsToClose(initial, stillListed, first);
    const afterFirst = applyLifecycle(initial, firstRun, first);
    const secondRun = selectPostingsToClose(afterFirst, stillListed, later);
    const afterSecond = applyLifecycle(afterFirst, secondRun, later);

    for (const id of ["b", "c"]) {
      const r = afterSecond.find((x) => x.id === id);
      assert.deepEqual(r?.closedAt, first, `${id} kept its original closed_at`);
    }
    // ...and a third run is just as quiet.
    const thirdRun = selectPostingsToClose(afterSecond, stillListed, later);
    assert.equal(thirdRun.toClose.length, 0);
  });

  it("closes nothing when the scrape came back empty", () => {
    // A transient fetch or parse failure returns zero listings. Treating
    // that as "every fund on this page shut down" would wipe the source out
    // on one bad request.
    const candidates = [row("a", "hash-a"), row("b", "hash-b")];
    const plan = selectPostingsToClose(candidates, []);
    assert.equal(plan.closeSuppressed, true);
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 0);
  });

  it("ignores rows already closed even when the page grows", () => {
    const closedLongAgo = new Date("2026-01-05T00:00:00Z");
    const candidates = [row("a", "hash-a", { closedAt: closedLongAgo }), row("b", "hash-b")];
    // "a" is still absent, but it was closed months ago — leave it alone.
    const plan = selectPostingsToClose(candidates, ["hash-b"]);
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 0);
  });

  it("has nothing to close on a source's first ever run", () => {
    const plan = selectPostingsToClose([], ["hash-a", "hash-b"]);
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.closeSuppressed, false);
  });

  it("resets misses when a missing row returns", () => {
    const candidates = [row("a", "hash-a", { missingStrikes: 1, missingSince: new Date() }), row("b", "hash-b")];
    const plan = selectPostingsToClose(candidates, ["hash-a", "hash-b"]);
    assert.equal(plan.toResetMissing.length, 1);
    assert.equal(plan.toResetMissing[0]?.id, "a");
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 0);
  });

  it("closes a row that returns after closure only when it reappears (handled by persist)", () => {
    // The pure close function does not reopen; that is persist's job when an
    // open hash matches a closed row. This test simply confirms closed rows
    // stay out of the close plan.
    const candidates = [row("a", "hash-a", { closedAt: new Date("2026-01-01") })];
    const plan = selectPostingsToClose(candidates, []);
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 0);
  });
});
