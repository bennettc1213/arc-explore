-- Term model: explicit, inferred, or unknown.
--
-- Adds provenance and structure to the existing `term` text column without
-- changing its meaning. Existing rows become `unknown` by default and are
-- backfilled in INS-005.
ALTER TABLE "postings" ADD COLUMN IF NOT EXISTS "term_source" text DEFAULT 'unknown' NOT NULL;
ALTER TABLE "postings" ADD COLUMN IF NOT EXISTS "term_season" text;
ALTER TABLE "postings" ADD COLUMN IF NOT EXISTS "term_year" integer;
ALTER TABLE "postings" ADD COLUMN IF NOT EXISTS "term_raw" text;
