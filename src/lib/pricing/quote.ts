/**
 * Reconciling the displayed price with what Stripe would actually charge.
 *
 * Pure — the Stripe reads live in `checkout-quote.ts`. Kept apart so the rule
 * "never advertise one amount and charge another" is tested without a network.
 */

import { TIER_PRICE_USD } from "./tiers";

export interface StripePriceFacts {
  unitAmountCents: number | null;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  active: boolean;
}

export interface StripeCouponFacts {
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  valid: boolean;
  /** "forever" | "once" | "repeating" */
  duration: string;
}

export type CheckoutQuote =
  | {
      ok: true;
      regularCents: number;
      /** Exact student amount Stripe would charge, or null when no usable
       *  coupon is configured. */
      studentCents: number | null;
      /** True when the student discount lasts for the whole subscription. */
      studentRecurring: boolean;
    }
  | { ok: false; reason: string };

/** Displayed Pro price in cents. */
export const DISPLAYED_PRO_CENTS = Math.round(TIER_PRICE_USD.apply * 100);

export function reconcileQuote(price: StripePriceFacts | null, coupon: StripeCouponFacts | null): CheckoutQuote {
  if (!price) return { ok: false, reason: "no Pro price is configured" };
  if (!price.active) return { ok: false, reason: "the configured Pro price is archived" };
  if (price.currency !== "usd") return { ok: false, reason: `the configured Pro price is in ${price.currency}, not USD` };
  if (price.interval !== "month" || price.intervalCount !== 1) {
    return { ok: false, reason: "the configured Pro price is not billed monthly" };
  }
  if (price.unitAmountCents !== DISPLAYED_PRO_CENTS) {
    return {
      ok: false,
      reason: `the configured Pro price is $${((price.unitAmountCents ?? 0) / 100).toFixed(2)}/month, not the $${(DISPLAYED_PRO_CENTS / 100).toFixed(2)} shown`,
    };
  }

  let studentCents: number | null = null;
  let studentRecurring = false;
  if (coupon && coupon.valid) {
    if (coupon.percentOff !== null) {
      // Stripe rounds a percentage discount to the nearest cent.
      studentCents = DISPLAYED_PRO_CENTS - Math.round((DISPLAYED_PRO_CENTS * coupon.percentOff) / 100);
    } else if (coupon.amountOffCents !== null && coupon.currency === "usd") {
      studentCents = Math.max(DISPLAYED_PRO_CENTS - coupon.amountOffCents, 0);
    }
    studentRecurring = coupon.duration === "forever";
  }
  return { ok: true, regularCents: DISPLAYED_PRO_CENTS, studentCents, studentRecurring };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
