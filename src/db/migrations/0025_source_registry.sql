-- INS-012 — canonical source registry, provenance, and lifecycle history.
--
-- Additive only: five new tables and new columns on two existing ones. No
-- existing column is dropped, renamed, or retyped, so this can be applied
-- without a table rewrite and reverted by dropping what it created.
--
-- Written by hand because `drizzle-kit generate` cannot run non-interactively
-- in this repo: the committed snapshot chain stops at 0020 while the journal
-- lists 0021-0024, so drizzle sees live columns as removed and asks which new
-- column is a rename of which. See scripts/schema-drift.ts and the 0025
-- snapshot regenerated from the staging database.

CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"provider" text NOT NULL,
	"authority" text DEFAULT 'source_of_truth' NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"org_id" uuid,
	"opportunity_kind" text DEFAULT 'both' NOT NULL,
	"public_page_url" text,
	"poll_tier" text DEFAULT 'B' NOT NULL,
	"poll_interval_sec" integer DEFAULT 1200 NOT NULL,
	"raw_storage" text DEFAULT 'full' NOT NULL,
	"terms_review_status" text DEFAULT 'not_reviewed' NOT NULL,
	"terms_reviewed_at" timestamp with time zone,
	"terms_review_note" text,
	"robots_review_status" text DEFAULT 'not_reviewed' NOT NULL,
	"robots_reviewed_at" timestamp with time zone,
	"crawler_contact" text,
	"last_complete_poll_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_summary" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"adapter_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_authority_check" CHECK ("authority" IN ('source_of_truth','discovery_only')),
	CONSTRAINT "sources_state_check" CHECK ("state" IN ('active','paused','blocked')),
	CONSTRAINT "sources_access_review_check" CHECK ("terms_review_status" IN ('not_reviewed','approved','restricted','denied') AND "robots_review_status" IN ('not_reviewed','approved','restricted','denied')),
	CONSTRAINT "sources_poll_tier_check" CHECK ("poll_tier" IN ('A','B','C'))
);
--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX "source_key_unique" ON "sources" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "source_state_tier_idx" ON "sources" USING btree ("state","poll_tier","last_complete_poll_at");
--> statement-breakpoint
CREATE INDEX "source_org_idx" ON "sources" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "source_authority_idx" ON "sources" USING btree ("authority");
--> statement-breakpoint
CREATE INDEX "source_state_authority_idx" ON "sources" USING btree ("state","authority");

CREATE TABLE "discovery_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"candidate_key" text NOT NULL,
	"organization_name" text NOT NULL,
	"organization_domain" text,
	"ats_type" text,
	"ats_slug" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_posting_id" uuid,
	"resolved_org_id" uuid,
	"note" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_candidates_origin_check" CHECK ("origin" IN ('simplify','adzuna','community','manual')),
	CONSTRAINT "discovery_candidates_status_check" CHECK ("status" IN ('pending','resolved','rejected'))
);
--> statement-breakpoint
ALTER TABLE "discovery_candidates" ADD CONSTRAINT "discovery_candidates_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "discovery_candidates" ADD CONSTRAINT "discovery_candidates_resolved_posting_id_postings_id_fk" FOREIGN KEY ("resolved_posting_id") REFERENCES "public"."postings"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "discovery_candidates" ADD CONSTRAINT "discovery_candidates_resolved_org_id_organizations_id_fk" FOREIGN KEY ("resolved_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_candidate_unique" ON "discovery_candidates" USING btree ("source_id","candidate_key");
--> statement-breakpoint
CREATE INDEX "discovery_candidate_status_idx" ON "discovery_candidates" USING btree ("status","last_seen_at");

CREATE TABLE "posting_field_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posting_id" uuid NOT NULL,
	"source_id" uuid,
	"field" text NOT NULL,
	"method" text NOT NULL,
	"confidence" real,
	"rule_id" text,
	"rule_version" text,
	"evidence" text,
	"value_text" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "posting_field_provenance_field_check" CHECK ("field" IN ('term','eligibility','amount','effort','award_count','sponsor_type')),
	CONSTRAINT "posting_field_provenance_method_check" CHECK ("method" IN ('source_value','deterministic_rule','llm','human')),
	CONSTRAINT "posting_field_provenance_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);
