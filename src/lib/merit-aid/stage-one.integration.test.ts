import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { loadMeritSeeds } from "./seed-files";

/** Opt-in, known staging/local only. Never falls back to the app's database. */
test("merit SQL migration, idempotent import, invalidation, rollback, RLS and stale lifecycle", {
  skip: !process.env.MERIT_TEST_DATABASE_URL,
  timeout: 45000,
}, async () => {
  const target = process.env.MERIT_TEST_DATABASE_URL!;
  const parsed = new URL(target);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  assert.ok(local || parsed.username.includes("dgkjfmohtphrmispucwf"), "Integration test refuses a production/unknown database");
  const testSchema = `merit_aid_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(testSchema, /^merit_aid_test_[a-f0-9]{32}$/);
  const client = postgres(target, { prepare: false, ssl: local ? false : "require", max: 1, connect_timeout: 5, connection: { search_path: testSchema } });
  let created = false;
  try {
    await client.unsafe(`CREATE SCHEMA "${testSchema}"`);
    created = true;
    const migration = await readFile("src/db/migrations/0028_merit_aid.sql", "utf8");
    await client.begin(async tx => {
      for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await tx.unsafe(statement);
    });
    process.env.DATABASE_URL ??= target; // Unused default pool; all test calls inject the isolated database.
    const schema = await import("@/db/schema");
    const { importMeritSeeds, staleMeritSchools } = await import("./store");
    const database = drizzle(client, { schema });
    const seed = structuredClone((await loadMeritSeeds())[0]);
    seed.slug = "synthetic-integration-fixture";
    seed.name = "SYNTHETIC INTEGRATION FIXTURE — not a real school";
    seed.review_issues = [];
    await importMeritSeeds([seed], database);
    const [first] = await database.select().from(schema.meritSchools);
    const originalTiers = await database.select().from(schema.meritTiers);
    await importMeritSeeds([seed], database);
    const [repeat] = await database.select().from(schema.meritSchools);
    assert.equal(repeat.id, first.id);
    assert.deepEqual((await database.select().from(schema.meritTiers)).map(tier => tier.id).sort(), originalTiers.map(tier => tier.id).sort());

    // Synthetic DB fixture status only; do NOT run the human verification CLI or verify any real seed.
    const approvedAt = new Date("2026-10-30T12:00:00Z");
    await database.update(schema.meritSchools).set({ status: "verified", verified_at: approvedAt, verified_content_hash: first.content_hash }).where(eq(schema.meritSchools.id, first.id));
    await importMeritSeeds([seed], database);
    assert.equal((await database.select().from(schema.meritSchools))[0].status, "verified");

    await database.update(schema.meritTiers).set({ amount_min: originalTiers[0].amount_min + 1, amount_max: originalTiers[0].amount_max + 1 }).where(eq(schema.meritTiers.id, originalTiers[0].id));
    assert.equal((await database.select().from(schema.meritSchools))[0].status, "draft");
    await importMeritSeeds([seed], database); // Repairs direct edits even when stored content_hash didn't change.
    assert.equal((await database.select().from(schema.meritTiers).where(eq(schema.meritTiers.id, originalTiers[0].id)))[0].amount_min, originalTiers[0].amount_min);

    const changed = structuredClone(seed);
    changed.tiers.pop();
    await importMeritSeeds([changed], database);
    assert.equal((await database.select().from(schema.meritTiers)).length, originalTiers.length - 1);

    const beforeFailure = (await database.select().from(schema.meritSchools))[0].content_hash;
    const invalid = structuredClone(seed);
    invalid.slug = "synthetic-bad-fixture";
    invalid.tiers[0].source_url = ""; // Exercise a database constraint and the whole-batch transaction rollback.
    await assert.rejects(importMeritSeeds([seed, invalid], database));
    assert.equal((await database.select().from(schema.meritSchools)).length, 1);
    assert.equal((await database.select().from(schema.meritSchools))[0].content_hash, beforeFailure);

    const [current] = await database.select().from(schema.meritSchools);
    await database.update(schema.meritSchools).set({ status: "verified", verified_at: approvedAt, verified_content_hash: current.content_hash }).where(eq(schema.meritSchools.id, first.id));
    assert.equal((await staleMeritSchools(false, new Date("2027-10-31T12:00:00Z"), database)).length, 1);
    await staleMeritSchools(true, new Date("2027-10-31T12:00:00Z"), database);
    assert.equal((await database.select().from(schema.meritSchools))[0].status, "stale");
    const protection = await client.unsafe(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = '${testSchema}'::regnamespace AND relname IN ('merit_schools','merit_tiers')`);
    assert.equal(protection.length, 2);
    assert.ok(protection.every(row => row.relrowsecurity));
    const privileges = await client.unsafe(`SELECT has_table_privilege('anon', '"${testSchema}".merit_schools', 'SELECT') AS readable`);
    assert.equal(privileges[0].readable, false);
  } finally {
    // Only this uniquely created, validated test schema; no public data is deleted.
    if (created) await client.unsafe(`DROP SCHEMA "${testSchema}" CASCADE`);
    await client.end({ timeout: 1 });
  }
});
