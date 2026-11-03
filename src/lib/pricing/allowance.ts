/**
 * Recurring tool allowances — the policy, with no database and no clock of
 * its own.
 *
 * Every function here takes `now` as an argument, so the 30-day boundary is
 * testable to the millisecond. `grants.ts` is the only caller that touches the
 * database; it loads a user's grant rows for one feature, asks this module
 * what to do, and writes the answer inside one locked transaction.
 *
 * THE POLICY, EXACTLY (UTC instants, no calendar rounding):
 *
 *  1. A tool's first successful NEW use starts its period.
 *  2. The allowance renews `ALLOWANCE_PERIOD_DAYS` after the period started.
 *     The next new use after that starts a fresh period — periods do not tick
 *     over on their own, so an unused month is not "spent".
 *  3. Tools are independent: each feature has its own period.
 *  4. Revisiting an earned result (same key) is a replay. It never starts a
 *     period and never counts, in this period or any later one.
 *  5. A use is reserved before the work runs and confirmed after it succeeds.
 *     Failed work releases its reservation, so it never consumes allowance. A
 *     reservation that was never confirmed or released (a crashed request)
 *     stops counting after `RESERVATION_TTL_MS`.
 *  6. Uses on an unlimited plan are recorded without a period, purely so the
 *     result stays replayable after a downgrade. They never count against a
 *     later Free allowance.
 */

import {
  ALLOWANCE_PERIOD_DAYS,
  evaluateFeature,
  type FeatureAccess,
  type FeatureKey,
  type TierId,
} from "./tiers";

export const DAY_MS = 86_400_000;
export const ALLOWANCE_PERIOD_MS = ALLOWANCE_PERIOD_DAYS * DAY_MS;

/** How long an unconfirmed reservation holds capacity. Longer than any tool
 *  call we make (the cover-letter request times out well before this). */
export const RESERVATION_TTL_MS = 10 * 60_000;

/**
 * How long a browser-local workflow (LinkedIn, essay) stays open once granted.
 *
 * Those tools never send us their text, so the server cannot tell one essay
 * from the next. The workflow boundary is therefore time: one granted session
 * is open for this long, across reloads and revisions, and then closes.
 */
export const BROWSER_WORKFLOW_MS = 72 * 3_600_000;

/** Features metered by `allowance.ts`. Kept here, not in the schema, so the
 *  database stores the feature key as plain text and this list stays the one
 *  definition. */
export const ALLOWANCE_FEATURES = [
  "resume_critique",
  "cover_letter",
  "github_tools",
  "linkedin_tools",
  "essay_reviewer",
] as const satisfies readonly FeatureKey[];
export type AllowanceFeature = (typeof ALLOWANCE_FEATURES)[number];

export function isAllowanceFeature(v: string): v is AllowanceFeature {
  return (ALLOWANCE_FEATURES as readonly string[]).includes(v);
}

export interface GrantRow {
  id: string;
  key: string;
  /** Null for a use on an unlimited plan: replayable, never metered. */
  periodStart: Date | null;
  grantedAt: Date;
  /** Null when the earned result never expires (most tools). */
  expiresAt: Date | null;
  status: "reserved" | "granted";
}

/** A row that still means something at `now`. */
function live(row: GrantRow, now: Date): boolean {
  if (row.status === "reserved") return now.getTime() - row.grantedAt.getTime() < RESERVATION_TTL_MS;
  return true;
}

export interface Period {
  start: Date;
  renewsAt: Date;
  used: number;
}

/** The period in force at `now`, or null when the allowance is fully available. */
export function currentPeriod(rows: readonly GrantRow[], now: Date): Period | null {
  let start: Date | null = null;
  for (const r of rows) {
    if (r.periodStart === null || !live(r, now)) continue;
    if (start === null || r.periodStart.getTime() > start.getTime()) start = r.periodStart;
  }
  if (start === null) return null;
  const renewsAt = new Date(start.getTime() + ALLOWANCE_PERIOD_MS);
  // Renewal is inclusive: at exactly renewsAt the allowance is available again.
  if (now.getTime() >= renewsAt.getTime()) return null;
  const used = rows.filter(
    (r) => r.periodStart !== null && r.periodStart.getTime() === start!.getTime() && live(r, now),
  ).length;
  return { start, renewsAt, used };
}

