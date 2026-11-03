import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { recordEvent } from "@/lib/analytics/record";
import { marketReadyFlags } from "@/lib/market-ready/flags";
import { getCheckoutQuote } from "@/lib/pricing/checkout-quote";
import { getStripe, stripeConfig } from "@/lib/stripe";
import { getStudentClaim } from "@/lib/student-discount";

export const runtime = "nodejs";

export async function POST() {
  if (!marketReadyFlags.billing()) {
    return NextResponse.json({ error: "Billing is not available yet." }, { status: 404 });
  }

  const user = await requireUser("/pricing");

  // Never charge a different amount than the page shows. The quote reads the
  // configured Stripe price and refuses when it disagrees with TIER_PRICE_USD.
  const quote = await getCheckoutQuote();
  if (!quote.ok) {
    console.error("[stripe] checkout refused:", quote.reason);
    return NextResponse.json({ error: "Checkout is unavailable right now. Nothing was charged." }, { status: 503 });
  }

  const [profile] = await db
    .select({ stripeCustomerId: profiles.stripeCustomerId })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // The student coupon applies only to a CURRENT verified claim — never a
  // pending one, and never a value the browser sent.
  const claim = await getStudentClaim(user.id).catch(() => null);
  const couponId = stripeConfig.studentCouponId();
  const student = Boolean(claim?.current && couponId && quote.studentCents !== null);

  const appUrl = stripeConfig.appUrl();
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: profile?.stripeCustomerId ?? undefined,
    customer_email: profile?.stripeCustomerId ? undefined : user.email ?? undefined,
    client_reference_id: user.id,
    line_items: [{ price: stripeConfig.applyMonthlyPriceId(), quantity: 1 }],
    ...(student && couponId ? { discounts: [{ coupon: couponId }] } : {}),
    subscription_data: { metadata: { userId: user.id, plan: "apply" } },
    metadata: { userId: user.id, plan: "apply" },
    // The redirect grants nothing: Pro is set only by the signed webhook.
    success_url: `${appUrl}/pricing?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
  }
  void recordEvent("checkout_started", { student });
  return NextResponse.json({ url: session.url });
}
