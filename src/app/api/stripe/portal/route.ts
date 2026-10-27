import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { marketReadyFlags } from "@/lib/market-ready/flags";
import { stripe, stripeConfig } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  if (!marketReadyFlags.billing()) return NextResponse.json({ error: "Billing is not available yet." }, { status: 404 });
  const user = await requireUser("/pricing");
  const [profile] = await db
    .select({ stripeCustomerId: profiles.stripeCustomerId })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (!profile?.stripeCustomerId) return NextResponse.json({ error: "No billing account found." }, { status: 409 });

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${stripeConfig.appUrl()}/pricing`,
  });
  return NextResponse.json({ url: session.url });
}
