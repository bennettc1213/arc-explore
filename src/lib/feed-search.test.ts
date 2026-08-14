import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { escapeLike, parseSearchQuery } from "./feed-search";

describe("parseSearchQuery", () => {
  it("splits on whitespace", () => {
    assert.deepEqual(parseSearchQuery("computer science"), ["computer", "science"]);
    assert.deepEqual(parseSearchQuery("  data   ai  "), ["data", "ai"]);
    assert.deepEqual(parseSearchQuery("nursing\tscholarship"), ["nursing", "scholarship"]);
  });

  // An empty box must mean "no search", never "match nothing".
  it("treats an absent or blank query as no search", () => {
    assert.deepEqual(parseSearchQuery(null), []);
    assert.deepEqual(parseSearchQuery(undefined), []);
    assert.deepEqual(parseSearchQuery(""), []);
    assert.deepEqual(parseSearchQuery("   "), []);
  });

  it("caps term count and term length", () => {
    assert.deepEqual(parseSearchQuery("a b c d e f g h"), ["a", "b", "c", "d", "e", "f"]);
    assert.equal(parseSearchQuery("x".repeat(200))[0].length, 64);
  });

  it("keeps punctuation that is meaningful to a searcher", () => {
    assert.deepEqual(parseSearchQuery("C++"), ["C++"]);
    assert.deepEqual(parseSearchQuery("first-generation"), ["first-generation"]);
  });
});

describe("escapeLike", () => {
  // Unescaped, each of these is a wildcard that would match far more than the
  // student asked for — "100%" would match every row in the table.
  it("neutralizes LIKE wildcards", () => {
    assert.equal(escapeLike("100%"), "100\\%");
    assert.equal(escapeLike("a_b"), "a\\_b");
    assert.equal(escapeLike("%_%"), "\\%\\_\\%");
  });

  it("escapes the escape character itself, without double-escaping", () => {
    assert.equal(escapeLike("a\\b"), "a\\\\b");
    // The backslash this adds for `%` must not then be escaped again.
    assert.equal(escapeLike("\\%"), "\\\\\\%");
  });

  it("leaves ordinary queries untouched", () => {
    assert.equal(escapeLike("computer science"), "computer science");
    assert.equal(escapeLike("C++"), "C++");
  });
});
