/**
 * Side-by-side comparison of two or three opportunities.
 *
 * WHAT MAKES THIS MORE THAN A TABLE. Printing both listings next to each other
 * is a worse version of two browser tabs. What a student cannot do in two tabs
 * is see, at a glance, *which* facts actually differ — so every row here knows
 * whether it varies, and the page can lead with the rows that do.
 *
 * THE RULE THAT SHAPES THE REST: a stated value against an unstated one is a
 * **difference**, not a tie. "One of these publishes a deadline and the other
 * does not" is genuinely useful — it is the difference between an application
 * you can plan and one that could close tomorrow — and a comparison that
 * rendered both as a quiet dash would hide it. Unknown is still never scored as
 * a miss; it is just not pretended to be agreement.
 *
 * Free of database imports so the shaping rules are unit-testable.
 */

import type { FeedItem } from "./feed";
import { presentFit, type TierId } from "./pricing/tiers";

/** Two or three. Four columns stops being a comparison and becomes a feed. */
export const MAX_COMPARE = 3;
export const MIN_COMPARE = 2;

export interface CompareCell {
  /** Rendered text, or null when the source did not state it. */
  value: string | null;
  /** True when this cell is the best of the row on a dimension that has one. */
  best?: boolean;
}

export interface CompareRow {
  label: string;
  cells: CompareCell[];
  /** True when the cells are not all the same — drives ordering and emphasis. */
  differs: boolean;
  /** Longer explanation, shown under the label where one earns its place. */
  note?: string;
}

export interface Comparison {
  items: FeedItem[];
  rows: CompareRow[];
  /** Rows that vary, first. What the student came here to see. */
  differing: CompareRow[];
  /** Rows identical across every column — collapsed by default. */
  shared: CompareRow[];
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

function formatAmount(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null && min !== max) {
    return `$${min.toLocaleString("en-US")}–$${max.toLocaleString("en-US")}`;
  }
  const value = min ?? max;
  return value === null ? null : `$${value.toLocaleString("en-US")}`;
}

function formatDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Whole UTC calendar days, matching the reminder job rather than elapsed time. */
export function daysUntil(deadline: Date, now: Date): number {
  const a = Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / 86_400_000);
}

function deadlineText(item: FeedItem, now: Date): string | null {
  if (!item.deadlineAt) return null;
  const days = daysUntil(item.deadlineAt, now);
  const date = formatDate(item.deadlineAt);
  if (days < 0) return `${date} — passed`;
  if (days === 0) return `${date} — today`;
  return `${date} — ${days} day${days === 1 ? "" : "s"}`;
}

