import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { marketReadyFlags } from "@/lib/market-ready/flags";
import { stripe, stripeConfig } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  if (!marketReadyFlags.billing()) {
    return NextResponse.json({ error: "Billing is not available yet." }, { status: 404 });
  }

  const user = await requireUser("/pricing");
  const [profile] = await db
    .select({ stripeCustomerId: profiles.stripeCustomerId })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: profile?.stripeCustomerId ?? undefined,
    customer_email: profile?.stripeCustomerId ? undefined : user.email ?? undefined,
    client_reference_id: user.id,
    line_items: [{ price: stripeConfig.applyMonthlyPriceId(), quantity: 1 }],
    subscription_data: { metadata: { userId: user.id, plan: "apply" } },
    metadata: { userId: user.id, plan: "apply" },
    success_url: `${stripeConfig.appUrl()}/pricing?checkout=success`,
    cancel_url: `${stripeConfig.appUrl()}/pricing?checkout=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
  }
  return NextResponse.json({ url: session.url });
}
