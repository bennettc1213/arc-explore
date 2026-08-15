import assert from "node:assert/strict";
import { test } from "node:test";

import { composeDigest, type DigestItem } from "./email";
import {
  DIGEST_FLOOR,
  DIGEST_INTERVAL_DAYS,
  MAX_DIGEST_ITEMS,
  MIN_PER_KIND,
  digestDue,
  pickDigestItems,
  subtractCovered,
  worthSending,
} from "./select";

import type { FitResult } from "../score/fit";

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function fit(partial: Partial<FitResult> = {}): FitResult {
  return {
    score: 80,
    reasons: [],
    blocked: false,
    knownDimensions: 5,
    totalDimensions: 5,
    ...partial,
  } as FitResult;
}

function item(id: string, f: Partial<FitResult> = {}, kind = "internship") {
  return { id, kind, fit: fit(f) };
}

const D = (iso: string) => new Date(iso);

/* ------------------------------------------------------------------ *
 * cadence
 * ------------------------------------------------------------------ */

test("digestDue waits a full week of calendar days", () => {
  const last = D("2026-08-01T09:00:00Z");
  assert.equal(digestDue(last, D("2026-08-07T23:59:00Z")), false, "6 days is not a week");
  assert.equal(digestDue(last, D("2026-08-08T00:01:00Z")), true, "7 calendar days is");
  assert.equal(DIGEST_INTERVAL_DAYS, 7);
});

test("digestDue measures calendar days, not elapsed hours", () => {
  // Sent late on the 1st, considered early on the 8th: 6.5 elapsed days but 7
  // calendar days. Elapsed time would push the send an hour later every week
  // until the "weekly" email arrived on a different day than it started on.
  assert.equal(digestDue(D("2026-08-01T23:00:00Z"), D("2026-08-08T07:00:00Z")), true);
});

test("digestDue is false for a watermark in the future", () => {
  assert.equal(digestDue(D("2026-09-01T00:00:00Z"), D("2026-08-15T00:00:00Z")), false);
});

/* ------------------------------------------------------------------ *
 * selection
 * ------------------------------------------------------------------ */

test("blocked postings are dropped, not merely ranked last", () => {
  const out = pickDigestItems([item("a"), item("b", { blocked: true, score: 95 })]);
  assert.deepEqual(out.picked.map((i) => i.id), ["a"]);
  assert.equal(out.droppedBlocked, 1);
});

test("unscoreable postings are dropped", () => {
  const out = pickDigestItems([
    item("a"),
    item("b", { score: null, knownDimensions: 0, totalDimensions: 5 }),
  ]);
  assert.deepEqual(out.picked.map((i) => i.id), ["a"]);
  assert.equal(out.droppedUnscored, 1);
});

test("the floor is applied to the confidence-weighted rank, not the shown score", () => {
  // 100 on one dimension of five shrinks to 100*0.2 + 50*0.8 = 60 — above the
  // floor. 100 on one of five is a real recommendation, just a weak one.
  const thin = pickDigestItems([item("thin", { score: 100, knownDimensions: 1, totalDimensions: 5 })]);
  assert.equal(thin.picked.length, 1);

  // 40 on four of five shrinks to 40*0.8 + 50*0.2 = 42 — below the floor, even
  // though the raw score is higher than nothing. We have evidence against it.
  const weak = pickDigestItems([item("weak", { score: 40, knownDimensions: 4, totalDimensions: 5 })]);
  assert.equal(weak.picked.length, 0);
  assert.equal(weak.droppedBelowFloor, 1);
  assert.equal(DIGEST_FLOOR, 50);
});

test("ranking puts the confident match above the speculative one", () => {
  const out = pickDigestItems([
    item("speculative", { score: 100, knownDimensions: 1, totalDimensions: 5 }),
    item("confident", { score: 90, knownDimensions: 5, totalDimensions: 5 }),
  ]);
  assert.deepEqual(out.picked.map((i) => i.id), ["confident", "speculative"]);
});

test("the cap holds and reports what it looked at", () => {
  const many = Array.from({ length: 20 }, (_, i) => item(`p${i}`, { score: 90 - i }));
  const out = pickDigestItems(many);
  assert.equal(out.picked.length, MAX_DIGEST_ITEMS);
  assert.equal(out.considered, 20);
  assert.deepEqual(out.picked.map((i) => i.id), ["p0", "p1", "p2", "p3", "p4", "p5"]);
});

/* ------------------------------------------------------------------ *
 * one kind cannot take every slot
 * ------------------------------------------------------------------ */

test("a stronger-scoring kind cannot sweep the whole email", () => {
  // The shape the first real dry run produced: scholarships confidently at
  // 3-of-3 sit above every internship, which is scored on five dimensions and
  // is rarely known on more than three.
  const scholarships = Array.from({ length: 10 }, (_, i) =>
    item(`s${i}`, { score: 100 - i, knownDimensions: 3, totalDimensions: 3 }, "scholarship"),
  );
  const internships = Array.from({ length: 10 }, (_, i) =>
    item(`i${i}`, { score: 90 - i, knownDimensions: 3, totalDimensions: 5 }, "internship"),
  );

  const out = pickDigestItems([...scholarships, ...internships]);
  const kinds = out.picked.map((p) => p.kind);

  assert.equal(out.picked.length, MAX_DIGEST_ITEMS);
  assert.equal(kinds.filter((k) => k === "internship").length, MIN_PER_KIND);
  assert.equal(kinds.filter((k) => k === "scholarship").length, MAX_DIGEST_ITEMS - MIN_PER_KIND);
  // The reserved internships are that kind's *best*, not an arbitrary pair.
  assert.deepEqual(
    out.picked.filter((p) => p.kind === "internship").map((p) => p.id),
    ["i0", "i1"],
  );
});

