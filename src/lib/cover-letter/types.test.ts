import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CoverLetterValidationError,
  coerceCoverLetter,
  normalizeDraft,
  slotMarker,
  slotsFromText,
  type LetterParagraph,
} from "./types";

function paragraphs(over: Partial<LetterParagraph>[] = []): LetterParagraph[] {
  const base: LetterParagraph[] = [
    { id: "a", role: "opening", text: "I am applying for this role." },
    { id: "b", role: "evidence", text: "At Startup I used Python daily." },
    { id: "c", role: "closing", text: "Thank you for your time." },
  ];
  return base.map((p, i) => ({ ...p, ...(over[i] ?? {}) }));
}

describe("slotsFromText", () => {
  it("finds placeholder markers and dedupes them", () => {
    const text = "See my [YOUR SPECIFIC DETAIL: portfolio link] and my [YOUR SPECIFIC DETAIL: portfolio link].";
    assert.deepEqual(slotsFromText(text), ["[YOUR SPECIFIC DETAIL: portfolio link]"]);
  });

  it("ignores prose that merely contains brackets", () => {
    assert.deepEqual(slotsFromText("No markers here."), []);
  });

  it("finds long placeholders like a model actually writes", () => {
    const long =
      "[YOUR SPECIFIC DETAIL: a reason this scholarship specifically, e.g. an eligibility connection such as a parent's service, since the posting facts do not state a mission to reference]";
    assert.deepEqual(slotsFromText(long), [long]);
  });

  it("truncates an oversized slot for storage", () => {
    const longSlot = `[YOUR SPECIFIC DETAIL: ${"x".repeat(210)}]`;
    const draft = normalizeDraft({
      paragraphs: [
        { id: "a", role: "opening", text: "I am applying for this role." },
        { id: "b", role: "evidence", text: longSlot },
        { id: "c", role: "closing", text: "Thank you for your time." },
      ],
    });
    assert.equal(draft.unfilledSlots.length, 1);
    assert.ok(draft.unfilledSlots[0].length <= 200);
  });
});

describe("normalizeDraft", () => {
  it("trims text and derives unfilled slots from placeholders", () => {
    const draft = normalizeDraft({
      paragraphs: [
        { id: "a", role: "opening", text: "  I am applying for this role.  " },
        { id: "b", role: "evidence", text: `Built it in Python — see ${slotMarker("portfolio link")}.` },
        { id: "c", role: "closing", text: "Thank you for your time." },
      ],
    });
    assert.equal(draft.paragraphs[0].text, "I am applying for this role.");
    assert.deepEqual(draft.unfilledSlots, [slotMarker("portfolio link")]);
  });

  it("rejects a letter with no opening", () => {
    const ps = paragraphs().filter((p) => p.role !== "opening");
    assert.throws(() => normalizeDraft({ paragraphs: ps }), CoverLetterValidationError);
  });

  it("rejects a letter with no closing", () => {
    const ps = paragraphs().filter((p) => p.role !== "closing");
    assert.throws(() => normalizeDraft({ paragraphs: ps }), CoverLetterValidationError);
  });

  it("rejects an empty paragraph", () => {
    const ps = paragraphs([{ text: "   " }]);
    assert.throws(() => normalizeDraft({ paragraphs: ps }), CoverLetterValidationError);
  });

  it("rejects an unknown role", () => {
    const ps = paragraphs([{ role: "ps" as never }]);
    assert.throws(() => normalizeDraft({ paragraphs: ps }), CoverLetterValidationError);
  });

  it("rejects an oversized paragraph", () => {
    const ps = paragraphs([{ text: "x".repeat(4001) }]);
    assert.throws(() => normalizeDraft({ paragraphs: ps }), CoverLetterValidationError);
  });

  it("re-ids duplicated ids so regeneration stays unambiguous", () => {
    const ps = paragraphs([{ id: "dup" }, { id: "dup" }]);
    const draft = normalizeDraft({ paragraphs: ps });
    assert.equal(new Set(draft.paragraphs.map((p) => p.id)).size, draft.paragraphs.length);
  });
});

describe("coerceCoverLetter", () => {
  it("returns null for garbage", () => {
    assert.equal(coerceCoverLetter(null), null);
    assert.equal(coerceCoverLetter({ paragraphs: "nope" }), null);
  });

  it("returns the draft for a valid stored value", () => {
    const draft = { paragraphs: paragraphs(), unfilledSlots: [] };
    const coerced = coerceCoverLetter(draft);
    assert.equal(coerced?.paragraphs.length, 3);
  });

  it("rejects a stored letter missing required roles", () => {
    const ps = paragraphs().filter((p) => p.role !== "opening");
    assert.equal(coerceCoverLetter({ paragraphs: ps, unfilledSlots: [] }), null);
  });
});
