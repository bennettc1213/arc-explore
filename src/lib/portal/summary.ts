/**
 * What the portal home says about a student's own tracker.
 *
 * Pure — rows in, display-ready numbers out — so every rule is testable
 * without a connection and the page holds no arithmetic of its own.
 *
 * ONE DEFINITION PER RULE. "Submitted", "in flight" and the terminal states are
 * not restated here: they come from `statusMeta` / `countByStatus`, the same
 * functions the tracker page uses, so the two screens cannot disagree about
 * what a submitted application is. (They can still disagree about *which rows*
 * — the tracker's own query drops scholarships, recorded in FIXES.md §2 — and
 * that is a fault in the tracker's join, not a second definition.)
 *
 * NOTHING IS A RATE. The tracker withholds a response rate below ten
 * submissions because a fraction over a tiny base reads as a rate and is not
 * one. The portal sidesteps the question by showing counts only: a count of
 * what happened never claims more than it observed.
 */

import type { ApplicationStatus, PostingKind } from "@/db/schema";
import { POSTING_KINDS } from "@/db/schema";
import { countByStatus, STATUSES, statusMeta, type TrackerCounts } from "@/lib/applications/types";

export interface ActivityRow {
  postingId: string;
  status: ApplicationStatus;
  kind: PostingKind;
  title: string;
  /** Employer for an internship, sponsor for a scholarship; null when neither is known. */
  company: string | null;
  updatedAt: Date;
}

export interface RecentActivity {
  postingId: string;
  title: string;
  company: string | null;
  kind: PostingKind;
  status: ApplicationStatus;
  statusLabel: string;
  ago: string;
}

export interface PipelineSegment {
  status: ApplicationStatus;
  label: string;
  count: number;
}

export interface ActivitySummary {
  counts: TrackerCounts;
  /** Tracked but not yet sent. */
  saved: number;
  /** Sent, and still waiting on a decision (applied, screen, interview). */
  awaiting: number;
  byKind: Record<PostingKind, { tracked: number; submitted: number }>;
  /** Only the statuses that hold something, in the order a real process runs. */
  pipeline: PipelineSegment[];
  recent: RecentActivity[];
}

export const RECENT_LIMIT = 5;

/** "today", "yesterday", "3d ago", "2mo ago" — coarse on purpose; the minute is noise. */
export function agoLabel(date: Date, now: Date): string {
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function summarizeActivity(rows: readonly ActivityRow[], now: Date): ActivitySummary {
  const counts = countByStatus(rows);

  const byKind = Object.fromEntries(
    POSTING_KINDS.map((kind) => {
      const ofKind = rows.filter((r) => r.kind === kind);
      return [kind, { tracked: ofKind.length, submitted: countByStatus(ofKind).submitted }];
    }),
  ) as ActivitySummary["byKind"];

  const pipeline: PipelineSegment[] = STATUSES.map((meta) => ({
    status: meta.value,
    label: meta.label,
    count: rows.filter((r) => r.status === meta.value).length,
  })).filter((s) => s.count > 0);

  const awaiting = rows.filter((r) => {
    const m = statusMeta(r.status);
    return m.submitted && !m.terminal;
  }).length;

  const recent = rows
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, RECENT_LIMIT)
    .map((r) => ({
      postingId: r.postingId,
      title: r.title,
      company: r.company,
      kind: r.kind,
      status: r.status,
      statusLabel: statusMeta(r.status).label,
      ago: agoLabel(r.updatedAt, now),
    }));

  return {
    counts,
    saved: rows.filter((r) => r.status === "saved").length,
    awaiting,
    byKind,
    pipeline,
    recent,
  };
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Whole dollars — award amounts are stated to the dollar, and cents would imply precision we do not have. */
export function formatDollars(n: number): string {
  return USD.format(n);
}
