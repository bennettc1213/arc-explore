import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAmount } from "./amount";

/** Shorthand for the common case: parsed cleanly, nothing to review. */
const ok = (min: number | null, max: number | null) => ({ min, max, needsReview: false });

describe("parseAmount", () => {
  it("reads a plain 'up to $X'", () => {
    assert.deepEqual(parseAmount("Up to $2,000 total per student"), ok(null, 2000));
  });

  it("reads 'up to $X' even inside 'multiple awards of' framing", () => {
    assert.deepEqual(parseAmount("Multiple awards of up to $10,000 per student"), ok(null, 10000));
  });

  it("reads a range as min/max, not two unrelated figures", () => {
    assert.deepEqual(parseAmount("Between $4,000-$8,000 per year per student"), ok(4000, 8000));
  });

  it("reads a range whose second figure omits the dollar sign", () => {
    // UNL writes them this way: "$16,000-20,000". Requiring a second `$`
    // silently downgraded these to a single flat figure of $16,000.
    assert.deepEqual(parseAmount("$16,000-20,000"), ok(16000, 20000));
    assert.deepEqual(parseAmount("$2,500-10,000"), ok(2500, 10000));
  });

  it("treats a single flat figure with no range language as exact", () => {
    assert.deepEqual(parseAmount("One award of $5,000"), ok(5000, 5000));
  });

  it("prefers 'up to' over the flat-figure reading when both could apply", () => {
    assert.deepEqual(parseAmount("One award of up to $5,000"), ok(null, 5000));
  });

  it("reads amounts written without a thousands separator", () => {
    assert.deepEqual(parseAmount("$1000"), ok(1000, 1000));
  });

  it("truncates cents to whole dollars rather than rejecting the figure", () => {
    // Real UNL row. The column is an integer, and $1,411 is the honest
    // reading of $1,411.05 — dropping the listing entirely would be worse.
    assert.deepEqual(parseAmount("$1,411.05"), ok(1411, 1411));
  });

  it("does not invent a number out of unparseable prose", () => {
    assert.deepEqual(
      parseAmount(
        "Varies – the amount of each annual scholarship may be up to the full amount of tuition, books, fees, required coursework materials, and on campus housing.",
      ),
      // No `$` anywhere: the source declined to state a figure, which is not
      // a parse failure and must not land in the review queue.
      { min: null, max: null, needsReview: false },
    );
  });

  it("refuses to pick one figure out of multi-figure prose", () => {
    // Two unrelated amounts is not a range; guessing which one is "the"
    // award would put a number on screen the source never stated. Flagged,
    // because the source *did* state figures we chose not to read.
    assert.deepEqual(parseAmount("$500 for books and $1,000 toward tuition"), {
      min: null,
      max: null,
      needsReview: true,
    });
  });

  it("strips thousands separators before matching", () => {
    assert.deepEqual(parseAmount("Up to $1,234,567"), ok(null, 1234567));
  });

  it("returns null on empty or non-monetary input", () => {
    assert.deepEqual(parseAmount(""), { min: null, max: null, needsReview: false });
    assert.deepEqual(parseAmount("Varies"), { min: null, max: null, needsReview: false });
  });

  it("refuses to read a source typo as a $0 award", () => {
    // Real UNL row: the amount cell reads "$,000" — the leading digit is
    // missing. Stripping the comma leaves a well-formed "$000", and storing
    // it asserts the scholarship pays nothing. No scholarship awards $0, so
    // a zero here always means we misread, never that the award is zero.
    const typo = parseAmount("$,000");
    assert.equal(typo.min, null);
    assert.equal(typo.max, null);
    assert.notEqual(typo.min, 0);
    assert.notEqual(typo.max, 0);
    // ...and it is a parse failure, not a source that stayed silent.
    assert.equal(typo.needsReview, true);

    assert.deepEqual(parseAmount("$0"), { min: null, max: null, needsReview: true });
  });

  it("rejects a range whose ends do not both parse", () => {
    // Publishing "$0-5,000" as a real range would state a floor the source
    // never gave.
    assert.deepEqual(parseAmount("$,000-5,000"), { min: null, max: null, needsReview: true });
  });
});
