/**
 * The scholarship Plan view: "your next 3 moves" and the reason rows.
 *
 * Pure — no database, no React — so every selection rule is testable against
 * fixtures and so a client component can import the payload types without
 * dragging a connection along. `explore.ts` builds the inputs from real feed
 * rows; this decides what goes where.
 *
 * THE RULES, ONCE. Each row is one `RowDef` with its own reason line, its own
 * eligibility test and its own sort, so a row cannot be described one way on
 * screen and selected another way here.
 *
 * TWO DOCTRINES SHAPE EVERY RULE BELOW.
 *  - Unknown is never a value. An unconfirmed amount is not $0 and an unknown
 *    effort is not "quick"; a listing missing the fact a row is about is simply
 *    not in that row.
 *  - Locking is decided here, server-side, and the locked half carries nothing.
 *    A blurred card that still has its title in the payload is not locked, it is
 *    decorated.
 */

import type { ApplicationStatus } from "@/db/schema";
import type { FitResult } from "@/lib/score/fit";
import type { PresentedFit } from "@/lib/pricing/tiers";

import type { Effort } from "./effort";

/** Eligibility as far as the stated requirements let us say. */
export type EligibilityStatus = "eligible" | "unknown" | "check";

export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  // "Likely", because a field match is the one requirement we can read — GPA,
  // residency and enrollment rules are usually stated in prose we do not parse.
  eligible: "Likely eligible",
  unknown: "Eligibility unknown",
  check: "Check eligibility",
};

/**
 * Read off the same Fit Score the feed ranks by — never a second judgement.
 *
 * There is no "almost eligible" here because no helper computes it; the status
 * is not emitted rather than approximated.
 */
export function eligibilityFrom(fit: FitResult): EligibilityStatus {
  if (fit.blocked) return "check";
  const field = fit.reasons.find((r) => r.dimension === "field");
  if (field?.kind === "bad") return "check";
  if (field?.kind === "good") return "eligible";
  return "unknown";
}

/** What the selection rules read. Everything else on a card is presentation. */
export interface PlanInput {
  id: string;
  /** Confirmed per-award dollars (the lower bound of a range), or null. */
  amount: number | null;
  effort: Effort | null;
  /** Known essay count, separately from effort: a letter count can be unknown
   *  while the essay count is not, and the no-essay row only needs this. */
  essays: number | null;
  /** Whole UTC days until the stated deadline; null when none is stated. */
  daysUntilDeadline: number | null;
  isMarketing: boolean;
  eligibility: EligibilityStatus;
  /** Defensive: the feed already excludes closed rows, and this re-checks. */
  closed: boolean;
}

/**
 * The largest single per-student award we will believe as stated.
 *
 * Measured 2026-10-26 on the 349 open scholarships with a stated amount: the
 * two above this are $450,000 ("about 225 awards a year", program total $101M)
 * and $175,000 — both program totals the parser stored in the per-award column,
 * the same rows the landing page already refused to sum. The next largest is
 * $22,000. Same move as `POSTED_PLAUSIBLE_DAYS` in score/timing.ts: beyond the
 * bound the figure is treated as unknown, not as a giant award, because a
 * "Big swings" row led by a misread program total is the worst first card the
 * view could show.
 */
export const PLAUSIBLE_AWARD_MAX = 100_000;

type AmountRow = {
  amountStatus: "exact" | "range" | "varies" | "unparseable";
  amountMin: number | null;
  amountMax: number | null;
  amountIsEstimated: boolean;
};

