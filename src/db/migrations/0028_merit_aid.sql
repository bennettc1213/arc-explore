-- Curated merit tables only. No student inputs and no changes to ingestion.
CREATE TABLE "merit_schools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "state" text NOT NULL CHECK ("state" ~ '^[A-Z]{2}$'),
  "control" text NOT NULL CHECK ("control" IN ('public','private')),
  "official_merit_url" text NOT NULL CHECK ("official_merit_url" ~ '^https://'),
  "net_price_calculator_url" text NOT NULL CHECK ("net_price_calculator_url" ~ '^https://'),
  "coa_in_state" numeric(12,2) CHECK ("coa_in_state" >= 0),
  "coa_out_of_state" numeric(12,2) CHECK ("coa_out_of_state" >= 0),
  "coa_academic_year" text,
  "coa_source_url" text CHECK ("coa_source_url" ~ '^https://'),
  "coa_source_checked_at" date,
  "notes" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','verified','stale','retired')),
  "verified_at" timestamptz,
  "source_checked_at" date NOT NULL,
  "content_hash" text NOT NULL CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
  "verified_content_hash" text,
  "review_issues" jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof("review_issues") = 'array'),
  "research" jsonb NOT NULL CHECK (jsonb_typeof("research") = 'object'),
  CONSTRAINT "merit_coa_evidence_check" CHECK (("coa_in_state" IS NULL AND "coa_out_of_state" IS NULL) OR ("coa_academic_year" IS NOT NULL AND "coa_source_url" IS NOT NULL AND "coa_source_checked_at" IS NOT NULL)),
  CONSTRAINT "merit_verification_check" CHECK ("status" <> 'verified' OR ("verified_at" IS NOT NULL AND "verified_content_hash" IS NOT NULL AND "verified_content_hash" = "content_hash" AND "review_issues" = '[]'::jsonb))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merit_school_slug_unique" ON "merit_schools" ("slug");
--> statement-breakpoint
CREATE INDEX "merit_school_status_verified_idx" ON "merit_schools" ("status", "verified_at");
--> statement-breakpoint
CREATE TABLE "merit_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "merit_schools"("id") ON DELETE CASCADE,
  "seed_key" text NOT NULL,
  "audience" text NOT NULL CHECK ("audience" IN ('first_year','transfer')),
  "residency" text NOT NULL CHECK ("residency" IN ('in_state','out_of_state','any')),
  "tier_label" text NOT NULL,
  "award_academic_year" text,
  "gpa_min" numeric(4,3) CHECK ("gpa_min" BETWEEN 0 AND 5),
  "gpa_min_inclusive" boolean NOT NULL DEFAULT true,
  "gpa_basis_note" text NOT NULL,
  "sat_min" integer CHECK ("sat_min" BETWEEN 400 AND 1600),
  "act_min" integer CHECK ("act_min" BETWEEN 1 AND 36),
  "test_policy" text NOT NULL CHECK ("test_policy" IN ('required','optional','not_considered')),
  "amount_type" text NOT NULL CHECK ("amount_type" IN ('fixed','up_to','range')),
  "amount_min" numeric(12,2) NOT NULL,
  "amount_max" numeric(12,2) NOT NULL,
  "per" text NOT NULL CHECK ("per" IN ('year','semester','total')),
  "award_periods_per_year" integer CHECK ("award_periods_per_year" BETWEEN 1 AND 4),
  "renewable" boolean NOT NULL,
  "renewal_conditions" text,
  "requires_action" text NOT NULL,
  "eligibility_rules" jsonb,
  "source_url" text NOT NULL CHECK ("source_url" ~ '^https://'),
  "source_excerpt" text NOT NULL CHECK (char_length("source_excerpt") BETWEEN 1 AND 200),
  "source_checked_at" date NOT NULL,
  CONSTRAINT "merit_amount_check" CHECK ("amount_min" >= 0 AND "amount_max" > 0 AND "amount_max" >= "amount_min" AND ("amount_type" <> 'fixed' OR "amount_min" = "amount_max")),
  CONSTRAINT "merit_test_policy_check" CHECK ("test_policy" <> 'not_considered' OR ("sat_min" IS NULL AND "act_min" IS NULL)),
  CONSTRAINT "merit_annual_period_check" CHECK (("per" <> 'year' OR "award_periods_per_year" IS NOT DISTINCT FROM 1) AND ("per" <> 'total' OR "award_periods_per_year" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merit_tier_school_key_unique" ON "merit_tiers" ("school_id", "seed_key");
--> statement-breakpoint
CREATE INDEX "merit_tier_school_idx" ON "merit_tiers" ("school_id");
--> statement-breakpoint
-- Drafts and locked content are read only through server-side, filtered queries.
ALTER TABLE "merit_schools" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "merit_tiers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "merit_schools", "merit_tiers" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
-- Even a direct operator edit must invalidate an existing approval.
CREATE FUNCTION merit_invalidate_tier_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - 'source_checked_at') = (to_jsonb(NEW) - 'source_checked_at') THEN RETURN NEW; END IF;
  UPDATE merit_schools SET status = CASE WHEN status = 'retired' THEN 'retired' ELSE 'draft' END,
    verified_at = NULL, verified_content_hash = NULL
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.school_id ELSE NEW.school_id END;
  IF TG_OP = 'UPDATE' AND OLD.school_id <> NEW.school_id THEN
    UPDATE merit_schools SET status = CASE WHEN status = 'retired' THEN 'retired' ELSE 'draft' END,
      verified_at = NULL, verified_content_hash = NULL WHERE id = OLD.school_id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER merit_tier_approval_changed AFTER INSERT OR UPDATE OR DELETE ON merit_tiers
FOR EACH ROW EXECUTE FUNCTION merit_invalidate_tier_verification();
--> statement-breakpoint
CREATE FUNCTION merit_invalidate_school_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(OLD) - ARRAY['status','verified_at','verified_content_hash','source_checked_at','coa_source_checked_at'])
     IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status','verified_at','verified_content_hash','source_checked_at','coa_source_checked_at']) THEN
    NEW.status := CASE WHEN NEW.status = 'retired' THEN 'retired' ELSE 'draft' END;
    NEW.verified_at := NULL;
    NEW.verified_content_hash := NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER merit_school_approval_changed BEFORE UPDATE ON merit_schools
FOR EACH ROW EXECUTE FUNCTION merit_invalidate_school_verification();
