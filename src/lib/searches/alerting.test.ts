import assert from "node:assert/strict";
import { test } from "node:test";

import { DAY_MS } from "@/lib/pricing/allowance";

import { ALERT_SLACK_MS, alertDue, alertingSearchIds, dueSearches, freeAlertSlot, savedSearchLimit, type AlertingInput } from "./alerting";

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const s = (id: string, created: number, over: Partial<AlertingInput> = {}): AlertingInput => ({
  id,
  notify: true,
  createdAt: day(created),
  freeAlertPickedAt: null,
  ...over,
});

test("Free holds one saved search; Pro many, up to the operational ceiling", () => {
  assert.equal(savedSearchLimit("free"), 1);
  assert.equal(savedSearchLimit("apply"), 20);
});

test("Pro alerts on every search with alerts on", () => {
  const ids = alertingSearchIds([s("a", 1), s("b", 2), s("c", 3, { notify: false })], "apply");
  assert.deepEqual([...ids].sort(), ["a", "b"]);
});

test("after a downgrade Free keeps one alert active, the newest by default", () => {
  const ids = alertingSearchIds([s("a", 1), s("b", 2), s("c", 3)], "free");
  assert.deepEqual([...ids], ["c"]);
});

test("the student's own pick wins on Free, and the latest pick wins", () => {
  const searches = [
    s("a", 1, { freeAlertPickedAt: day(10) }),
    s("b", 2, { freeAlertPickedAt: day(12) }),
    s("c", 3),
  ];
  assert.deepEqual([...alertingSearchIds(searches, "free")], ["b"]);
});

test("turning off (or unsubscribing from) the Free alert never starts another", () => {
  // The slot stays with the picked search; with its alerts off, nothing emails.
  const searches = [s("a", 1, { notify: false, freeAlertPickedAt: day(12) }), s("b", 2)];
  assert.deepEqual([...alertingSearchIds(searches, "free")], []);
  assert.equal(freeAlertSlot(searches), "a");
  // Same with no pick: the newest holds the slot even when switched off.
  assert.deepEqual([...alertingSearchIds([s("a", 1), s("b", 2, { notify: false })], "free")], []);
});

test("the alert job: due, paused and not-due searches after a downgrade", () => {
  const now = day(20);
  const row = (id: string, created: number, plan: "free" | "apply", last: number, over: Partial<AlertingInput> = {}) => ({
    ...s(id, created, over),
    userId: "u1",
    plan,
    lastNotifiedAt: day(last),
  });
  // A downgraded account with three searches: only the newest alerts, weekly.
  const free = dueSearches([row("a", 1, "free", 10), row("b", 2, "free", 10), row("c", 3, "free", 10)], now);
  assert.deepEqual(free.due.map((r) => r.id), ["c"]);
  assert.equal(free.paused, 2);
  // Same account, last alerted 3 days ago: weekly cadence holds it back.
  const recent = dueSearches([row("c", 3, "free", 17)], now);
  assert.equal(recent.due.length, 0);
  assert.equal(recent.notDue, 1);
  // On Pro all three alert, daily.
  const pro = dueSearches([row("a", 1, "apply", 19), row("b", 2, "apply", 19), row("c", 3, "apply", 19)], now);
  assert.equal(pro.due.length, 3);
});

test("Free alerts weekly, Pro daily, with slack for scheduler drift", () => {
  const last = day(1);
  const at = (ms: number) => new Date(last.getTime() + ms);
  assert.equal(alertDue(last, at(DAY_MS - ALERT_SLACK_MS - 1), "apply"), false);
  assert.equal(alertDue(last, at(DAY_MS - ALERT_SLACK_MS), "apply"), true);
  assert.equal(alertDue(last, at(6 * DAY_MS), "free"), false);
  assert.equal(alertDue(last, at(7 * DAY_MS - ALERT_SLACK_MS), "free"), true);
});
