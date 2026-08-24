-- Drop two columns that were never wired to anything.
--
-- postings.category was superseded before launch by the derived field
-- taxonomy (lib/score/fit.ts, `fieldsForPosting`): the feed's category filter
-- reads that derivation, not this column, and the column has been NULL on
-- every row since the table was created. organizations.vertical was a
-- registry sketch that no insert ever populated and no query ever read.
--
-- Keeping them was not neutral: a column with a plausible name invites the
-- next person to filter on it and silently get an empty result set. Dropped
-- rather than backfilled because there is nothing to backfill from — the
-- taxonomy derivation is computed at read time, not stored.
--
-- NOT to be confused with recruiting_cycles.vertical (kept: curated, NOT
-- NULL, part of the business-cycle feature) or profiles.target_verticals
-- (kept: the student's own answers).
--> statement-breakpoint

ALTER TABLE "postings" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "vertical";--> statement-breakpoint
