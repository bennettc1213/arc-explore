import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadMeritSeeds } from "./seed-files";
import { validateMeritSeed, type MeritSeed } from "./types";
import { importedStatus, meritContentHash, meritIsCurrent, requireExactSlug, requireInteractiveVerification, requireReviewableSeed, verificationCutoff } from "./lifecycle";
import { assertMeritWriteTarget } from "../../../scripts/merit-cli";

async function fixture() { return structuredClone((await loadMeritSeeds())[0]); }

test("all shipped public facts validate and are drafts, never operator-verified", async () => {
  const seeds = await loadMeritSeeds();
  assert.equal(seeds.length, 7);
  for (const seed of seeds) {
    assert.equal(seed.status, "draft");
    assert.equal(seed.verified_at, null);
    for (const tier of seed.tiers) { assert.ok(tier.source_url); assert.ok(tier.source_checked_at); assert.ok(tier.source_excerpt.length <= 200); }
  }
});

test("validator rejects missing sources, invalid amounts, out-of-range GPA/SAT/ACT and extra fields", async () => {
  const seed = await fixture();
  for (const invalid of [{ source_url: undefined }, { source_url: "" }, { source_url: "https://unrelated.example/award" }, { amount_min: -1 }, { amount_min: 999999 }, { amount_max: 0 }, { gpa_min: -0.01 }, { gpa_min: 5.01 }, { sat_min: 399 }, { sat_min: 1601 }, { act_min: 0 }, { act_min: 37 }, { student_email: "never-accepted@example.test" }]) {
    const changed = structuredClone(seed);
    Object.assign(changed.tiers[0], invalid);
    assert.throws(() => validateMeritSeed(changed), JSON.stringify(Object.keys(invalid)));
  }
});

test("nested rules retain the same numerical limits and no-test semantics", async () => {
  const seed = await fixture();
  seed.tiers[0].eligibility_rules = { kind: "act", min: 37, max: null };
  assert.throws(() => validateMeritSeed(seed));
  seed.tiers[0].eligibility_rules = { kind: "any", rules: [] };
  assert.throws(() => validateMeritSeed(seed));
});

test("known COA requires its own official source, academic year and check date", async () => {
  const seed = await fixture();
  seed.coa_in_state = 1; // Synthetic validation input, not a published cost.
  assert.throws(() => validateMeritSeed(seed));
  seed.coa_academic_year = "2027-2028";
  seed.coa_source_url = seed.official_merit_url;
  seed.coa_source_checked_at = seed.source_checked_at;
  assert.equal(validateMeritSeed(seed).coa_in_state, 1);
});

test("file imports cannot self-approve by supplying verified status or a timestamp", async () => {
  const seed = await fixture();
  assert.throws(() => validateMeritSeed({ ...seed, status: "verified" }));
  assert.throws(() => validateMeritSeed({ ...seed, verified_at: "2026-10-30" }));
});

test("future/invalid check dates, duplicated keys, unsafe URLs and invalid periods fail", async () => {
  const seed = await fixture();
  assert.throws(() => validateMeritSeed({ ...seed, source_checked_at: "2099-01-01" }));
  assert.throws(() => validateMeritSeed({ ...seed, source_checked_at: "2026-02-30" }));
  assert.throws(() => validateMeritSeed({ ...seed, official_merit_url: "http://example.edu" }));
  assert.throws(() => validateMeritSeed({ ...seed, tiers: [seed.tiers[0], seed.tiers[0]] }));
  const tier = { ...seed.tiers[0], per: "total", award_periods_per_year: 2 };
  assert.throws(() => validateMeritSeed({ ...seed, tiers: [tier] }));
});

test("approval hash ignores check dates/order but includes every material award fact", async () => {
  const seed = await fixture();
  const digest = meritContentHash(seed);
  const reordered = structuredClone(seed);
  reordered.tiers.reverse(); reordered.source_checked_at = "2026-10-31";
  for (const tier of reordered.tiers) tier.source_checked_at = "2026-10-31";
  assert.equal(meritContentHash(reordered), digest);
  for (const update of [(s: MeritSeed) => { s.tiers[0].amount_min += 1; }, (s: MeritSeed) => { s.tiers[0].requires_action += " Changed"; }, (s: MeritSeed) => { s.tiers[0].gpa_min = 4.99; }, (s: MeritSeed) => { s.tiers.pop(); }, (s: MeritSeed) => { s.notes += " Changed"; }]) {
    const changed = structuredClone(seed); update(changed); assert.notEqual(meritContentHash(changed), digest);
  }
});

