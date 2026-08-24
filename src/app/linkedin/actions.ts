"use server";

import { requireUser } from "@/lib/auth";
import { getUserTier } from "@/lib/pricing/entitlements";
import { consumeUsage } from "@/lib/pricing/usage";

/**
 * Marks one use of the LinkedIn checker's free-tier quota.
 *
 * CARRIES NO CONTENT. No headline, no About text, nothing the student
 * pasted — the call takes no arguments at all. `LinkedInChecker`'s own
 * comment states the premise this page is built on: the pasted profile text
 * never leaves the browser, there is no endpoint that accepts it, and
 * quietly uploading it to be scored "for billing purposes" would be that
 * rule wearing a different hat. This action only ever answers "has this
 * account used its one free run" — a fact about a plan, not about a person's
 * LinkedIn profile.
 *
 * Fired once, from a `useEffect` in the client component, the first time the
 * form goes from empty to non-empty — see the comment there for why that
 * moment and not page load.
 */
export async function consumeLinkedInCheckAction(): Promise<{ usable: boolean }> {
  const user = await requireUser("/linkedin");
  const tier = await getUserTier(user.id);
  const result = await consumeUsage(user.id, tier, "linkedin_tools");
  return { usable: result.access.usable };
}
