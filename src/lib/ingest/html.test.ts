import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { htmlToText } from "./html";

describe("htmlToText", () => {
  it("strips ordinary HTML", () => {
    assert.equal(htmlToText("<p>Hello <b>world</b></p>"), "Hello world");
  });

  // Greenhouse returns markup that is itself entity-escaped. A single
  // decode-then-strip pass leaves the revealed tags sitting in the text.
  it("handles entity-escaped markup", () => {
    assert.equal(
      htmlToText("&lt;p&gt;Must be authorized to work in the U.S.&lt;/p&gt;"),
      "Must be authorized to work in the U.S.",
    );
  });

  /*
   * The reason block boundaries become spaces rather than nothing. Without it
   * this collapses to "...citizenBachelor's..." and the work-auth detector's
   * word boundaries stop matching — the posting silently scores as "not
   * stated" instead of "citizenship required".
   */
  it("keeps words apart across block boundaries", () => {
    const text = htmlToText("<ul><li>Must be a U.S. citizen</li><li>Bachelor's degree</li></ul>");
    assert.equal(text, "Must be a U.S. citizen Bachelor's degree");
    assert.match(text!, /\bcitizen\b/);
  });

  it("decodes named and numeric entities", () => {
    assert.equal(htmlToText("R&amp;D &ndash; 100&#37; remote"), "R&D – 100% remote");
    assert.equal(htmlToText("caf&#233; &rsquo;24"), "café ’24");
  });

  it("collapses whitespace", () => {
    assert.equal(htmlToText("  a\n\n   b\t\tc  "), "a b c");
  });

  it("returns null for nothing rather than an empty string", () => {
    assert.equal(htmlToText(null), null);
    assert.equal(htmlToText(undefined), null);
    assert.equal(htmlToText(""), null);
    assert.equal(htmlToText("   "), null);
    assert.equal(htmlToText("<p></p>"), null);
  });

  it("leaves a stray ampersand alone", () => {
    assert.equal(htmlToText("Ben & Jerry & Co"), "Ben & Jerry & Co");
  });
});
