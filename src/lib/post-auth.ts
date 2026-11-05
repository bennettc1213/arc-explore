/**
 * Where to send someone after sign-in, carried in a cookie rather than the URL.
 *
 * WHY NOT `?next=` ON THE RETURN ADDRESS, WHICH IS WHAT THIS REPLACED. Supabase
 * only returns to addresses on the project's redirect allowlist, and matches
 * them exactly. Measured on production 2026-11-03: asked to return to
 * `https://instela.org/auth/confirm?next=%2Fprofile` it refused and fell back
 * to the Site URL (`https://instela.org.`) with the session in a `#fragment`
 * nothing reads, so every Google and email sign-in landed on the home page
 * signed out. The bare `https://instela.org/auth/confirm` is accepted. Keeping
 * the return address bare makes sign-in independent of how the allowlist entry
 * is written.
 *
 * The cookie holds only a path, and `/auth/confirm` passes it through
 * `safeNextPath` before using it, so it is no more trusted than the query
 * parameter it replaces.
 */
export const POST_AUTH_COOKIE = "instela_post_auth_next";

/** Long enough to finish a Google chooser or open an email; short enough to go stale quickly. */
export const POST_AUTH_MAX_AGE_SEC = 30 * 60;

/** The one return address handed to Supabase, with nothing appended. */
export function authConfirmUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/auth/confirm`;
}
