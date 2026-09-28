/**
 * Shared close/reopen lifecycle logic for every listing kind.
 *
 * The rules are the same for internships and scholarships because the product
 * makes the same promise for both: "we do not call a posting closed until we
 * have missed it on two consecutive successful complete polls." A single
 * absence is as flaky as a single 404 on an apply URL, and a failed or partial
 * poll is not evidence of anything.
 *
 * This module is pure: it takes the current stored rows and the set of hashes
 * seen on the latest poll, and returns the ids that must be updated. Database
 * writes live in the calling modules so this logic can be tested without a
 * Postgres connection.
 */

export const DEFAULT_MISSING_STRIKES_REQUIRED = 2;

/** One stored row as the lifecycle engine needs to see it. */
export interface LifecycleCandidate {
  id: string;
  canonicalHash: string;
  closedAt: Date | null;
  /** Consecutive absences already accumulated. */
  missingStrikes: number;
  /** When the first consecutive absence was observed, if any. */
  missingSince: Date | null;
}

export interface LifecycleOptions {
  /** Moment the current poll is happening. */
  now: Date;
  /**
   * True only when the poll completed successfully enough for absence to be
   * meaningful. Timeouts, network errors, 5xx, blocks/403, partial pagination,
   * parser failures, and validation failures must all be false.
   */
  successfulComplete: boolean;
  /**
   * If true, a completely empty seen set suppresses closes and miss advances.
   * This is the "empty scrape" guard: a page that returned nothing parseable
   * probably broke, so it should not retire every listing in one run.
   */
  suppressOnEmptySeen: boolean;
  /** Number of consecutive misses required before closing. Defaults to 2. */
  missingStrikesRequired: number;
}

export interface LifecyclePlan {
  /** Rows that have reached the miss threshold and must be closed. */
  toClose: LifecycleCandidate[];
  /** Rows that missed for the first time: bump the counter and stamp missingSince. */
  toIncrementMissing: LifecycleCandidate[];
  /** Rows that returned after a prior miss: clear the counter. */
  toResetMissing: LifecycleCandidate[];
  /** True when the close/miss step was suppressed by a failed or empty poll. */
  closeSuppressed: boolean;
}

const DEFAULTS: LifecycleOptions = {
  now: new Date(),
  successfulComplete: true,
  suppressOnEmptySeen: true,
  missingStrikesRequired: DEFAULT_MISSING_STRIKES_REQUIRED,
};

/**
 * Compute close/reopen/miss transitions for a set of stored candidates against
 * the hashes seen on the latest poll.
 *
 * Closed rows are never re-closed by this function. Reopening a closed row is
 * the caller's responsibility when a returned hash matches a closed row.
 */
export function computeLifecycleTransitions(
  candidates: LifecycleCandidate[],
  seenHashes: string[],
  opts: Partial<LifecycleOptions> = {},
): LifecyclePlan {
  const options = { ...DEFAULTS, ...opts };
  const plan: LifecyclePlan = {
    toClose: [],
    toIncrementMissing: [],
    toResetMissing: [],
    closeSuppressed: false,
  };

  if (!options.successfulComplete) {
    plan.closeSuppressed = true;
    return plan;
  }

  if (options.suppressOnEmptySeen && seenHashes.length === 0) {
    plan.closeSuppressed = true;
    return plan;
  }

  const seen = new Set(seenHashes);

  for (const c of candidates) {
    if (c.closedAt) continue; // already closed; only reopen can touch it

    if (seen.has(c.canonicalHash)) {
      if (c.missingStrikes > 0) {
        plan.toResetMissing.push(c);
      }
      continue;
    }

    const nextStrikes = c.missingStrikes + 1;
    if (nextStrikes >= options.missingStrikesRequired) {
      plan.toClose.push(c);
    } else {
      plan.toIncrementMissing.push(c);
    }
  }

  return plan;
}

/**
 * The `closed_at` value for a row that is closing now.
 *
 * It must be the first-miss time, not the current poll time, so a listing that
 * dropped off the board a week ago does not read as having closed today.
 */
export function closingTimestamp(candidate: LifecycleCandidate, now: Date): Date {
  return candidate.missingSince ?? now;
}
