/**
 * Scholarship close-on-removal decision.
 *
 * Scholarships are scraped as full snapshots rather than polled like ATS
 * boards, but the close rule is the same: a row that has vanished from the
 * snapshot needs two consecutive successful misses before it is closed, and
 * `closed_at` is the first-miss time. A completely empty snapshot suppresses
 * all closes/misses because it almost always means the scrape broke.
 *
 * The actual database writes live in `src/lib/scholarships/persist.ts` so this
 * module stays pure and testable without a Postgres connection.
 */

import {
  computeLifecycleTransitions,
  closingTimestamp,
  type LifecycleCandidate,
  type LifecyclePlan,
} from "../lifecycle";

export type { LifecycleCandidate, LifecyclePlan };

/** One previously-recorded row, as the close decision needs to see it. */
export type CloseCandidate = LifecycleCandidate;

export interface ClosePlan {
  /** Rows that have reached the miss threshold and must be closed. */
  toClose: CloseCandidate[];
  /** Rows that missed for the first time: bump the counter and stamp missingSince. */
  toIncrementMissing: CloseCandidate[];
  /** Rows that returned after a prior miss: clear the counter. */
  toResetMissing: CloseCandidate[];
  /** True when the close step was suppressed by an empty snapshot. */
  closeSuppressed: boolean;
}

/**
 * Decide which previously-recorded postings this scrape closes.
 *
 * Returns a plan of ids to close / increment / reset. Never re-closes an
 * already-closed row, so `closed_at` is written exactly once.
 */
export function selectPostingsToClose(
  candidates: CloseCandidate[],
  seenHashes: string[],
  now = new Date(),
): ClosePlan {
  const lifecycle = computeLifecycleTransitions(candidates, seenHashes, {
    now,
    successfulComplete: true,
    suppressOnEmptySeen: true,
    missingStrikesRequired: 2,
  });

  return {
    toClose: lifecycle.toClose,
    toIncrementMissing: lifecycle.toIncrementMissing,
    toResetMissing: lifecycle.toResetMissing,
    closeSuppressed: lifecycle.closeSuppressed,
  };
}

export { closingTimestamp };
