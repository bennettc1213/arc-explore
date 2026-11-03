"use server";

import { revalidatePath } from "next/cache";
import { TIER_LABELS } from "@/lib/pricing/tiers";

import { requireUser } from "@/lib/auth";
import { recordEvent } from "@/lib/analytics/record";
import {
  removeApplication,
  setStatusWithinCapacity,
  updateDetails,
} from "@/lib/applications/store";
import { isApplicationStatus } from "@/lib/applications/types";
import { getUserTier } from "@/lib/pricing/entitlements";
import { FEATURES } from "@/lib/pricing/tiers";
import { maybeRecordActivation } from "@/lib/profile/activation";
import { FEED_PATH } from "@/lib/routes";

/** The single paid plan's display name — never hardcoded. */
const PAID = TIER_LABELS.apply;

/**
 * Tracker mutations.
 *
 * Every one takes the user id from the verified session, never from the form.
 * The store filters on it, which is what actually scopes these rows — our
 * database connection is the table owner and bypasses RLS.
 */

export interface TrackerActionState {
  status: "idle" | "ok" | "error";
  message?: string;
}

const OK: TrackerActionState = { status: "ok" };

export async function setStatusAction(
  _prev: TrackerActionState,
  formData: FormData,
): Promise<TrackerActionState> {
  const user = await requireUser(FEED_PATH);

  const postingId = String(formData.get("postingId") ?? "");
  const next = String(formData.get("status") ?? "");

  if (!postingId) return { status: "error", message: "missing posting" };
  if (!isApplicationStatus(next)) return { status: "error", message: "unknown status" };

  // The plan limit counts ACTIVE opportunities only (see occupiesActiveSlot).
  // Only a move INTO the active set can be refused — saving a new one, or
  // reopening a finished one. Status moves within the active set, moves into
  // history, notes and removal always work, so a student at capacity (or
  // downgraded with more than the limit) never has to delete history.
  const tier = await getUserTier(user.id);
  const result = await setStatusWithinCapacity(user.id, postingId, next, FEATURES.tracker.limits[tier]);
  if (result === "missing_posting") return { status: "error", message: "that listing is no longer available" };
  if (result === "at_capacity") {
    void recordEvent("upgrade_prompt_viewed", { feature: "tracker" });
    return {
      status: "error",
      message: `you have ${FEATURES.tracker.limits[tier]} active opportunities on ${TIER_LABELS[tier]} — finish or remove one, or upgrade to ${PAID} for unlimited`,
    };
  }

  // Saving a posting is the engagement half of the activation definition.
  // The helper is idempotent, so it is safe to call on every status change.
  void maybeRecordActivation(user.id);

  revalidatePath(FEED_PATH);
  revalidatePath("/tracker");
  return OK;
}

export async function updateDetailsAction(
  _prev: TrackerActionState,
  formData: FormData,
): Promise<TrackerActionState> {
  const user = await requireUser("/tracker");

  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return { status: "error", message: "missing application" };

  const trim = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim();
    return s.length === 0 ? null : s.slice(0, 4000);
  };

  await updateDetails(user.id, applicationId, {
    notes: trim(formData.get("notes")),
    outcome: trim(formData.get("outcome")),
  });

  revalidatePath("/tracker");
  return OK;
}

export async function removeAction(
  _prev: TrackerActionState,
  formData: FormData,
): Promise<TrackerActionState> {
  const user = await requireUser("/tracker");

  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return { status: "error", message: "missing application" };

  await removeApplication(user.id, applicationId);

  revalidatePath(FEED_PATH);
  revalidatePath("/tracker");
  return OK;
}
