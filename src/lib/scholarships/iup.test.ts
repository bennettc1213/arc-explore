import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseListings } from "./iup";

/**
 * Real markup from the live page (2026-08-26), not hand-written — eight of the
 * ~34 headings, chosen to cover every shape the parser has to survive: a
 * scholarship stating an amount and a deadline, one stating an *opening* date
 * instead of a deadline, a heading that appears twice, a heading that is not a
 * scholarship at all, a directory of links, an entry with nowhere to apply,
 * and the final entry followed by the real page footer.
 *
 * The one edit: "Links to Regional Scholarship Opportunities" is trimmed from
 * 23 outbound links to 12 — still comfortably over MAX_LINKS_PER_ENTRY, which
 * is what it is there to exercise, without committing 23 community
 * foundations' URLs to the repo.
 */
const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "iup.sample.html"), "utf8");

/** Injected so a year-less deadline resolves deterministically rather than
 *  depending on when the suite runs. */
const NOW = new Date("2026-08-26T00:00:00Z");

const listings = parseListings(FIXTURE, NOW);
const byTitle = (needle: string) => {
  const found = listings.find((l) => l.title.includes(needle));
  assert.ok(found, `fixture is missing an entry titled like "${needle}"`);
  return found;
};

describe("parseListings (IUP)", () => {
  it("finds every entry that is a scholarship with somewhere to apply", () => {
    assert.equal(listings.length, 4);
    assert.ok(listings.every((l) => l.source === "iup"));
  });

  /**
   * THE REASON THIS SOURCE EXISTS. 1,559 of the corpus's scholarships point at
   * an aggregator's listing page carrying no form; every row here has to reach
   * the awarding organisation's own site or it adds nothing.
   */
  it("every row links off-site to the sponsor, never back into iup.edu", () => {
    for (const l of listings) {
      assert.match(l.url, /^https?:\/\//);
      assert.ok(!l.url.includes("iup.edu"), `${l.title} points back at IUP`);
    }
    assert.equal(byTitle("Banyon").url, "https://www.banyantreatmentcenter.com/resources/student-scholarship/");
  });

  it("reads an amount stated in prose rather than in a field", () => {
    const banyon = byTitle("Banyon");
    assert.equal(banyon.amountMin, 1000);
    assert.equal(banyon.amountMax, 1000);
    assert.equal(banyon.amountNeedsReview, false);
  });

  it("reads a deadline stated in a bullet and one stated mid-sentence", () => {
    // "<li><strong>Application deadline: December 8, 2026</strong></li>"
    assert.equal(byTitle("Banyon").deadlineAt?.toISOString(), "2026-12-08T00:00:00.000Z");
    // "The deadline for the fall 2026 applications is <strong>August 5, 2026</strong>."
    assert.equal(byTitle("Working Student").deadlineAt?.toISOString(), "2026-08-05T00:00:00.000Z");
  });

  /**
   * Found by reading the live page. "Applications open in May 2026" is the
   * opposite of a deadline, and reading it as one would publish a date that is
   * wrong in the most misleading possible direction.
   */
  it("does not read an OPENING date as a deadline", () => {
    const boc = byTitle("BOC Sciences");
    assert.equal(boc.deadlineAt, null);
    assert.match(boc.eligibility[0], /open/i, "fixture should still contain the opening sentence");
  });

  /**
   * Found by reading the live page. The final `<h2>` runs to end-of-document,
   * so without the footer cut the last scholarship's description contains
   * IUP's street address and switchboard number — and `parseAmount` reads a
   * postal code.
   */
  it("the last entry does not absorb the page footer", () => {
    const last = listings[listings.length - 1];
    assert.equal(last.title, "Working Student Scholarship");
    assert.ok(
      !/Clark Hall|724-357|iupathletics/.test(last.eligibility[0] ?? ""),
      "the page footer leaked into the final entry's description",
    );
    assert.equal(last.url, "https://www.mallonsnyderlaw.com/scholarship");
  });

  /** A repeated heading must not become two rows that close each other on
   *  alternating runs. */
  it("a heading that appears twice yields one row", () => {
    assert.equal(listings.filter((l) => l.title === "Attorney Ambitions Scholarship").length, 1);
  });

  it("skips headings that are not scholarships", () => {
    // "First, File Your FAFSA" — a federal form, and its body never says
    // "scholarship" either.
    assert.ok(!listings.some((l) => /FAFSA/i.test(l.title)));
  });

  it("skips a directory of links rather than treating it as one award", () => {
    assert.ok(!listings.some((l) => /Links to Regional/i.test(l.title)));
  });

  it("skips an entry with no outbound link — there is nowhere to send a student", () => {
    assert.ok(!listings.some((l) => /Hispanic Chamber/i.test(l.title)));
  });

  it("carries the source's own prose as eligibility, for the field taxonomy to read", () => {
    for (const l of listings) {
      assert.equal(l.eligibility.length, 1);
      assert.ok(l.eligibility[0].length > 40);
    }
  });

  it("ids are stable slugs, so an editor's punctuation fix is not a closure", () => {
    assert.equal(byTitle("Banyon").sourceId, "banyon-scholarship-for-clinical-education-and-healthcare-professions");
    assert.ok(listings.every((l) => /^[a-z0-9-]+$/.test(l.sourceId)));
  });

  it("everything is open — the page states no per-entry status", () => {
    assert.ok(listings.every((l) => l.isOpen));
  });
});

describe("parseListings (IUP) — a deadline stated without a year", () => {
  const page = (body: string) => `<h2>Test Scholarship</h2>${body}`;

  /** Same rule as UNR: "Deadline: March 1" means the next one that has not
   *  passed. Assuming the current year marks an award closed for most of the
   *  year it is actually open. */
  it("rolls forward to the next occurrence", () => {
    const [row] = parseListings(
      page('<p>Deadline: March 1. Apply at <a href="https://example.org/x">here</a>.</p>'),
      new Date("2026-08-26T00:00:00Z"),
    );
    assert.equal(row.deadlineAt?.toISOString(), "2027-03-01T00:00:00.000Z");
  });

  it("keeps the stated year when there is one", () => {
    const [row] = parseListings(
      page('<p>Deadline: March 1, 2026. Apply at <a href="https://example.org/x">here</a>.</p>'),
      new Date("2026-08-26T00:00:00Z"),
    );
    assert.equal(row.deadlineAt?.toISOString(), "2026-03-01T00:00:00.000Z");
  });
});
