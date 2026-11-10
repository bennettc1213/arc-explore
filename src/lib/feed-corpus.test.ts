import assert from "node:assert/strict";
import { test } from "node:test";

import { canUseCorpusMemo, filterCorpusRows } from "./feed-corpus";
import { parseQuery } from "./search/query";

const bare = parseQuery(undefined);

test("the browse shape is served from the corpus memo", () => {
  assert.equal(canUseCorpusMemo({}, bare), true);
  assert.equal(canUseCorpusMemo({ kind: "internship", remoteOnly: true, excludeMarketing: true, hideBlocked: true, category: "software", limit: 20 }, bare), true);
});

test("every narrowing filter falls back to SQL", () => {
  const narrowing = [
    { includeClosed: true }, { newSince: new Date() }, { term: "Summer 2027" }, { includeInferred: false },
    { meritOnly: true }, { college: "Utah" }, { deadline: "30" as const }, { minAmount: 1000 }, { location: "Denver" },
  ];
  for (const f of narrowing) assert.equal(canUseCorpusMemo(f, bare), false, JSON.stringify(f));
  // A typed search, and an amount lifted out of one, both narrow in SQL.
  assert.equal(canUseCorpusMemo({}, parseQuery("nursing")), false);
  assert.equal(canUseCorpusMemo({}, { terms: [], minAmount: 5000 }), false);
});

test("in-memory filters match the SQL conditions, including nulls", () => {
  const rows = [
    { id: "a", kind: "internship" as const, isRemote: true, isContentMarketing: false },
    { id: "b", kind: "internship" as const, isRemote: null, isContentMarketing: null },
    { id: "c", kind: "scholarship" as const, isRemote: false, isContentMarketing: true },
    { id: "d", kind: "scholarship" as const, isRemote: true, isContentMarketing: false },
  ];
  const ids = (f: Parameters<typeof filterCorpusRows>[1]) => filterCorpusRows(rows, f).map((r) => r.id);
  assert.deepEqual(ids({ kind: null, remoteOnly: false, excludeMarketing: false }), ["a", "b", "c", "d"]);
  assert.deepEqual(ids({ kind: "scholarship", remoteOnly: false, excludeMarketing: false }), ["c", "d"]);
  // `eq(isRemote, true)` and `eq(isContentMarketing, false)` never match NULL in SQL.
  assert.deepEqual(ids({ kind: null, remoteOnly: true, excludeMarketing: false }), ["a", "d"]);
  assert.deepEqual(ids({ kind: null, remoteOnly: false, excludeMarketing: true }), ["a", "d"]);
});
