CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"last_notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_search_user_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_search_notify_idx" ON "saved_searches" USING btree ("notify","last_notified_at");--> statement-breakpoint

-- Hand-appended to the drizzle-generated migration above.
--
-- Same reason as migrations 0008 and 0011: drizzle-kit emits CREATE TABLE and
-- nothing else, migration 0002 cannot cover a table created after it, and
-- PostgREST serves `anon` and `authenticated` to anyone holding the key that
-- ships to the browser. Without the lines below, saved_searches would be
-- world-readable -- which is a list of exactly what every student is looking
-- for, joined to their user id.
--
-- Saved searches are written and updated only through Server Actions and the
-- alert job, both of which connect as the owner and bypass RLS. `authenticated`
-- therefore gets SELECT on its own rows and nothing more: a student may see
-- their own saved searches, and may not read anyone else's, nor forge one, nor
-- move another person's `last_notified_at` watermark to silence their alerts.

ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT ON "saved_searches" TO authenticated;--> statement-breakpoint

DROP POLICY IF EXISTS "saved_searches_own" ON "saved_searches";--> statement-breakpoint
CREATE POLICY "saved_searches_own" ON "saved_searches" FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = "user_id");
