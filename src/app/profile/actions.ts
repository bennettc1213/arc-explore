"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { resumes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AccountDeleteError, deleteAccount } from "@/lib/profile/delete";
import { ensureProfile, getProfile, saveEmailPrefs, saveProfile } from "@/lib/profile/store";
import {
  INTEREST_VALUES,
  parseLocations,
  profileInputSchema,
  type InterestValue,
} from "@/lib/profile/types";
import { parseResume, ResumeParseError } from "@/lib/resume/parse";
import { checkUpload, resumeToProfileSuggestions, type ProfileSuggestions } from "@/lib/resume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProfileFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  /** Field-level messages, keyed by form field name. */
  fieldErrors?: Record<string, string>;
}

export async function saveProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  // The id comes from the verified session. It is never read from the form —
  // otherwise anyone could post someone else's id and overwrite their profile.
  const user = await requireUser("/profile");

  const picked = formData.getAll("targetVerticals").map(String);
  const parsed = profileInputSchema.safeParse({
    displayName: String(formData.get("displayName") ?? ""),
    school: String(formData.get("school") ?? ""),
    major: String(formData.get("major") ?? ""),
    gradYear: String(formData.get("gradYear") ?? ""),
    gpa: String(formData.get("gpa") ?? ""),
    workAuth: String(formData.get("workAuth") ?? ""),
    targetVerticals: picked.filter((v): v is InterestValue =>
      (INTEREST_VALUES as readonly string[]).includes(v),
    ),
    targetLocations: parseLocations(String(formData.get("targetLocations") ?? "")),
    openToRemote: formData.get("openToRemote") === "1",
    portfolioUrl: String(formData.get("portfolioUrl") ?? ""),
    githubUsername: String(formData.get("githubUsername") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "fix the highlighted fields", fieldErrors };
  }

  await saveProfile(user.id, parsed.data);

  // The feed ranks against this profile, so it must not serve a cached page
  // scored on the previous answers.
  revalidatePath("/");
  revalidatePath("/profile");
  // Both read the profile: /github pre-fills the username, /linkedin builds its
  // draft from the rest of it.
  revalidatePath("/github");
  revalidatePath("/linkedin");

  return { status: "saved" };
}

export interface ResumeUploadState {
  status: "idle" | "parsed" | "error";
  message?: string;
  fileName?: string;
  /** What the resume could fill in that the profile has not answered yet. */
  suggestions?: ProfileSuggestions;
  counts?: { experiences: number; skills: number; projects: number };
}

export async function uploadResumeAction(
  _prev: ResumeUploadState,
  formData: FormData,
): Promise<ResumeUploadState> {
  const user = await requireUser("/profile");

  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "choose a file first" };
  }

  const check = checkUpload({ name: file.name, type: file.type, size: file.size });
  if (!check.ok) return { status: "error", message: check.error, fileName: file.name };

  let result;
  try {
    result = await parseResume({
      bytes: new Uint8Array(await file.arrayBuffer()),
      kind: check.kind!,
      fileName: file.name,
    });
  } catch (err) {
    if (err instanceof ResumeParseError) {
      return { status: "error", message: err.message, fileName: file.name };
    }
    throw err;
  }

  // Sessions can outlive a schema change or predate the confirm route, so the
  // FK target is guaranteed here too rather than assumed.
  await ensureProfile(user.id);

  // The file itself is not retained — only the structured extraction and, for
  // text uploads, the text we were given. There is no reason to hold a PDF of
  // someone's address and phone number to rank job postings.
  await db.insert(resumes).values({
    userId: user.id,
    fileName: file.name,
    rawText: result.rawText,
    parsed: result.parsed,
    isPrimary: true,
  });

  const existing = await getProfile(user.id);
  const suggestions = resumeToProfileSuggestions(result.parsed, existing ?? {});

  revalidatePath("/profile");

  return {
    status: "parsed",
    fileName: file.name,
    suggestions,
    counts: {
      experiences: result.parsed.experiences.length,
      skills: result.parsed.skills.length,
      projects: result.parsed.projects.length,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Email preferences
 * ------------------------------------------------------------------ */

export interface EmailPrefsState {
  status: "idle" | "saved" | "error";
  message?: string;
}

/**
 * Save the two email subscriptions.
 *
 * A separate action from `saveProfileAction`, and the separation is the point:
 * every unsubscribe link writes these columns without a session, so folding
 * them into the profile form would let a stale tab silently resubscribe someone
 * who had already opted out. See `getEmailPrefs` for the longer version.
 */
export async function saveEmailPrefsAction(
  _prev: EmailPrefsState,
  formData: FormData,
): Promise<EmailPrefsState> {
  const user = await requireUser("/profile");
  await ensureProfile(user.id);

  await saveEmailPrefs(user.id, {
    deadlineReminders: formData.get("deadlineReminders") === "1",
    weeklyDigest: formData.get("weeklyDigest") === "1",
  });

  revalidatePath("/profile");
  return { status: "saved" };
}

/* ------------------------------------------------------------------ *
 * Account deletion
 * ------------------------------------------------------------------ */

export interface DeleteAccountState {
  status: "idle" | "error";
  message?: string;
}

/**
 * Delete the account.
 *
 * Guarded by typing the word rather than a confirm dialog: this is the one
 * irreversible action in the product, and a dialog is dismissed by reflex. The
 * id comes from the verified session, never the form, so a posted id cannot
 * delete somebody else.
 *
 * On success it redirects out — the session cookie now points at a user that
 * no longer exists, and every authenticated page would otherwise bounce the
 * visitor through a login for an account they just destroyed.
 */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser("/profile");

  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    return { status: "error", message: 'type "delete" to confirm' };
  }

  let authDeleted: boolean;
  try {
    ({ authDeleted } = await deleteAccount(user.id));
  } catch (err) {
    return {
      status: "error",
      message: err instanceof AccountDeleteError ? err.message : "could not delete the account",
    };
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  revalidatePath("/");
  // `authDeleted: false` means SUPABASE_SERVICE_ROLE_KEY is unset: every row we
  // hold is gone but the login record survives. The landing page says which
  // happened rather than claiming a clean sweep either way.
  redirect(authDeleted ? "/?deleted=1" : "/?deleted=partial");
}
