-- INS-007 — canonical two-successful-miss close/reopen lifecycle.
--
-- Historical rows that were closed by the old one-shot rules have no recorded
-- first-miss timestamp, so their closed_at is left untouched rather than
-- invented. We only normalize counters and bound missing_since by the last
-- retained observation.
--> statement-breakpoint

-- Closed rows should not carry miss state.
UPDATE "postings"
SET "missing_strikes" = 0, "missing_since" = null
WHERE "closed_at" IS NOT NULL
  AND ("missing_strikes" > 0 OR "missing_since" IS NOT NULL);
--> statement-breakpoint

-- Open rows that already have strikes but no first-miss timestamp get the
-- safest available bound: they were definitely seen at last_seen_at, so the
-- first miss cannot be earlier than that.
UPDATE "postings"
SET "missing_since" = "last_seen_at"
WHERE "closed_at" IS NULL
  AND "missing_strikes" > 0
  AND "missing_since" IS NULL;
