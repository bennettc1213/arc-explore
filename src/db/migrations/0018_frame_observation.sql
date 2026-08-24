-- Framing observation, read off the response the link checker already fetches.
--
-- Replaces the four-host `FRAMEABLE_ATS_HOSTS` allowlist as the source of
-- truth for whether an application can be embedded in an Arc page. An
-- allowlist can cover four ATS families; it cannot cover the ~300 distinct
-- scholarship hosts in this corpus (one row per host), and it silently
-- excluded every source added after it was written.
--
-- Two consecutive `allow` observations are required before we embed; a single
-- refusal resets to 0. See src/lib/apply/frame-headers.ts for why that is
-- asymmetric — a wrong "deny" costs one browser tab, a wrong "allow" shows a
-- blank rectangle at the moment someone was applying.
--
-- No RLS block needed: `postings` already has RLS from migration 0002 and this
-- adds columns to it rather than creating a table. (drizzle-kit emits CREATE
-- TABLE only, which is why new tables here get a hand-appended RLS pass.)
ALTER TABLE "postings" ADD COLUMN IF NOT EXISTS "frame_allow_strikes" integer DEFAULT 0 NOT NULL;
ALTER TABLE "postings" ADD COLUMN IF NOT EXISTS "frame_checked_at" timestamp with time zone;
