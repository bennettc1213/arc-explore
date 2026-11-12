import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { applications, organizations, postings, type ApplicationStatus } from "@/db/schema";

import { countActiveSlots, shouldStampAppliedAt, transitionNeedsSlot } from "./types";

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
  workArrangement: "remote" | "hybrid" | "in_person" | null;
  compensationMinCents: number | null;
  compensationMaxCents: number | null;
  compensationInterval: "hour" | "year" | null;
  closedAt: Date | null;
  lastSeenAt: Date;
  /** Employer- or sponsor-stated deadline, when one is published. */
  deadlineAt: Date | null;
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
      // Scholarships carry no orgId, so this is a LEFT join and the sponsor
      // stands in for the company — the same coalesce FEED_SELECT does. An
      // inner join here silently dropped every saved scholarship (FIXES.md §2).
      company: sql<string>`coalesce(${organizations.name}, ${postings.sponsorName}, 'sponsor not stated')`,
      url: postings.url,
      locations: postings.locations,
      term: postings.term,
      workArrangement: postings.workArrangement,
      compensationMinCents: postings.compensationMinCents,
      compensationMaxCents: postings.compensationMaxCents,
      compensationInterval: postings.compensationInterval,
      closedAt: postings.closedAt,
      lastSeenAt: postings.lastSeenAt,
      deadlineAt: postings.deadlineAt,
    })
    .from(applications)
    .innerJoin(postings, eq(applications.postingId, postings.id))
    .leftJoin(organizations, eq(postings.orgId, organizations.id))
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.updatedAt));
}

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Every tracked row's status and whether its listing has closed. */
async function capacityRows(exec: Exec, userId: string) {
  const rows = await exec
    .select({ postingId: applications.postingId, status: applications.status, closedAt: postings.closedAt })
    .from(applications)
    .innerJoin(postings, eq(applications.postingId, postings.id))
    .where(eq(applications.userId, userId));
  return rows.map((r) => ({ postingId: r.postingId, status: r.status, closed: r.closedAt !== null }));
}

/** Active tracked opportunities — what the plan's tracker limit counts. */
export async function countActiveApplications(userId: string): Promise<number> {
  return countActiveSlots(await capacityRows(db, userId));
}

export type CapacityResult = "ok" | "at_capacity" | "missing_posting";

/**
 * Create or move an application, refusing only a move that would push active
 * rows past `limit` (null = unlimited).
 *
 * Check and write happen in one transaction under a per-user advisory lock,
 * so two saves racing for the last slot cannot both land. Moves into history,
 * between active statuses, notes and removal never need a slot.
 */
export async function setStatusWithinCapacity(
  userId: string,
  postingId: string,
  status: ApplicationStatus,
  limit: number | null,
): Promise<CapacityResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`tracker:${userId}`}, 0))`);
    const [posting] = await tx.select({ closedAt: postings.closedAt }).from(postings).where(eq(postings.id, postingId)).limit(1);
    if (!posting) return "missing_posting";
    if (limit !== null) {
      const rows = await capacityRows(tx, userId);
      const current = rows.find((r) => r.postingId === postingId)?.status ?? null;
      if (transitionNeedsSlot(current, status, posting.closedAt !== null) && countActiveSlots(rows) >= limit) {
        return "at_capacity";
      }
    }
    await setStatus(userId, postingId, status, tx);
    return "ok";
  });
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
  exec: Exec = db,
): Promise<void> {
  const [existing] = await exec
    .select({ appliedAt: applications.appliedAt })
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.postingId, postingId)))
    .limit(1);

  const appliedAt = shouldStampAppliedAt(status, existing?.appliedAt ?? null)
    ? new Date()
    : undefined;

  await exec
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