const positive = (n: number | null): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * Confirmed per-award dollars, or null.
 *
 * Only an exact amount, or a range with a stated floor, counts — and a range
 * counts as its floor. Null for: "varies"; "unparseable" (the "$,000" class of
 * source typo); a stored 0; an amount we computed from a program total (our
 * arithmetic, not the sponsor's statement); an "up to $X" range with no floor,
 * which is a ceiling and not a promise; and anything beyond
 * `PLAUSIBLE_AWARD_MAX`.
 */
export function confirmedAmount(row: AmountRow): number | null {
  if (row.amountIsEstimated) return null;
  const value =
    row.amountStatus === "exact"
      ? (row.amountMin ?? row.amountMax)
      : row.amountStatus === "range"
        ? row.amountMin
        : null;
  return positive(value) && value <= PLAUSIBLE_AWARD_MAX ? value : null;
}

/** "up to $22,000" for a floorless range — shown, but never ranked as confirmed. */
export function amountCeiling(row: AmountRow): number | null {
  if (row.amountStatus !== "range" || positive(row.amountMin)) return null;
  return positive(row.amountMax) && row.amountMax <= PLAUSIBLE_AWARD_MAX ? row.amountMax : null;
}

// ── Next 3 moves ─────────────────────────────────────────────────────────────

export const NEXT_MOVES_COUNT = 3;
/** A deadline closer than this is not a plan, it is a scramble. */
export const NEXT_MOVES_MIN_DAYS = 3;
/** Floor on the effort divisor, so a tiny estimate cannot dominate the ratio. */
export const MIN_EFFORT_DIVISOR = 0.5;

function nearestDeadlineFirst(a: PlanInput, b: PlanInput): number {
  const ad = a.daysUntilDeadline ?? Number.POSITIVE_INFINITY;
  const bd = b.daysUntilDeadline ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Dollars per estimated hour, among listings where both are known.
 *
 * Fewer than three is a real answer, not a gap to fill — the view shows what
 * qualified and says why the rest did not.
 */
export function nextMoves(inputs: PlanInput[]): PlanInput[] {
  const payoff = (i: PlanInput) =>
    (i.amount as number) / Math.max((i.effort as Effort).hours, MIN_EFFORT_DIVISOR);

  return inputs
    .filter(
      (i) =>
        !i.closed &&
        !i.isMarketing &&
        i.eligibility !== "check" &&
        i.amount !== null &&
        i.effort !== null &&
        i.daysUntilDeadline !== null &&
        i.daysUntilDeadline >= NEXT_MOVES_MIN_DAYS,
    )
    .sort((a, b) => payoff(b) - payoff(a) || nearestDeadlineFirst(a, b))
    .slice(0, NEXT_MOVES_COUNT);
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export type RowId =
  | "quick-wins"
  | "closing-week"
  | "big-swings"
  | "no-essay"
  | "local"
  | "almost-eligible";

export const ROW_SIZE = 8;
/** A "row" of one or two is a list item wearing a costume. */
export const ROW_MIN = 3;

export const QUICK_WIN_MAX_HOURS = 2;
export const CLOSING_WINDOW_DAYS = 7;
export const BIG_SWING_MIN_AMOUNT = 5_000;

function byAmountDesc(a: PlanInput, b: PlanInput): number {
  return (b.amount ?? -1) - (a.amount ?? -1) || nearestDeadlineFirst(a, b);
}

interface RowDef {
  id: RowId;
  /** The row's title is its reason — what every card in it has in common. */
  title: string;
  /**
   * Set when the data this row needs does not exist at all. The row is then
   * never rendered, and the reason is reported rather than the row silently
   * missing.
   */
  unavailable?: string;
  select: (i: PlanInput) => boolean;
  sort: (a: PlanInput, b: PlanInput) => number;
}

export const ROW_DEFS: readonly RowDef[] = [
  {
    id: "quick-wins",
    title: `Quick wins — about ${QUICK_WIN_MAX_HOURS} hours or less`,
    select: (i) => !i.isMarketing && i.effort !== null && i.effort.hours <= QUICK_WIN_MAX_HOURS,
    sort: byAmountDesc,
  },
  {
    id: "closing-week",
    title: "Closing this week",
    select: (i) =>
      i.daysUntilDeadline !== null &&
      i.daysUntilDeadline >= 0 &&
      i.daysUntilDeadline <= CLOSING_WINDOW_DAYS,
    sort: nearestDeadlineFirst,
  },
  {
    id: "big-swings",
    title: `Big swings — $${BIG_SWING_MIN_AMOUNT.toLocaleString("en-US")} or more`,
    select: (i) => i.amount !== null && i.amount >= BIG_SWING_MIN_AMOUNT,
    sort: byAmountDesc,
  },
  {
    id: "no-essay",
    title: "No essay required",
    select: (i) => i.essays === 0,
    sort: nearestDeadlineFirst,
  },
  {
    id: "local",
    title: "Local, less competition",
    unavailable: "no listing stores a state or local scope we can match against",
    select: () => false,
    sort: nearestDeadlineFirst,
  },
  {
    id: "almost-eligible",
    title: "Almost eligible",
    unavailable: "there is no almost-eligible rule to select with yet",
    select: () => false,
    sort: nearestDeadlineFirst,
  },
];

export interface SelectedRow {
  id: RowId;
  title: string;
  ids: string[];
}

export interface HiddenRow {
  id: RowId;
  title: string;
  reason: string;
}

/** Each row's members, best first, with the rows too thin to show set aside. */
export function selectRows(inputs: PlanInput[]): { rows: SelectedRow[]; hidden: HiddenRow[] } {
  const open = inputs.filter((i) => !i.closed);
  const rows: SelectedRow[] = [];
  const hidden: HiddenRow[] = [];

  for (const def of ROW_DEFS) {
    if (def.unavailable) {
      hidden.push({ id: def.id, title: def.title, reason: def.unavailable });
      continue;
    }
    const members = open.filter(def.select).sort(def.sort).slice(0, ROW_SIZE);
    if (members.length < ROW_MIN) {
      hidden.push({
        id: def.id,
        title: def.title,
        reason:
          members.length === 0
            ? "nothing open qualifies right now"
            : `only ${members.length} open listing${members.length === 1 ? "" : "s"} qualif${members.length === 1 ? "ies" : "y"}`,
      });
      continue;
    }
    rows.push({ id: def.id, title: def.title, ids: members.map((m) => m.id) });
  }

  return { rows, hidden };
}

// ── Payload and locking ──────────────────────────────────────────────────────

/** Everything a card renders. Built server-side from a feed row. */
export interface ScholarshipCardData {
  id: string;
  title: string;
  sponsor: string;
  url: string;
  /** The host the apply link actually goes to, shown so it is never a surprise. */
  sourceHost: string;
  /** True for aggregator index pages that carry no application form. */
  viaAggregator: boolean;
  amountLabel: string;
  deadlineLabel: string | null;
  closesLabel: string | null;
  effortLabel: string;
  eligibility: EligibilityStatus;
  why: string;
  fit: PresentedFit;
  /** Scholarship freshness, phrased on its own — never blended with internship timing. */
  verifiedLabel: string;
  isMarketing: boolean;
  lowTrust: boolean;
  tracked: ApplicationStatus | null;
}

/**
 * A slot in the Plan view. A locked slot carries a positional key and nothing
 * else — no id, no title, no sponsor, no link — so there is nothing in the
 * response to read even with the blur stripped off.
 */
export type PlanSlot =
  | { locked: false; card: ScholarshipCardData }
  | { locked: true; key: string };

export interface PlanPayload {
  nextMoves: PlanSlot[];
  rows: Array<{ id: RowId; title: string; slots: PlanSlot[] }>;
  hiddenRows: HiddenRow[];
  /** How many listings fed the plan, and how many carry each fact it needs. */
  counts: { listings: number; amountKnown: number; effortKnown: number };
  /** Null when uncapped. */
  cap: number | null;
  lockedCount: number;
}

/** Logged-out visitors see this many real cards across the whole Plan view. */
export const SIGNED_OUT_CARD_CAP = 10;

/**
 * Assemble the view and apply the cap.
 *
 * Cards are revealed in reading order — next moves first, then each row top to
 * bottom — so the cap spends itself on what a visitor sees first. A listing
 * already revealed stays revealed when it reappears in a later row: showing it
 * twice discloses nothing new, and locking the second copy would hide a card
 * the visitor is already looking at.
 */
export function buildPlanPayload(
  inputs: PlanInput[],
  cards: Map<string, ScholarshipCardData>,
  options: { cap: number | null },
): PlanPayload {
  const moves = nextMoves(inputs);
  const { rows, hidden } = selectRows(inputs);

  const revealed = new Set<string>();
  let lockedCount = 0;

  const slotFor = (id: string, key: string): PlanSlot => {
    const card = cards.get(id);
    const allowed =
      card !== undefined &&
      (options.cap === null || revealed.has(id) || revealed.size < options.cap);
    if (card && allowed) {
      revealed.add(id);
      return { locked: false, card };
    }
    lockedCount++;
    return { locked: true, key };
  };

  const nextSlots = moves.map((m, i) => slotFor(m.id, `next-${i}`));
  const rowSlots = rows.map((r) => ({
    id: r.id,
    title: r.title,
    slots: r.ids.map((id, i) => slotFor(id, `${r.id}-${i}`)),
  }));

  return {
    nextMoves: nextSlots,
    rows: rowSlots,
    hiddenRows: hidden,
    counts: {
      listings: inputs.filter((i) => !i.closed).length,
      amountKnown: inputs.filter((i) => !i.closed && i.amount !== null).length,
      effortKnown: inputs.filter((i) => !i.closed && i.effort !== null).length,
    },
    cap: options.cap,
    lockedCount,
  };
}

// ── Funding goal meter ───────────────────────────────────────────────────────

export interface TrackedAward {
  status: ApplicationStatus;
  /** Confirmed dollars, or null when the listing states none. */
  amount: number | null;
}

export interface FundingTotals {
  submitted: number;
  saved: number;
  /** Tracked scholarships with no confirmed amount — counted, never summed. */
  unconfirmed: number;
}

/**
 * Dollars a student has applied for and dollars they have saved to apply for.
 *
 * "Submitted" is every status the tracker counts as submitted — including a
 * rejection, because the meter is about effort spent, not money won. Saved is
 * the tracker's "saved" status and nothing else; there is no "in progress"
 * status, so the meter does not claim one. Withdrawn counts toward neither.
 */
export function fundingTotals(
  tracked: TrackedAward[],
  isSubmitted: (s: ApplicationStatus) => boolean,
): FundingTotals {
  let submitted = 0;
  let saved = 0;
  let unconfirmed = 0;
  for (const t of tracked) {
    const counts = isSubmitted(t.status) || t.status === "saved";
    if (!counts) continue;
    if (t.amount === null) {
      unconfirmed++;
      continue;
    }
    if (isSubmitted(t.status)) submitted += t.amount;
    else saved += t.amount;
  }
  return { submitted, saved, unconfirmed };
}

/** The goal a student types, as a whole-dollar amount we will store. */
export const MAX_FUNDING_GOAL = 10_000_000;

export function parseFundingGoal(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Math.round(Number(cleaned));
  return n >= 1 && n <= MAX_FUNDING_GOAL ? n : null;
}

// ── View param ───────────────────────────────────────────────────────────────

export const EXPLORE_VIEWS = ["plan", "list"] as const;
export type ExploreView = (typeof EXPLORE_VIEWS)[number];
export const DEFAULT_VIEW: ExploreView = "plan";

/**
 * `?view=plan|map|list`. The map is specified but not built, so `map` reads as
 * the default rather than as an error — a shared map link still lands somewhere
 * useful.
 */
export function parseExploreView(raw: unknown): ExploreView {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "list" ? "list" : DEFAULT_VIEW;
}
