/**
 * What a capped feed holds beyond the rows it shows — counted, never shown.
 *
 * The Free plan sees its top N ranked matches. The old prompt below them said
 * only "your top 20 of 812", which tells a student how many rows exist and
 * nothing about whether any of them are worth paying to see. This summarises
 * the hidden rows with facts we already hold about each one, so the upgrade
 * prompt can say "47 more Strong Fit · 6 close within 14 days · 12 found today".
 *
 * HONESTY RULES, SAME AS THE REST OF THE FEED.
 *  - Every number is a count over real ranked rows from this same request.
 *    Nothing is estimated, rounded up or padded.
 *  - Unknown is not a value: a row with no stated deadline is not "closing
 *    soon", and an unconfirmed award adds $0 to the total, not a guess
 *    (`confirmedAmount` decides, the same rule the Funding Plan uses).
 *  - The preview stubs carry NO title, sponsor or URL. A blurred card whose
 *    title is still in the HTML is not locked, it is decorated — the rule
 *    `scholarships/plan.ts` states, and the reason this returns only the
 *    facts a stub is allowed to show.
 *
 * Pure (no database), so the arithmetic is testable against fixtures.
 */

import { bucketFitScore, type FitBucket } from "@/lib/pricing/tiers";
import { confirmedAmount } from "@/lib/scholarships/plan";

/** The slice of a FeedItem this module reads. Structural, so tests stay small. */
export interface HiddenSourceRow {
  id: string;
  kind: "internship" | "scholarship";
  fit: { score: number | null; blocked: boolean };
  timing: { label: string; hoursSinceFirstSeen: number; daysUntilDeadline: number | null; isClosed: boolean };
  amountStatus: "exact" | "range" | "varies" | "unparseable";
  amountMin: number | null;
  amountMax: number | null;
  amountIsEstimated: boolean;
}

export interface HiddenPreview {
  kind: "internship" | "scholarship";
  /** Null when the row is blocked or unscored; never a guessed bucket. */
  bucket: FitBucket | null;
  /** The row's own timing label ("found 3h ago", "closes in 5 days"). */
  timingLabel: string;
}

export interface HiddenSummary {
  /** Rows ranked but not shown. */
  count: number;
  /** Hidden rows that bucket as Strong Fit (and are not eligibility-blocked). */
  strongFit: number;
  /** Hidden rows with a stated deadline 0–14 days out. */
  closingSoon: number;
  /** Hidden rows our crawler first saw in the last 24 hours. */
  foundToday: number;
  /** Hidden scholarships whose per-award amount is confirmed. */
  awardsConfirmed: number;
  /** Sum of those confirmed per-award amounts, in dollars. */
  awardTotal: number;
  /** The first few hidden rows, redacted to what a stub may show. */
  preview: HiddenPreview[];
}

export const CLOSING_SOON_DAYS = 14;
export const HIDDEN_PREVIEW_COUNT = 3;

export function summarizeHidden(
  ranked: readonly HiddenSourceRow[],
  shown: readonly { id: string }[],
): HiddenSummary {
  const shownIds = new Set(shown.map((s) => s.id));
  const summary: HiddenSummary = {
    count: 0,
    strongFit: 0,
    closingSoon: 0,
    foundToday: 0,
    awardsConfirmed: 0,
    awardTotal: 0,
    preview: [],
  };

  for (const row of ranked) {
    if (shownIds.has(row.id)) continue;
    summary.count++;

    const bucket = row.fit.blocked || row.fit.score === null ? null : bucketFitScore(row.fit.score);
    if (bucket === "strong") summary.strongFit++;

    const d = row.timing.daysUntilDeadline;
    if (!row.timing.isClosed && d !== null && d >= 0 && d <= CLOSING_SOON_DAYS) summary.closingSoon++;
    if (row.timing.hoursSinceFirstSeen < 24) summary.foundToday++;

    if (row.kind === "scholarship") {
      const amount = confirmedAmount(row);
      if (amount !== null) {
        summary.awardsConfirmed++;
        summary.awardTotal += amount;
      }
    }

    if (summary.preview.length < HIDDEN_PREVIEW_COUNT) {
      summary.preview.push({ kind: row.kind, bucket, timingLabel: row.timing.label });
    }
  }

  return summary;
}

/* ------------------------------------------------------------------ *
 * "N new matches since you last looked"
 * ------------------------------------------------------------------ */

export interface NewSinceSummary {
  /** Ranked rows (this search) our crawler first saw after `since`. */
  total: number;
  /** Of those, how many bucket as Strong Fit and are not blocked. */
  strongFit: number;
  /** Of those, how many are past the rows this plan shows. */
  beyondShown: number;
}

/**
 * Counts rows first seen after the student's previous visit, over the same
 * ranked set the page shows, so the banner can never promise a row the
 * search would not return. "New" is new to us (`firstSeenAt`), the rule the
 * alerts follow.
 */
export function summarizeNew(
  ranked: readonly (HiddenSourceRow & { firstSeenAt: Date })[],
  shown: readonly { id: string }[],
  since: Date,
): NewSinceSummary {
  const shownIds = new Set(shown.map((s) => s.id));
  const out: NewSinceSummary = { total: 0, strongFit: 0, beyondShown: 0 };
  const cutoff = since.getTime();
  for (const row of ranked) {
    if (row.firstSeenAt.getTime() <= cutoff) continue;
    out.total++;
    if (!row.fit.blocked && row.fit.score !== null && bucketFitScore(row.fit.score) === "strong") out.strongFit++;
    if (!shownIds.has(row.id)) out.beyondShown++;
  }
  return out;
}
