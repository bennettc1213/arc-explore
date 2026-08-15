"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { markReviewed, resolveReport, setHidden } from "@/lib/reports/store";

/**
 * Curation actions.
 *
 * Every one of these calls `requireAdmin()` first. A Server Action is a public
 * POST endpoint with a generated name — it is reachable by anyone who can read
 * the client bundle, so checking access in the page that renders the button is
 * not a check at all. The guard belongs here, on every single one.
 */

const MAX_REASON = 500;

function text(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim().slice(0, MAX_REASON);
  return s.length === 0 ? null : s;
}

function refresh(postingId?: string) {
  revalidatePath("/admin");
  // The feed and the listing both read `hidden_at`, so a takedown that does not
  // invalidate them stays visible until the cache expires.
  revalidatePath("/");
  if (postingId) revalidatePath(`/listing/${postingId}`);
}

export async function hideListingAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const postingId = String(formData.get("postingId") ?? "");
  if (!postingId) return;

  await setHidden(postingId, true, text(formData.get("reason")));
  refresh(postingId);
}

export async function unhideListingAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const postingId = String(formData.get("postingId") ?? "");
  if (!postingId) return;

  await setHidden(postingId, false, null);
  refresh(postingId);
}

/** Looked at it, leaving it up. Clears it from triage without hiding it. */
export async function markReviewedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const postingId = String(formData.get("postingId") ?? "");
  if (!postingId) return;

  await markReviewed(postingId);
  refresh(postingId);
}

export async function resolveReportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("reportId") ?? "");
  if (!id) return;

  await resolveReport(id, text(formData.get("resolution")));
  refresh();
}
