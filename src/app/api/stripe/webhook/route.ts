import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@/db/client";
import { billingWebhookEvents, profiles } from "@/db/schema";
import { stripe, stripeConfig } from "@/lib/stripe";

export const runtime = "nodejs";

function paidStatus(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing";
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const userId = subscription.metadata.userId;
  const where = userId
    ? eq(profiles.id, userId)
    : or(eq(profiles.stripeCustomerId, customerId), eq(profiles.stripeSubscriptionId, subscription.id));

  await db.update(profiles).set({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    plan: paidStatus(subscription.status) ? "apply" : "free",
    planUpdatedAt: new Date(),
  }).where(where);
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!userId || !customerId || !subscriptionId) return;
      await db.update(profiles).set({
        stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, plan: "apply", planUpdatedAt: new Date(),
      }).where(eq(profiles.id, userId));
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing Stripe signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, stripeConfig.webhookSecret());
  } catch {
    return new NextResponse("Invalid Stripe signature", { status: 400 });
  }
  try {
    const inserted = await db.insert(billingWebhookEvents).values({ id: event.id, type: event.type })
      .onConflictDoNothing().returning({ id: billingWebhookEvents.id });
    if (inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });
    await handleEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    // Let Stripe retry a transient database failure. Individual entitlement
    // writes are idempotent, so repeating an interrupted event is safe.
    await db.delete(billingWebhookEvents).where(eq(billingWebhookEvents.id, event.id)).catch(() => undefined);
    console.error("[stripe] webhook processing failed", { eventId: event.id, type: event.type, error });
    return new NextResponse("Webhook processing failed", { status: 500 });
  }
}
