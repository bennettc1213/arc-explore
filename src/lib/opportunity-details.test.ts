import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCompensation, formatWorkArrangement } from "./opportunity-details";

test("formats source-stated compensation without inventing a rate", () => {
  assert.equal(formatCompensation(2136, 2404, "hour"), "$21.36–$24.04/hr");
  assert.equal(formatCompensation(50_000_00, 50_000_00, "year"), "$50,000/yr");
  assert.equal(formatCompensation(null, null, null), "Not stated");
  assert.equal(formatCompensation(0, 0, null), "Unpaid");
});

test("labels only source-stated work arrangements", () => {
  assert.equal(formatWorkArrangement("hybrid"), "Hybrid");
  assert.equal(formatWorkArrangement("in_person"), "In person");
  assert.equal(formatWorkArrangement(null), "Not stated");
});
