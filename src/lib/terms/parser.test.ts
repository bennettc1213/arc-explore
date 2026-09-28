import assert from "node:assert";
import { describe, it } from "node:test";
import { parseTerm, parseExplicitTerm, type TermSource } from "./parser";

function source(r: { termSource: TermSource }) {
  return r.termSource;
}

function date(iso: string): Date {
  return new Date(iso);
}

describe("parseTerm", () => {
  describe("explicit from title", () => {
    it("extracts Summer 2027 from the title", () => {
      const r = parseTerm("Software Engineer Intern (Summer 2027)", null, null);
      assert.equal(source(r), "explicit");
      assert.equal(r.term, "Summer 2027");
      assert.equal(r.termSeason, "summer");
      assert.equal(r.termYear, 2027);
      assert.equal(r.termRaw, "Summer 2027");
    });

    it("prefers title over description", () => {
      const r = parseTerm(
        "Data Intern, Fall 2026",
        "This is a Summer 2027 internship.",
        null,
      );
      assert.equal(r.term, "Fall 2026");
      assert.equal(source(r), "explicit");
    });

    it("normalises Autumn to Fall", () => {
      const r = parseTerm("Autumn 2026 Placement", null, null);
      assert.equal(r.term, "Fall 2026");
      assert.equal(r.termSeason, "fall");
    });

    it("expands two-digit years", () => {
      const r = parseTerm("Summer '27 Analyst", null, null);
      assert.equal(r.term, "Summer 2027");
      assert.equal(r.termYear, 2027);
    });

    it("matches reversed year-first forms", () => {
      const r = parseTerm("2026 Fall Intern, Digital Health", null, null);
      assert.equal(r.term, "Fall 2026");
    });

    it("supports co-op wording", () => {
      const r = parseTerm("Engineering Co-op 2027", null, null);
      assert.equal(r.term, "Co-op 2027");
      assert.equal(r.termSeason, "co-op");
    });

    it("supports year-first co-op wording", () => {
      const r = parseTerm("2028 Co-op - Mechanical Engineering", null, null);
      assert.equal(r.term, "Co-op 2028");
    });

    it("uses the first term when multiple are mentioned", () => {
      const r = parseTerm("Summer 2027 or Fall 2027 Intern", null, null);
      assert.equal(r.term, "Summer 2027");
    });
  });

  describe("explicit from description", () => {
    it("falls back to the description when the title has no term", () => {
      const r = parseTerm(
        "Software Engineer Intern",
        "We are hiring for the Spring 2028 cohort.",
        null,
      );
      assert.equal(source(r), "explicit");
      assert.equal(r.term, "Spring 2028");
      assert.equal(r.termRaw, "Spring 2028");
    });

    it("does not treat a bare year as a term", () => {
      const r = parseTerm(
        "Engineering Intern",
        "The company was founded in 2025 and is growing fast.",
        null,
      );
      assert.notEqual(source(r), "explicit");
    });
  });

  describe("inferred from first_seen", () => {
    it("infers next summer for a July first-seen date", () => {
      const r = parseTerm("Engineering Intern", null, date("2026-07-01"));
      assert.equal(source(r), "inferred");
      assert.equal(r.term, "Summer 2027");
      assert.equal(r.termYear, 2027);
      assert.equal(r.termRaw, null);
    });

    it("infers next summer for a January first-seen date", () => {
      const r = parseTerm("Engineering Intern", null, date("2027-01-15"));
      assert.equal(r.term, "Summer 2027");
    });

    it("infers that calendar year's summer for a February first-seen date", () => {
      const r = parseTerm("Engineering Intern", null, date("2027-02-01"));
      assert.equal(r.term, "Summer 2027");
    });

    it("infers that calendar year's summer for a June first-seen date", () => {
      const r = parseTerm("Engineering Intern", null, date("2027-06-30"));
      assert.equal(r.term, "Summer 2027");
    });

    it("crosses the year boundary at July", () => {
      const r = parseTerm("Engineering Intern", null, date("2027-07-01"));
      assert.equal(r.term, "Summer 2028");
    });

    it("accepts ISO date strings", () => {
      const r = parseTerm("Engineering Intern", null, "2026-12-01T00:00:00.000Z");
      assert.equal(r.term, "Summer 2027");
    });
  });

  describe("explicit outranks inferred", () => {
    it("keeps an explicit title term even with an old first-seen date", () => {
      const r = parseTerm("Winter 2028 Intern", null, date("2026-07-01"));
      assert.equal(source(r), "explicit");
      assert.equal(r.term, "Winter 2028");
    });

    it("keeps an explicit description term over inference", () => {
      const r = parseTerm(
        "Engineering Intern",
        "Join us for Fall 2026.",
        date("2026-07-01"),
      );
      assert.equal(source(r), "explicit");
      assert.equal(r.term, "Fall 2026");
    });
  });

  describe("unknown", () => {
    it("returns unknown when no term and no first-seen date is provided", () => {
      const r = parseTerm("Software Engineer Intern", null, null);
      assert.equal(source(r), "unknown");
      assert.equal(r.term, null);
      assert.equal(r.termSeason, null);
      assert.equal(r.termYear, null);
      assert.equal(r.termRaw, null);
    });

    it("returns unknown for malformed dates", () => {
      const r = parseTerm("Intern, Summer Twenty Twenty-Seven", null, null);
      assert.equal(source(r), "unknown");
    });

    it("returns unknown for an invalid first-seen string", () => {
      const r = parseTerm("Engineering Intern", null, "not-a-date");
      assert.equal(source(r), "unknown");
    });
  });
});

describe("parseExplicitTerm", () => {
  it("returns the explicit term when present", () => {
    const r = parseExplicitTerm("Summer 2027 Intern", null);
    assert.equal(r?.term, "Summer 2027");
    assert.equal(r?.termYear, 2027);
  });

  it("returns null when only inference is possible", () => {
    const r = parseExplicitTerm("Engineering Intern", null);
    assert.equal(r, null);
  });
});
