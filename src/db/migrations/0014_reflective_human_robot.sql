CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"props" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "event_name_at_idx" ON "events" USING btree ("name","at");--> statement-breakpoint

-- ==========================================================================
-- Everything below is hand-written. drizzle-kit emits CREATE TABLE only, and
-- migration 0002's RLS pass cannot cover a table created after it — the same
-- gap 0008, 0011 and 0012 each had to close by hand.
-- ==========================================================================

-- Backfill from `updated_at` rather than leaving every existing row stamped
-- with the migration time. For a row nobody has touched since saving it the
-- two are the same instant, so this is exact; for one that has been edited it
-- is the closest thing we hold. Either beats claiming every application in the
-- table was tracked the moment we ran this.
UPDATE "applications" SET "created_at" = "updated_at";--> statement-breakpoint

-- RLS on, and DELIBERATELY NO POLICIES. Every other user-owned table grants
-- `authenticated` access to its own rows; this one grants nothing to anyone.
-- Postgres denies by default once RLS is enabled, so with no policy the public
-- anon key can read nothing here, which is correct: there is no row in this
-- table any client has a reason to see. The server connects as table owner and
-- bypasses RLS, which is how the app writes and how the metrics read.
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "events" FROM anon, authenticated;
