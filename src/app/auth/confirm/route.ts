import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { ensureProfile } from "@/lib/profile/store";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where the emailed sign-in link lands.
 *
 * Two shapes are accepted because Supabase can send either, depending on the
 * project's email template:
 *
 *  - `?token_hash=…&type=…` — the template we want, pointing straight here.
 *  - `?code=…` — the stock `{{ .ConfirmationURL }}` template, which bounces
 *    through Supabase's own /auth/v1/verify first and arrives with a PKCE code.
 *
 * Handling both means the app works on a default-configured project and keeps
 * working after the template is customised. See README for the template.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"), "/profile");

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const fail = (reason: "expired" | "invalid" | "missing") =>
    NextResponse.redirect(
      new URL(`/login?error=${reason}&next=${encodeURIComponent(next)}`, request.url),
    );

  if (!tokenHash && !code) return fail("missing");

  const supabase = await createSupabaseServerClient();

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ type: type ?? "email", token_hash: tokenHash })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    // A used or timed-out link is the overwhelmingly common case and deserves
    // its own wording — "invalid" reads like the user did something wrong.
    const expired = /expired|already|invalid or has expired/i.test(error.message);
    return fail(expired ? "expired" : "invalid");
  }

  // Give the account its profile row now. Everything user-owned keys off it,
  // so a new user who uploads a resume before saving a profile would otherwise
  // hit a foreign-key failure on their very first action.
  const { data } = await supabase.auth.getUser();
  if (data.user) await ensureProfile(data.user.id);

  return NextResponse.redirect(new URL(next, request.url));
}
