ALTER TABLE "profiles" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint

-- Backfill activation for profiles that already meet the four-field minimum
-- and have saved at least one posting. This keeps the metric honest for
-- accounts that activated before the event existed.
UPDATE "profiles" p
SET "activated_at" = COALESCE(
  (SELECT MAX(a."created_at") FROM "applications" a WHERE a."user_id" = p."id"),
  p."created_at"
)
WHERE p."major" IS NOT NULL
  AND p."grad_year" IS NOT NULL
  AND p."work_auth" IS NOT NULL
  AND cardinality(p."target_locations") > 0
  AND EXISTS (SELECT 1 FROM "applications" a WHERE a."user_id" = p."id");
