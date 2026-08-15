ALTER TABLE "postings" ADD COLUMN "url_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "url_status" integer;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "url_dead_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "url_dead_strikes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "posting_url_check_idx" ON "postings" USING btree ("url_checked_at");