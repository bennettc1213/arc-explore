import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeedItem } from "@/lib/feed";
import { buildScoutTiers, resolveScout } from "./results";
import { defaultScout, scoutSchema, type ScoutPreferences } from "./types";
import { scoutFreshness } from "./freshness";

const now = new Date("2026-11-03T18:00:00Z");
function item(id: string, changes: Partial<FeedItem> = {}): FeedItem {
  return {
    id, kind: "scholarship", title: `Listing ${id}`, company: `Sponsor ${id}`, eligibility: [], skills: [], fields: [], locations: [], isRemote: false,
    closedAt: null, isLottery: false, fit: { blocked: false }, deadlineAt: null, firstSeenAt: new Date("2026-10-01"),
    amountMin: 5000, amountMax: 5000, amountStatus: "exact", amountIsEstimated: false, ...changes,
  } as FeedItem;
}
const scout = (p: Partial<ScoutPreferences>) => resolveScout(scoutSchema.parse({ ...defaultScout, ...p }));
const tiers = (items: FeedItem[], p: Partial<ScoutPreferences>, limit = 20) => buildScoutTiers(items, scout(p), { limit, reservePerKind: 0, now });
const ids = (r: ReturnType<typeof tiers>, tier: string) => r.tiers.find((t) => t.id === tier)?.items.map((i) => i.id) ?? [];

test("closed, expired, blocked and lottery opportunities never enter a Scout", () => {
  const r = tiers([item("closed", { closedAt: now }), item("expired", { deadlineAt: new Date("2026-11-02") }), item("blocked", { fit: { blocked: true } as FeedItem["fit"] }), item("lottery", { isLottery: true })], {});
  assert.deepEqual(r.tiers, []);
  assert.equal(r.total, 0);
});

test("the live regression: a cybersecurity Scout leads with listings that say cyber, not generic software", () => {
  const r = tiers([
    item("java", { kind: "internship", title: "Entry Level Java Developer", fields: ["software"] }),
    item("eset", { title: "ESET Women in Cybersecurity Scholarship" }),
    item("caci", { kind: "internship", title: "Cyber Security Intern - Summer 2027", fields: ["software"] }),
    item("garden", { title: "National Garden Clubs Scholarship" }),
  ], { field: "cyber security, with grad of 2028" });
  assert.deepEqual(ids(r, "best").sort(), ["caci", "eset"]);
  assert.deepEqual(ids(r, "related"), ["java"]);
  assert.deepEqual(ids(r, "broader"), ["garden"]);
});

test("a soft preference never empties a Scout: unmet rows move to the relaxed tier and say why", () => {
  const r = tiers([item("ohio", { kind: "internship", title: "Nursing Intern", locations: ["Columbus, OH"] })], { field: "Nursing", location: "Texas" });
  assert.deepEqual(ids(r, "relaxed"), ["ohio"]);
  assert.deepEqual(r.tiers[0].relaxed, ["Texas"]);
});

test("a listing that states no location is unknown, not a miss, and a remote role meets a location preference", () => {
  const r = tiers([
    item("national", { title: "Nursing Scholarship" }),
    item("remote", { kind: "internship", title: "Nurse Intern", locations: ["Remote"], isRemote: true }),
    item("austin-mn", { kind: "internship", title: "Student Nurse Intern", locations: ["Austin, MN"] }),
    item("austin-tx", { kind: "internship", title: "Nurse Intern", locations: ["Austin, TX"] }),
  ], { field: "Nursing", location: "Texas" });
  assert.deepEqual(ids(r, "best").sort(), ["austin-tx", "national", "remote"]);
  assert.deepEqual(ids(r, "relaxed"), ["austin-mn"]);
});

test("strict location and remote-only are the hard filters, and an empty result names them", () => {
  const items = [item("ohio", { kind: "internship", title: "Data Science Intern", locations: ["Columbus, OH"] })];
  const strict = tiers(items, { field: "Data science", location: "Colorado", locationStrict: true });
  assert.equal(strict.total, 0);
  assert.deepEqual(strict.emptyBecause, ["only Colorado"]);
  const soft = tiers(items, { field: "Data science", location: "Colorado" });
  assert.equal(soft.total, 1);
});

test("deadline and amount preferences rank rows that meet them first", () => {
  const r = tiers([
    item("big-later", { title: "Finance Scholarship", amountMin: 10000, amountMax: 10000, deadlineAt: new Date("2027-03-01") }),
    item("big-soon", { title: "Finance Scholarship II", amountMin: 10000, amountMax: 10000, deadlineAt: new Date("2026-11-20") }),
    item("small-soon", { title: "Finance Award", amountMin: 500, amountMax: 500, deadlineAt: new Date("2026-11-20") }),
  ], { field: "Finance", deadline: "30", minAward: "5000" });
  assert.deepEqual(ids(r, "best"), ["big-soon"]);
  assert.deepEqual(ids(r, "relaxed").sort(), ["big-later", "small-soon"]);
});

test("typed words are whole words: basket weaving does not find basketball", () => {
  const r = tiers([item("ball", { kind: "internship", title: "Basketball Operations Intern" })], { field: "underwater basket weaving" });
  assert.deepEqual(ids(r, "best"), []);
  assert.deepEqual(ids(r, "broader"), ["ball"]);
});

test("the window fills tier by tier and keeps each kind's reservation", () => {
  const items = [
    ...Array.from({ length: 30 }, (_, n) => item(`s${n}`, { title: `Cybersecurity Scholarship ${n}` })),
    item("i1", { kind: "internship", title: "Warehouse Intern" }),
  ];
  const r = buildScoutTiers(items, scout({ field: "Cybersecurity" }), { limit: 10, reservePerKind: 3, now });
  const shown = r.tiers.flatMap((t) => t.items);
  assert.equal(shown.length, 10);
  assert.ok(shown.some((i) => i.id === "i1"), "the reservation still promotes the other kind");
  assert.equal(r.bestTotal, 30);
});

test("Scout validation permits a broad search and loads preferences saved before tiers existed", () => {
  assert.equal(scoutSchema.parse({ ...defaultScout, field: "Civil engineering" }).gpa, "");
  assert.equal(scoutSchema.safeParse({ ...defaultScout, field: "" }).success, true);
  assert.equal(scoutSchema.safeParse({ ...defaultScout, field: "Engineering", gpa: -1 }).success, false);
  const old = { kind: "both", field: "Nursing", location: "", remote: false, priority: "fit", school: "", gradYear: "", workAuth: "", gpa: "", gpaScale: "4", residency: "" };
  const parsed = scoutSchema.parse(old);
  assert.equal(parsed.locationStrict, false);
  assert.equal(parsed.deadline, "any");
  assert.equal(parsed.minAward, "0");
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
