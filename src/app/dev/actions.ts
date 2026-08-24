"use server";

import { revalidatePath } from "next/cache";

import { clearDevTier, devModeConfigured, devUnlocked, setDevTier } from "@/lib/pricing/dev-session";
import { devPasswordMatches, parseTier } from "@/lib/pricing/dev-tier";

/**
 * Server Actions behind the `/dev` unlock.
 *
 * EACH ONE RE-CHECKS ITS OWN PRECONDITION, exactly as every `/admin` action
 * re-checks `requireAdmin()`. A Server Action is a public POST endpoint; the
 * page that renders the form is not a gate, and `switchTierAction` in
 * particular must confirm the caller is already unlocked or it would be a way
 * to set any tier without ever knowing the password.
 */

export type DevFormState = { error: string | null };

export async function unlockAction(
  _prev: DevFormState,
  formData: FormData,
): Promise<DevFormState> {
  if (!devModeConfigured()) {
    return { error: "dev mode is not configured on this deployment." };
  }

  const attempt = String(formData.get("password") ?? "");
  if (!attempt) return { error: "enter the dev password." };

  if (!devPasswordMatches(attempt)) {
    // One message for every failure. Distinguishing "wrong password" from
    // anything else here would only ever help someone guessing.
    return { error: "that password is not right." };
  }

  const tier = parseTier(String(formData.get("tier") ?? "")) ?? "apply";
  await setDevTier(tier);
  revalidatePath("/", "layout");
  return { error: null };
}

/** Change which tier dev mode is pretending, for someone already unlocked. */
export async function switchTierAction(formData: FormData): Promise<void> {
  if (!(await devUnlocked())) return;

  const tier = parseTier(String(formData.get("tier") ?? ""));
  if (!tier) return;

  await setDevTier(tier);
  revalidatePath("/", "layout");
}

export async function lockAction(): Promise<void> {
  await clearDevTier();
  revalidatePath("/", "layout");
}
