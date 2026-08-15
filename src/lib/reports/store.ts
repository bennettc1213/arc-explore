import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { listingReports, organizations, postings } from "@/db/schema";

import { queuePriority, type ReportInput, type ReportReason } from "./types";

/**
 * Reports: writes from students, reads for the queue.
 *
 * As everywhere else here, our connection is the table owner and **bypasses
 * RLS**, so every query below must scope itself explicitly. The policy in
 * migration 0011 guards the PostgREST door we do not control; these functions
 * guard the one we do.
 */

/** Already-reported is not an error worth showing as a failure. */
export type SubmitResult = "recorded" | "already_reported";

export async function submitReport(userId: string, input: ReportInput): Promise<SubmitResult> {
  const inserted = await db
    .insert(listingReports)
    .values({
      postingId: input.postingId,
      userId,
      reason: input.reason,
      detail: input.detail,
    })
    // One report per person per listing. Someone who feels strongly can write
    // a longer detail; they cannot file the same complaint fifty times. A
    // second attempt is not a failure — the first one already worked.
    .onConflictDoNothing({ target: [listingReports.userId, listingReports.postingId] })
    .returning({ id: listingReports.id });

  return inserted.length > 0 ? "recorded" : "already_reported";
}

/** Whether this user has already reported this listing, for the button state. */
export async function hasReported(userId: string, postingId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: listingReports.id })
    .from(listingReports)
    .where(and(eq(listingReports.userId, userId), eq(listingReports.postingId, postingId)))
    .limit(1);
  return Boolean(row);
}

export interface QueuedReport {
  id: string;
  postingId: string;
  reason: ReportReason;
  detail: string | null;
  createdAt: Date;
  title: string;
  company: string | null;
  url: string;
  kind: string;
  hiddenAt: Date | null;
  /** How many people have reported this same listing, resolved or not. */
  reportCount: number;
}

/**
 * Open reports, urgent first, then oldest.
 *
 * The count of other reports on the same listing is joined in because it is
 * the single most useful thing a reviewer can know: one person saying a
 * deadline is wrong is a maybe, four people saying it is a fact.
 */
export async function openReports(limit = 100): Promise<QueuedReport[]> {
  const rows = await db
    .select({
      id: listingReports.id,
      postingId: listingReports.postingId,
      reason: listingReports.reason,
      detail: listingReports.detail,
      createdAt: listingReports.createdAt,
      title: postings.title,
      company: sql<string | null>`coalesce(${organizations.name}, ${postings.sponsorName})`,
      url: postings.url,
      kind: postings.kind,
      hiddenAt: postings.hiddenAt,
      reportCount: sql<number>`(
        select count(*)::int from ${listingReports} r2
        where r2.posting_id = ${listingReports.postingId}
      )`,
    })
    .from(listingReports)
    .innerJoin(postings, eq(postings.id, listingReports.postingId))
    .leftJoin(organizations, eq(organizations.id, postings.orgId))
    .where(isNull(listingReports.resolvedAt))
    .orderBy(asc(listingReports.createdAt))
    .limit(limit);

  // Priority is applied in memory rather than in SQL: it is a product rule
  // ("money and fraud first"), and expressing it as a CASE in the ORDER BY
  // would put a second copy of that rule somewhere it can drift from
  // `queuePriority`.
  return rows
    .map((r) => ({ ...r, reason: r.reason as ReportReason }))
    .sort(
      (a, b) =>
        queuePriority(a.reason) - queuePriority(b.reason) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
}

export async function resolveReport(id: string, resolution: string | null): Promise<void> {
  await db
    .update(listingReports)
    .set({ resolvedAt: new Date(), resolution })
    .where(eq(listingReports.id, id));
}

/* ------------------------------------------------------------------ *
 * Curation
 * ------------------------------------------------------------------ */

/**
 * Take a listing down, or put it back.
 *
 * Hiding is a *human* decision and is never made by an automated check —
 * `closed_at` is owned by the ATS poll and `url_dead_strikes` by the link
 * checker, and neither of them touches this column. That separation is what
 * makes a hidden row auditable: if it is hidden, a person hid it, and
 * `hidden_reason` says why.
 */
export async function setHidden(
  postingId: string,
  hidden: boolean,
  reason: string | null,
): Promise<void> {
  await db
    .update(postings)
    .set(
      hidden
        ? { hiddenAt: new Date(), hiddenReason: reason, reviewedAt: new Date() }
        : { hiddenAt: null, hiddenReason: null, reviewedAt: new Date() },
    )
    .where(eq(postings.id, postingId));
}

/** Mark a listing as looked at and left up, clearing it from the triage list. */
export async function markReviewed(postingId: string): Promise<void> {
  await db.update(postings).set({ reviewedAt: new Date() }).where(eq(postings.id, postingId));
}

export interface TriageRow {
  id: string;
  title: string;
  company: string | null;
  url: string;
  kind: string;
  reason: string;
  hiddenAt: Date | null;
  urlStatus: number | null;
  amountNeedsReview: boolean;
}

/**
 * Rows a machine has flagged and a person has not yet looked at.
 *
 * Deliberately not "everything ingested". A review gate in front of 3,765 rows
 * would empty the feed and could never be worked through; this is the much
 * smaller set where an automated signal already says something is off, which
 * is the only queue a single operator can actually keep at zero.
 */
export async function triageQueue(limit = 100): Promise<TriageRow[]> {
  const rows = await db
    .select({
      id: postings.id,
      title: postings.title,
      company: sql<string | null>`coalesce(${organizations.name}, ${postings.sponsorName})`,
      url: postings.url,
      kind: postings.kind,
      hiddenAt: postings.hiddenAt,
      urlStatus: postings.urlStatus,
      amountNeedsReview: postings.amountNeedsReview,
      deadStrikes: postings.urlDeadStrikes,
    })
    .from(postings)
    .leftJoin(organizations, eq(organizations.id, postings.orgId))
    .where(
      and(
        isNull(postings.closedAt),
        isNull(postings.reviewedAt),
        sql`(${postings.urlDeadStrikes} >= 2 or ${postings.amountNeedsReview})`,
      ),
    )
    .orderBy(desc(postings.urlDeadStrikes), asc(postings.firstSeenAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    reason:
      r.deadStrikes >= 2
        ? `apply url answered ${r.urlStatus ?? "nothing"} twice`
        : "source stated an amount we could not parse",
  }));
}

export interface AdminCounts {
  openReports: number;
  urgentReports: number;
  triage: number;
  hidden: number;
}

export async function adminCounts(): Promise<AdminCounts> {
  const [reports] = await db
    .select({
      open: sql<number>`count(*) filter (where ${listingReports.resolvedAt} is null)::int`,
      urgent: sql<number>`count(*) filter (
        where ${listingReports.resolvedAt} is null
          and ${listingReports.reason} in ('asks_for_payment','not_real')
      )::int`,
    })
    .from(listingReports);

  const [posts] = await db
    .select({
      triage: sql<number>`count(*) filter (
        where ${postings.closedAt} is null and ${postings.reviewedAt} is null
          and (${postings.urlDeadStrikes} >= 2 or ${postings.amountNeedsReview})
      )::int`,
      hidden: sql<number>`count(*) filter (where ${postings.hiddenAt} is not null)::int`,
    })
    .from(postings);

  return {
    openReports: Number(reports?.open ?? 0),
    urgentReports: Number(reports?.urgent ?? 0),
    triage: Number(posts?.triage ?? 0),
    hidden: Number(posts?.hidden ?? 0),
  };
}
