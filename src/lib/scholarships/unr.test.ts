import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseListings } from "./unr";

/**
 * Real markup from the live page (2026-08-14), not hand-written — seven of the
 * sixty accordion entries, chosen to cover every shape the parser has to
 * survive: an amount stated as a range, one stated as a single figure, two
 * that state none, a deadline given without a year, and a law-firm award.
 */
const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "unr.sample.html"), "utf8");

/** Injected everywhere so a year-less deadline resolves deterministically
 *  rather than depending on when the suite runs. */
const NOW = new Date("2026-08-14T00:00:00Z");

const listings = parseListings(FIXTURE, NOW);
const byTitle = (needle: string) => {
  const found = listings.find((l) => l.title.includes(needle));
  assert.ok(found, `fixture is missing an entry titled like "${needle}"`);
  return found;
};

describe("parseListings (UNR)", () => {
  it("finds every accordion entry", () => {
    assert.equal(listings.length, 7);
    assert.ok(listings.every((l) => l.source === "unr"));
  });

  it("links out to the scholarship, never back to the UNR page", () => {
    assert.equal(byTitle("Reno Rodeo").url, "https://renorodeofoundation.org/scholarships/");
    assert.ok(listings.every((l) => !l.url.includes("unr.edu")));
  });

  it("reads an amount stated as a range", () => {
    const l = byTitle("Reno Rodeo"); // "scholarships of $1,000 to $2,500"
    assert.equal(l.amountMin, 1000);
    assert.equal(l.amountMax, 2500);
    assert.equal(l.amountNeedsReview, false);
  });

  it("reads an amount stated as a single figure", () => {
    const l = byTitle("American Muscle"); // "Two $2,000 scholarships"
    assert.equal(l.amountMin, 2000);
    assert.equal(l.amountMax, 2000);
  });

  // Most entries state no figure. Null, never a guess from surrounding prose.
  it("leaves the amount null when the entry states none", () => {
    const l = byTitle("AICPA");
    assert.equal(l.amountMin, null);
    assert.equal(l.amountMax, null);
    assert.equal(l.amountNeedsReview, false);
  });

  /**
   * "an application deadline of March 22" carries no year. Reading it as the
   * current year would mark the scholarship closed for ten months out of
   * twelve; the page plainly means the next one.
   */
  it("rolls a year-less deadline forward to the next occurrence", () => {
    assert.equal(byTitle("Reno Rodeo").deadlineAt?.toISOString(), "2027-03-22T00:00:00.000Z");
  });

  it("leaves the deadline null when the entry states none", () => {
    assert.equal(byTitle("AICPA").deadlineAt, null);
  });

  /** The point of adding this source — no other source gives us this. */
  it("captures the eligibility prose the field matcher reads", () => {
    const l = byTitle("ACWA");
    assert.equal(l.eligibility.length, 1);
    assert.match(l.eligibility[0], /graduate students pursuing a master's, doctorate or law degree/);
  });

  /**
   * The accordion icon is an inline SVG whose path is hundreds of characters
   * of coordinates. Left in, it lands inside every description and gives
   * parseAmount a field of digits to misread.
   */
  it("strips the accordion icon out of the extracted text", () => {
    for (const l of listings) {
      const text = l.eligibility.join(" ");
      assert.ok(!text.includes("path-fill"), `${l.title} carries icon markup`);
      assert.ok(!/M19\.827,11\.624/.test(text), `${l.title} carries SVG path data`);
    }
  });

  // The title is the only identifier the page offers, so it has to survive an
  // editor changing capitalisation or spacing without reading as a new row.
  it("derives a stable, normalized source id", () => {
    assert.equal(byTitle("Reno Rodeo").sourceId, "reno-rodeo-foundation-scholarship");
    assert.ok(listings.every((l) => /^[a-z0-9-]+$/.test(l.sourceId)));
    assert.equal(new Set(listings.map((l) => l.sourceId)).size, listings.length);
  });

  // No per-entry status exists on the page; closure comes from disappearing.
  it("treats every listed entry as open", () => {
    assert.ok(listings.every((l) => l.isOpen));
  });
});
