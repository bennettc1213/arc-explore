ALTER TABLE "profiles" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
  "id" text PRIMARY KEY,
  "type" text NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ENABLE ROW LEVEL SECURITY;
-- Billing events are written exclusively by the signature-verified webhook.
