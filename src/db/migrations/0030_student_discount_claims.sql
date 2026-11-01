CREATE TABLE "student_email_challenges" (
  "user_id" uuid PRIMARY KEY REFERENCES "profiles"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_sent_at" timestamptz NOT NULL DEFAULT now(),
  "window_started_at" timestamptz NOT NULL DEFAULT now(),
  "send_count" integer NOT NULL DEFAULT 1,
  CONSTRAINT "student_challenge_attempts" CHECK ("attempts" BETWEEN 0 AND 5),
  CONSTRAINT "student_challenge_sends" CHECK ("send_count" BETWEEN 0 AND 5)
);--> statement-breakpoint
CREATE TABLE "student_discount_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid UNIQUE REFERENCES "profiles"("id") ON DELETE SET NULL,
  "school_email_hash" text NOT NULL UNIQUE,
  "school_domain" text NOT NULL,
  "student_subject_hash" text UNIQUE,
  "email_verified_at" timestamptz NOT NULL DEFAULT now(),
  "enrollment_status" text NOT NULL DEFAULT 'pending',
  "enrollment_verified_at" timestamptz,
  "enrollment_valid_until" timestamptz,
  "redeemed_at" timestamptz,
  CONSTRAINT "student_enrollment_status" CHECK ("enrollment_status" IN ('pending', 'verified', 'rejected')),
  CONSTRAINT "student_discount_requires_enrollment" CHECK ("redeemed_at" IS NULL OR ("enrollment_status" = 'verified' AND "enrollment_verified_at" IS NOT NULL AND "enrollment_valid_until" IS NOT NULL))
);--> statement-breakpoint
ALTER TABLE "student_email_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_discount_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "student_claim_read_own" ON "student_discount_claims" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");
-- Challenges and claim writes are server-only. Email hashes survive account
-- deletion to prevent recycling a school address into another discount.
