-- Flag rows whose stated term has already ended so the normal lifecycle can
-- recheck them instead of leaving them visible to students.
ALTER TABLE "postings" ADD COLUMN IF NOT EXISTS "term_ended_flag_at" timestamp with time zone;
