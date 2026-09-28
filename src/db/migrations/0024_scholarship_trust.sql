ALTER TABLE "postings" ADD COLUMN "trust_score" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "trust_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "is_lottery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "lottery_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "corroboration_count" integer DEFAULT 0 NOT NULL;