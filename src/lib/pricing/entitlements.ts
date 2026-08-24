/**
 * The database-touching half of entitlements: reading a user's actual tier.
 *
 * Split from `tiers.ts` for the reason `admin/auth.ts` is split from
 * `allowlist.ts` — that file is pure, so it can be imported from a client
 * component and tested without a database connection or a Supabase key.
 * This one imports `db` and is server-only.
 *
 * `presentFit` is re-exported here so call sites that need both it and
 * `getUserTier` have one import, but it is defined in `tiers.ts` and does
 * not touch the database.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { profiles } from "@/db/schema";

import { devTier } from "./dev-session";
import { devTierWarning } from "./dev-tier";
import { tierAtLeast, type TierId } from "./tiers";

export { presentFit, type PresentedFit } from "./tiers";
export { devTier, devModeConfigured, devUnlocked } from "./dev-session";

/*
 * Printed once per server process, at import. A `DEV_TIER` that was set and
 * did nothing — a typo, or a production build — would otherwise be silent, and
 * silence sends someone debugging the gating code instead of their env file.
 */
const devWarning = devTierWarning();
if (devWarning) console.warn(`[pricing] ${devWarning}`);

/**
 * A signed-in user's tier, straight from `profiles.plan`.
 *
 * FAILS CLOSED IN EVERY DIRECTION THAT MATTERS: no user id, no row, a null
 * column, or an unrecognised string all resolve to the least capable tier
 * rather than the most. The same call `isAdminEmail` makes for an empty
 * allowlist — the tempting "unknown state, so let them through while we sort
 * it out" shortcut is how a paywall ships open.
 *
 * THE ONE EXCEPTION IS DEV MODE, and it is checked here rather than in each of
 * the ~20 call sites because this is the single chokepoint every gate reads —
 * feed depth, the Fit Score paywall, the run caps, the alert/digest SQL and
 * both extension routes all resolve their tier through this function. A second
 * place to override would be a second place to forget.
 *
 * It applies **before** the signed-out check on purpose: magic-link auth means
 * the common local case is browsing with no session at all, and a dev mode
 * that required a Supabase login to work would not solve the problem it exists
 * for. The `/dev` password is the only credential it wants.
 */
export async function getUserTier(userId: string | null | undefined): Promise<TierId> {
  const forced = await devTier();
  if (forced) return forced;

  if (!userId) return "free";

  const [row] = await db
    .select({ plan: profiles.plan })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (row?.plan === "apply") return "apply";
  /*
   * `edge` was the middle of three tiers before pricing collapsed to
   * free + Apply ($5.99). It is gone from `PLAN_IDS`, but a row could still
   * hold the string, and an unrecognised plan falling through to `free` would
   * silently *downgrade a paying subscriber* rather than fail closed. Failing
   * closed protects us from someone getting access they did not buy; this is
   * the opposite case, so the legacy value maps up to the plan that replaced
   * it. Everything else — null, empty, a typo — still resolves to free.
   */
  return "free";
}

/** True when this tier is above free — a single boolean where a full
 *  `evaluateFeature` call would be overkill. */
export function isPaidTier(tier: TierId): boolean {
  return tierAtLeast(tier, "apply");
}
