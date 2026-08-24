import { and, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { applications, organizations, postings, type ApplicationStatus } from "@/db/schema";

import { shouldStampAppliedAt } from "./types";

/**
 * Application tracker persistence.
 *
 * Our connection is the table owner and bypasses RLS, so every function here
 * takes a `userId` and filters on it. That `where` clause is the actual
 * access control for this table — see migration 0002.
 */

export interface TrackedApplication {
  id: string;
  postingId: string;
  status: ApplicationStatus;
  appliedAt: Date | null;
  outcome: string | null;
  notes: string | null;
  updatedAt: Date;
  /* denormalised for display */
  title: string;
  company: string;
  url: string;
  locations: string[];
  term: string | null;
  closedAt: Date | null;
  lastSeenAt: Date;
}

export async function listApplications(userId: string): Promise<TrackedApplication[]> {
  return db
    .select({
      id: applications.id,
      postingId: applications.postingId,
      status: applications.status,
      appliedAt: applications.appliedAt,
      outcome: applications.outcome,
      notes: applications.notes,
      updatedAt: applications.updatedAt,
      title: postings.title,
      company: organizations.name,
      url: postings.url,
      locations: postings.locations,
      term: postings.term,
      closedAt: postings.closedAt,
      lastSeenAt: postings.lastSeenAt,
    })
    .from(applications)
    .innerJoin(postings, eq(applications.postingId, postings.id))
    .innerJoin(organizations, eq(postings.orgId, organizations.id))
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.updatedAt));
}

/** How many postings this user is tracking, for the tracker's tier cap. */
export async function countApplications(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(applications)
    .where(eq(applications.userId, userId));
  return row?.n ?? 0;
}

/** Status of the given postings for this user, for rendering feed rows. */
export async function statusesForPostings(
  userId: string,
  postingIds: string[],
): Promise<Map<string, ApplicationStatus>> {
  if (postingIds.length === 0) return new Map();

  const rows = await db
    .select({ postingId: applications.postingId, status: applications.status })
    .from(applications)
    .where(
      and(eq(applications.userId, userId), inArray(applications.postingId, postingIds)),
    );

  return new Map(rows.map((r) => [r.postingId, r.status]));
}

/**
 * Create or move an application.
 *
 * One row per (user, posting) — enforced by a unique index, so double-clicking
 * "save" cannot produce two entries for the same role.
 */
export async function setStatus(
  userId: string,
  postingId: string,
  status: ApplicationStatus,
): Promise<void> {
  const [existing] = await db
    .select({ appliedAt: applications.appliedAt })
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.postingId, postingId)))
    .limit(1);

  const appliedAt = shouldStampAppliedAt(status, existing?.appliedAt ?? null)
    ? new Date()
    : undefined;

  await db
    .insert(applications)
    .values({
      userId,
      postingId,
      status,
      appliedAt: appliedAt ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [applications.userId, applications.postingId],
      set: {
        status,
        updatedAt: new Date(),
        // Only ever set, never moved — see shouldStampAppliedAt.
        ...(appliedAt ? { appliedAt } : {}),
      },
    });
}

/** Free-text notes and final outcome. Both are the user's own words. */
export async function updateDetails(
  userId: string,
  applicationId: string,
  patch: { notes?: string | null; outcome?: string | null },
): Promise<void> {
  await db
    .update(applications)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)));
}

export async function removeApplication(userId: string, applicationId: string): Promise<void> {
  await db
    .delete(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)));
}
