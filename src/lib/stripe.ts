import "server-only";

import Stripe from "stripe";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see .env`);
  return value;
}

/**
 * The Stripe client, created on first use rather than at import.
 *
 * Constructing it at module load threw whenever STRIPE_SECRET_KEY was unset,
 * which failed `next build`'s page-data collection for every route that merely
 * imports this file (FIXES.md, 2026-11-03). Now an unconfigured environment
 * fails only when billing is actually used — and every billing route is behind
 * `marketReadyFlags.billing()` first.
 */
let client: Stripe | null = null;
export function getStripe(): Stripe {
  client ??= new Stripe(required("STRIPE_SECRET_KEY"));
  return client;
}

export const stripeConfig = {
  applyMonthlyPriceId: () => required("STRIPE_PRICE_APPLY_MONTHLY"),
  /** Optional. A Stripe coupon applied at checkout for a verified student. */
  studentCouponId: (): string | null => process.env.STRIPE_COUPON_STUDENT || null,
  webhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  appUrl: () => {
    const raw = required("NEXT_PUBLIC_APP_URL");
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_APP_URL must be an http(s) URL");
    }
    return url.origin;
  },
};
