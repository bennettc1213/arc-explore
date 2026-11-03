/**
 * Does this browser hold a Supabase session cookie?
 *
 * Used only to notice that the site header is out of date, never to decide
 * who someone is: the server re-verifies every session (`lib/auth.ts`). The
 * header lives in the root layout, which Next keeps across client-side
 * navigation, so a header drawn while signed out stays "Sign in" after the
 * student signs in from an emailed link in another tab, or returns through the
 * back button to a page cached before they signed in. Measured 2026-11-03 on
 * instela.org: page body signed in ("Open your tracker"), header still "Sign
 * in", which reads as being signed out and hides the admin link.
 *
 * Matches `sb-<ref>-auth-token` and its chunked form `sb-<ref>-auth-token.0`,
 * and deliberately not the PKCE `…-auth-token-code-verifier` cookies, which
 * exist while signed out.
 */
const SESSION_COOKIE_RE = /(?:^|;\s*)sb-[a-z0-9]+-auth-token(?:\.\d+)?=[^;]+/;

export function hasSessionCookie(cookieHeader: string): boolean {
  return SESSION_COOKIE_RE.test(cookieHeader);
}
