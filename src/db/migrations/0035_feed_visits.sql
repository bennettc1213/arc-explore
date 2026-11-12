-- "Since you last looked": the start of the student's current feed visit and
-- the one before it. Two timestamps on the student's own profile row, no
-- history and no per-listing log. Covered by profiles' existing RLS.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "last_feed_seen_at" timestamptz;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "prev_feed_seen_at" timestamptz;
