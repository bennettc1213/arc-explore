CREATE TABLE "scout_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "filters" jsonb NOT NULL,
  "fingerprint" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "scout_history_user_fingerprint_unique" UNIQUE ("user_id", "fingerprint")
);--> statement-breakpoint
CREATE INDEX "scout_history_user_updated_idx" ON "scout_history" ("user_id", "updated_at");--> statement-breakpoint
ALTER TABLE "scout_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_scout_history" ON "scout_history"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "user_id")
  WITH CHECK ((SELECT auth.uid()) = "user_id");
