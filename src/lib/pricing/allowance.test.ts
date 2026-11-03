import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALLOWANCE_PERIOD_MS,
  BROWSER_WORKFLOW_MS,
  RESERVATION_TTL_MS,
  accessAfterUse,
  allowanceStatus,
  currentPeriod,
  decide,
  type GrantRow,
} from "./allowance";
import { ALLOWANCE_PERIOD_DAYS, FEATURES } from "./tiers";

const T0 = new Date("2026-11-03T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
let seq = 0;

function grant(over: Partial<GrantRow> = {}): GrantRow {
  return {
    id: `g${seq++}`,
    key: "k1",
    periodStart: T0,
    grantedAt: T0,
    expiresAt: null,
    status: "granted",
    ...over,
  };
}

test("the period is 30 days and every allowance tool is metered per period", () => {
  assert.equal(ALLOWANCE_PERIOD_DAYS, 30);
  for (const f of ["resume_critique", "cover_letter", "github_tools", "linkedin_tools", "essay_reviewer"] as const) {
    assert.equal(FEATURES[f].meter, "period");
    assert.equal(FEATURES[f].limits.free, 1);
    assert.equal(FEATURES[f].limits.apply, null);
  }
});

test("first successful use on Free starts a period at that instant", () => {
  const d = decide("free", "resume_critique", [], ["rev-a"], T0);
  assert.equal(d.kind, "new");
  assert.equal(d.kind === "new" && d.periodStart?.toISOString(), T0.toISOString());
  // The first run must be usable — the old lifetime counter once charged it
  // before answering and rendered an upgrade wall over the free run.
  assert.equal(d.status.access.usable, true);
  const after = accessAfterUse(d.status);
  assert.equal(after.usable, true);
  assert.equal(after.remaining, 0);
});

test("reloading the same input is a replay and never charges", () => {
  const rows = [grant({ key: "rev-a" })];
  const d = decide("free", "resume_critique", rows, ["rev-a"], at(5 * 86_400_000));
  assert.equal(d.kind, "replay");
});

test("an earned result stays replayable after its period ends", () => {
  const rows = [grant({ key: "rev-a" })];
  const d = decide("free", "resume_critique", rows, ["rev-a"], at(400 * 86_400_000));
  assert.equal(d.kind, "replay");
});

test("a new input inside the period is blocked, with the renewal date", () => {
  const rows = [grant({ key: "rev-a" })];
  const d = decide("free", "resume_critique", rows, ["rev-b"], at(86_400_000));
  assert.equal(d.kind, "blocked");
  assert.equal(d.status.access.reason, "limit_reached");
  assert.equal(d.status.renewsAt?.toISOString(), at(ALLOWANCE_PERIOD_MS).toISOString());
});

test("renewal boundary: blocked 1ms before 30 days, available at exactly 30 days", () => {
  const rows = [grant({ key: "rev-a" })];
  assert.equal(decide("free", "cover_letter", rows, ["p2"], at(ALLOWANCE_PERIOD_MS - 1)).kind, "blocked");
  const d = decide("free", "cover_letter", rows, ["p2"], at(ALLOWANCE_PERIOD_MS));
  assert.equal(d.kind, "new");
  // The new use starts a fresh period at its own instant, not at the old boundary.
  assert.equal(d.kind === "new" && d.periodStart?.toISOString(), at(ALLOWANCE_PERIOD_MS).toISOString());
});

test("an idle allowance does not tick over on its own", () => {
  const rows = [grant({ key: "rev-a" })];
  const later = at(75 * 86_400_000);
  assert.equal(currentPeriod(rows, later), null);
  const d = decide("free", "resume_critique", rows, ["rev-b"], later);
  assert.equal(d.kind === "new" && d.periodStart?.toISOString(), later.toISOString());
});

test("tools are independent: one tool's use does not touch another's", () => {
  // Rows are loaded per feature, so the essay tool sees none of the resume rows.
  const resumeRows = [grant({ key: "rev-a" })];
  assert.equal(decide("free", "resume_critique", resumeRows, ["rev-b"], at(1)).kind, "blocked");
  assert.equal(decide("free", "essay_reviewer", [], ["session"], at(1)).kind, "new");
});

test("failed work: a released reservation leaves the allowance untouched", () => {
  // releaseUse deletes the reserved row, so the next decision sees no rows.
  assert.equal(decide("free", "github_tools", [], ["octocat"], at(10)).kind, "new");
});

test("a crashed request's reservation stops counting after its TTL", () => {
  const stuck = [grant({ key: "octocat", status: "reserved" })];
  assert.equal(decide("free", "github_tools", stuck, ["other"], at(RESERVATION_TTL_MS - 1)).kind, "blocked");
  assert.equal(decide("free", "github_tools", stuck, ["other"], at(RESERVATION_TTL_MS)).kind, "new");
});

test("concurrent requests: an open reservation holds the last unit", () => {
  // Request A reserved; request B (different input) arrives before A confirms.
  const rows = [grant({ key: "octocat", status: "reserved" })];
  assert.equal(decide("free", "github_tools", rows, ["torvalds"], at(100)).kind, "blocked");
  // Request B for the SAME input is a double submit, not a second use.
  assert.equal(decide("free", "github_tools", rows, ["octocat"], at(100)).kind, "in_flight");
});

test("Pro is unlimited and records uses with no period", () => {
  const rows = [grant({ key: "a", periodStart: null }), grant({ key: "b", periodStart: null })];
  const d = decide("apply", "cover_letter", rows, ["c"], at(1));
  assert.equal(d.kind, "new");
  assert.equal(d.kind === "new" && d.periodStart, null);
});

test("after a downgrade, Pro-era uses do not exhaust Free but stay replayable", () => {
  const rows = [grant({ key: "a", periodStart: null }), grant({ key: "b", periodStart: null })];
  assert.equal(decide("free", "cover_letter", rows, ["a"], at(1)).kind, "replay");
  assert.equal(decide("free", "cover_letter", rows, ["new-one"], at(1)).kind, "new");
  assert.equal(allowanceStatus("free", "cover_letter", rows, at(1)).access.remaining, 1);
});

test("a replay alias recognises a pre-migration key", () => {
  const rows = [grant({ key: "legacy-resume-id" })];
  assert.equal(decide("free", "resume_critique", rows, ["content-hash", "legacy-resume-id"], at(1)).kind, "replay");
});

test("browser-local sessions replay until they expire, then need a new period", () => {
  const rows = [grant({ key: "session", expiresAt: at(BROWSER_WORKFLOW_MS) })];
  assert.equal(decide("free", "linkedin_tools", rows, ["session"], at(BROWSER_WORKFLOW_MS - 1)).kind, "replay");
  // Expired session inside the same 30-day period: no second session on Free.
  assert.equal(decide("free", "linkedin_tools", rows, ["session"], at(BROWSER_WORKFLOW_MS)).kind, "blocked");
  assert.equal(decide("apply", "linkedin_tools", rows, ["session"], at(BROWSER_WORKFLOW_MS)).kind, "new");
});
