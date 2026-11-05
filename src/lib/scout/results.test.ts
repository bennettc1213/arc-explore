import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeedItem } from "@/lib/feed";
import { selectScoutSections } from "./results";
import { defaultScout, scoutSchema } from "./types";
import { scoutFreshness } from "./freshness";

const now = new Date("2026-11-03T18:00:00Z");
function item(id: string, changes: Partial<FeedItem> = {}): FeedItem {
  return { id, kind: "scholarship", closedAt: null, isLottery: false, fit: { blocked: false }, deadlineAt: null, firstSeenAt: new Date("2026-10-01"), amountMin: 5000, amountMax: 5000, amountStatus: "exact", amountIsEstimated: false, ...changes } as FeedItem;
}
test("new results use discovery time and exclude future discovery timestamps", () => {
  const sections = selectScoutSections([item("recent", { firstSeenAt: new Date("2026-11-03T17:59:00Z") }), item("old", { postedAt: new Date("2026-11-03T17:59:00Z") }), item("future", { firstSeenAt: new Date("2026-11-04") })], now);
  assert.deepEqual(sections.find(s => s.id === "new")?.items.map(i => i.item.id), ["recent"]);
});
test("closed, expired, blocked and lottery opportunities cannot enter Scout sections", () => {
  const sections = selectScoutSections([item("closed", { closedAt: now }), item("expired", { deadlineAt: new Date("2026-11-02") }), item("blocked", { fit: { blocked: true } as FeedItem["fit"] }), item("lottery", { isLottery: true })], now);
  assert.deepEqual(sections, []);
});
test("each listing appears once and estimated awards remain unconfirmed", () => {
  const sections = selectScoutSections([item("new", { firstSeenAt: now, deadlineAt: new Date("2026-11-05"), amountIsEstimated: true }), item("closing", { deadlineAt: new Date("2026-11-10") })], now);
  const all = sections.flatMap(s => s.items);
  assert.equal(all.length, 2);
  assert.equal(all[0].confirmedAward, null);
  assert.equal(sections[1].id, "closing");
});
test("Scout validation permits a broad search and rejects invalid preferences", () => {
  assert.equal(scoutSchema.parse({ ...defaultScout, field: "Civil engineering" }).gpa, "");
  assert.equal(scoutSchema.safeParse({ ...defaultScout, field: "" }).success, true);
  assert.equal(scoutSchema.safeParse({ ...defaultScout, field: "Engineering", gpa: -1 }).success, false);
});

test("Scout categories retain every admitted result beyond twelve of the same kind", () => {
  const sections = selectScoutSections(Array.from({ length: 40 }, (_, index) => item(String(index))), now);
  assert.equal(sections.flatMap(section => section.items).length, 40);
});

test("freshness distinguishes recent checks, older observations, and unverified imports", () => {
  const firstSeen = new Date("2026-10-01");
  assert.equal(scoutFreshness(firstSeen, new Date("2026-11-03T17:00:00Z"), "live_polled", now).state, "recent");
  assert.equal(scoutFreshness(firstSeen, firstSeen, "periodic_check", now).state, "older");
  assert.equal(scoutFreshness(firstSeen, now, "unverified_static", now).state, "unverified");
  assert.equal(scoutFreshness(firstSeen, new Date("2026-11-04"), "live_polled", now).state, "unverified");
});

test("discovery labels use first seen and never borrow a recent source check", () => {
  assert.equal(scoutFreshness(now, now, "live_polled", now).foundLabel, "New to Instela just now");
  assert.equal(scoutFreshness(new Date(now.getTime() - 60000), now, "live_polled", now).foundLabel, "Found 1 minute ago");
  assert.equal(scoutFreshness(new Date("2026-10-01"), now, "live_polled", now).foundLabel, null);
});