test("unchanged imports preserve approval, changed facts invalidate it and drafts never resurrect retirement", async () => {
  const seed = await fixture();
  const previous = { status: "verified", content_hash: meritContentHash(seed) };
  assert.deepEqual(importedStatus(previous, seed), { status: "verified", retainVerification: true });
  assert.deepEqual(importedStatus(null, seed), { status: "draft", retainVerification: false });
  const changed = structuredClone(seed); changed.notes += " Changed";
  assert.deepEqual(importedStatus(previous, changed), { status: "draft", retainVerification: false });
  assert.equal(importedStatus({ ...previous, status: "retired" }, seed).status, "retired");
  assert.equal(importedStatus({ ...previous, status: "stale" }, seed).status, "stale");
});

test("current-data predicate excludes draft/stale/retired, absent/future approval and over-12-month approval", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const cutoff = verificationCutoff(now);
  assert.equal(cutoff.toISOString(), "2025-10-31T12:00:00.000Z");
  for (const status of ["draft", "stale", "retired"]) assert.equal(meritIsCurrent(status, now, now), false);
  assert.equal(meritIsCurrent("verified", null, now), false);
  assert.equal(meritIsCurrent("verified", new Date("2027-01-01"), now), false);
  assert.equal(meritIsCurrent("verified", new Date(cutoff.getTime() - 1), now), false);
  assert.equal(meritIsCurrent("verified", cutoff, now), true);
  assert.equal(verificationCutoff(new Date("2024-02-29T12:00:00Z")).toISOString(), "2023-02-28T12:00:00.000Z");
});

test("interactive refusal helper rejects pipes/CI and requires the exact slug; verification script is NOT invoked", () => {
  for (const [stdinTTY, stdoutTTY, unattended] of [[false, false, false], [true, false, false], [false, true, false], [true, true, true]]) assert.throws(() => requireInteractiveVerification({ stdinTTY, stdoutTTY, unattended }));
  assert.doesNotThrow(() => requireInteractiveVerification({ stdinTTY: true, stdoutTTY: true, unattended: false }));
  for (const typed of ["yes", "alabama ", "ALABAMA", ""]) assert.throws(() => requireExactSlug("alabama", typed));
  assert.doesNotThrow(() => requireExactSlug("alabama", "alabama"));
});

test("unresolved source issues and unknown award years prevent verification", async () => {
  const seed = await fixture();
  assert.throws(() => requireReviewableSeed(seed));
  seed.review_issues = [];
  seed.tiers[0].award_academic_year = null;
  assert.throws(() => requireReviewableSeed(seed));
});

test("write-target guard fails before remote writes unless explicitly acknowledged", () => {
  assert.throws(() => assertMeritWriteTarget([], {}));
  assert.throws(() => assertMeritWriteTarget([], { DATABASE_URL: "postgres://example:fake@db.example.test/db" }));
  assert.doesNotThrow(() => assertMeritWriteTarget([], { DATABASE_URL: "postgres://example:fake@localhost/db" }));
});

test("only the new tables are created; RLS is enabled and no anonymous read policies are added", async () => {
  const migration = await readFile("src/db/migrations/0028_merit_aid.sql", "utf8");
  assert.deepEqual([...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map(match => match[1]), ["merit_schools", "merit_tiers"]);
  assert.match(migration, /ALTER TABLE "merit_schools" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE "merit_tiers" ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /CREATE POLICY|DISABLE ROW LEVEL SECURITY/);
  const script = await readFile("scripts/merit-verify.ts", "utf8");
  assert.ok(script.indexOf("requireInteractiveVerification({") < script.indexOf("await loadMeritSeed(slug)"));
});
