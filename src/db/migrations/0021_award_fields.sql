-- Four-field award representation + backfill of existing scholarship rows.
ALTER TABLE "postings"
  ADD COLUMN IF NOT EXISTS "amount_status" text DEFAULT 'varies',
  ADD COLUMN IF NOT EXISTS "program_total" integer,
  ADD COLUMN IF NOT EXISTS "awards_count" integer,
  ADD COLUMN IF NOT EXISTS "amount_is_estimated" boolean DEFAULT false;

-- Constrain status to the four known values once the column exists.
ALTER TABLE "postings"
  DROP CONSTRAINT IF EXISTS "postings_amount_status_check";
ALTER TABLE "postings"
  ADD CONSTRAINT "postings_amount_status_check"
    CHECK ("amount_status" IN ('exact', 'range', 'varies', 'unparseable'));

-- Backfill from the existing min/max/review columns. Original text is not
-- retained, so provenance is inferred from the stored shape.
UPDATE "postings"
SET
  "amount_status" = CASE
    WHEN "amount_needs_review" THEN 'unparseable'
    WHEN "amount_min" IS NOT NULL AND "amount_max" IS NOT NULL AND "amount_min" != "amount_max" THEN 'range'
    WHEN "amount_min" IS NOT NULL THEN 'exact'
    ELSE 'varies'
  END,
  "amount_is_estimated" = false
WHERE "amount_status" IS NULL;

ALTER TABLE "postings" ALTER COLUMN "amount_status" SET NOT NULL;
