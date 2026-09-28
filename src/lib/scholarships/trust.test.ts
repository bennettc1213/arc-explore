import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assessTrust, TRUST_CONFIG } from "./trust";

function input(over: Partial<Parameters<typeof assessTrust>[0]> = {}): Parameters<typeof assessTrust>[0] {
  return {
    sponsorName: "Anonymous Foundation",
    title: "Anonymous Award",
    eligibility: [],
    amountMin: null,
    amountMax: null,
    corroborationCount: 0,
    ...over,
  };
}

describe("assessTrust", () => {
  it("starts neutral for a plain scholarship", () => {
    const a = assessTrust(input());
    assert.equal(a.score, TRUST_CONFIG.neutralScore);
    assert.equal(a.isLottery, false);
    assert.equal(a.reasons.length, 0);
  });

  it("flags a law-firm marketing award as low trust", () => {
    const a = assessTrust(
      input({
        sponsorName: "Smith Injury Law, LLP",
        title: "Smith Injury Law Essay Scholarship",
        amountMin: 1000,
        amountMax: 1000,
      }),
    );
    assert.ok(a.score < TRUST_CONFIG.neutralScore, `expected low trust, got ${a.score}`);
    assert.ok(a.reasons.some((r) => r.signal === "content_marketing"));
  });

  it("flags a rehab sponsor as unrelated services", () => {
    const a = assessTrust(input({ sponsorName: "New Start Rehabilitation Center" }));
    assert.ok(a.reasons.some((r) => r.signal === "unrelated_services"));
  });

  it("flags an SEO sponsor as unrelated services", () => {
    const a = assessTrust(input({ sponsorName: "RankFirst SEO" }));
    assert.ok(a.reasons.some((r) => r.signal === "unrelated_services"));
  });

  it("detects sweepstakes language as lottery", () => {
    const a = assessTrust(
      input({
        title: "Back-to-School Sweepstakes — Enter to Win",
        eligibility: ["No essay required.", "Winner selected by random drawing."],
      }),
    );
    assert.equal(a.isLottery, true);
    assert.ok(a.lotteryReasons.length > 0);
    assert.ok(a.reasons.some((r) => r.signal === "lottery"));
  });

  it("flags minimal requirements", () => {
    const a = assessTrust(input({ eligibility: ["Must be a student."] }));
    assert.ok(a.reasons.some((r) => r.signal === "minimal_requirements"));
  });

  it("does not flag requirements as minimal when an essay or GPA is mentioned", () => {
    const a = assessTrust(input({ eligibility: ["Must be a student.", "Submit a 500-word essay."] }));
    assert.ok(!a.reasons.some((r) => r.signal === "minimal_requirements"));
  });

  it("flags third-party account requirements", () => {
    const a = assessTrust(input({ eligibility: ["Create an account to apply."] }));
    assert.ok(a.reasons.some((r) => r.signal === "third_party_account"));
  });

  it("boosts corroborated awards", () => {
    const a = assessTrust(input({ corroborationCount: 3 }));
    assert.ok(a.score > TRUST_CONFIG.neutralScore);
    assert.ok(a.reasons.some((r) => r.signal === "corroborated" && r.kind === "positive"));
  });

  it("keeps reasons with every non-neutral score", () => {
    const a = assessTrust(input({ sponsorName: "Brooks Law Group", amountMin: 1000, amountMax: 1000 }));
    assert.ok(a.reasons.length > 0);
  });

  it("exposes signals for review", () => {
    const a = assessTrust(input({ sponsorName: "RankFirst SEO", corroborationCount: 2 }));
    const triggered = a.signals.filter((s) => s.triggered).map((s) => s.signal);
    assert.deepEqual(triggered.sort(), ["corroborated", "unrelatedServices"]);
  });
});
