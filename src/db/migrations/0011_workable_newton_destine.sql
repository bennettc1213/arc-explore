CREATE TABLE "listing_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posting_id" uuid NOT NULL,
	"user_id" uuid,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text
);
--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_report_user_posting_unique" ON "listing_reports" USING btree ("user_id","posting_id");--> statement-breakpoint
CREATE INDEX "listing_report_open_idx" ON "listing_reports" USING btree ("resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "listing_report_posting_idx" ON "listing_reports" USING btree ("posting_id");--> statement-breakpoint

-- Hand-appended to the drizzle-generated migration above.
--
-- drizzle-kit emits CREATE TABLE and nothing else, so a new table arrives with
-- no RLS, and migration 0002 cannot cover a table created after it. PostgREST
-- serves `anon` and `authenticated` to anyone holding the key that ships to
-- the browser. Without the lines below, listing_reports would be world-
-- readable: every complaint anyone has filed, joined to the user id that filed
-- it. "This student reported a scholarship as a scam" is not public business.
--
-- Reports are read only by the admin queue, which connects as the owner and
-- bypasses RLS. So `authenticated` gets SELECT on its OWN rows and nothing
-- else -- enough for a student to see that their report was received, and not
-- enough to read anyone else's or to resolve their own.
--
-- INSERT is deliberately NOT granted. Reports are written by a Server Action
-- that has already checked the session and the posting id; granting insert
-- here would open a second door straight into the table through PostgREST,
-- with no validation of the reason value and no unique-index-friendly error
-- handling.

ALTER TABLE "listing_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT ON "listing_reports" TO authenticated;--> statement-breakpoint

DROP POLICY IF EXISTS "listing_reports_own" ON "listing_reports";--> statement-breakpoint
CREATE POLICY "listing_reports_own" ON "listing_reports" FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = "user_id");
