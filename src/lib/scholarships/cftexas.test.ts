import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseListings } from "./cftexas";

/**
 * Real markup pulled from the live page (2026-08-13), not hand-written —
 * seven entries covering every award-amount shape seen across the full
 * 96-entry page, plus one entry duplicated verbatim (the page renders every
 * scholarship once per filter tab even though only one tab shows at a time).
 */
const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "cftexas.sample.html"), "utf8");

describe("parseListings", () => {
  const listings = parseListings(FIXTURE);

  it("dedupes the same scholarship shown across multiple filter tabs", () => {
    // The fixture contains 7 raw entries but only 6 distinct CMS post ids —
    // one (AAF Dallas) is deliberately duplicated to exercise this path.
    assert.equal(listings.length, 6);
    const ids = listings.map((l) => l.sourceId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("reads title, deadline and detail URL for a known entry", () => {
    const aaf = listings.find((l) => l.title === "AAF Dallas Foundation Scholarship Fund");
    assert.ok(aaf);
    assert.equal(aaf.deadlineAt?.toISOString().slice(0, 10), "2026-05-01");
    assert.equal(
      aaf.url,
      "https://www.cftexas.org/scholarships/apply-for-scholarships/aaf-dallas-foundation-scholarship-fund/",
    );
    assert.equal(aaf.sponsorName, "Communities Foundation of Texas");
    assert.equal(aaf.source, "cftexas");
  });

  it("reads real eligibility bullets, not a mangled blob", () => {
    const aaf = listings.find((l) => l.title === "AAF Dallas Foundation Scholarship Fund");
    assert.ok(aaf);
    assert.ok(aaf.eligibility.length >= 3);
    assert.ok(aaf.eligibility.some((e) => /3\.0 GPA/.test(e)));
    assert.ok(aaf.eligibility.some((e) => /United States citizens/.test(e)));
    // Each bullet is its own array entry, not one run-on string.
    for (const bullet of aaf.eligibility) {
      assert.ok(!bullet.includes("<li>"), "bullet should not carry raw markup");
    }
  });

  it("marks every entry in this fixture closed, honestly — the source says so", () => {
    // All seven raw entries in the fixture come from a live fetch where CFT's
    // own status field read scholarship_status-closed on every one of them.
    // This is a real, first-party assertion, not a scraper bug — most of
    // CFT's funds run on a spring deadline and this fixture was pulled in
    // August, well past every one of them.
    assert.ok(listings.every((l) => !l.isOpen));
  });

  it("parses every listing's amount into a real number, no silent NaN", () => {
    for (const l of listings) {
      if (l.amountMin !== null) assert.ok(Number.isFinite(l.amountMin));
      if (l.amountMax !== null) assert.ok(Number.isFinite(l.amountMax));
    }
    // At least one entry in this fixture is genuinely unparseable prose
    // ("Varies...") and must come back null rather than a guessed number.
    assert.ok(listings.some((l) => l.amountMin === null && l.amountMax === null));
  });

  it("returns nothing rather than throwing on empty input", () => {
    assert.deepEqual(parseListings(""), []);
    assert.deepEqual(parseListings("<html><body>no scholarships here</body></html>"), []);
  });
});