/** An earned result for any of these keys, still open at `now`. */
export function findReplay(rows: readonly GrantRow[], keys: readonly string[], now: Date): GrantRow | null {
  const wanted = new Set(keys);
  for (const r of rows) {
    if (r.status !== "granted" || !wanted.has(r.key)) continue;
    if (r.expiresAt !== null && r.expiresAt.getTime() <= now.getTime()) continue;
    return r;
  }
  return null;
}

/** A use of the same key that is reserved right now — a double submit. */
function findInFlight(rows: readonly GrantRow[], keys: readonly string[], now: Date): GrantRow | null {
  const wanted = new Set(keys);
  return rows.find((r) => r.status === "reserved" && wanted.has(r.key) && live(r, now)) ?? null;
}

export interface AllowanceStatus {
  access: FeatureAccess;
  /** When the allowance becomes available again; null when it already is, or
   *  the plan is unlimited. */
  renewsAt: Date | null;
}

/** What a viewer may do with this tool at `now`, ignoring any particular key. */
export function allowanceStatus(
  tier: TierId,
  feature: AllowanceFeature,
  rows: readonly GrantRow[],
  now: Date,
): AllowanceStatus {
  const period = currentPeriod(rows, now);
  const access = evaluateFeature(tier, feature, period?.used ?? 0);
  return {
    access,
    renewsAt: access.unlimited || access.usable ? null : period?.renewsAt ?? null,
  };
}

export type AllowanceDecision =
  /** The same input was already earned — show it, charge nothing. */
  | { kind: "replay"; grant: GrantRow; status: AllowanceStatus }
  /** Another request for the same input is running right now. */
  | { kind: "in_flight"; status: AllowanceStatus }
  /** A new use may proceed; reserve it with this period start (null = unmetered). */
  | { kind: "new"; periodStart: Date | null; status: AllowanceStatus }
  /** Not available: limit reached, not included, or not built. */
  | { kind: "blocked"; status: AllowanceStatus };

/**
 * Decide one request.
 *
 * `keys[0]` is the key a new grant is recorded under; any further keys are
 * aliases that also count as a replay (e.g. a pre-migration resume id).
 */
export function decide(
  tier: TierId,
  feature: AllowanceFeature,
  rows: readonly GrantRow[],
  keys: readonly string[],
  now: Date,
): AllowanceDecision {
  const status = allowanceStatus(tier, feature, rows, now);
  if (status.access.reason === "coming_soon" || status.access.reason === "not_included") {
    return { kind: "blocked", status };
  }

  const replay = findReplay(rows, keys, now);
  if (replay) return { kind: "replay", grant: replay, status };
  if (findInFlight(rows, keys, now)) return { kind: "in_flight", status };

  if (status.access.unlimited) return { kind: "new", periodStart: null, status };
  if (!status.access.usable) return { kind: "blocked", status };

  // Inside an existing period the new use joins it; otherwise it starts one.
  const period = currentPeriod(rows, now);
  return { kind: "new", periodStart: period?.start ?? now, status };
}

/**
 * The access a caller should render after a successful new use.
 *
 * `usable` answers "may THIS call proceed" (it did), while `remaining` reports
 * what is left afterwards — the distinction the old lifetime counter got wrong
 * once, rendering an upgrade wall over the first free run.
 */
export function accessAfterUse(status: AllowanceStatus): FeatureAccess {
  const a = status.access;
  if (a.unlimited || a.remaining === null) return a;
  return { ...a, usable: true, reason: "ok", remaining: Math.max(a.remaining - 1, 0) };
}

/** "renews Dec 3" — the date a student can plan around. */
export function formatRenewal(renewsAt: Date): string {
  return renewsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
