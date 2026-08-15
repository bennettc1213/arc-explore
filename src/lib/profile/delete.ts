import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { profiles } from "@/db/schema";

import { SUPABASE_URL } from "../supabase/env";

/**
 * Delete an account and everything attached to it.
 *
 * WHY THIS FILE HOLDS THE SERVICE-ROLE KEY WHEN NOTHING ELSE DOES.
 * `supabase/env.ts` says plainly that the service-role key is not read there
 * and that nothing in the request path should hold it — a rule worth keeping,
 * because a client with it bypasses RLS on every table. This is the one
 * deliberate exception, and it is narrow on purpose:
 *
 *  - The key is read **inside the function**, not at module scope, so merely
 *    importing this file never puts it anywhere. (The `server-only` package
 *    would make a browser import a build error outright, but it is not
 *    installed and this codebase has declined dependencies for less; the
 *    single importer below is a `"use server"` module, which Next already
 *    refuses to bundle into a client component.)
 *  - It imports `db`, which needs `DATABASE_URL` and would fail loudly in a
 *    browser long before the key mattered.
 *  - The admin client is used for exactly one call — deleting one user, by an
 *    id that came from a verified session — and never for reads.
 *
 * The alternative was to delete our own tables and leave the login record, but
 * a privacy policy that says "we deleted your account" while the account can
 * still sign in is not true. And signing back in would call `ensureProfile` and
 * silently recreate an empty row, which is a worse outcome than either.
 *
 * ORDER MATTERS. The `profiles` row goes first: every user-owned table
 * (`resumes`, `cover_letters`, `applications`, `deadline_reminders`,
 * `contacts`, `outreach_drafts`, `matches`) has `on delete cascade` against it,
 * so one statement removes all of it. If the auth deletion then fails, the
 * account is empty but still exists — recoverable, and the user can retry.
 * Doing it the other way round could leave orphaned resume content behind with
 * no session that could ever reach it again.
 */

export class AccountDeleteError extends Error {}

export interface DeleteResult {
  /** True when the login record is gone too, not just the application data. */
  authDeleted: boolean;
}

export async function deleteAccount(userId: string): Promise<DeleteResult> {
  // Cascades through every table that references profiles.id.
  await db.delete(profiles).where(eq(profiles.id, userId));

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    // Say so rather than reporting a complete deletion we did not perform.
    return { authDeleted: false };
  }

  const admin = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new AccountDeleteError(
      `your data was deleted, but the login record could not be removed: ${error.message}`,
    );
  }

  return { authDeleted: true };
}
