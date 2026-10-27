import "server-only";

import Stripe from "stripe";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see .env`);
  return value;
}

export const stripe = new Stripe(required("STRIPE_SECRET_KEY"));

export const stripeConfig = {
  applyMonthlyPriceId: () => required("STRIPE_PRICE_APPLY_MONTHLY"),
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
