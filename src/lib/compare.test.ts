import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_COMPARE, buildComparison, daysUntil, parseCompareIds } from "./compare";
import type { FeedItem } from "./feed";

const NOW = new Date("2026-08-15T12:00:00Z");

function item(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "a",
    kind: "internship",
    title: "Software Engineering Intern",
    company: "Acme",
    url: "https://example.com/a",
    locations: ["Chicago"],
    isRemote: false,
    term: "Summer 2027",
    workAuth: null,
    skills: ["Python", "SQL"],
    deadlineAt: null,
    amountMin: null,
    amountMax: null,
    amountNeedsReview: false,
    applyLinkDead: false,
    eligibility: [],
    isContentMarketing: false,
    freshnessTier: "live_polled",
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    closedAt: null,
    fields: [],
    fit: {
      score: 70,
      blocked: false,
      knownDimensions: 4,
      totalDimensions: 5,
      reasons: [],
    },
    timing: { score: 80, label: "", liveness: "" },
    ...over,
  } as FeedItem;
}

/* ------------------------------------------------------------------ *
 * Ids
 * ------------------------------------------------------------------ */

test("ids are deduped and capped rather than rejected", () => {
  // Someone arriving with five should get a comparison of three, not an error.
  assert.deepEqual(parseCompareIds("a,b,c,d,e"), ["a", "b", "c"]);
  assert.deepEqual(parseCompareIds("a,a,b"), ["a", "b"]);
  assert.deepEqual(parseCompareIds(" a , b "), ["a", "b"]);
  assert.deepEqual(parseCompareIds(undefined), []);
  assert.deepEqual(parseCompareIds(""), []);
  assert.ok(parseCompareIds("a,b,c,d").length <= MAX_COMPARE);
});

/* ------------------------------------------------------------------ *
 * Difference detection
 * ------------------------------------------------------------------ */

test("a stated value against an unstated one counts as a difference", () => {
  /*
   * The rule the whole page rests on. "One of these publishes a deadline and
   * the other does not" is the difference between an application you can plan
   * and one that could close tomorrow. Rendering both as a quiet dash would
   * hide exactly the thing worth seeing.
   */
  const c = buildComparison(
    [item({ deadlineAt: new Date("2026-09-01T00:00:00Z") }), item({ id: "b", deadlineAt: null })],
    NOW,
  );
  const deadline = c.rows.find((r) => r.label === "deadline");
  assert.ok(deadline);
  assert.equal(deadline.differs, true);
  assert.equal(deadline.cells[1].value, null);
  assert.ok(c.differing.includes(deadline));
});

test("identical rows are separated out rather than shown as findings", () => {
  const c = buildComparison([item(), item({ id: "b" })], NOW);
  const term = c.rows.find((r) => r.label === "term");
  assert.ok(term);
  assert.equal(term.differs, false);
  assert.ok(c.shared.includes(term));
  assert.equal(c.differing.includes(term), false);
});

test("every row lands in exactly one of differing or shared", () => {
  const c = buildComparison([item(), item({ id: "b", company: "Globex" })], NOW);
  assert.equal(c.differing.length + c.shared.length, c.rows.length);
  for (const r of c.rows) {
    assert.equal(c.differing.includes(r) !== c.shared.includes(r), true, r.label);
  }
});

/* ------------------------------------------------------------------ *
 * Marking a winner
 * ------------------------------------------------------------------ */

test("the higher fit score is marked", () => {
  const c = buildComparison(
    [item({ fit: { ...item().fit, score: 80 } }), item({ id: "b", fit: { ...item().fit, score: 40 } })],
    NOW,
  );
  const fit = c.rows.find((r) => r.label === "fit");
  assert.equal(fit?.cells[0].best, true);
  assert.equal(fit?.cells[1].best, undefined);
});

test("a tie marks nobody", () => {
  // Marking the first column on a tie quietly implies it came out ahead.
  const c = buildComparison([item(), item({ id: "b" })], NOW);
  const fit = c.rows.find((r) => r.label === "fit");
  assert.equal(fit?.cells.some((x) => x.best), false);
});

test("an unscorable column means no winner at all", () => {
  /*
   * Declaring a winner would be ranking one posting above another on a fact we
   * do not hold for both — the same rule that makes unknown dimensions drop out
   * of a fit score rather than count as a miss.
   */
  const c = buildComparison(
    [item({ fit: { ...item().fit, score: 90 } }), item({ id: "b", fit: { ...item().fit, score: null } })],
    NOW,
  );
  const fit = c.rows.find((r) => r.label === "fit");
  assert.equal(fit?.cells.some((x) => x.best), false);
  assert.equal(fit?.cells[1].value, null);
});

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

test("deadlines count whole calendar days, matching the reminder job", () => {
  // Not elapsed time: these are dates, and midnight is an artifact of parsing.
  assert.equal(daysUntil(new Date("2026-08-16T00:00:00Z"), NOW), 1);
  assert.equal(daysUntil(new Date("2026-08-15T23:00:00Z"), NOW), 0);
  assert.equal(daysUntil(new Date("2026-08-14T00:00:00Z"), NOW), -1);
});

test("a passed deadline says so instead of showing a negative count", () => {
  const c = buildComparison(
    [item({ deadlineAt: new Date("2026-08-01T00:00:00Z") }), item({ id: "b" })],
    NOW,
  );
  assert.match(c.rows.find((r) => r.label === "deadline")!.cells[0].value!, /passed/);
});

test("an amount the source stated but we could not read is distinguished from silence", () => {
  const c = buildComparison(
    [
      item({ kind: "scholarship", amountMin: 5000, amountMax: 5000 }),
      item({ id: "b", kind: "scholarship", amountNeedsReview: true }),
    ],
    NOW,
  );
  const award = c.rows.find((r) => r.label === "award");
  assert.equal(award?.cells[0].value, "$5,000");
  assert.equal(award?.cells[1].value, "stated, unreadable");
});

test("the award row is omitted entirely when no column has one", () => {
  // An all-empty row is noise. Two internships should not be compared on a
  // dimension neither of them has.
  const c = buildComparison([item(), item({ id: "b" })], NOW);
  assert.equal(c.rows.some((r) => r.label === "award"), false);
});

test("freshness reports what we verified, not when it was posted", () => {
  const c = buildComparison(
    [item(), item({ id: "b", freshnessTier: "periodic_check" })],
    NOW,
  );
  const fresh = c.rows.find((r) => r.label === "how fresh");
  assert.equal(fresh?.cells[0].value, "confirmed live");
  assert.match(fresh!.cells[1].value!, /^checked \d{4}-\d{2}-\d{2}$/);
  assert.equal(fresh?.differs, true);
});

test("a dead apply link shows up as a difference worth seeing", () => {
  const c = buildComparison([item({ applyLinkDead: true }), item({ id: "b" })], NOW);
  const link = c.rows.find((r) => r.label === "apply link");
  assert.equal(link?.cells[0].value, "may be dead");
  assert.equal(link?.differs, true);
});

test("three columns work as well as two", () => {
  const c = buildComparison(
    [item(), item({ id: "b", company: "Globex" }), item({ id: "c", company: "Initech" })],
    NOW,
  );
  assert.equal(c.items.length, 3);
  for (const r of c.rows) assert.equal(r.cells.length, 3, r.label);
  assert.equal(c.rows.find((r) => r.label === "organisation")?.differs, true);
});
