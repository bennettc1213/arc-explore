import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAmount, type ParsedAward } from "./amount";

function p(
  amountPerAwardMin: number | null,
  amountPerAwardMax: number | null,
  status: ParsedAward["status"],
  opts: Partial<ParsedAward> = {},
): ParsedAward {
  return {
    amountPerAwardMin,
    amountPerAwardMax,
    awardsCount: null,
    programTotal: null,
    status,
    isEstimated: false,
    needsReview: status === "unparseable",
    ...opts,
  };
}

describe("parseAmount", () => {
  it("reads a single flat figure as an exact per-award amount", () => {
    assert.deepEqual(parseAmount("One award of $5,000"), p(5000, 5000, "exact"));
    assert.deepEqual(parseAmount("$1000"), p(1000, 1000, "exact"));
  });

  it("reads a range as min/max", () => {
    assert.deepEqual(parseAmount("Between $4,000-$8,000 per year per student"), p(4000, 8000, "range"));
  });

  it("reads a range whose second figure omits the dollar sign", () => {
    assert.deepEqual(parseAmount("$16,000-20,000"), p(16000, 20000, "range"));
    assert.deepEqual(parseAmount("$2,500-10,000"), p(2500, 10000, "range"));
  });

  it("reads 'up to' as a range ceiling, not an exact amount", () => {
    assert.deepEqual(parseAmount("Up to $2,000 total per student"), p(null, 2000, "range"));
    assert.deepEqual(parseAmount("Multiple awards of up to $10,000 per student"), p(null, 10000, "range"));
    assert.deepEqual(parseAmount("Up to $1,234,567"), p(null, 1234567, "range"));
  });

  it("truncates cents to whole dollars", () => {
    assert.deepEqual(parseAmount("$1,411.05"), p(1411, 1411, "exact"));
  });

  it("treats 'Varies' and empty input as no known amount", () => {
    assert.deepEqual(parseAmount(""), p(null, null, "varies"));
    assert.deepEqual(parseAmount("Varies"), p(null, null, "varies"));
  });

  it("treats $0.00 as 'varies', not a zero-dollar award", () => {
    assert.deepEqual(parseAmount("$0.00"), p(null, null, "varies"));
    assert.deepEqual(parseAmount("$0"), p(null, null, "varies"));
  });

  it("does not invent a number out of unparseable prose", () => {
    assert.deepEqual(
      parseAmount(
        "Varies – the amount of each annual scholarship may be up to the full amount of tuition, books, fees, required coursework materials, and on campus housing.",
      ),
      p(null, null, "varies"),
    );
  });

  it("refuses to pick one figure out of multi-figure prose", () => {
    assert.deepEqual(parseAmount("$500 for books and $1,000 toward tuition"), p(null, null, "unparseable"));
  });

  it("refuses to read a source typo as a $0 award", () => {
    const typo = parseAmount("$,000");
    assert.equal(typo.amountPerAwardMin, null);
    assert.equal(typo.amountPerAwardMax, null);
    assert.notEqual(typo.amountPerAwardMin, 0);
    assert.notEqual(typo.amountPerAwardMax, 0);
    assert.equal(typo.status, "unparseable");
    assert.equal(typo.needsReview, true);

    assert.deepEqual(parseAmount("$0"), p(null, null, "varies"));
  });

  it("rejects a range whose ends do not both parse", () => {
    assert.deepEqual(parseAmount("$,000-5,000"), p(null, null, "unparseable"));
  });

  it("stores a program total separately from a per-award amount", () => {
    assert.deepEqual(parseAmount("$50,000 total"), p(null, null, "varies", { programTotal: 50000 }));
    assert.deepEqual(parseAmount("Program total of $100,000"), p(null, null, "varies", { programTotal: 100000 }));
  });

  it("stores an award count when no per-award amount is given", () => {
    assert.deepEqual(parseAmount("225 awards"), p(null, null, "varies", { awardsCount: 225 }));
  });

  it("computes an estimated per-award amount from total and count", () => {
    assert.deepEqual(
      parseAmount("about $450,000 to 225 students"),
      p(2000, 2000, "exact", {
        programTotal: 450000,
        awardsCount: 225,
        isEstimated: true,
      }),
    );
  });

  it("derives a total from a stated count and per-award amount", () => {
    assert.deepEqual(
      parseAmount("5 scholarships of $2,000"),
      p(2000, 2000, "exact", { awardsCount: 5, programTotal: 10000 }),
    );
  });
});
