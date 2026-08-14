"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { getLatestResume, saveParsedResume } from "@/lib/profile/store";
import { decodeResumeEdit } from "@/lib/resume/edit";

export interface ResumeEditState {
  status: "idle" | "saved" | "error";
  message?: string;
}

/**
 * Save an edited resume.
 *
 * The resume id is read from the session's own latest resume rather than from
 * the form, for the same reason `saveProfileAction` refuses to read a user id
 * from a form: a posted id is an id an attacker chooses. `saveParsedResume`
 * filters on both anyway, so this is the second of two locks.
 */
export async function saveResumeAction(
  _prev: ResumeEditState,
  formData: FormData,
): Promise<ResumeEditState> {
  const user = await requireUser("/resume");

  const resume = await getLatestResume(user.id);
  if (!resume) {
    return { status: "error", message: "upload a resume before editing one" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("resume") ?? ""));
  } catch {
    return { status: "error", message: "could not read the edited resume" };
  }

  const parsed = decodeResumeEdit(payload);
  // Null means the payload did not survive the stored schema. Writing an empty
  // structure over real content because a field was malformed would silently
  // destroy the parse.
  if (!parsed) {
    return { status: "error", message: "those edits did not look like a resume — nothing was saved" };
  }

  const saved = await saveParsedResume(user.id, resume.id, parsed);
  if (!saved) {
    return { status: "error", message: "that resume is no longer available" };
  }

  // Both pages read this structure: /resume renders it, and /profile scores
  // the critique and competitiveness summary off it.
  revalidatePath("/resume");
  revalidatePath("/profile");
  // The feed's internship Fit Score derives skills from the parse on read, so
  // an edit changes every score on it.
  revalidatePath("/");

  return { status: "saved" };
}
