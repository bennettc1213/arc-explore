import { notFound } from "next/navigation";

import { getSessionUser, type SessionUser } from "../auth";

import { isAdminEmail } from "./allowlist";

/**
 * Session-reading half of admin access. The rule itself — and the fail-closed
 * guarantee — lives in `allowlist.ts`, which imports nothing and is therefore
 * testable without a database connection or a Supabase key.
 *
 * Emails come from Supabase's verified session (`getUser()`, which revalidates
 * the token with the auth server), never from a form or a header.
 */

export { isAdminEmail } from "./allowlist";

/**
 * The signed-in admin, or a 404.
 *
 * `notFound()` rather than a redirect to sign-in, deliberately. A login prompt
 * confirms the route exists and is worth attacking; a 404 tells someone who is
 * not an admin exactly what a wrong URL tells them. The real admin knows the
 * path.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!isAdminEmail(user?.email)) notFound();
  return user as SessionUser;
}

/** Whether an admin link should be rendered at all. */
export async function viewerIsAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  return isAdminEmail(user?.email);
}
