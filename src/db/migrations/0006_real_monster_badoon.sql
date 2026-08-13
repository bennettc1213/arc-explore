ALTER TABLE "postings" ADD COLUMN "amount_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "is_content_marketing" boolean DEFAULT false NOT NULL;