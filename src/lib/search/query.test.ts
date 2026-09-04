import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { EMPTY_QUERY, escapeRegex, isEmptyQuery, parseQuery, stem } from "./query";

const literals = (raw: string) => parseQuery(raw).terms.map((t) => t.literal);

describe("parseQuery — facts we hold in columns", () => {
  test("reads an amount out of the text instead of searching for it", () => {
    // The live failure: "$5000" returned 0 rows while 311 rows carried a
    // parsed amount. A number is not a word to find in a title.
    for (const raw of ["$5000", "5000", "5k", "$5,000"]) {
      assert.equal(parseQuery(raw).minAmount, 5000, `failed on ${raw}`);
      assert.deepEqual(literals(raw), [], `${raw} should leave no text terms`);
    }
  });

  test("reads the qualifier forms students write in full", () => {
    assert.equal(parseQuery("scholarships over $10000").minAmount, 10000);
    assert.equal(parseQuery("grants at least 2500").minAmount, 2500);
    assert.equal(parseQuery("more than 10k").minAmount, 10000);
  });

  test("a qualifier is consumed as structure, not left behind as a word", () => {
    // "over" must not become a term, or every result has to contain the word.
    assert.equal(literals("scholarships over $10000").includes("over"), false);
  });

  test("a year is not an amount", () => {
    // "summer 2026" is the query that makes this non-optional.
    const q = parseQuery("summer 2026 internship");
    assert.equal(q.minAmount, null);
    assert.ok(literals("summer 2026 internship").includes("2026"), "2026 should stay searchable");
  });

  test("but a year marked as money is an amount", () => {
    // "$2000" is a real award and sits inside the year range.
    assert.equal(parseQuery("$2000").minAmount, 2000);
  });

  test("reads the kind, so a plural stops narrowing the search", () => {
    // "nursing scholarships" was requiring the literal "scholarships" beside
    // "nursing", which is why the plural returned fewer rows than the singular.
    const q = parseQuery("nursing scholarships");
    assert.equal(q.kind, "scholarship");
    assert.deepEqual(
      q.terms.map((t) => t.literal),
      ["nursing"],
    );
  });

  test("a bare kind word is a filter with nothing left to search", () => {
    const q = parseQuery("scholarships");
    assert.equal(q.kind, "scholarship");
    assert.deepEqual(literals("scholarships"), []);
    assert.equal(isEmptyQuery(q), false, "a kind filter is still a search");
  });

  test("naming both kinds means neither was meant as a filter", () => {
    const q = parseQuery("scholarships and internships");
    assert.equal(q.kind, null);
  });

  test("reads remote as a filter rather than a word", () => {
    const q = parseQuery("remote internship");
    assert.equal(q.remoteOnly, true);
    assert.equal(q.kind, "internship");
    assert.deepEqual(literals("remote internship"), []);
  });
});

describe("parseQuery — normalising what is left", () => {
  test("a hyphen is not a different query", () => {
    // Live: "first generation" returned 6 rows, "first-generation" returned 2.
    assert.deepEqual(literals("first-generation"), literals("first generation"));
  });

  test("case is not a different query", () => {
    assert.deepEqual(literals("Computer Science"), literals("computer science"));
  });

  test("drops function words that cannot discriminate", () => {
    // Matching is anchored at the start of a word, so "in" is satisfied by
    // "Intern" — i.e. by the whole corpus — and costs a scan to learn nothing.
    assert.deepEqual(literals("women in stem"), ["women", "stem"]);
  });

  test("an empty or whitespace query is not a search", () => {
    assert.equal(isEmptyQuery(parseQuery("")), true);
    assert.equal(isEmptyQuery(parseQuery("   ")), true);
    assert.equal(isEmptyQuery(parseQuery(null)), true);
    assert.deepEqual(parseQuery(undefined), EMPTY_QUERY);
  });

  test("a query of nothing but stopwords does not become a filter for everything", () => {
    assert.equal(isEmptyQuery(parseQuery("the of and")), true);
  });

  test("caps the number of terms, because each one costs a scan", () => {
    const q = parseQuery("alpha beta gamma delta epsilon zeta eta theta iota");
    assert.ok(q.terms.length <= 6, `got ${q.terms.length} terms`);
  });
});

describe("parseQuery — expansion", () => {
  test("the literal is always first, so the ranker can privilege it", () => {
    // relevance.ts scores alternates below the literal by walking this order.
    // Note none of these may be a kind word — those are lifted out as a filter
    // and correctly leave no term behind at all.
    for (const raw of ["compsci", "nursing", "bursary"]) {
      const t = parseQuery(raw).terms[0];
      assert.equal(t.alternates[0], t.literal, `${raw} did not lead with its literal`);
    }
  });

  test("expands an abbreviation nobody spells out", () => {
    // Live: "compsci" returned 0 rows.
    assert.ok(parseQuery("compsci").terms[0].alternates.includes("computer science"));
  });

  test("does not expand a two-letter word that is also ordinary English", () => {
    // "me" for mechanical engineering would fire on every posting saying "me",
    // and a false expansion is indistinguishable from a real match downstream.
    const q = parseQuery("me");
    assert.equal(q.terms.length === 0 || q.terms[0].alternates.length === 1, true);
  });

  test("a stem covers the inflections, which is the nurse/nursing gap", () => {
    // Live: "nurse" returned 2 rows while "nursing" returned 15.
    const alts = parseQuery("nurses").terms[0].alternates;
    assert.ok(
      alts.some((a) => "nursing".startsWith(a)),
      `no alternate of "nurses" is a prefix of "nursing": ${alts.join(", ")}`,
    );
  });

  test("never stems a short word into a collision", () => {
    // The Delaware bug, one layer down: an over-eager stem of "art" or "law"
    // would match Start, Heartland, Delaware and Lawrence.
    assert.equal(stem("art"), null);
    assert.equal(stem("law"), null);
    assert.equal(stem("data"), null);
  });

  test("never produces a stem shorter than four characters", () => {
    const words = ["arts", "laws", "ends", "ties", "uses", "acres", "cases", "asked"];
    for (const w of words) {
      const s = stem(w);
      assert.ok(s === null || s.length >= 4, `${w} stemmed to ${s}`);
    }
  });

  test("a stem is never longer than the word it came from", () => {
    for (const w of ["nursing", "scholarships", "engineers", "studies", "internship"]) {
      const s = stem(w);
      assert.ok(s === null || s.length < w.length, `${w} -> ${s}`);
    }
  });
});

describe("escapeRegex", () => {
  test("neutralises everything a student might type at a regex engine", () => {
    // The filter matches on a word boundary, so terms reach Postgres as a
    // regular expression. "C++" and "$5,000" are real queries.
    for (const raw of ["c++", "$5,000", "(", "[", "a|b", "*", "\\", "a{2}", "^x", "y$"]) {
      const escaped = escapeRegex(raw);
      assert.doesNotThrow(() => new RegExp(escaped), `${raw} produced an invalid pattern`);
      assert.ok(new RegExp(escaped).test(raw), `${raw} no longer matches itself`);
    }
  });

  test("leaves an ordinary word untouched", () => {
    assert.equal(escapeRegex("nursing"), "nursing");
  });
});
