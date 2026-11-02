import type { Metadata } from "next";

import { PortalHome } from "@/components/portal/PortalHome";
import { getSessionUser } from "@/lib/auth";
import { getUserTier, isPaidTier } from "@/lib/pricing/entitlements";
import { TIER_LABELS, TIER_PRICE_USD } from "@/lib/pricing/tiers";
import { getPortalActivity } from "@/lib/portal/activity";
import { resolvePortalTiles } from "@/lib/portal/destinations";
import { getProfile } from "@/lib/profile/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal | Instela",
};

/**
 * Open to everyone, on purpose. A free or signed-out visitor sees the same
 * portal with the paid boxes locked — the page is the shop window, so it does
 * not redirect to sign-in. What it *reads* is still per-user and scoped by id in
 * `getPortalActivity`; signed out, there is simply nothing to read, and the
 * numbers render as dashes rather than as zeros.
 */
export default async function PortalPage() {
  const user = await getSessionUser();
  const tier = await getUserTier(user?.id);

  const [profile, activity] = user
    ? await Promise.all([getProfile(user.id), getPortalActivity(user.id)])
    : [null, null];

  return (
    <PortalHome
      activity={activity}
      firstName={profile?.displayName?.trim().split(/\s+/)[0] || null}
      planLabel={TIER_LABELS[tier]}
      paid={isPaidTier(tier)}
      paidLabel={TIER_LABELS.apply}
      paidPrice={TIER_PRICE_USD.apply}
      tiles={resolvePortalTiles(tier)}
    />
  );
}
