import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapScholarshipPortal, mapScholarshipsCom, parseDateText } from "./parse";

/** Fixed clock so open/closed derivations do not drift as real time passes. */
const NOW = new Date("2026-08-13T00:00:00Z");

describe("parseDateText", () => {
  it("reads DD Mon YYYY — the ScholarshipPortal deadline format", () => {
    assert.equal(parseDateText("18 Dec 2026")?.toISOString().slice(0, 10), "2026-12-18");
  });

  it("reads Month D, YYYY", () => {
    assert.equal(parseDateText("December 18, 2026")?.toISOString().slice(0, 10), "2026-12-18");
  });

  it("reads a single-digit day", () => {
    assert.equal(parseDateText("3 Jan 2027")?.toISOString().slice(0, 10), "2027-01-03");
  });

  it("treats 'Not specified' and empty strings as no date", () => {
    assert.equal(parseDateText("Not specified"), null);
    assert.equal(parseDateText(""), null);
    assert.equal(parseDateText(undefined), null);
  });

  it("rejects an impossible date rather than rolling it over", () => {
    // 31 Feb would become March 3rd in a lenient parser.
    assert.equal(parseDateText("31 Feb 2026"), null);
    assert.equal(parseDateText("99 Dec 2026"), null);
  });

  it("returns null on anything unparseable", () => {
    assert.equal(parseDateText("2026-08-10"), null);
    assert.equal(parseDateText("Rolling"), null);
    assert.equal(parseDateText("Aug 2026"), null);
  });
});

describe("mapScholarshipsCom", () => {
  // Real rows pulled from the live API (2026-08-13). The duplicate is the
  // same scholarship appearing under two directory subcategories.
  const rows = [
    {
      name: "Taco Bell Live Más Scholarship - $10,000",
      slug: "taco-bell-live-más-scholarship",
      url: "https://www.scholarships.com/scholarships/taco-bell-live-más-scholarship",
    },
    {
      name: "Generation Google Scholarship",
      slug: "generation-google-scholarship",
      url: "https://www.scholarships.com/scholarships/generation-google-scholarship",
    },
    {
      name: "Taco Bell Live Más Scholarship - $10,000",
      slug: "taco-bell-live-más-scholarship",
      url: "https://www.scholarships.com/scholarships/taco-bell-live-más-scholarship",
    },
  ];

  it("maps the listing fields", () => {
    const [first] = mapScholarshipsCom(rows);
    assert.equal(first.source, "scholarshipscom");
    assert.equal(first.title, "Taco Bell Live Más Scholarship - $10,000");
    assert.equal(first.sourceId, "taco-bell-live-más-scholarship");
    assert.equal(first.url, rows[0].url);
  });

  it("names the aggregator as sponsor since the directory states none", () => {
    assert.ok(
      mapScholarshipsCom(rows).every((l) => l.sponsorName === "Scholarships.com (listed)"),
    );
  });

  it("dedupes a scholarship listed under multiple directory categories", () => {
    assert.equal(mapScholarshipsCom(rows).length, 2);
  });

  it("keeps amount/deadline/eligibility null — the listing carries none", () => {
    for (const l of mapScholarshipsCom(rows)) {
      assert.equal(l.amountMin, null);
      assert.equal(l.amountMax, null);
      assert.equal(l.amountNeedsReview, false);
      assert.deepEqual(l.eligibility, []);
      assert.equal(l.deadlineAt, null);
      assert.equal(l.isOpen, true);
    }
  });

  it("skips rows with no usable identity fields rather than guessing", () => {
    assert.deepEqual(mapScholarshipsCom([]), []);
    const bad = [
      { name: "", slug: "x", url: "u" },
      { name: "t", slug: "", url: "u" },
      { name: "t", slug: "x", url: "" },
    ];
    assert.equal(mapScholarshipsCom(bad).length, 0);
  });
});

describe("mapScholarshipPortal", () => {
  const items = [
    {
      id: "8878",
      slug: "top-up-scholarship",
      title: "Top-Up Scholarship",
      url: "https://www.mastersportal.com/scholarships/8878/top-up-scholarship.html",
      provider: { name: "Education USA" },
      deadline: "Not specified",
      is_deadline_specified: false,
      grant: { amount: 20000, currency: "USD", description: "Up to $20,000" },
    },
    {
      id: "9254",
      slug: "mundus-mapp-emjm-scholarship",
      title: "Mundus MAPP EMJM Scholarship",
      url: "https://www.mastersportal.com/scholarships/9254/mundus-mapp-emjm-scholarship.html",
      provider: { name: "Mundus MAPP" },
      deadline: "18 Dec 2026",
      is_deadline_specified: true,
      grant: { amount: 33600, currency: "EUR", description: "33600 EUR" },
    },
  ];

  it("maps the search fields", () => {
    const [first] = mapScholarshipPortal(items, NOW);
    assert.equal(first.source, "scholarshipportal");
    assert.equal(first.sourceId, "8878::top-up-scholarship");
    assert.equal(first.title, "Top-Up Scholarship");
    assert.equal(first.url, items[0].url);
    assert.equal(first.sponsorName, "Education USA");
  });

  it("parses a USD amount out of the grant description", () => {
    const [first] = mapScholarshipPortal(items, NOW);
    assert.equal(first.amountMax, 20000);
    assert.equal(first.amountMin, null); // "up to" states a ceiling, not a floor
    assert.equal(first.amountNeedsReview, false);
  });

  it("does not store a EUR grant as dollars", () => {
    const [, eur] = mapScholarshipPortal(items, NOW);
    assert.equal(eur.amountMin, null);
    assert.equal(eur.amountMax, null);
    assert.equal(eur.amountNeedsReview, false);
  });

  it("derives isOpen from the stated deadline against the injected clock", () => {
    const [, eur] = mapScholarshipPortal(items, NOW);
    assert.equal(eur.deadlineAt?.toISOString().slice(0, 10), "2026-12-18");
    assert.equal(eur.isOpen, true);

    const past = mapScholarshipPortal(items, new Date("2027-01-01T00:00:00Z"));
    assert.equal(past[1].isOpen, false);
  });

  it("treats an unspecified deadline as open — no evidence of closure", () => {
    const [first] = mapScholarshipPortal(items, NOW);
    assert.equal(first.deadlineAt, null);
    assert.equal(first.isOpen, true);
  });

  it("falls back to the aggregator when no provider is stated", () => {
    const [noProvider] = mapScholarshipPortal([{ ...items[0], provider: null }], NOW);
    assert.equal(noProvider.sponsorName, "ScholarshipPortal (listed)");
  });

  it("skips rows missing identity fields", () => {
    assert.deepEqual(mapScholarshipPortal([], NOW), []);
    const bad = [{ id: "", slug: "s", title: "t", url: "u" }];
    assert.equal(mapScholarshipPortal(bad as never, NOW).length, 0);
  });
});
