"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  removeApplication,
  setStatus,
  updateDetails,
} from "@/lib/applications/store";
import { isApplicationStatus } from "@/lib/applications/types";

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
  const user = await requireUser("/");

  const postingId = String(formData.get("postingId") ?? "");
  const next = String(formData.get("status") ?? "");

  if (!postingId) return { status: "error", message: "missing posting" };
  if (!isApplicationStatus(next)) return { status: "error", message: "unknown status" };

  await setStatus(user.id, postingId, next);

  revalidatePath("/");
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

  revalidatePath("/");
  revalidatePath("/tracker");
  return OK;
}
