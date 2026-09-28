import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatAward } from "./display";

function item(
  overrides: Partial<Parameters<typeof formatAward>[0]> = {},
): Parameters<typeof formatAward>[0] {
  return {
    kind: "scholarship",
    amountMin: null,
    amountMax: null,
    amountStatus: "varies",
    programTotal: null,
    awardsCount: null,
    amountIsEstimated: false,
    ...overrides,
  };
}

describe("formatAward", () => {
  it("returns null for internships", () => {
    assert.equal(formatAward(item({ kind: "internship" })), null);
  });

  it("shows an exact per-award amount", () => {
    assert.equal(formatAward(item({ amountMin: 2000, amountMax: 2000, amountStatus: "exact" })), "$2,000");
  });

  it("shows a range", () => {
    assert.equal(formatAward(item({ amountMin: 1000, amountMax: 2000, amountStatus: "range" })), "$1,000–$2,000");
  });

  it("labels estimated per-award amounts", () => {
    assert.equal(
      formatAward(item({ amountMin: 2000, amountMax: 2000, amountStatus: "exact", amountIsEstimated: true, awardsCount: 225, programTotal: 450000 })),
      "$2,000 (est.) · about 225 awards a year",
    );
  });

  it("shows a program total without inventing a per-award amount", () => {
    assert.equal(formatAward(item({ amountStatus: "varies", programTotal: 50000 })), "$50,000 total");
  });

  it("shows a count when no per-award amount is known", () => {
    assert.equal(formatAward(item({ amountStatus: "varies", awardsCount: 10 })), "about 10 awards a year");
  });

  it("shows 'Amount varies' for honest silence", () => {
    assert.equal(formatAward(item({ amountStatus: "varies" })), "Amount varies");
  });

  it("shows 'Amount not stated' for unparseable input", () => {
    assert.equal(formatAward(item({ amountStatus: "unparseable" })), "Amount not stated");
  });
});
