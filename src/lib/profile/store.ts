import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { profiles, resumes } from "@/db/schema";

import type { ProfileInput, UserProfile, WorkAuthValue, InterestValue } from "./types";

/**
 * Profile reads and writes.
 *
 * Our connection is the table owner and therefore **bypasses RLS**, so the
 * policies in migration 0002 do not scope these queries — every function here
 * takes a `userId` and must filter on it. RLS covers the door we do not
 * control (PostgREST via the public anon key); this is the door we do.
 */

function toUserProfile(row: typeof profiles.$inferSelect): UserProfile {
  return {
    id: row.id,
    displayName: row.displayName,
    school: row.school,
    major: row.major,
    gradYear: row.gradYear,
    gpa: row.gpa,
    // Stored as free text so an older value never becomes unreadable; narrowed
    // on the way out because the scorer only understands the known set.
    workAuth: (row.workAuth as WorkAuthValue | null) ?? null,
    targetVerticals: row.targetVerticals as InterestValue[],
    targetLocations: row.targetLocations,
    openToRemote: row.openToRemote,
    portfolioUrl: row.portfolioUrl,
  };
}

/**
 * Guarantees the user has a `profiles` row.
 *
 * `profiles.id` is the foreign key every other user-owned table hangs off
 * (resumes, applications, contacts, outreach_drafts), and Supabase's
 * `auth.users` is a separate schema we do not migrate. Without this, the first
 * thing a brand-new user does — before they have ever pressed save — fails on
 * `resumes_user_id_profiles_id_fk`.
 *
 * Idempotent, so it is safe to call on every sign-in and before any dependent
 * write. The row it creates is entirely empty, which `isProfileUsable` reports
 * as "no profile yet" — existing and being filled in are different things.
 */
export async function ensureProfile(userId: string): Promise<void> {
  await db.insert(profiles).values({ id: userId }).onConflictDoNothing();
}

/** The user's profile, or null if they have not saved one yet. */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return row ? toUserProfile(row) : null;
}

/**
 * Insert or update the user's profile.
 *
 * `id` comes from the verified session, never from the form — otherwise a
 * user could post someone else's id and overwrite their profile.
 */
export async function saveProfile(userId: string, input: ProfileInput): Promise<UserProfile> {
  const values = {
    id: userId,
    displayName: input.displayName,
    school: input.school,
    major: input.major,
    gradYear: input.gradYear,
    gpa: input.gpa,
    workAuth: input.workAuth,
    targetVerticals: input.targetVerticals,
    targetLocations: input.targetLocations,
    openToRemote: input.openToRemote,
    portfolioUrl: input.portfolioUrl,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(profiles)
    .values(values)
    .onConflictDoUpdate({ target: profiles.id, set: values })
    .returning();

  return toUserProfile(row);
}

export interface StoredResume {
  id: string;
  fileName: string | null;
  parsed: unknown;
  createdAt: Date;
}

/** The user's most recent resume, if they have uploaded one. */
export async function getLatestResume(userId: string): Promise<StoredResume | null> {
  const [row] = await db
    .select({
      id: resumes.id,
      fileName: resumes.fileName,
      parsed: resumes.parsed,
      createdAt: resumes.createdAt,
    })
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt))
    .limit(1);

  return row ?? null;
}
