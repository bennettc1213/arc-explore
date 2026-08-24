-- Two-observation close rule for the ATS-feed freshness engine.
--
-- A posting dropped from one scrape is not evidence the employer closed it;
-- that single absence is as flaky as a 404 on an apply URL. These columns
-- mirror urlDeadStrikes / urlDeadSince from the apply-URL health checker
-- (see src/lib/ingest/linkcheck.ts): missingStrikes is bumped on each
-- consecutive absence and reset to 0 whenever the posting reappears, and
-- closedAt is only set once it crosses MISSING_STRIKES_REQUIRED (== 2).
--
-- closedAt was previously set on the first absence; this migration backfills
-- missingStrikes for currently-open postings (0) and leaves closed_at as-is
-- — a row that was closed by the old one-shot rule is not reopened by history,
-- it simply stops accumulating strikes now that the rule changes.
--> statement-breakpoint

ALTER TABLE "postings" ADD COLUMN "missing_strikes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "missing_since" timestamp with time zone;--> statement-breakpoint

-- Backfill the counter for every open row so the new column is consistent
-- before the next scrape reads it. Closed rows are left at 0; they will not
-- re-enter the liveness engine until reopened, at which point the counter
-- starts fresh from 0.
--> statement-breakpoint
UPDATE "postings" SET "missing_strikes" = 0 WHERE "closed_at" IS NULL;--> statement-breakpoint
UPDATE "postings" SET "missing_strikes" = 0 WHERE "closed_at" IS NOT NULL;--> statement-breakpoint

CREATE INDEX "posting_missing_strike_idx" ON "postings" USING btree ("missing_strikes") WHERE "closed_at" IS NULL;
