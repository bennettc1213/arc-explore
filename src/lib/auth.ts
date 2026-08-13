import { cache } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "./supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in user, or null.
 *
 * `getUser()` (not `getSession()`) is deliberate: it revalidates the token with
 * the auth server, so a forged or stale cookie cannot fake a session. React
 * `cache` dedupes that round-trip across a single render, so a page and its
 * children pay for it once.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
});

/**
 * The signed-in user, or a redirect to sign-in.
 *
 * `next` round-trips the requested path so the user lands where they were
 * headed. Callers pass their own path; we never read it from a header, which
 * would be attacker-controlled.
 */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return user;
}

