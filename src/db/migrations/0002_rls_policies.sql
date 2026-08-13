-- Row Level Security.
--
-- WHY THIS IS NOT OPTIONAL
--
-- We run migrations with drizzle-kit, not the Supabase CLI. Supabase's default
-- privileges grant `anon` and `authenticated` full CRUD on every new table in
-- `public`, and PostgREST serves those roles to anyone holding the anon key —
-- which ships to the browser in NEXT_PUBLIC_SUPABASE_ANON_KEY. Before this
-- migration every table in this database was readable AND writable by anyone
-- on the internet at https://<ref>.supabase.co/rest/v1/<table>.
--
-- Our own app connects over DATABASE_URL as the table owner, which bypasses
-- RLS. So none of this changes what the app can do, and none of it could have
-- been caught by exercising the app. Server code stays responsible for scoping
-- every user query by user_id; the policies below are the second line, for the
-- door we do not control. `scripts/db-audit.ts` asserts the state this
-- migration establishes — run it after adding any table.
--
-- Grants are re-issued from zero rather than patched, so the privilege set is
-- readable in one place instead of being the residue of Supabase's defaults.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint

-- Future drizzle-generated tables should not inherit blanket access either.
-- (Default privileges are per-grantor; this covers tables created by the role
-- drizzle-kit connects as. db-audit is the backstop if a grantor differs.)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
--> statement-breakpoint

/* ------------------------------------------------------------------ *
 * Public catalog — readable by everyone, writable only by ingestion
 * (which runs as the owner role and bypasses RLS).
 * ------------------------------------------------------------------ */

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "postings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruiting_cycles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT ON "organizations", "postings", "recruiting_cycles" TO anon, authenticated;--> statement-breakpoint

DROP POLICY IF EXISTS "organizations_public_read" ON "organizations";--> statement-breakpoint
CREATE POLICY "organizations_public_read" ON "organizations" FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint

DROP POLICY IF EXISTS "postings_public_read" ON "postings";--> statement-breakpoint
CREATE POLICY "postings_public_read" ON "postings" FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint

DROP POLICY IF EXISTS "recruiting_cycles_public_read" ON "recruiting_cycles";--> statement-breakpoint
CREATE POLICY "recruiting_cycles_public_read" ON "recruiting_cycles" FOR SELECT TO anon, authenticated USING (true);--> statement-breakpoint

/* ------------------------------------------------------------------ *
 * Internal — no client-side access at all. RLS on with zero policies
 * denies everything; the grants above are already revoked.
 *
 * posting_sources stores raw ATS payloads for debugging parser drift and
 * ingest_runs is operational telemetry. Neither is ever read by the browser.
 * ------------------------------------------------------------------ */

ALTER TABLE "posting_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingest_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ------------------------------------------------------------------ *
 * User-owned rows — visible only to the row's owner.
 *
 * `auth.uid()` reads the `sub` claim of the request's JWT, so an anon-key
 * request with no session matches nothing and a signed-in user matches only
 * their own rows. Applied to every command, including INSERT, so a user
 * cannot write a row owned by someone else.
 * ------------------------------------------------------------------ */

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resumes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "profiles", "resumes", "matches", "applications", "contacts", "outreach_drafts"
  TO authenticated;--> statement-breakpoint

-- profiles keys on `id` (it mirrors auth.users.id); everything else on user_id.
DROP POLICY IF EXISTS "profiles_owner" ON "profiles";--> statement-breakpoint
CREATE POLICY "profiles_owner" ON "profiles" FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "id") WITH CHECK ((SELECT auth.uid()) = "id");--> statement-breakpoint

DROP POLICY IF EXISTS "resumes_owner" ON "resumes";--> statement-breakpoint
CREATE POLICY "resumes_owner" ON "resumes" FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "user_id") WITH CHECK ((SELECT auth.uid()) = "user_id");--> statement-breakpoint

DROP POLICY IF EXISTS "matches_owner" ON "matches";--> statement-breakpoint
CREATE POLICY "matches_owner" ON "matches" FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "user_id") WITH CHECK ((SELECT auth.uid()) = "user_id");--> statement-breakpoint

DROP POLICY IF EXISTS "applications_owner" ON "applications";--> statement-breakpoint
CREATE POLICY "applications_owner" ON "applications" FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "user_id") WITH CHECK ((SELECT auth.uid()) = "user_id");--> statement-breakpoint

DROP POLICY IF EXISTS "contacts_owner" ON "contacts";--> statement-breakpoint
CREATE POLICY "contacts_owner" ON "contacts" FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "user_id") WITH CHECK ((SELECT auth.uid()) = "user_id");--> statement-breakpoint

DROP POLICY IF EXISTS "outreach_drafts_owner" ON "outreach_drafts";--> statement-breakpoint
CREATE POLICY "outreach_drafts_owner" ON "outreach_drafts" FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "user_id") WITH CHECK ((SELECT auth.uid()) = "user_id");
