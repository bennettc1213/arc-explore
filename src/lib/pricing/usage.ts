/**
 * Usage counters for the quantity-capped free tools that have no persisted
 * artifact of their own — a resume critique and a GitHub/LinkedIn run are
 * computed fresh every time, unlike a cover letter or a tracked application,
 * which already have a real database row per unit (see `cover_letter.ts` /
 * `tracker.ts` gating, which count those tables directly instead of using
 * this module).
 *
 * KNOWN LIMITATION, STATED RATHER THAN HIDDEN: these are LIFETIME counters.
 * There is no billing cycle to reset them against — no Stripe subscription,
 * no renewal date — so "free: 1 run" today means "1 run, ever" rather than
 * "1 run per month". Once a real billing provider supplies a renewal
 * timestamp, this should reset on it; until then, a lifetime cap is the
 * honest thing to enforce rather than a monthly one this codebase cannot
 * actually observe. Recorded in FIXES.md.
 */

import { eq, and } from "drizzle-orm";

import { db } from "@/db/client";
import { featureUsage, type UsageFeatureKey } from "@/db/schema";

import { evaluateFeature, type FeatureAccess, type TierId } from "./tiers";

/** Current count and last-used key, or the zero state for a feature never used. */
export async function getUsage(
  userId: string,
  feature: UsageFeatureKey,
): Promise<{ count: number; lastKey: string | null }> {
  const [row] = await db
    .select({ count: featureUsage.count, lastKey: featureUsage.lastKey })
    .from(featureUsage)
    .where(and(eq(featureUsage.userId, userId), eq(featureUsage.feature, feature)))
    .limit(1);

  return row ?? { count: 0, lastKey: null };
}

export interface ConsumeResult {
  access: FeatureAccess;
  /** True when this call actually incremented the counter — false when it
   *  was blocked, or when `key` matched the last recorded key (a free
   *  replay of the same input; see the schema comment on `featureUsage`). */
  consumed: boolean;
}

/**
 * Check-and-increment for a run-capped tool.
 *
 * `key` is the replay guard: pass the resume id being critiqued, the GitHub
 * username being audited, or omit it for a tool with no natural replay key
 * (the LinkedIn checker, which never sends us the pasted text to key on —
 * see `lib/pricing`'s FIXES.md entry). Re-calling with the same key as last
 * time costs nothing and always succeeds regardless of remaining quota,
 * because it is not a new use of the tool — it is the same page reloading.
 *
 * SERVER-SIDE AND ATOMIC ENOUGH FOR THIS PURPOSE. This is a read-then-write,
 * not a single `UPDATE ... WHERE count < limit`, so two simultaneous
 * requests from the same free user at their very last unit could both
 * succeed — a real race, and an acceptable one: the cost of losing it is
 * one extra free run for one student, not a security boundary. Money moving
 * through Stripe later would deserve the stricter version; a lifetime cap
 * with no revenue behind it does not.
 */
export async function consumeUsage(
  userId: string,
  tier: TierId,
  feature: UsageFeatureKey,
  key: string | null = null,
): Promise<ConsumeResult> {
  const current = await getUsage(userId, feature);
  const access = evaluateFeature(tier, feature, current.count);

  /*
   * Nothing to meter on an unlimited tier, so nothing is written.
   *
   * This is not merely an avoided round trip. The counter is a LIFETIME count
   * with no billing cycle to reset it against (see the module comment), so a
   * row written while the viewer happened to be unlimited never goes away —
   * an Edge subscriber who lapsed, or anyone browsing with DEV_TIER set, would
   * find the free run they had never actually used already spent. A count that
   * only exists to enforce a limit should only be kept where a limit exists.
   */
  if (access.unlimited) {
    return { access, consumed: false };
  }

  if (key !== null && key === current.lastKey) {
    // Same input as last time — free replay, not a new run. This exact use
    // was already paid for out of the quota, so it stays viewable even if
    // the count it left behind now reads as "limit reached" for anything
    // NEW. `count - 1` reconstructs what the quota looked like before this
    // unit was charged, purely so `remaining` displays sensibly.
    const priorCount = Math.max(current.count - 1, 0);
    return {
      access: { ...evaluateFeature(tier, feature, priorCount), usable: true, reason: "ok" },
      consumed: false,
    };
  }

  if (!access.usable) {
    return { access, consumed: false };
  }

  const nextCount = current.count + 1;
  await db
    .insert(featureUsage)
    .values({ userId, feature, count: nextCount, lastKey: key, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [featureUsage.userId, featureUsage.feature],
      set: { count: nextCount, lastKey: key, updatedAt: new Date() },
    });

  /*
   * `usable: true`, forced — and this line is load-bearing.
   *
   * `usable` answers "may THIS call proceed", not "would a further call
   * proceed". Returning the raw `evaluateFeature(tier, feature, nextCount)`
   * reads the quota as it stands *after* this use is charged, so on a limit
   * of 1 the very first critique came back `usable: false` having already
   * spent the unit — the caller then rendered an upgrade wall instead of the
   * one run the free tier promises, making "1 free run" mean zero.
   *
   * Found by running it against the live database, not by the unit tests,
   * which had only ever called `evaluateFeature` directly. `remaining` still
   * reports the post-use figure, which is what a "0 of 1 left" note wants.
   */
  return {
    access: { ...evaluateFeature(tier, feature, nextCount), usable: true, reason: "ok" },
    consumed: true,
  };
}

/** Read-only check — for rendering a lock state without spending a unit
 *  (e.g. deciding whether to show the "audit it" button as disabled before
 *  the visitor has typed anything). */
export async function checkUsage(
  userId: string,
  tier: TierId,
  feature: UsageFeatureKey,
): Promise<FeatureAccess> {
  const current = await getUsage(userId, feature);
  return evaluateFeature(tier, feature, current.count);
}
