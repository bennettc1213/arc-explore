"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { submitReport } from "@/lib/reports/store";
import { reportInputSchema } from "@/lib/reports/types";

export interface ReportFormState {
  status: "idle" | "recorded" | "already" | "error";
  message?: string;
}

/**
 * File a report against a listing.
 *
 * SIGN-IN IS REQUIRED, and that is a real trade rather than laziness. An open
 * write endpoint with no rate limiting is a spam vector, and there is no abuse
 * tooling here to catch one. What it costs us is the passing visitor who clicks
 * a dead link and would have told us — but that case is now the one our own
 * link checker catches on its own, twice a day. What only a person can tell us
 * is that a scholarship charges a fee, or that the deadline on the page
 * disagrees with ours, and those come from someone engaged enough to have an
 * account.
 */
export async function reportListingAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const user = await requireUser("/");

  const parsed = reportInputSchema.safeParse({
    postingId: String(formData.get("postingId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    detail: String(formData.get("detail") ?? ""),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "that did not go through" };
  }

  let result;
  try {
    result = await submitReport(user.id, parsed.data);
  } catch {
    // A bad posting id is a foreign-key violation. Reported as "we do not
    // recognise that listing" rather than as a database error, and never with
    // the statement text attached.
    return { status: "error", message: "we could not match that to a listing" };
  }

  revalidatePath(`/listing/${parsed.data.postingId}`);
  return result === "recorded"
    ? { status: "recorded" }
    : { status: "already", message: "you have already reported this one — we have it" };
}
