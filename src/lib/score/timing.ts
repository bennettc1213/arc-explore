/**
 * Timing score — how urgent is this, right now.
 *
 * Deliberately separate from fit. Fit answers "is this right for me"; timing
 * answers "will applying now still matter". They are shown as two numbers
 * because collapsing them hides the reason a stale perfect-fit role ranks low.
 *
 * Anchored on `firstSeenAt` — the moment WE first observed the posting on the
 * employer's own board — rather than the employer-stated `postedAt`. Measured
 * on live Greenhouse data, `first_published` is frequently years old on roles
 * that are actively open (a 2023 date on a Summer 2027 internship), because
 * employers reuse and repost requisitions. Our own observation is the honest
 * signal, and it is the one we can actually vouch for.
 */

export interface TimingInput {
  /** When our pipeline first saw this posting. */
  firstSeenAt: Date;
  /** Last poll in which the board still listed it. */
  lastSeenAt: Date;
  /** Set when it vanished from the board. */
  closedAt?: Date | null;
  /** Employer-stated deadline, when published. */
  deadlineAt?: Date | null;
  now?: Date;
}

export interface TimingResult {
  /** 0–100. Higher means acting now matters more. */
  score: number;
  /** Short human label, e.g. "new today". */
  label: string;
  /** Freshness phrasing for the UI, e.g. "confirmed live 6m ago". */
  liveness: string;
  hoursSinceFirstSeen: number;
  isClosed: boolean;
}

const HOUR = 3_600_000;

function humanAgo(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Score urgency.
 *
 * The curve is steep in the first 48 hours because that is when an application
 * is most likely to be read by a human rather than landing in a pile of
 * several hundred.
 */
export function scoreTiming(input: TimingInput): TimingResult {
  const now = input.now ?? new Date();
  const hours = Math.max(0, (now.getTime() - input.firstSeenAt.getTime()) / HOUR);
  const isClosed = Boolean(input.closedAt);

  const liveness = isClosed
    ? `closed ${humanAgo(now.getTime() - input.closedAt!.getTime())}`
    : `confirmed live ${humanAgo(now.getTime() - input.lastSeenAt.getTime())}`;

  if (isClosed) {
    return { score: 0, label: "closed", liveness, hoursSinceFirstSeen: hours, isClosed };
  }

  // A stated deadline overrides age — an old posting closing tomorrow is
  // urgent regardless of when it appeared.
  if (input.deadlineAt) {
    const hoursLeft = (input.deadlineAt.getTime() - now.getTime()) / HOUR;
    if (hoursLeft <= 0) {
      return { score: 0, label: "deadline passed", liveness, hoursSinceFirstSeen: hours, isClosed };
    }
    if (hoursLeft < 72) {
      return { score: 100, label: "closes soon", liveness, hoursSinceFirstSeen: hours, isClosed };
    }
  }

  let score: number;
  let label: string;

  if (hours < 24) {
    score = 100;
    label = "new today";
  } else if (hours < 48) {
    score = 90;
    label = "new this week";
  } else if (hours < 168) {
    // 2–7 days: 85 down to 60
    score = Math.round(85 - ((hours - 48) / 120) * 25);
    label = "new this week";
  } else if (hours < 720) {
    // 1–4 weeks: 55 down to 30
    score = Math.round(55 - ((hours - 168) / 552) * 25);
    label = "still open";
  } else {
    // Beyond a month, floor at 15 — still open, just not urgent.
    score = Math.max(15, Math.round(30 - (hours - 720) / 240));
    label = "long-listed";
  }

  return { score, label, liveness, hoursSinceFirstSeen: hours, isClosed };
}
