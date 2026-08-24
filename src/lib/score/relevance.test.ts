import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { relevanceScore } from "./relevance";

const row = (title: string, company?: string, eligibility: string[] = []) => ({
  title,
  company,
  eligibility,
});

describe("relevanceScore", () => {
  test("a title match beats a sponsor match beats an eligibility mention", () => {
    // The whole point: every row reaching this function already contains the
    // term, so relevance is about WHERE it appears, not whether.
    const inTitle = relevanceScore(row("Nursing Scholarship"), ["nursing"]);
    const inSponsor = relevanceScore(row("Memorial Scholarship", "Nursing Trust"), ["nursing"]);
    const inEligibility = relevanceScore(
      row("Memorial Scholarship", "Rodeo Foundation", ["open to nursing students"]),
      ["nursing"],
    );
    assert.ok(inTitle > inSponsor, `title ${inTitle} should beat sponsor ${inSponsor}`);
    assert.ok(inSponsor > inEligibility, `sponsor ${inSponsor} should beat eligibility ${inEligibility}`);
  });

  test("the live regression: a real match outranks an incidental mention", () => {
    // Measured before this existed — "nursing" returned 15 rows led by "Reno
    // Rodeo Foundation Scholarship", which mentions nursing in its eligibility
    // prose, above actual nursing scholarships.
    const real = relevanceScore(row("Mildred Nutting Nursing Scholarship"), ["nursing"]);
    const incidental = relevanceScore(
      row("Reno Rodeo Foundation Scholarship", "Reno Rodeo Foundation", [
        "applicants pursuing nursing, education or agriculture",
      ]),
      ["nursing"],
    );
    assert.ok(real > incidental, `${real} should beat ${incidental}`);
  });

  test("a whole word beats a substring inside a longer word", () => {
    // "art" inside "particle" is not an arts scholarship. Same class of error
    // as the taxonomy's \blaw\b boundary bug matching "Delaware".
    const word = relevanceScore(row("Art Scholarship"), ["art"]);
    const inside = relevanceScore(row("Particle Physics Scholarship"), ["art"]);
    assert.ok(word > inside, `whole word ${word} should beat substring ${inside}`);
  });

  test("leading the title beats appearing later in it", () => {
    const leading = relevanceScore(row("Nursing Excellence Scholarship"), ["nursing"]);
    const later = relevanceScore(row("Foundation Scholarship for Nursing"), ["nursing"]);
    assert.ok(leading > later, `${leading} should beat ${later}`);
  });

  test("the query as a contiguous phrase beats its words scattered", () => {
    const phrase = relevanceScore(row("Computer Science Scholarship"), ["computer", "science"]);
    const scattered = relevanceScore(row("Computer Lab Fund of the Science Foundation"), [
      "computer",
      "science",
    ]);
    assert.ok(phrase > scattered, `phrase ${phrase} should beat scattered ${scattered}`);
  });

  test("matching every term beats matching only some", () => {
    const both = relevanceScore(row("Women in STEM Scholarship"), ["women", "stem"]);
    const one = relevanceScore(row("Women's Memorial Scholarship", "STEM Trust"), ["women", "stem"]);
    assert.ok(both > one, `${both} should beat ${one}`);
  });

  test("an empty query scores 0 rather than tying every row", () => {
    // Callers read 0 as "relevance has nothing to say", which is what lets the
    // comparator skip it entirely when there is no search.
    assert.equal(relevanceScore(row("Anything At All"), []), 0);
  });

  test("scores stay inside 0-100", () => {
    const max = relevanceScore(row("nursing"), ["nursing"]);
    assert.ok(max <= 100 && max >= 0, `out of range: ${max}`);
    assert.equal(relevanceScore(row("Nursing Scholarship"), ["unrelated"]), 0);
  });

  test("a regex metacharacter in the query cannot throw", () => {
    // The query is user input and reaches `new RegExp` — "C++" and "$5,000"
    // are things students genuinely type.
    for (const q of ["c++", "$5,000", "(", "[", "a|b", "*", "\\"]) {
      assert.doesNotThrow(() => relevanceScore(row("C++ Scholarship"), [q]), `threw on ${q}`);
    }
  });
});
