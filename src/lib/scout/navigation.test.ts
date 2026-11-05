import assert from "node:assert/strict";
import test from "node:test";
import { scoutReturnPath } from "./navigation";

test("an opportunity preserves its originating Scout and result snapshot", () => {
  assert.equal(scoutReturnPath("/scout?for=scholarships&run=search-1"), "/scout?for=scholarships&run=search-1");
});

test("return destinations cannot navigate outside Scout or inject a URL", () => {
  for (const value of [undefined, ["/scout"], "//example.com/scout", "https://example.com", "/scouting", "/scout/../admin", "/scout\\evil", "javascript:alert(1)"]) {
    assert.equal(scoutReturnPath(value), null);
  }
});
