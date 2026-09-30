/**
 * Guard for `drizzle-kit generate`.
 *
 * This repository cannot use the generator, and running it is actively
 * dangerous. Discovered while building INS-012 (2026-09-29): with the snapshot
 * chain repaired, `drizzle-kit generate` produced a 149-line migration that
 *
 *   - ran `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` on 16 tables, including
 *     profiles, resumes, applications, saved_searches, contacts and matches,
 *   - dropped all 13 row-level-security policies,
 *   - dropped every CHECK constraint, including the live
 *     `postings_amount_status_check` from the trust sprint,
 *   - dropped and recreated all 48 indexes.
 *
 * The cause is structural, not a version accident: Drizzle's schema model has
 * no representation for RLS policies or CHECK constraints, so a generated
 * migration always reads their absence from `schema.ts` as "drop them". Migrations
 * here must be hand-written, reviewed, and applied with `db:migrate`.
 *
 * Run `npm run db:generate:unsafe` only if you are deliberately reproducing the
 * generator's output to inspect it. Never apply what it writes.
 */

const message = [
  "",
  "npm run db:generate is disabled in this repository.",
  "",
  "Drizzle's model cannot represent row-level-security policies or CHECK",
  "constraints, so anything it generates tries to disable RLS and drop those",
  "constraints in the live database. See scripts/guard-drizzle-generate.ts.",
  "",
  "Instead:",
  "  1. Edit src/db/schema.ts and write the SQL by hand in",
  "     src/db/migrations/NNNN_name.sql, using --> statement-breakpoint between",
  "     statements.",
  "  2. Add the matching entry to src/db/migrations/meta/_journal.json",
  "     (no BOM, version \"7\", idx = previous + 1).",
  "  3. Verify with: npx tsx scripts/schema-drift.ts   (schema.ts vs the database)",
  "  4. Apply to staging first, then production at an approved release:",
  "     npm run db:migrate",
  "",
  "To see the generator's output without applying it:",
  "  npm run db:generate:unsafe",
  "",
].join("\n");

console.error(message);
process.exit(1);
