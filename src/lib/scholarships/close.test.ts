import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type CloseCandidate, selectPostingsToClose } from "./close";

const row = (id: string, canonicalHash: string, closedAt: Date | null = null): CloseCandidate => ({
  id,
  canonicalHash,
  closedAt,
});

/**
 * Apply the close the way `closeRemoved` does, so a test can run the decision
 * twice in a row against the state the first run left behind.
 */
function applyClose(candidates: CloseCandidate[], ids: string[], at: Date): CloseCandidate[] {
  const closing = new Set(ids);
  return candidates.map((c) => (closing.has(c.id) ? { ...c, closedAt: at } : c));
}

describe("selectPostingsToClose", () => {
  it("closes rows that are no longer on the page", () => {
    const candidates = [row("a", "hash-a"), row("b", "hash-b"), row("c", "hash-c")];
    assert.deepEqual(selectPostingsToClose(candidates, ["hash-a", "hash-c"]), ["b"]);
  });

  it("closes nothing when every prior row is still listed", () => {
    const candidates = [row("a", "hash-a"), row("b", "hash-b")];
    assert.deepEqual(selectPostingsToClose(candidates, ["hash-a", "hash-b"]), []);
  });

  it("sets closed_at exactly once and never moves it", () => {
    // The bug this guards: re-closing an already-closed row on every run
    // makes the reported count mean "absent from the page" instead of
    // "closed by this run", and drags closed_at forward until a fund that
    // shut down in March reads as having closed today.
    const first = new Date("2026-03-01T00:00:00Z");
    const later = new Date("2026-08-13T00:00:00Z");

    const initial = [row("a", "hash-a"), row("b", "hash-b"), row("c", "hash-c")];
    const stillListed = ["hash-a"];

    const firstRun = selectPostingsToClose(initial, stillListed);
    assert.deepEqual(firstRun.sort(), ["b", "c"]);

    const afterFirst = applyClose(initial, firstRun, first);

    // Same absent-row set, a later run: nothing new to close.
    const secondRun = selectPostingsToClose(afterFirst, stillListed);
    assert.deepEqual(secondRun, []);

    const afterSecond = applyClose(afterFirst, secondRun, later);
    for (const id of ["b", "c"]) {
      const r = afterSecond.find((x) => x.id === id);
      assert.deepEqual(r?.closedAt, first, `${id} kept its original closed_at`);
    }
    // ...and a third run is just as quiet.
    assert.deepEqual(selectPostingsToClose(afterSecond, stillListed), []);
  });

  it("closes nothing when the scrape came back empty", () => {
    // A transient fetch or parse failure returns zero listings. Treating
    // that as "every fund on this page shut down" would wipe the source out
    // on one bad request.
    const candidates = [row("a", "hash-a"), row("b", "hash-b")];
    assert.deepEqual(selectPostingsToClose(candidates, []), []);
  });

  it("ignores rows already closed even when the page grows", () => {
    const closedLongAgo = new Date("2026-01-05T00:00:00Z");
    const candidates = [row("a", "hash-a", closedLongAgo), row("b", "hash-b")];
    // "a" is still absent, but it was closed months ago — leave it alone.
    assert.deepEqual(selectPostingsToClose(candidates, ["hash-b"]), []);
  });

  it("has nothing to close on a source's first ever run", () => {
    assert.deepEqual(selectPostingsToClose([], ["hash-a", "hash-b"]), []);
  });
});
