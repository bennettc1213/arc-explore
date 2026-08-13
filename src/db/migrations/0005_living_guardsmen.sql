ALTER TABLE "postings" ALTER COLUMN "org_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "kind" text DEFAULT 'internship' NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "freshness_tier" text DEFAULT 'live_polled' NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "sponsor_name" text;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "amount_min" integer;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "amount_max" integer;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "eligibility" jsonb;--> statement-breakpoint
CREATE INDEX "posting_kind_idx" ON "postings" USING btree ("kind");