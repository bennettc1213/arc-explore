import assert from "node:assert/strict";
import { test } from "node:test";

import { SOURCE_CATALOGUE, classifySource, formatAge, perDay, type RunFacts, type SourceFacts } from "./source-health";

const NOW = new Date("2026-11-03T20:00:00Z");
const ATS = { staleAfterHours: 1.5 };
const WEEKLY = { staleAfterHours: 192 };

function run(over: Partial<RunFacts> = {}): RunFacts {
  return {
    startedAt: new Date("2026-11-03T19:40:00Z"),
    finishedAt: new Date("2026-11-03T19:46:00Z"),
    postingsSeen: 500,
    postingsNew: 3,
    errors: 0,
    errorMessage: null,
    ...over,
  };
}

function facts(over: Partial<SourceFacts> = {}): SourceFacts {
  return { open: 100, new24h: 5, new7d: 21, lastRun: run(), runningSince: null, boards: null, ...over };
}

test("a run that read listings without errors is healthy", () => {
  assert.equal(classifySource(ATS, facts(), NOW).health, "healthy");
});

test("a run that read nothing and errored is failing, with its own message", () => {
  /*
   * The case that made this module judge runs by what they did: the live
   * scholarships.com run on 2026-11-01 is stored as `successful_complete`
   * despite reading nothing because PARSE_API_KEY was unset.
   */
  const v = classifySource(
    WEEKLY,
    facts({ lastRun: run({ postingsSeen: 0, errors: 1, errorMessage: "PARSE_API_KEY is not set" }) }),
    NOW,
  );
  assert.equal(v.health, "failing");
  assert.equal(v.reason, "PARSE_API_KEY is not set");
});

test("failing outranks stale, so the page points at the key rather than the scheduler", () => {
  const old = new Date("2026-10-01T00:00:00Z");
  const v = classifySource(ATS, facts({ lastRun: run({ startedAt: old, postingsSeen: 0, errors: 2 }) }), NOW);
  assert.equal(v.health, "failing");
});

test("a run older than its schedule allows is stale", () => {
  const v = classifySource(ATS, facts({ lastRun: run({ startedAt: new Date("2026-11-03T17:00:00Z") }) }), NOW);
  assert.equal(v.health, "stale");
  assert.match(v.reason, /3 h ago/);
});

test("the same age is fine for a weekly source", () => {
  const v = classifySource(WEEKLY, facts({ lastRun: run({ startedAt: new Date("2026-10-30T00:00:00Z") }) }), NOW);
  assert.equal(v.health, "healthy");
});

test("a source whose every listing is closed is degraded", () => {
  // CFT Texas on 2026-11-01: read 48 listings, 0 open.
  const v = classifySource(WEEKLY, facts({ open: 0, lastRun: run({ postingsSeen: 48 }) }), NOW);
  assert.equal(v.health, "degraded");
  assert.match(v.reason, /none of them is open/);
});

test("an ATS family with too many dead boards is degraded", () => {
  const v = classifySource(ATS, facts({ boards: { total: 100, failing: 30 } }), NOW);
  assert.equal(v.health, "degraded");
  assert.equal(classifySource(ATS, facts({ boards: { total: 100, failing: 25 } }), NOW).health, "healthy");
});

test("a few board errors on a run that still read listings are normal", () => {
  assert.equal(classifySource(ATS, facts({ lastRun: run({ errors: 4 }) }), NOW).health, "healthy");
});

test("no run at all says so, and notices a first run in progress", () => {
  assert.equal(classifySource(ATS, facts({ lastRun: null }), NOW).reason, "no run has ever been recorded");
  assert.equal(
    classifySource(ATS, facts({ lastRun: null, runningSince: NOW }), NOW).reason,
    "first run is in progress",
  );
});

test("a source missing from the catalogue is still judged, just never as stale", () => {
  const old = new Date("2026-01-01T00:00:00Z");
  assert.equal(classifySource(null, facts({ lastRun: run({ startedAt: old }) }), NOW).health, "healthy");
});

test("catalogue keys are unique", () => {
  const keys = SOURCE_CATALOGUE.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("ages and per-day rates read the way the page prints them", () => {
  assert.equal(formatAge(new Date("2026-11-03T19:56:00Z"), NOW), "4 min ago");
  assert.equal(formatAge(new Date("2026-11-03T17:00:00Z"), NOW), "3 h ago");
  assert.equal(formatAge(new Date("2026-10-30T20:00:00Z"), NOW), "4 days ago");
  assert.equal(perDay(21), 3);
  assert.equal(perDay(10), 1.4);
});
