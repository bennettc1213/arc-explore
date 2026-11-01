-- The scholarship Plan view's funding goal: "how much do you need to cover?".
-- Whole dollars, typed by the student. Null means not stated, never zero.
-- No RLS block is needed: this is a column on `profiles`, which migration 0002
-- already covers. Read and written by `lib/profile/funding-goal.ts` until this
-- is applied everywhere and the column is declared in db/schema.ts.
ALTER TABLE "profiles" ADD COLUMN "funding_goal" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_funding_goal_range"
  CHECK ("funding_goal" IS NULL OR ("funding_goal" >= 1 AND "funding_goal" <= 10000000));
