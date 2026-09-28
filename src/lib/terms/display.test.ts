import assert from "node:assert";
import { describe, it } from "node:test";
import { formatTerm, formatTermShort, resolveTermView } from "./display";

describe("formatTerm", () => {
  it("renders an explicit term plainly", () => {
    assert.equal(formatTerm({ term: "Summer 2027", termSource: "explicit" }), "Summer 2027");
  });

  it("labels an inferred term", () => {
    assert.equal(formatTerm({ term: "Summer 2027", termSource: "inferred" }), "Summer 2027 (inferred)");
  });

  it("is honest about unknown terms", () => {
    assert.equal(formatTerm({ term: null, termSource: "unknown" }), "term not stated");
  });
});

describe("formatTermShort", () => {
  it("marks inferred terms with an asterisk", () => {
    assert.equal(formatTermShort({ term: "Fall 2026", termSource: "inferred" }), "Fall 2026*");
  });

  it("uses 'unknown' for missing terms", () => {
    assert.equal(formatTermShort({ term: null, termSource: "unknown" }), "unknown");
  });
});

describe("resolveTermView", () => {
  it("passes a coherent term straight through", () => {
    assert.deepEqual(
      resolveTermView({
        term: "Summer 2027",
        termSource: "explicit",
        termSeason: "summer",
        termYear: 2027,
      }),
      { term: "Summer 2027", termSource: "explicit" },
    );
  });

  it("keeps free text when it is a non-canonical spelling of the same term", () => {
    assert.deepEqual(
      resolveTermView({
        term: "Autumn 2026",
        termSource: "explicit",
        termSeason: "fall",
        termYear: 2026,
      }),
      { term: "Autumn 2026", termSource: "explicit" },
    );
  });

  it("never shows an ended term the structured columns contradict", () => {
    // Regression: a JD whose only season mention was an eligibility window
    // ("graduation date from Spring 2025 to Fall 2026") left the free text
    // claiming Spring 2025 while the structured term was Summer 2027. Showing
    // the free text would have put a term that already ended on a live card.
    assert.deepEqual(
      resolveTermView({
        term: "Spring 2025",
        termSource: "inferred",
        termSeason: "summer",
        termYear: 2027,
      }),
      { term: "Summer 2027", termSource: "inferred" },
    );
  });

  it("derives the term when only the structured columns are populated", () => {
    assert.deepEqual(
      resolveTermView({
        term: null,
        termSource: "unknown",
        termSeason: "fall",
        termYear: 2026,
      }),
      { term: "Fall 2026", termSource: "unknown" },
    );
  });

  it("leaves rows without a structured term untouched", () => {
    assert.deepEqual(
      resolveTermView({ term: "Summer 2027", termSource: "inferred", termSeason: null, termYear: null }),
      { term: "Summer 2027", termSource: "inferred" },
    );
    assert.deepEqual(
      resolveTermView({ term: null, termSource: "unknown" }),
      { term: null, termSource: "unknown" },
    );
  });
});
