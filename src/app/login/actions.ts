"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { googleSignInEnabled } from "@/lib/auth-providers";
import { POST_AUTH_COOKIE, POST_AUTH_MAX_AGE_SEC, authConfirmUrl } from "@/lib/post-auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSiteOrigin } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

/** Remember where to land after sign-in; see `lib/post-auth.ts` for why not the URL. */
async function rememberNext(next: string): Promise<void> {
  (await cookies()).set(POST_AUTH_COOKIE, next, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth",
    maxAge: POST_AUTH_MAX_AGE_SEC,
  });
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
  await rememberNext(next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authConfirmUrl(origin) },
  });

  if (error) {
    // Supabase rate-limits OTP sends per address; surface that verbatim rather
    // than pretending the mail went out.
    return { status: "error", message: error.message.toLowerCase(), email };
  }

  return { status: "sent", email };
}

/**
 * Starts Google sign-in: asks Supabase for the provider URL and sends the
 * browser there. Google returns to `/auth/confirm?code=…`, the same route the
 * emailed link lands on, so both methods end in one place and one profile row.
 *
 * A Server Action is a public POST endpoint, so the enabled check is repeated
 * here and not left to the page that renders the button. Failure redirects back
 * to /login with a fixed error key rather than echoing provider text.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""), "/profile");
  const back = `/login?error=google&next=${encodeURIComponent(next)}`;

  if (!googleSignInEnabled()) redirect(back);

  const origin = await getSiteOrigin();
  const supabase = await createSupabaseServerClient();
  await rememberNext(next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authConfirmUrl(origin),
      // Always show the account chooser: a student on a shared lab machine or
      // with a personal and a school account should not be signed in silently
      // as whichever Google remembers first.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) redirect(back);
  redirect(data.url);
}
