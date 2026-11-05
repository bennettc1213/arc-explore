import "server-only";

import { marketReadyFlags } from "@/lib/market-ready/flags";
import { getStripe, stripeConfig } from "@/lib/stripe";

import { reconcileQuote, type CheckoutQuote } from "./quote";

/**
 * What checkout would actually charge, read from Stripe (read-only) and
 * reconciled against the displayed price. Cached briefly per process so the
 * pricing page does not call Stripe on every render.
 *
 * Returns `ok: false` when billing is off, unconfigured, unreachable, or the
 * configured price disagrees with the page — and checkout refuses in every
 * one of those cases.
 */
const TTL_MS = 10 * 60_000;
let cached: { at: number; quote: CheckoutQuote } | null = null;

export async function getCheckoutQuote(now = Date.now()): Promise<CheckoutQuote> {
  if (!marketReadyFlags.billing()) return { ok: false, reason: "billing is switched off" };
  if (cached && now - cached.at < TTL_MS) return cached.quote;

  let quote: CheckoutQuote;
  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(stripeConfig.applyMonthlyPriceId());
    const couponId = stripeConfig.studentCouponId();
    const coupon = couponId ? await stripe.coupons.retrieve(couponId) : null;
    quote = reconcileQuote(
      {
        unitAmountCents: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
        intervalCount: price.recurring?.interval_count ?? null,
        active: price.active,
      },
      coupon
        ? {
            percentOff: coupon.percent_off ?? null,
            amountOffCents: coupon.amount_off ?? null,
            currency: coupon.currency ?? null,
            valid: coupon.valid,
            duration: coupon.duration,
          }
        : null,
    );
  } catch (err) {
    quote = { ok: false, reason: err instanceof Error ? err.message : "Stripe could not be reached" };
  }
  cached = { at: now, quote };
  return quote;
}
