CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"status" text DEFAULT 'saved' NOT NULL,
	"applied_at" timestamp with time zone,
	"outcome" text,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" text NOT NULL,
	"source" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"orgs_polled" integer DEFAULT 0 NOT NULL,
	"postings_seen" integer DEFAULT 0 NOT NULL,
	"postings_new" integer DEFAULT 0 NOT NULL,
	"postings_closed" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"user_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"fit_score" real NOT NULL,
	"timing_score" real NOT NULL,
	"reasons" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "matches_user_id_posting_id_pk" PRIMARY KEY("user_id","posting_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"domain" text,
	"ats_type" text DEFAULT 'unknown' NOT NULL,
	"ats_slug" text,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"vertical" text,
	"poll_interval_sec" integer DEFAULT 1200 NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_poll_ok" boolean,
	"last_poll_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"etag" text,
	"discovered_via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_id" uuid,
	"posting_id" uuid,
	"subject_variants" text[] DEFAULT '{}' NOT NULL,
	"body" text NOT NULL,
	"follow_ups" jsonb,
	"unfilled_slots" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posting_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posting_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"source_url" text,
	"raw" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"canonical_hash" text NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"url" text NOT NULL,
	"locations" text[] DEFAULT '{}' NOT NULL,
	"is_remote" boolean DEFAULT false NOT NULL,
	"term" text,
	"category" text,
	"degrees" text[] DEFAULT '{}' NOT NULL,
	"work_auth" text,
	"description_text" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"school" text,
	"major" text,
	"grad_year" integer,
	"gpa" real,
	"work_auth" text,
	"target_verticals" text[] DEFAULT '{}' NOT NULL,
	"target_locations" text[] DEFAULT '{}' NOT NULL,
	"portfolio_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiting_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"firm_name" text NOT NULL,
	"vertical" text NOT NULL,
	"program_name" text,
	"term_year" integer,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"source_url" text,
	"notes" text,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text,
	"raw_text" text,
	"parsed" jsonb,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_sources" ADD CONSTRAINT "posting_sources_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_cycles" ADD CONSTRAINT "recruiting_cycles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_user_posting_unique" ON "applications" USING btree ("user_id","posting_id");--> statement-breakpoint
CREATE INDEX "application_user_idx" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "contact_user_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ingest_run_started_idx" ON "ingest_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "match_rank_idx" ON "matches" USING btree ("user_id","fit_score");--> statement-breakpoint
CREATE UNIQUE INDEX "org_ats_unique" ON "organizations" USING btree ("ats_type","ats_slug");--> statement-breakpoint
CREATE INDEX "org_normalized_name_idx" ON "organizations" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "org_poll_due_idx" ON "organizations" USING btree ("last_polled_at");--> statement-breakpoint
CREATE INDEX "outreach_user_idx" ON "outreach_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posting_source_unique" ON "posting_sources" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "posting_source_posting_idx" ON "posting_sources" USING btree ("posting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posting_canonical_unique" ON "postings" USING btree ("canonical_hash");--> statement-breakpoint
CREATE INDEX "posting_org_idx" ON "postings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "posting_open_idx" ON "postings" USING btree ("closed_at","first_seen_at");--> statement-breakpoint
CREATE INDEX "posting_term_idx" ON "postings" USING btree ("term");--> statement-breakpoint
CREATE INDEX "cycle_opens_idx" ON "recruiting_cycles" USING btree ("opens_at");--> statement-breakpoint
CREATE INDEX "resume_user_idx" ON "resumes" USING btree ("user_id");