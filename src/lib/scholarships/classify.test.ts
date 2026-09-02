import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTENT_MARKETING_MAX_AMOUNT, isContentMarketing } from "./classify";

/** Most cases state one exact figure; this keeps the call sites readable. */
const at = (sponsorName: string, amount: number | null) =>
  isContentMarketing({ sponsorName, amountMin: amount, amountMax: amount });

describe("isContentMarketing", () => {
  it("tags a small-award law firm", () => {
    // All real sponsor names from the live UNL list.
    assert.equal(at("Groth Law", 1000), true);
    assert.equal(at("Bronx Injury Lawyers P.C.", 500), true);
    assert.equal(at("Kush Arora Criminal Defense Attorney", 1000), true);
    assert.equal(at("Levin & Nalbandyan LLP", 1000), true);
    assert.equal(at("Schaffer & Associates LPA", 1000), true);
    assert.equal(at("The Bihm Firm, PLLC", 1000), true);
    assert.equal(at("Kingbird Legal", 1000), true);
  });

  it("tags a firm at the higher, corpus-measured ceiling", () => {
    // Real rows measured as misses under the old $1,500 ceiling: "RMD Law
    // Scholarship" ($2,500) and "Burress Injury Law Underdog" ($5,000) are
    // both a firm's own name as the prize, a one-off essay contest — the
    // same shape as the $1,000 cases above, just committing more money.
    assert.equal(isContentMarketing({ sponsorName: "Burress Injury Law Underdog", amountMin: 2500, amountMax: 5000 }), true);
    assert.equal(at("RMD Law Scholarship", 2500), true);
    assert.equal(at("Aero Law Center", 2500), true);
  });

  it("does not tag a firm whose award is above the raised threshold", () => {
    // A firm committing five figures is not running a link-building contest
    // — the ceiling still has to be somewhere.
    assert.equal(isContentMarketing({ sponsorName: "Aero Law Center", amountMin: 5000, amountMax: 10000 }), false);
  });

  it("tags a marketing or advertising agency, not only a law firm", () => {
    // Real row: "Red Egg Marketing Scholarship" carries no legal language at
    // all — LEGAL_RE alone was blind to it. Same shape of award, a different
    // industry running the identical backlink play.
    assert.equal(at("Red Egg Marketing", 2500), true);
    assert.equal(at("Sable Advertising Group", 1000), true);
    assert.equal(at("Northstar Creative Agency", 1000), true);
  });

  it("does not fire on words that merely resemble the marketing marker", () => {
    // The reason MARKETING_RE is word-bounded on "marketing", not "market".
    assert.equal(at("Farmers Market Alliance", 1000), false);
  });

  it("judges a range by its ceiling, not its floor", () => {
    // Real row: "Brooks Law Group" lists $250-$1,000. The floor alone would
    // tag any firm with a small consolation award, however large the top prize.
    assert.equal(isContentMarketing({ sponsorName: "Brooks Law Group", amountMin: 250, amountMax: 1000 }), true);
    assert.equal(isContentMarketing({ sponsorName: "Brooks Law Group", amountMin: 250, amountMax: 9000 }), false);
  });

  it("treats the threshold as inclusive", () => {
    assert.equal(at("Kisner Law", CONTENT_MARKETING_MAX_AMOUNT), true);
    assert.equal(at("Kisner Law", CONTENT_MARKETING_MAX_AMOUNT + 1), false);
  });

  it("does not tag when the amount is unknown", () => {
    // "Small" is one of the three conditions. An unreadable amount is not
    // evidence the award is small, and guessing it is would put a label on a
    // row on the strength of a fact we do not have.
    assert.equal(at("Groth Law", null), false);
    assert.equal(isContentMarketing({ sponsorName: "Groth Law", amountMin: null, amountMax: null }), false);
  });

  it("falls back to the floor when only a floor is known", () => {
    assert.equal(isContentMarketing({ sponsorName: "Groth Law", amountMin: 1000, amountMax: null }), true);
  });

  it("exempts institutions that happen to be legal", () => {
    // A law school, a university clinic, a bar association memorial fund and
    // a legal-aid nonprofit all trip the legal marker and none of them are
    // buying backlinks.
    assert.equal(at("Harvard Law School Public Interest Fund", 1000), false);
    assert.equal(at("University of Denver Sturm College of Law", 1000), false);
    assert.equal(at("Nebraska State Bar Association", 1000), false);
    assert.equal(at("Legal Aid Foundation of Los Angeles", 1000), false);
  });

  it("does not tag a sponsor with no legal marker at all", () => {
    assert.equal(at("Maple Flooring Manufacturers Association", 1000), false);
    assert.equal(at("Communities Foundation of Texas", 1000), false);
  });

  it("does not fire on surnames that merely contain the letters", () => {
    // The reason the pattern is word-bounded. A bare /law/i substring match
    // tags every Lawrence and Lawson memorial scholarship as a marketing
    // stunt, and those are exactly the small family awards this corpus
    // exists to surface.
    assert.equal(at("Lawrence Memorial Scholarship", 1000), false);
    assert.equal(at("Lawson Family Endowment", 1000), false);
    assert.equal(at("Harlow Trust Award", 1000), false);
    assert.equal(at("Delaware Valley Grant", 1000), false);
  });
});
