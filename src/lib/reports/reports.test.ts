import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_DETAIL_LENGTH,
  REPORT_OPTIONS,
  URGENT_REASONS,
  queuePriority,
  reasonLabel,
  reportInputSchema,
} from "./types";

const VALID_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function form(over: Record<string, unknown> = {}) {
  return { postingId: VALID_ID, reason: "dead_link", detail: "", ...over };
}

test("an empty detail box becomes null, not an empty string", () => {
  // "No comment" and "a comment that happens to be blank" are different facts,
  // and only one of them should reach a reviewer as a quoted line.
  assert.equal(reportInputSchema.parse(form()).detail, null);
  assert.equal(reportInputSchema.parse(form({ detail: "   " })).detail, null);
  assert.equal(reportInputSchema.parse(form({ detail: "  it 404s  " })).detail, "it 404s");
});

test("a posting id that is not a uuid is rejected before it reaches the database", () => {
  // Comparing text to a uuid column raises `invalid input syntax` in Postgres,
  // which the reminders unsubscribe route already learned the hard way — it
  // 500s instead of showing a message.
  assert.equal(reportInputSchema.safeParse(form({ postingId: "nope" })).success, false);
  assert.equal(reportInputSchema.safeParse(form({ postingId: "" })).success, false);
});

test("an unrecognised reason is rejected rather than stored as free text", () => {
  assert.equal(reportInputSchema.safeParse(form({ reason: "because" })).success, false);
  for (const o of REPORT_OPTIONS) {
    assert.equal(reportInputSchema.safeParse(form({ reason: o.value })).success, true, o.value);
  }
});

test("detail is capped", () => {
  assert.equal(reportInputSchema.safeParse(form({ detail: "x".repeat(MAX_DETAIL_LENGTH) })).success, true);
  assert.equal(
    reportInputSchema.safeParse(form({ detail: "x".repeat(MAX_DETAIL_LENGTH + 1) })).success,
    false,
  );
});

test("money and fraud sort ahead of everything else", () => {
  /*
   * A scholarship charging an application fee is the one thing in this queue
   * that can cost a student money today, so it outranks a report filed weeks
   * earlier. Everything else is oldest-first so nothing rots at the bottom.
   */
  assert.equal(queuePriority("asks_for_payment"), 0);
  assert.equal(queuePriority("not_real"), 0);
  assert.equal(queuePriority("dead_link"), 1);
  assert.equal(queuePriority("wrong_details"), 1);
  assert.ok(queuePriority("asks_for_payment") < queuePriority("dead_link"));
});

test("every reason has a label and a hint, and the urgent set is a subset", () => {
  for (const o of REPORT_OPTIONS) {
    assert.ok(o.label.length > 0, o.value);
    assert.ok(o.hint.length > 0, o.value);
    assert.equal(reasonLabel(o.value), o.label);
  }
  for (const urgent of URGENT_REASONS) {
    assert.ok(
      REPORT_OPTIONS.some((o) => o.value === urgent),
      `${urgent} is urgent but is not offered`,
    );
  }
});