function freshnessText(item: FeedItem): string {
  if (item.closedAt) return "closed";
  switch (item.freshnessTier) {
    case "live_polled":
      return "confirmed live";
    case "periodic_check":
      return `checked ${formatDate(item.lastSeenAt)}`;
    default:
      return `imported ${formatDate(item.lastSeenAt)}, not re-checked`;
  }
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

function cellsDiffer(cells: CompareCell[]): boolean {
  const first = cells[0]?.value ?? null;
  // Null vs a value counts as a difference — see the header. This is deliberate
  // and is the one place a comparison should not treat unknown as neutral.
  return cells.some((c) => (c.value ?? null) !== first);
}

/**
 * Mark the highest-scoring cell, but only when the win is real.
 *
 * Two rules keep this honest. A row where any value is unstated gets no winner
 * at all — declaring one would be ranking a posting above another on a fact we
 * do not have for both. And a tie marks nobody, rather than marking the first
 * column and quietly implying it came out ahead.
 */
function markBest(cells: CompareCell[], scores: Array<number | null>): CompareCell[] {
  if (scores.some((s) => s === null)) return cells;
  const values = scores as number[];
  const top = Math.max(...values);
  if (values.filter((v) => v === top).length > 1) return cells;
  return cells.map((c, i) => (values[i] === top ? { ...c, best: true } : c));
}

function row(label: string, cells: CompareCell[], note?: string): CompareRow {
  return { label, cells, differs: cellsDiffer(cells), note };
}

/**
 * Build the comparison.
 *
 * Rows are chosen for what changes a decision, not for what we happen to
 * store. Nothing here restates the title or the description: those are on the
 * page already, and a comparison whose first three rows are the things the
 * student is already looking at buries the answer.
 */
export function buildComparison(
  items: FeedItem[],
  now: Date = new Date(),
  tier: TierId = "free",
): Comparison {
  const rows: CompareRow[] = [];

  /*
   * The fit row goes through `presentFit` like every other place a score is
   * shown. It is easy to miss that this file renders a score at all — it
   * builds strings rather than using `ScoreBadge` — and a paywall that holds
   * on the feed and the listing page while `/compare` prints the exact
   * number is not a paywall. Found by grepping for the score after the
   * badge-level gate was already working.
   *
   * `markBest` is fed the presented scores, so on a bucketed tier no column
   * is marked as the winner: declaring one would rank two postings against
   * each other on a number this viewer is not being shown, which is a
   * stronger claim than the row is allowed to make.
   */
  const presented = items.map((i) => presentFit(i.fit, tier));
  const fitScores = presented.map((p) => p.score);
  rows.push(
    row(
      "fit",
      markBest(
        presented.map((p) => ({
          value:
            p.bucketLabel !== null
              ? `${p.bucketLabel} · ${p.known}/${p.total} known`
              : p.score === null
                ? null
                : `${p.score} · ${p.known}/${p.total} known`,
        })),
        fitScores,
      ),
      "a score built from fewer known dimensions is a weaker claim, not a worse opportunity",
    ),
  );

  rows.push(
    row(
      "eligibility",
      items.map((i) => ({ value: i.fit.blocked ? "you are not eligible" : "no stated blocker" })),
    ),
  );

  rows.push(
    row(
      "deadline",
      items.map((i) => ({ value: deadlineText(i, now) })),
      "an unstated deadline is not a distant one — it means the source never published a date",
    ),
  );

  const amounts = items.map((i) => formatAmount(i.amountMin, i.amountMax));
  if (amounts.some((a) => a !== null)) {
    rows.push(
      row(
        "award",
        items.map((i, n) => ({
          value: amounts[n] ?? (i.amountNeedsReview ? "stated, unreadable" : null),
        })),
      ),
    );
  }

  rows.push(row("kind", items.map((i) => ({ value: i.kind }))));
  rows.push(row("organisation", items.map((i) => ({ value: i.company }))));

  rows.push(
    row(
      "location",
      items.map((i) => ({
        value: i.isRemote
          ? i.locations.length > 0
            ? `remote · ${i.locations.slice(0, 2).join(" / ")}`
            : "remote"
          : i.locations.length > 0
            ? i.locations.slice(0, 3).join(" / ")
            : null,
      })),
    ),
  );

  rows.push(row("term", items.map((i) => ({ value: i.term }))));

  rows.push(
    row(
      "work authorization",
      items.map((i) => ({
        value:
          i.workAuth === "citizenship_required"
            ? "U.S. citizenship required"
            : i.workAuth === "no_sponsorship"
              ? "no sponsorship"
              : i.workAuth === "sponsorship_offered"
                ? "sponsors visas"
                : null,
      })),
    ),
  );

  rows.push(
    row(
      "how fresh",
      items.map((i) => ({ value: freshnessText(i) })),
      "how recently we verified this listing exists, not when it was posted",
    ),
  );

  const skillCounts = items.map((i) => i.skills.length);
  if (skillCounts.some((n) => n > 0)) {
    rows.push(
      row(
        "skills named",
        items.map((i) => ({
          value: i.skills.length > 0 ? i.skills.slice(0, 6).join(", ") : null,
        })),
      ),
    );
  }

  rows.push(
    row(
      "apply link",
      items.map((i) => ({ value: i.applyLinkDead ? "may be dead" : "answering normally" })),
    ),
  );

  return {
    items,
    rows,
    differing: rows.filter((r) => r.differs),
    shared: rows.filter((r) => !r.differs),
  };
}

/**
 * Read and clamp the `ids` query parameter.
 *
 * Deduped, because comparing a posting with itself is a page of identical
 * columns, and capped rather than rejected — someone who arrives with five ids
 * should get a comparison of the first three, not an error.
 */
export function parseCompareIds(raw: string | string[] | undefined): string[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const seen = new Set<string>();
  for (const part of joined.split(",")) {
    const id = part.trim();
    if (id) seen.add(id);
    if (seen.size >= MAX_COMPARE) break;
  }
  return [...seen];
}
