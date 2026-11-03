-- Free/Pro plan redesign (docs/free-pro-plans.md).
--
-- Additive only. `feature_usage` is left in place and simply stops being read:
-- its lifetime counters are what this replaces, and dropping it would destroy
-- the evidence a rollback needs.
--
-- Hand-written, like 0017: drizzle-kit generate needs an interactive TTY here.

CREATE TABLE IF NOT EXISTS "feature_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE cascade,
  "feature" text NOT NULL,
  "grant_key" text NOT NULL,
  "period_start" timestamptz,
  "granted_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz,
  "status" text DEFAULT 'reserved' NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_grants_user_feature_idx" ON "feature_grants" ("user_id", "feature");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tool_request_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE cascade,
  "feature" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_request_log_user_idx" ON "tool_request_log" ("user_id", "feature", "created_at");--> statement-breakpoint

ALTER TABLE "saved_searches" ADD COLUMN IF NOT EXISTS "free_alert_picked_at" timestamptz;--> statement-breakpoint

-- Transition: earned results stay earned.
--
-- (1) Every existing cover letter becomes a granted use for its posting, so
--     revising it never charges. Rows written while the account was on Pro get
--     no period (replay only); Free rows keep their creation time as the period
--     start, so a letter drafted in the last 30 days is this period's use and
--     an older one is not.
INSERT INTO "feature_grants" ("user_id", "feature", "grant_key", "period_start", "granted_at", "status")
SELECT c."user_id", 'cover_letter', c."posting_id"::text,
       CASE WHEN p."plan" IN ('apply', 'edge') THEN NULL ELSE c."created_at" END,
       c."created_at", 'granted'
FROM "cover_letters" c JOIN "profiles" p ON p."id" = c."user_id";--> statement-breakpoint

-- (2) The last keyed run of each lifetime counter becomes a granted use at the
--     time it was recorded. Old counts are NOT carried over, so a lifetime
--     counter can never exhaust a recurring allowance. The resume key was the
--     resume id; `lib/pricing/grants.ts` accepts it as a replay alias.
INSERT INTO "feature_grants" ("user_id", "feature", "grant_key", "period_start", "granted_at", "status")
SELECT u."user_id", u."feature",
       CASE WHEN u."feature" = 'github_tools' THEN lower(u."last_key") ELSE u."last_key" END,
       CASE WHEN p."plan" IN ('apply', 'edge') THEN NULL ELSE u."updated_at" END,
       u."updated_at", 'granted'
FROM "feature_usage" u JOIN "profiles" p ON p."id" = u."user_id"
WHERE u."last_key" IS NOT NULL AND u."feature" IN ('resume_critique', 'github_tools');--> statement-breakpoint

-- RLS, hand-appended for the reason 0017 gives: drizzle-kit emits CREATE TABLE
-- only, and PostgREST serves `authenticated` to anyone holding the public key.
-- The app connects as owner and bypasses RLS; every query scopes by user_id in
-- code. Clients get SELECT on their own grants, nothing on the request log.
ALTER TABLE "feature_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON "feature_grants" TO authenticated;--> statement-breakpoint
DROP POLICY IF EXISTS "feature_grants_own" ON "feature_grants";--> statement-breakpoint
CREATE POLICY "feature_grants_own" ON "feature_grants" FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = "user_id");--> statement-breakpoint
ALTER TABLE "tool_request_log" ENABLE ROW LEVEL SECURITY;
