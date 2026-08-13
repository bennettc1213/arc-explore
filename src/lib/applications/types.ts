/**
 * The application tracker's status model.
 *
 * Free of database imports so the rules are unit-testable.
 *
 * Why this matters beyond the UI: `applications.outcome` is the only source of
 * ground truth this product will ever have about whether an application
 * actually worked. Every other signal — fit, timing, freshness — is a heuristic
 * we assert without evidence. Until this table has real rows, nothing here is
 * allowed to claim it predicts odds. The point of shipping it early is that
 * outcome data only accumulates from the moment it exists.
 */

import type { ApplicationStatus } from "@/db/schema";

export interface StatusMeta {
  value: ApplicationStatus;
  label: string;
  /** Ordering in the tracker — roughly the path through a real process. */
  rank: number;
  /**
   * A finished application. Terminal states are what a future odds model
   * trains on; everything else is still in flight and proves nothing yet.
   */
  terminal: boolean;
  /** True when the user has actually submitted something. */
  submitted: boolean;
}

export const STATUSES: readonly StatusMeta[] = [
  { value: "saved", label: "saved", rank: 0, terminal: false, submitted: false },
  { value: "applied", label: "applied", rank: 1, terminal: false, submitted: true },
  { value: "screen", label: "screen", rank: 2, terminal: false, submitted: true },
  { value: "interview", label: "interview", rank: 3, terminal: false, submitted: true },
  { value: "offer", label: "offer", rank: 4, terminal: true, submitted: true },
  { value: "rejected", label: "rejected", rank: 5, terminal: true, submitted: true },
  { value: "ghosted", label: "ghosted", rank: 6, terminal: true, submitted: true },
  { value: "withdrawn", label: "withdrawn", rank: 7, terminal: true, submitted: false },
];

const BY_VALUE = new Map(STATUSES.map((s) => [s.value, s]));

export function statusMeta(status: ApplicationStatus): StatusMeta {
  const meta = BY_VALUE.get(status);
  if (!meta) throw new Error(`unknown application status: ${status}`);
  return meta;
}

export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return typeof v === "string" && BY_VALUE.has(v as ApplicationStatus);
}

/**
 * Should moving to this status stamp `applied_at`?
 *
 * Stamped once, on the first status that implies a submission, and never
 * moved afterwards. "How long ago did I apply" has one answer; overwriting it
 * every time a process advances would silently rewrite the user's own history
 * — and corrupt the only timing evidence a future odds model would have.
 */
export function shouldStampAppliedAt(
  next: ApplicationStatus,
  existingAppliedAt: Date | null,
): boolean {
  if (existingAppliedAt !== null) return false;
  return statusMeta(next).submitted;
}

export interface TrackerCounts {
  total: number;
  active: number;
  submitted: number;
  offers: number;
  /** Terminal applications — the rows a v2 odds model could learn from. */
  resolved: number;
}

export function countByStatus(
  rows: readonly { status: ApplicationStatus }[],
): TrackerCounts {
  let active = 0;
  let submitted = 0;
  let offers = 0;
  let resolved = 0;

  for (const r of rows) {
    const m = statusMeta(r.status);
    if (m.terminal) resolved++;
    else active++;
    if (m.submitted) submitted++;
    if (r.status === "offer") offers++;
  }

  return { total: rows.length, active, submitted, offers, resolved };
}

/**
 * Response rate, or null when there is not enough data to state one.
 *
 * Deliberately returns null under a threshold instead of a number. One reply
 * out of two applications is not a 50% response rate, and rendering it as one
 * would be exactly the kind of confident-looking figure derived from nothing
 * that this product exists to avoid.
 */
export const MIN_FOR_RATE = 10;

export function responseRate(
  rows: readonly { status: ApplicationStatus }[],
): { rate: number; of: number } | null {
  const submitted = rows.filter((r) => statusMeta(r.status).submitted);
  if (submitted.length < MIN_FOR_RATE) return null;

  const responded = submitted.filter((r) => r.status !== "applied" && r.status !== "ghosted");
  return { rate: Math.round((responded.length / submitted.length) * 100), of: submitted.length };
}
