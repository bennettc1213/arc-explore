-- Employer-stated internship details. These deliberately do not reuse the
-- scholarship award columns: compensation has a rate unit, while an award is
-- a one-time amount.
ALTER TABLE "postings"
  ADD COLUMN IF NOT EXISTS "work_arrangement" text,
  ADD COLUMN IF NOT EXISTS "compensation_min_cents" integer,
  ADD COLUMN IF NOT EXISTS "compensation_max_cents" integer,
  ADD COLUMN IF NOT EXISTS "compensation_interval" text;
--> statement-breakpoint
ALTER TABLE "postings"
  ADD CONSTRAINT "postings_work_arrangement_check"
    CHECK ("work_arrangement" IS NULL OR "work_arrangement" IN ('remote','hybrid','in_person'));
--> statement-breakpoint
ALTER TABLE "postings"
  ADD CONSTRAINT "postings_compensation_interval_check"
    CHECK ("compensation_interval" IS NULL OR "compensation_interval" IN ('hour','year'));
--> statement-breakpoint
ALTER TABLE "postings"
  ADD CONSTRAINT "postings_compensation_range_check"
    CHECK (
      ("compensation_min_cents" IS NULL AND "compensation_max_cents" IS NULL AND "compensation_interval" IS NULL)
      OR (
        "compensation_min_cents" IS NOT NULL
        AND "compensation_max_cents" IS NOT NULL
        AND "compensation_min_cents" >= 0
        AND "compensation_max_cents" >= "compensation_min_cents"
      )
    );
