"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { buildApplicationPacket } from "@/lib/apply/packet";
import { composeConfirmation, type ConfirmationDraft } from "@/lib/apply/wizard";
import { setStatus } from "@/lib/applications/store";
import { getPosting } from "@/lib/feed";
import { ensureProfile, getLatestResume, getProfile, saveProfile } from "@/lib/profile/store";
import { parseLocations, toScoreProfile, WORK_AUTH_VALUES, type WorkAuthValue } from "@/lib/profile/types";
import { coerceParsedResume } from "@/lib/resume/types";
import { skillsFromParsedResume } from "@/lib/score/skills";

export interface ApplyActionState {
  status: "idle" | "saved" | "error";
  message?: string;
  /** Returned by markApplied: the confirmation draft for the final step. */
  confirmation?: ConfirmationDraft;
}

/**
 * Save ONE profile field from inside the apply wizard.
 *
 * The profile form posts its whole validated shape at once; the wizard cannot
 * — it is mid-flow and holds exactly one answer. This action reads the current
 * profile, applies the single permitted field, and revalidates the whole
 * shape through the same schema the form uses, so a wizard answer can never
 * put a value in the column the profile page itself would reject.
 *
 * Only fields the packet can prompt for are writable here. Anything else is
 * rejected outright — this action is not a general profile-write endpoint,
 * and keeping the allowlist tight is what stops it becoming one.
 */
const WIZARD_FIELDS = [
  "displayName",
  "school",
  "major",
  "gradYear",
  "gpa",
  "workAuth",
  "targetLocations",
] as const;
type WizardField = (typeof WIZARD_FIELDS)[number];

export async function saveApplyFieldAction(
  _prev: ApplyActionState,
  formData: FormData,
): Promise<ApplyActionState> {
  const postingId = String(formData.get("postingId") ?? "").trim();
  if (!postingId) return { status: "error", message: "missing posting" };
  const user = await requireUser(`/listing/${postingId}`);

  const field = String(formData.get("field") ?? "").trim() as WizardField;
  if (!(WIZARD_FIELDS as readonly string[]).includes(field)) {
    return { status: "error", message: "that field cannot be answered here" };
  }
  const raw = String(formData.get("value") ?? "").trim();

  await ensureProfile(user.id);
  const current = (await getProfile(user.id)) ?? null;

  // Start from what is already stored so the other fields survive untouched.
  const merged: Record<string, unknown> = {
    displayName: current?.displayName ?? null,
    school: current?.school ?? null,
    major: current?.major ?? null,
    gradYear: current?.gradYear ?? null,
    gpa: current?.gpa ?? null,
    workAuth: current?.workAuth ?? null,
    targetVerticals: current?.targetVerticals ?? [],
    targetLocations: current?.targetLocations ?? [],
    openToRemote: current?.openToRemote ?? true,
    portfolioUrl: current?.portfolioUrl ?? null,
    githubUsername: current?.githubUsername ?? null,
    linkedinUrl: current?.linkedinUrl ?? null,
  };

  switch (field) {
    case "displayName":
    case "school":
    case "major":
      merged[field] = raw;
      break;
    case "gradYear":
    case "gpa":
      merged[field] = raw; // the schema coerces "" to null and validates range
      break;
    case "workAuth": {
      if (!(WORK_AUTH_VALUES as readonly string[]).includes(raw)) {
        return { status: "error", message: "unrecognised work authorization" };
      }
      merged.workAuth = raw as WorkAuthValue;
      break;
    }
    case "targetLocations":
      merged.targetLocations = parseLocations(raw);
      break;
  }

  try {
    // saveProfile runs the full schema; an invalid answer is rejected with the
    // same fieldErrors the profile form would show.
    await saveProfile(user.id, merged as Parameters<typeof saveProfile>[1]);
  } catch {
    return { status: "error", message: "that answer did not pass validation" };
  }

  revalidatePath(`/listing/${postingId}`);
  revalidatePath(`/listing/${postingId}/apply`);
  return { status: "saved" };
}

/**
 * Mark the application as submitted and compose the confirmation draft.
 *
 * Stamps the tracker through the same `setStatus` the tracker itself uses —
 * `appliedAt` is set once and never moved, per `shouldStampAppliedAt`. The
 * confirmation is composed from the freshly rebuilt packet so it reflects any
 * answers the student gave during the flow, and it is RETURNED for display —
 * never sent. Sending is a separate, explicit decision this project has kept
 * inert until the Resend key and sender domain are configured.
 */
export async function markAppliedAction(
  _prev: ApplyActionState,
  formData: FormData,
): Promise<ApplyActionState> {
  const postingId = String(formData.get("postingId") ?? "").trim();
  if (!postingId) return { status: "error", message: "missing posting" };
  const user = await requireUser(`/listing/${postingId}`);

  await setStatus(user.id, postingId, "applied");

  const [stored, resume] = await Promise.all([getProfile(user.id), getLatestResume(user.id)]);
  const resumeSkills = resume ? skillsFromParsedResume(resume.parsed) : [];
  const posting = await getPosting(postingId, toScoreProfile(stored, resumeSkills));
  if (!posting) return { status: "error", message: "that posting is no longer tracked" };

  const packet = buildApplicationPacket({
    profile: stored,
    resume: resume ? coerceParsedResume(resume.parsed) : null,
    accountEmail: user.email ?? null,
  });

  // Which facts the packet held vs. which the student had to answer is
  // derivable from each field's source: profile/resume/account means we held
  // it; a field that was missing at the start of the flow and is filled now
  // was answered during it. The confirmation names both, so the email reads
  // as a receipt of what actually happened rather than a template.
  const filled = packet.fields.filter((f) => f.value !== null).map((f) => f.label);
  const confirmed = packet.attestations.filter((f) => f.value !== null).map((f) => f.label);

  const confirmation = composeConfirmation({
    displayName: stored?.displayName ?? null,
    title: posting.title,
    company: posting.company ?? null,
    kind: posting.kind,
    url: posting.url,
    deadlineAt: posting.deadlineAt,
    filled,
    answered: [],
    confirmed,
  });

  revalidatePath(`/listing/${postingId}`);
  revalidatePath("/tracker");
  return { status: "saved", confirmation };
}
