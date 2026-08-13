"use server";

import { safeNextPath } from "@/lib/safe-redirect";
import { getSiteOrigin } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

/** Deliberately loose — the real check is whether the email arrives. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/**
 * Sends a one-time sign-in link.
 *
 * No passwords: nothing to leak, nothing to reset, and one less thing for a
 * student to reuse from another site.
 */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""), "/profile");

  if (!EMAIL_RE.test(email)) {
    return { status: "error", message: "that does not look like an email address", email };
  }

  const origin = await getSiteOrigin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // Supabase rate-limits OTP sends per address; surface that verbatim rather
    // than pretending the mail went out.
    return { status: "error", message: error.message.toLowerCase(), email };
  }

  return { status: "sent", email };
}
