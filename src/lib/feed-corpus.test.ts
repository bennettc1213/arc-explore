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

test("each source keeps its first `cap` rows in place; the rest move to the end, never dropped", async () => {
  const { capPerSource, sourceCapFor } = await import("./feed-trim");
  const rows = ["osac", "osac", "osac", "osac", "a", "osac", "b", null, "c"].map((s, i) => ({ i, s }));
  const out = capPerSource(rows, 2, (r) => r.s);
  assert.deepEqual(out.map((r) => r.i), [0, 1, 4, 6, 7, 8, 2, 3, 5]);
  assert.equal(out.length, rows.length);
  // Case and spacing do not make two sources out of one.
  assert.deepEqual(capPerSource([{ s: "OSAC " }, { s: "osac" }, { s: "Osac" }, { s: "x" }], 2, (r) => r.s).map((r) => r.s), ["OSAC ", "osac", "x", "Osac"]);
  // With nothing else to show, the window still fills.
  assert.equal(capPerSource([{ s: "a" }, { s: "a" }, { s: "a" }, { s: "a" }], 1, (r) => r.s).length, 4);
  assert.equal(sourceCapFor(20), 3);
  assert.equal(sourceCapFor(100), 15);
});

test("a stated residency becomes a rule that fails another state and stays unknown without one", async () => {
  const { extractOpportunityFacts } = await import("./score/v2/requirements");
  const { evaluateEligibility } = await import("./score/v2/engine");
  const facts = extractOpportunityFacts({ title: "X", criteria: ["Residence (county): Polk County"], url: "https://example.org", observedAt: "2026-11-10T00:00:00Z",
    statedResidency: { states: ["Oregon"], quote: "Residence (county): Polk County" } });
  const state = (residency: string | null) => evaluateEligibility(facts.rules, { residency } as never).state;
  assert.equal(state("Texas"), "fail");
  assert.notEqual(state("Oregon"), "fail");
  assert.notEqual(state(null), "fail");
});