--> statement-breakpoint
ALTER TABLE "posting_field_provenance" ADD CONSTRAINT "posting_field_provenance_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "posting_field_provenance" ADD CONSTRAINT "posting_field_provenance_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX "posting_field_provenance_current" ON "posting_field_provenance" USING btree ("posting_id","field") WHERE "superseded_at" is null;
--> statement-breakpoint
CREATE INDEX "posting_field_provenance_posting_idx" ON "posting_field_provenance" USING btree ("posting_id");
--> statement-breakpoint
CREATE INDEX "posting_field_provenance_field_idx" ON "posting_field_provenance" USING btree ("field");

CREATE TABLE "posting_lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posting_id" uuid NOT NULL,
	"event" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid,
	"source_id" uuid,
	"detail" jsonb,
	CONSTRAINT "posting_lifecycle_events_event_check" CHECK ("event" IN ('first_seen','confirmed','last_seen','missing_1','closed','reopened','quarantined','unquarantined','rejected','term_flagged','term_unflagged'))
);
--> statement-breakpoint
ALTER TABLE "posting_lifecycle_events" ADD CONSTRAINT "posting_lifecycle_events_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "posting_lifecycle_events" ADD CONSTRAINT "posting_lifecycle_events_run_id_ingest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "posting_lifecycle_events" ADD CONSTRAINT "posting_lifecycle_events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "posting_lifecycle_posting_at_idx" ON "posting_lifecycle_events" USING btree ("posting_id","at");
--> statement-breakpoint
CREATE INDEX "posting_lifecycle_event_at_idx" ON "posting_lifecycle_events" USING btree ("event","at");

CREATE TABLE "posting_corroborations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posting_id" uuid NOT NULL,
	"portal_source_id" uuid NOT NULL,
	"org_id" uuid,
	"source_ref" text DEFAULT '' NOT NULL,
	"url" text,
	"listed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posting_corroborations" ADD CONSTRAINT "posting_corroborations_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "posting_corroborations" ADD CONSTRAINT "posting_corroborations_portal_source_id_sources_id_fk" FOREIGN KEY ("portal_source_id") REFERENCES "public"."sources"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "posting_corroborations" ADD CONSTRAINT "posting_corroborations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX "posting_corroboration_unique" ON "posting_corroborations" USING btree ("posting_id","portal_source_id","source_ref");
--> statement-breakpoint
CREATE INDEX "posting_corroboration_portal_idx" ON "posting_corroborations" USING btree ("portal_source_id");
--> statement-breakpoint
CREATE INDEX "posting_corroboration_posting_idx" ON "posting_corroborations" USING btree ("posting_id");

ALTER TABLE "postings" ADD COLUMN "confirmed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "reopened_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "reopen_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "authoritative_source_id" uuid;
--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "publication_state" text DEFAULT 'unverified' NOT NULL;
--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_publication_state_check" CHECK ("publication_state" IN ('verified','unverified','candidate','quarantined'));
--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_authoritative_source_id_sources_id_fk" FOREIGN KEY ("authoritative_source_id") REFERENCES "public"."sources"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "posting_publication_state_idx" ON "postings" USING btree ("publication_state","closed_at");

ALTER TABLE "posting_sources" ADD COLUMN "registry_source_id" uuid;
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD COLUMN "authority" text DEFAULT 'source_of_truth' NOT NULL;
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD COLUMN "is_authoritative_observation" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD COLUMN "payload_hash" text;
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD COLUMN "adapter_version" text;
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD COLUMN "fetched_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD COLUMN "raw_storage" text DEFAULT 'full' NOT NULL;
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD CONSTRAINT "posting_sources_authority_check" CHECK ("authority" IN ('source_of_truth','discovery_only'));
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD CONSTRAINT "posting_sources_raw_storage_check" CHECK ("raw_storage" IN ('full','hash_only','none'));
--> statement-breakpoint
ALTER TABLE "posting_sources" ADD CONSTRAINT "posting_sources_registry_source_id_sources_id_fk" FOREIGN KEY ("registry_source_id") REFERENCES "public"."sources"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "posting_source_registry_idx" ON "posting_sources" USING btree ("registry_source_id");
