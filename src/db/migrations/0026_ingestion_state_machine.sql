-- INS-013 — idempotent ingestion state machine.
--
-- Three changes, all additive: a status on the run, a replay ledger, and a
-- uniqueness guarantee on lifecycle events.
--
-- Written by hand for the same reason as 0025 — see the note in that file. The
-- committed snapshot chain stops at 0020 while the journal lists 0021-0025, so
-- `drizzle-kit generate` sees live columns as removed and prompts for rename
-- decisions it cannot answer non-interactively.

-- ------------------------------------------------------------------
-- 1. The four states a run can end in
-- ------------------------------------------------------------------
-- Before this, a run's outcome lived only in `detail` as a bag of counters, so
-- "did the run work?" had to be reconstructed by hand from `errors` and
-- `postings_new`. That reconstruction is where "a third of our boards were
-- unreadable last night" stops being visible.
--
-- The default is `successful_complete` rather than something stricter because
-- every pre-existing row was written by a caller that had no opinion on this
-- and completed its work; reinterpreting them as failures would be worse than
-- losing the distinction on rows that predate it.

ALTER TABLE "ingest_runs" ADD COLUMN "status" text DEFAULT 'successful_complete' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_status_check" CHECK ("status" IN ('successful_complete','successful_no_changes','partial','failed'));
--> statement-breakpoint
CREATE INDEX "ingest_run_status_idx" ON "ingest_runs" USING btree ("status","started_at");

-- ------------------------------------------------------------------
-- 2. Which run has already applied which org
-- ------------------------------------------------------------------
-- `postings.missing_strikes` is only meaningful as a count of *distinct polls*.
-- The pipeline is re-runnable — a CI retry, an overlapping 20-minute cycle, a
-- manual re-poll — and without this table, replaying one successful poll takes a
-- genuinely-absent row from 0 to 1 strikes and then from 1 to 2 and closes it.
-- One flaky absence would become a closure after one retry instead of two real
-- polls, which is precisely what the two-miss rule promises cannot happen.
--
-- The primary key is (org, run) rather than a surrogate id so the database
-- itself refuses the second attempt, including when two pollers race. `outcome`
-- is stored rather than recomputed so a replayed call returns what it returned
-- the first time, instead of a zeroed result that reads as "we found nothing".

CREATE TABLE "poll_run_marks" (
	"org_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" jsonb NOT NULL,
	CONSTRAINT "poll_run_marks_pkey" PRIMARY KEY ("org_id","run_id")
);
--> statement-breakpoint
ALTER TABLE "poll_run_marks" ADD CONSTRAINT "poll_run_marks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "poll_run_marks" ADD CONSTRAINT "poll_run_marks_run_id_ingest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE cascade;

-- ------------------------------------------------------------------
-- 3. One run makes at most one decision per posting
-- ------------------------------------------------------------------
-- The lifecycle event table was created by 0025 and never written to. Without
-- this index, re-applying a run appends a second `missing_1` or `closed` for the
-- same posting, so the history table becomes a record of how many times we ran,
-- not of what happened to the listing.
--
-- `run_id IS NOT NULL` is deliberate: Postgres treats NULLs as distinct, so
-- events written outside a run stay unconstrained. That is the correct
-- behaviour — an event with no run is not replayable, so deduplicating it
-- against another would suppress a genuinely separate event.
--
-- Creating this index is safe on an existing table even if events were written
-- by hand during staging: a duplicate would make the build fail loudly rather
-- than silently dropping history.

CREATE UNIQUE INDEX "posting_lifecycle_run_event_unique" ON "posting_lifecycle_events" USING btree ("posting_id","run_id","event") WHERE "run_id" is not null;