test("the list still reads strongest-first after slots are reserved", () => {
  const out = pickDigestItems([
    item("s0", { score: 100, knownDimensions: 3, totalDimensions: 3 }, "scholarship"),
    item("s1", { score: 95, knownDimensions: 3, totalDimensions: 3 }, "scholarship"),
    item("i0", { score: 90, knownDimensions: 3, totalDimensions: 5 }, "internship"),
  ]);
  assert.deepEqual(out.picked.map((p) => p.id), ["s0", "s1", "i0"]);
});

test("a reservation for a kind with nothing in it costs no slot", () => {
  const only = Array.from({ length: 8 }, (_, i) =>
    item(`s${i}`, { score: 100 - i }, "scholarship"),
  );
  const out = pickDigestItems(only);
  assert.equal(out.picked.length, MAX_DIGEST_ITEMS);
  assert.deepEqual(out.picked.map((p) => p.id), ["s0", "s1", "s2", "s3", "s4", "s5"]);
});

test("worthSending is false for an empty week", () => {
  assert.equal(worthSending(pickDigestItems([])), false);
  assert.equal(
    worthSending(pickDigestItems([item("blocked", { blocked: true })])),
    false,
    "a week whose only new rows are blocked is a quiet week",
  );
  assert.equal(worthSending(pickDigestItems([item("a")])), true);
});

/* ------------------------------------------------------------------ *
 * deferring to saved-search alerts
 * ------------------------------------------------------------------ */

test("subtractCovered removes what the alerts already reported", () => {
  const out = subtractCovered([item("a"), item("b"), item("c")], new Set(["b"]));
  assert.deepEqual(out.map((i) => i.id), ["a", "c"]);
});

test("an empty covered set changes nothing", () => {
  const items = [item("a"), item("b")];
  assert.deepEqual(subtractCovered(items, new Set()).map((i) => i.id), ["a", "b"]);
});

/* ------------------------------------------------------------------ *
 * the email
 * ------------------------------------------------------------------ */

const TOKEN = "11111111-2222-3333-4444-555555555555";

function digestItem(partial: Partial<DigestItem> = {}): DigestItem {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    title: "Software Engineer, Intern",
    company: "Sentry",
    kind: "internship",
    deadlineAt: null,
    score: 82,
    knownDimensions: 4,
    totalDimensions: 5,
    ...partial,
  };
}

test("the subject names the count and the top match", () => {
  const email = composeDigest({
    email: "s@example.com",
    displayName: null,
    items: [digestItem(), digestItem({ id: "x", title: "Data Intern" })],
    considered: 40,
    coveredBySearches: 0,
    unsubscribeToken: TOKEN,
  });

  assert.equal(email.subject, "2 new matches this week — Software Engineer, Intern");
});

test("a score never appears without the confidence it rests on", () => {
  const email = composeDigest({
    email: "s@example.com",
    displayName: "Ben",
    items: [digestItem({ score: 100, knownDimensions: 1, totalDimensions: 5 })],
    considered: 12,
    coveredBySearches: 0,
    unsubscribeToken: TOKEN,
  });

  assert.match(email.text, /fit 100 \(on 1 of 5\)/);
  assert.match(email.text, /^Ben, 1 new opportunity worth a look this week\./m);
});

test("an unscoreable row prints no number rather than a bare one", () => {
  const email = composeDigest({
    email: "s@example.com",
    displayName: null,
    items: [digestItem({ score: null, knownDimensions: 0, totalDimensions: 5 })],
    considered: 3,
    coveredBySearches: 0,
    unsubscribeToken: TOKEN,
  });

  assert.doesNotMatch(email.text, /fit /);
});

test("it says the list is ranked, not exhaustive", () => {
  const email = composeDigest({
    email: "s@example.com",
    displayName: null,
    items: [digestItem()],
    considered: 137,
    coveredBySearches: 0,
    unsubscribeToken: TOKEN,
  });

  assert.match(email.text, /Picked from 137 we saw for the first time/);
  // The caveat every alert carries, verbatim.
  assert.match(email.text, /“New” means we first saw it since the last time we wrote to you\./);
});

test("withheld matches are explained rather than left as an unexplained gap", () => {
  const withCover = composeDigest({
    email: "s@example.com",
    displayName: null,
    items: [digestItem()],
    considered: 20,
    coveredBySearches: 7,
    unsubscribeToken: TOKEN,
  });
  assert.match(withCover.text, /7 more matched your saved searches/);

  const without = composeDigest({
    email: "s@example.com",
    displayName: null,
    items: [digestItem()],
    considered: 20,
    coveredBySearches: 0,
    unsubscribeToken: TOKEN,
  });
  assert.doesNotMatch(without.text, /matched your saved searches/);
});

test("the unsubscribe link stops the digest and says so", () => {
  const email = composeDigest({
    email: "s@example.com",
    displayName: null,
    items: [digestItem()],
    considered: 5,
    coveredBySearches: 0,
    unsubscribeToken: TOKEN,
  });

  assert.match(email.unsubscribeUrl, new RegExp(`token=${TOKEN}&digest=1$`));
  assert.equal(email.text.includes(email.unsubscribeUrl), true);
  assert.match(email.text, /separate — this link does not touch them/);
});

test("a long title is trimmed in the subject but never in the body", () => {
  const long = "Software Engineering Intern, Distributed Systems Platform Group, Summer 2027";
  const email = composeDigest({
    email: "s@example.com",
    displayName: null,
    items: [digestItem({ title: long })],
    considered: 5,
    coveredBySearches: 0,
    unsubscribeToken: TOKEN,
  });

  assert.equal(email.subject.includes("…"), true);
  assert.equal(email.subject.length < long.length + 30, true);
  assert.equal(email.text.includes(long), true);
});
