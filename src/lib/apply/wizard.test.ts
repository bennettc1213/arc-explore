import assert from "node:assert/strict";
import { test } from "node:test";

import type { ApplicationPacket, PacketField } from "./packet";
import {
  composeConfirmation,
  planApplySteps,
  progressLabel,
  progressOf,
  promptForField,
} from "./wizard";

function field(overrides: Partial<PacketField>): PacketField {
  return { key: "x", label: "x", value: null, source: "missing", ...overrides };
}

function packet(fields: PacketField[], attestations: PacketField[] = []): ApplicationPacket {
  return {
    fields,
    attestations,
    known: fields.filter((f) => f.value !== null).length,
    total: fields.length,
  };
}

const FULL_FIELDS: PacketField[] = [
  field({ key: "name", label: "full name", value: "Ada Lovelace", source: "profile" }),
  field({ key: "email", label: "email", value: "ada@example.com", source: "account" }),
  field({ key: "school", label: "school", value: "UNL", source: "profile" }),
];

const NO_ATTESTATIONS: PacketField[] = [
  field({ key: "workAuth", label: "work authorization", value: "U.S. citizen", source: "profile" }),
];

test("a gap maps to the profile field it writes back to", () => {
  assert.equal(promptForField(field({ key: "gradYear", label: "graduation year" }))?.profileField, "gradYear");
  assert.equal(promptForField(field({ key: "major", label: "major" }))?.profileField, "major");
  assert.equal(promptForField(field({ key: "workAuth", label: "work authorization" }))?.profileField, "workAuth");
});

test("resume-only gaps prompt a nudge, not a profile write-back", () => {
  // The profile has no phone or links column. Prompting a write-back to a
  // column that does not exist would split the data model in two.
  assert.equal(promptForField(field({ key: "phone", label: "phone" }))?.profileField, null);
  assert.equal(promptForField(field({ key: "links", label: "links" }))?.profileField, null);
});

test("email and GPA are never prompted", () => {
  // Email always falls back to the proven account address; a missing GPA is a
  // legitimate choice, per the packet's own note — nagging about either is
  // noise on every single application.
  assert.equal(promptForField(field({ key: "email", label: "email" })), null);
  assert.equal(promptForField(field({ key: "gpa", label: "GPA" })), null);
});

test("a complete profile produces review then handoff; review pauses", () => {
  const plan = planApplySteps(packet(FULL_FIELDS, NO_ATTESTATIONS), "ready");
  const kinds = plan.steps.map((s) => s.kind);
  assert.deepEqual(kinds, ["review", "handoff"]);
  assert.equal(plan.needsYou, 1);
});

test("every promptable gap becomes its own pausing step", () => {
  const gaps = [
    field({ key: "name", label: "full name" }),
    field({ key: "email", label: "email", value: "a@b.c", source: "account" }),
    field({ key: "major", label: "major" }),
    field({ key: "gradYear", label: "graduation year" }),
  ];
  const plan = planApplySteps(packet(gaps, NO_ATTESTATIONS), "ready");
  const gapSteps = plan.steps.filter((s) => s.kind === "gap");
  assert.equal(gapSteps.length, 3);
  assert.deepEqual(
    gapSteps.map((s) => s.prompt?.profileField),
    ["displayName", "major", "gradYear"],
  );
  assert.ok(gapSteps.every((s) => s.pauses));
});

test("resume-only gaps are folded into the review step, not their own step", () => {
  const gaps = [field({ key: "phone", label: "phone" }), field({ key: "email", label: "email", value: "a@b.c" })];
  const plan = planApplySteps(packet(gaps, []), "ready");
  const phone = plan.steps.find((s) => s.field?.key === "phone");
  assert.equal(phone, undefined);
  assert.deepEqual(plan.steps.map((s) => s.kind), ["review", "handoff"]);
});

test("the review step always pauses, even when we hold the answer", () => {
  const plan = planApplySteps(packet(FULL_FIELDS, NO_ATTESTATIONS), "ready");
  const review = plan.steps.find((s) => s.kind === "review");
  assert.ok(review);
  assert.equal(review.pauses, true);
});

test("the plan is the same regardless of letter state", () => {
  const slots = planApplySteps(packet(FULL_FIELDS, []), "slots");
  const ready = planApplySteps(packet(FULL_FIELDS, []), "ready");
  const none = planApplySteps(packet(FULL_FIELDS, []), "none");
  assert.deepEqual(slots.steps.map((s) => s.kind), ready.steps.map((s) => s.kind));
  assert.deepEqual(ready.steps.map((s) => s.kind), none.steps.map((s) => s.kind));
});

test("the hand-off is always last and never pauses", () => {
  const plan = planApplySteps(packet(FULL_FIELDS, NO_ATTESTATIONS), "none");
  const last = plan.steps[plan.steps.length - 1];
  assert.equal(last.kind, "handoff");
  assert.equal(last.pauses, false);
});

test("progress is a fraction of completed steps, clamped to 0–1", () => {
  assert.equal(progressOf(0, 6), 0);
  assert.equal(progressOf(3, 6), 0.5);
  assert.equal(progressOf(6, 6), 1);
  assert.equal(progressOf(7, 6), 1);
  assert.equal(progressOf(0, 0), 1);
});

test("the progress label names what the bar is waiting on", () => {
  const plan = planApplySteps(packet(FULL_FIELDS, NO_ATTESTATIONS), "ready");
  const waiting = plan.steps.find((s) => s.pauses) ?? null;
  assert.ok(waiting);
  assert.equal(progressLabel(1, plan.steps, waiting), "1 of 2 · waiting on you: review your application");
  assert.equal(progressLabel(2, plan.steps, null), "2 of 2 · done");
});

test("the confirmation draft carries facts, not prose, and never claims we submitted", () => {
  const draft = composeConfirmation({
    displayName: "Ada",
    title: "Women in Engineering Award",
    company: "SWE",
    kind: "scholarship",
    url: "https://swe.org/apply",
    deadlineAt: new Date("2026-12-01T00:00:00Z"),
    filled: ["full name", "email", "school"],
    answered: ["graduation year"],
    confirmed: ["work authorization"],
  });

  assert.match(draft.subject, /Women in Engineering Award/);
  assert.match(draft.text, /Hi Ada,/);
  assert.match(draft.text, /Deadline: 2026-12-01/);
  assert.match(draft.text, /We filled from your profile and resume: full name, email, school/);
  assert.match(draft.text, /You answered during this application: graduation year/);
  assert.match(draft.text, /You confirmed yourself: work authorization/);
  assert.match(draft.text, /We did not submit anything for you/);
});

test("no stated deadline means no response-window line at all", () => {
  // "When you'll hear back" is included only when the posting states it — an
  // estimated timeline is exactly the invented fact this product refuses.
  const draft = composeConfirmation({
    displayName: null,
    title: "Some Internship",
    company: null,
    kind: "internship",
    url: "https://example.com/jobs/1",
    deadlineAt: null,
    filled: ["email"],
    answered: [],
    confirmed: [],
  });

  assert.equal(draft.text.includes("Deadline:"), false);
  assert.equal(draft.text.includes("response window"), false);
  assert.match(draft.text, /^Hi,/m);
});
