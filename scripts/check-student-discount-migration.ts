import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

// Exercises the migration and constraints inside a rolled-back
// transaction. No test profiles, claims or schema changes are committed.
async function main() {
  const connection = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    ssl: "require",
    max: 1,
  });
  const rollback = new Error("verification-test-rollback");
  try {
    await connection.begin(async (tx) => {
      const [existing] =
        await tx`select to_regclass('public.student_discount_claims') as claims`;
      if (!existing.claims)
        await tx.unsafe(
          readFileSync(
            "src/db/migrations/0028_student_discount_claims.sql",
            "utf8",
          ),
        );
      const first = randomUUID();
      const second = randomUUID();
      await tx`insert into profiles (id) values (${first}), (${second})`;
      await tx`insert into student_discount_claims (user_id, school_email_hash, school_domain, student_subject_hash) values (${first}, 'synthetic-email-hash', 'example.edu', 'synthetic-student-subject')`;
      await assert.rejects(
        tx.savepoint(async (sp) => {
          await sp`insert into student_discount_claims (user_id, school_email_hash, school_domain, student_subject_hash) values (${second}, 'another-email-hash', 'example.edu', 'synthetic-student-subject')`;
        }),
        (error: { code: string }) => error.code === "23505",
      );
      await assert.rejects(
        tx.savepoint(async (sp) => {
          await sp`insert into student_discount_claims (user_id, school_email_hash, school_domain) values (${second}, 'synthetic-email-hash', 'example.edu')`;
        }),
        (error: { code: string }) => error.code === "23505",
      );
      await assert.rejects(
        tx.savepoint(async (sp) => {
          await sp`update student_discount_claims set redeemed_at = now() where user_id = ${first}`;
        }),
        (error: { code: string }) => error.code === "23514",
      );
      await tx`update student_discount_claims set enrollment_status = 'verified', enrollment_verified_at = now(), enrollment_valid_until = now() + interval '90 days' where user_id = ${first}`;
      const redeemed =
        await tx`update student_discount_claims set redeemed_at = now() where user_id = ${first} and redeemed_at is null and enrollment_status = 'verified' and enrollment_valid_until > now() returning id`;
      assert.equal(redeemed.length, 1);
      const repeated =
        await tx`update student_discount_claims set redeemed_at = now() where user_id = ${first} and redeemed_at is null and enrollment_status = 'verified' and enrollment_valid_until > now() returning id`;
      assert.equal(repeated.length, 0);
      await tx`delete from profiles where id = ${first}`;
      const [retained] =
        await tx`select user_id from student_discount_claims where school_email_hash = 'synthetic-email-hash'`;
      assert.equal(retained.user_id, null);
      await assert.rejects(
        tx.savepoint(async (sp) => {
          await sp`insert into student_discount_claims (user_id, school_email_hash, school_domain) values (${second}, 'synthetic-email-hash', 'example.edu')`;
        }),
        (error: { code: string }) => error.code === "23505",
      );
      const policies =
        await tx`select relrowsecurity from pg_class where oid = 'public.student_discount_claims'::regclass`;
      assert.equal(policies[0].relrowsecurity, true);
      console.log(
        "PASS: unique school email, enrollment requirement, one-time redemption, account-deletion reuse prevention, RLS.",
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
    console.log("All test data and migration DDL rolled back.");
  } finally {
    await connection.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
