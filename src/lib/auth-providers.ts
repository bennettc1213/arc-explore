/**
 * Which sign-in methods are switched on.
 *
 * Google needs two things this repo cannot hold: an OAuth client from Google
 * Cloud, and the provider enabled in the Supabase dashboard. Until both exist
 * the button would send a student to a Supabase error page, so it is off unless
 * `GOOGLE_SIGNIN_ENABLED=true` is set — the same fail-closed shape as
 * `ADMIN_EMAILS`. Server-side only: the login page reads it and passes a
 * boolean down, so it never needs a NEXT_PUBLIC_ copy that could drift.
 */
export function googleSignInEnabled(): boolean {
  return process.env.GOOGLE_SIGNIN_ENABLED === "true";
}
