import assert from "node:assert/strict";
import { test } from "node:test";

import { FEED_MIN_PER_KIND, FREE_DAILY_RESULTS, trimWithReservation } from "./feed-trim";

type Row = { id: number; kind: "internship" | "scholarship" };

const scholarships = (n: number, from = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, kind: "scholarship" as const }));
const internships = (n: number, from = 100): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, kind: "internship" as const }));

test("a list shorter than the limit is returned whole", () => {
  const rows = [...scholarships(3), ...internships(2)];
  assert.deepEqual(trimWithReservation(rows, 20, 5), rows);
});

test("with no reservation it is a plain slice in rank order", () => {
  const rows = [...scholarships(30)];
  const out = trimWithReservation(rows, 20, 0);
  assert.equal(out.length, 20);
  assert.deepEqual(out.map((r) => r.id), rows.slice(0, 20).map((r) => r.id));
});

test("the crowded-out kind is guaranteed its slots", () => {
  /*
   * THE CASE THIS EXISTS FOR, and it is not hypothetical. FIXES.md records
   * that scholarships structurally outrank internships — three known
   * dimensions reaching a confident 100 against five with two routinely
   * unstated — measured live at best-scholarship 100.0 vs best-internship
   * 82.0. The uncapped feed hides that by showing everything. Capping the
   * free plan at twenty would stop hiding it, and a student could open the
   * product to twenty scholarships and no internships at all.
   */
  const rows = [...scholarships(40), ...internships(40)];
  const out = trimWithReservation(rows, FREE_DAILY_RESULTS, FEED_MIN_PER_KIND);

  assert.equal(out.length, FREE_DAILY_RESULTS);
  assert.ok(
    out.filter((r) => r.kind === "internship").length >= FEED_MIN_PER_KIND,
    "internships were crowded out entirely",
  );
  assert.ok(out.filter((r) => r.kind === "scholarship").length >= FEED_MIN_PER_KIND);
});

test("it promotes, never reorders — output stays in rank order", () => {
  const rows = [...scholarships(40), ...internships(40)];
  const out = trimWithReservation(rows, FREE_DAILY_RESULTS, FEED_MIN_PER_KIND);
  const positions = out.map((r) => rows.indexOf(r));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "rank order was disturbed");
});

test("promoted rows are the BEST of their kind, not an arbitrary few", () => {
  // A guarantee that surfaced the wrong internships would be worse than none.
  const rows = [...scholarships(40), ...internships(40)];
  const out = trimWithReservation(rows, FREE_DAILY_RESULTS, FEED_MIN_PER_KIND);
  const promoted = out.filter((r) => r.kind === "internship").map((r) => r.id);
  const bestInternships = internships(40).slice(0, promoted.length).map((r) => r.id);
  assert.deepEqual(promoted, bestInternships);
});

test("one kind alone is not padded with rows that do not exist", () => {
  const rows = scholarships(40);
  const out = trimWithReservation(rows, FREE_DAILY_RESULTS, FEED_MIN_PER_KIND);
  assert.equal(out.length, FREE_DAILY_RESULTS);
  assert.ok(out.every((r) => r.kind === "scholarship"));
});

test("the reservation never inflates the list past the limit", () => {
  for (const limit of [1, 5, 11, 20, 50]) {
    const rows = [...scholarships(60), ...internships(60)];
    const out = trimWithReservation(rows, limit, FEED_MIN_PER_KIND);
    assert.ok(out.length <= limit, `limit ${limit} produced ${out.length}`);
  }
});

test("a limit below the reservation still returns exactly the limit", () => {
  // 2 slots cannot honour 5-per-kind; the cap wins rather than overflowing.
  const rows = [...scholarships(30), ...internships(30)];
  const out = trimWithReservation(rows, 2, FEED_MIN_PER_KIND);
  assert.equal(out.length, 2);
});
