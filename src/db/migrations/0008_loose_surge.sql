CREATE TABLE "deadline_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"days_before" integer NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "deadline_reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "deadline_reminders" ADD CONSTRAINT "deadline_reminders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_reminders" ADD CONSTRAINT "deadline_reminders_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_unique" ON "deadline_reminders" USING btree ("user_id","posting_id","days_before","deadline_at");--> statement-breakpoint
CREATE INDEX "reminder_user_idx" ON "deadline_reminders" USING btree ("user_id");--> statement-breakpoint

-- Hand-appended to the drizzle-generated migration above.
--
-- drizzle-kit emits CREATE TABLE and nothing else, so a new table arrives with
-- no RLS. Supabase's PostgREST serves `anon` and `authenticated` to anyone
-- holding the key that ships to the browser, which is exactly the exposure
-- migration 0002 exists to close — and 0002 cannot cover a table created after
-- it. Without the lines below, deadline_reminders would be readable by anyone
-- on the internet: a list of which student is tracking which opportunity, and
-- their deadlines.
--
-- Reminders are written only by the scheduled job, which connects as the owner
-- and bypasses RLS. `authenticated` therefore needs SELECT and nothing more:
-- a student may see what we sent them, and may not manufacture a record that
-- suppresses a reminder or fabricates one for someone else.

ALTER TABLE "deadline_reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT ON "deadline_reminders" TO authenticated;--> statement-breakpoint

DROP POLICY IF EXISTS "deadline_reminders_owner" ON "deadline_reminders";--> statement-breakpoint
CREATE POLICY "deadline_reminders_owner" ON "deadline_reminders" FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = "user_id");
