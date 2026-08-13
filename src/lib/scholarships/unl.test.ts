import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseDeadline, parseListings } from "./unl";

/**
 * Real rows pulled from the live table (2026-08-13), chosen to cover every
 * award format on the page plus two distinct scholarships from one firm that
 * share a single outbound URL.
 */
const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "unl.sample.html"), "utf8");

/** Fixed clock so open/closed assertions do not drift as real time passes. */
const NOW = new Date("2026-08-13T00:00:00Z");

describe("parseDeadline", () => {
  it("reads MM-DD-YYYY as month-first", () => {
    const d = parseDeadline("08-10-2026");
    assert.equal(d?.toISOString().slice(0, 10), "2026-08-10");
  });

  it("does not silently swap month and day", () => {
    // 12-01 is December 1st, not January 12th. A DD-MM reading would put
    // this deadline eleven months early with no error anywhere.
    assert.equal(parseDeadline("12-01-2026")?.toISOString().slice(0, 10), "2026-12-01");
  });

  it("builds the date in UTC so it does not shift by runner timezone", () => {
    // CI runs UTC, a laptop does not. A local-time construction moves the
    // stored instant across a day boundary depending on where it ran.
    assert.equal(parseDeadline("03-01-2027")?.toISOString(), "2027-03-01T00:00:00.000Z");
  });

  it("rejects an impossible date rather than rolling it over", () => {
    // new Date(2026, 1, 31) silently becomes March 3rd.
    assert.equal(parseDeadline("02-31-2026"), null);
    assert.equal(parseDeadline("13-01-2026"), null);
  });

  it("returns null on anything that is not the expected format", () => {
    assert.equal(parseDeadline(""), null);
    assert.equal(parseDeadline("Rolling"), null);
    assert.equal(parseDeadline("2026-08-10"), null);
  });
});

describe("parseListings", () => {
  const listings = parseListings(FIXTURE, NOW);

  it("reads every row in the table", () => {
    assert.equal(listings.length, 7);
  });

  it("separates the scholarship title from the sponsor name", () => {
    const first = listings[0];
    assert.equal(first.title, "Fawell & Fawell Out-of-State Scholarship");
    assert.equal(first.sponsorName, "Fawell & Fawell");
    // The sponsor lives in a <span> inside the same cell as the title — if
    // the split fails it gets appended to the title instead.
    assert.ok(!first.title.includes("Fawell & Fawell Out-of-State Scholarship Fawell"));
  });

  it("decodes HTML entities in titles and sponsors", () => {
    assert.ok(listings.some((l) => l.sponsorName === "Fawell & Fawell"));
    for (const l of listings) {
      assert.ok(!l.title.includes("&amp;"), `raw entity left in title: ${l.title}`);
      assert.ok(!l.sponsorName.includes("&amp;"), `raw entity in sponsor: ${l.sponsorName}`);
    }
  });

  it("keeps two scholarships from one firm distinct despite a shared URL", () => {
    const kennedy = listings.filter((l) => l.sponsorName === "James Kennedy, P.L.L.C.");
    assert.equal(kennedy.length, 2);
    // Same landing page...
    assert.equal(kennedy[0].url, kennedy[1].url);
    // ...but they must not collapse into one row.
    assert.notEqual(kennedy[0].sourceId, kennedy[1].sourceId);
  });

  it("gives every listing a unique sourceId", () => {
    const ids = listings.map((l) => l.sourceId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("parses the award formats this page actually uses", () => {
    const byTitle = (needle: string) => listings.find((l) => l.title.includes(needle));

    const flat = byTitle("Fawell & Fawell");
    assert.deepEqual([flat?.amountMin, flat?.amountMax], [1000, 1000]);

    const noSeparator = byTitle("Legal Ethics");
    assert.deepEqual([noSeparator?.amountMin, noSeparator?.amountMax], [1000, 1000]);

    const decimal = byTitle("Sanctions Reform");
    assert.deepEqual([decimal?.amountMin, decimal?.amountMax], [1411, 1411]);

    const range = byTitle("National Italian American");
    assert.deepEqual([range?.amountMin, range?.amountMax], [2500, 12000]);
  });

  it("treats a future deadline as open against the injected clock", () => {
    const future = listings.find((l) => l.title.includes("National Italian American"));
    assert.equal(future?.deadlineAt?.toISOString().slice(0, 10), "2027-03-01");
    assert.equal(future?.isOpen, true);
  });

  it("treats a passed deadline as closed", () => {
    // Every fixture row is dated after NOW, so assert the boundary directly
    // rather than pretending the fixture contains a stale row.
    const past = parseListings(FIXTURE, new Date("2027-06-01T00:00:00Z"));
    assert.ok(past.every((l) => !l.isOpen));
  });

  it("never records the aggregator as the awarding sponsor when a real one is stated", () => {
    // UNL publishes the list; the firms award the money. Attributing all 236
    // rows to UNL would be wrong on every one of them.
    for (const l of listings) {
      assert.notEqual(l.sponsorName, "University of Nebraska–Lincoln (listed)");
    }
  });

  it("carries no eligibility rather than inventing any", () => {
    // The table has no eligibility column; the detail lives on each sponsor's
    // own page. An empty array is the honest answer.
    assert.ok(listings.every((l) => l.eligibility.length === 0));
  });

  it("returns nothing rather than throwing on unusable input", () => {
    assert.deepEqual(parseListings(""), []);
    assert.deepEqual(parseListings("<html><body>no table here</body></html>"), []);
    assert.deepEqual(parseListings("<table><tbody></tbody></table>"), []);
  });
});
