import type { ReactNode } from "react";
import { viewerIsAdmin } from "@/lib/admin/auth";
import { getSessionUser } from "@/lib/auth";
import { devModeConfigured, devTier, getUserTier } from "@/lib/pricing/entitlements";
import { TIER_LABELS } from "@/lib/pricing/tiers";
import { SiteShell } from "./SiteShell";
import { Footer } from "./Footer";

export async function Frame({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const [isAdmin, tier, forced] = await Promise.all([viewerIsAdmin(), getUserTier(user?.id), devTier()]);
  return <SiteShell signedIn={Boolean(user)} email={user?.email ?? null} isAdmin={isAdmin} plan={TIER_LABELS[tier]} dev={devModeConfigured() ? { forced: Boolean(forced), label: forced ? TIER_LABELS[forced] : null } : null} footer={<Footer />}>{children}</SiteShell>;
}
