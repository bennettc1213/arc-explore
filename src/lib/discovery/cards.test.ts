import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeedItem } from "@/lib/feed";
import { discoveryCardSchema, readGuestSaves, savedSnapshot, toDiscoveryCard } from "./cards";

function posting(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "scholarship-1", kind: "scholarship", title: "College Merit Award", company: "Example University", url: "https://example.edu/award",
    locations: [], isRemote: false, term: null, termSource: "unknown", termSeason: null, termYear: null,
    workAuth: null, skills: ["Python"], deadlineAt: null, postedAt: null,
    amountMin: null, amountMax: null, amountNeedsReview: false, amountStatus: "unparseable", programTotal: null, awardsCount: null, amountIsEstimated: false,
    applyLinkDead: false, frameAllowStrikes: 0, eligibility: ["Applicants must be enrolled."], isContentMarketing: false,
    trustScore: 80, trustReasons: [], isLottery: false, lotteryReasons: [], corroborationCount: 1, freshnessTier: "periodic_check",
    firstSeenAt: new Date("2026-10-01"), lastSeenAt: new Date("2026-10-27"), closedAt: null, fields: [],
    fit: { score: 87, knownDimensions: 2, totalDimensions: 3, blocked: false, reasons: [{ dimension: "field", kind: "good", label: "Major matches", detail: "Based on your major" }], skills: { matched: ["Python"], missing: ["Go"] } },
    timing: { score: 50, label: "Check the source", liveness: "checked today", hoursSinceFirstSeen: 1, isClosed: false, ageDays: 1, ageBasis: "first_seen", daysUntilDeadline: null, knownSignals: 1, totalSignals: 3, reasons: [] },
    dates: { verified: "checked today", posted: null, closes: null }, ...overrides,
  };
}

test("unknown award amounts and recipient counts stay unknown on discovery cards", () => {
  const card = toDiscoveryCard(posting(), "apply", true);
  assert.equal(card.award, "Amount not stated"); assert.equal(card.awardsCount, null); assert.equal(card.deadline, null);
  assert.equal(discoveryCardSchema.safeParse(card).success, true);
});
test("discovery does not expose a numerical score or explanations on a bucketed plan", () => {
  const card = toDiscoveryCard(posting(), "free", true);
  assert.equal(card.score, null); assert.equal(card.bucketLabel, "Strong Fit"); assert.deepEqual(card.reasons, []);
  assert.deepEqual(card.missingSkills, []); assert.deepEqual(card.skills, []);
});
test("an incomplete profile cannot show a computed fit, even on the full-score plan", () => {
  const card = toDiscoveryCard(posting(), "apply", false);
  assert.equal(card.score, null); assert.equal(card.bucketLabel, null); assert.deepEqual(card.reasons, []);
});
test("real scores preserve their known-factor count and award estimates keep their qualifier", () => {
  const card = toDiscoveryCard(posting({ amountMin: 2000, amountMax: 2000, amountStatus: "exact", amountIsEstimated: true, awardsCount: 25 }), "apply", true);
  assert.equal(card.score, 87); assert.equal(card.scoreKnown, 2); assert.equal(card.scoreTotal, 3);
  assert.match(card.award ?? "", /est\./); assert.equal(card.awardsCount, 25);
});
test("browser saves omit profile-derived score and resume evidence", () => {
  const saved = savedSnapshot(toDiscoveryCard(posting(), "apply", true));
  assert.equal(saved.score, null); assert.equal(saved.profileReady, false);
  assert.deepEqual(saved.reasons, []); assert.deepEqual(saved.matchedSkills, []); assert.deepEqual(saved.missingSkills, []);
  assert.equal(saved.title, "College Merit Award");
});
test("browser storage rejects unsafe links and malformed data, and deduplicates saves", () => {
  const card = toDiscoveryCard(posting(), "apply", true);
  assert.deepEqual(readGuestSaves("{bad json"), []);
  assert.deepEqual(readGuestSaves(JSON.stringify([{ ...card, url: "javascript:alert(1)" }])), []);
  assert.equal(readGuestSaves(JSON.stringify([card, { nope: true }, card])).length, 1);
});
test("closure, dead links, and sweepstakes retain decision-relevant warnings", () => {
  const card = toDiscoveryCard(posting({ closedAt: new Date(), applyLinkDead: true, isLottery: true }), "apply", true);
  assert.equal(card.closed, true); assert.equal(card.timing, null);
  assert(card.warnings.some(w => /closed/.test(w))); assert(card.warnings.some(w => /unavailable/.test(w))); assert(card.warnings.some(w => /sweepstakes/.test(w)));
});
