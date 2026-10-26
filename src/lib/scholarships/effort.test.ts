import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { effortInputsFor, estimateEffort, formatEffort, roundToStep } from "./effort";

describe("estimateEffort", () => {
  test("follows the formula: 0.5 + 2/essay + 1.5/letter + 0.5/extra document", () => {
    assert.equal(estimateEffort({ essays: 0, letters: 0 })?.hours, 0.5);
    assert.equal(estimateEffort({ essays: 1, letters: 0 })?.hours, 2.5);
    assert.equal(estimateEffort({ essays: 1, letters: 1, extraDocuments: 1 })?.hours, 4.5);
    assert.equal(estimateEffort({ essays: 2, letters: 2, extraDocuments: 3 })?.hours, 9);
  });

  test("an unknown essay or letter count makes effort unknown — never zero", () => {
    assert.equal(estimateEffort({ essays: null, letters: 0 }), null);
    assert.equal(estimateEffort({ essays: 0, letters: null }), null);
    assert.equal(estimateEffort({ essays: -1, letters: 0 }), null);
    assert.equal(estimateEffort({ essays: 1.5, letters: 0 }), null);
  });

  test("rounds to the nearest half hour", () => {
    assert.equal(roundToStep(2.2), 2);
    assert.equal(roundToStep(2.3), 2.5);
    assert.equal(roundToStep(2.76), 3);
  });

  test("no listing carries the counts yet, so every listing is unknown", () => {
    assert.equal(estimateEffort(effortInputsFor()), null);
  });
});

describe("formatEffort", () => {
  test("labels the hours as approximate and names both counts", () => {
    assert.equal(formatEffort(estimateEffort({ essays: 1, letters: 0 })), "~2.5 hrs, 1 essay, 0 letters");
    assert.equal(formatEffort(estimateEffort({ essays: 0, letters: 1 })), "~2 hrs, 0 essays, 1 letter");
    assert.equal(formatEffort(null), "Effort unknown");
  });
});
