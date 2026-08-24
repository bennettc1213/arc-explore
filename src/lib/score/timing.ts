/**
 * Timing score — how much applying *now* beats applying later.
 *
 * Deliberately separate from fit. Fit answers "is this right for me"; timing
 * answers "will acting now still matter". They are shown as two numbers
 * because collapsing them hides the reason a stale perfect-fit role ranks low.
 *
 * ── WHY THIS WAS REWRITTEN ──────────────────────────────────────────────────
 *
 * The first version anchored everything on `firstSeenAt` — the moment WE first
 * observed the posting — with a stated deadline only mattering inside 72
 * hours. Measured against the live corpus (3,788 open rows) that produced
 * **four distinct scores, with 97.5% of the corpus sitting on 53 or 54.**
 *
 * The cause is structural, not a tuning problem. `firstSeenAt` is a fact about
 * *our ingest*, and this corpus was bulk-ingested across three days, so the
 * variable the whole score hung on barely varied. Meanwhile two genuinely
 * discriminating facts were being thrown away: `postedAt`, present on 50.4% of
 * open rows, was ignored outright, and of the 288 rows carrying a real
 * deadline only 2 were inside the 72-hour window, so 286 got no benefit at all
 * from having one. A scholarship closing in three weeks scored the same as one
 * closing in three years.
 *
 * ── WHAT IT USES NOW, AND HOW MUCH EACH IS TRUSTED ──────────────────────────
 *
 * Two independent pressures, and the score is the STRONGER of the two rather
 * than their average. Both are reasons to act now, and averaging them is
 * wrong: a posting closing in 48 hours is urgent even if it was first listed
 * two years ago, and blending that urgency with its age would report a
 * comfortable middle for something about to disappear.
 *
 *   1. DEADLINE PRESSURE — the employer/sponsor published a closing date.
 *      The most decision-relevant timing fact there is, and now a continuous
 *      curve rather than a cliff.
 *   2. FRESHNESS PRESSURE — how long the posting has been open to applicants,
 *      because an early application is read by a human rather than landing on
 *      a pile of four hundred.
 *
 * Then one damper: VERIFICATION STALENESS. If we have not re-observed the
 * posting recently we are less sure it is open at all, so the urgency of
 * acting on it is scaled back. It scales rather than replaces, so it cannot
 * flatten the distribution the way the old anchor did.
 *
 * ── THE postedAt PLAUSIBILITY BOUND, WHICH IS THE INTERESTING PART ──────────
 *
 * `postedAt` cannot simply be trusted, and the live corpus says exactly why:
 * a still-open "User Interface Designer (Entry level)" carries
 * **2012-02-29**, Lever's rows average 588 days old, and 304 open rows claim
 * to have been posted over a year ago. Employers reuse and repost
 * requisitions, so an ancient date means "this req id is old", not "this
 * vacancy is fourteen years old".
 *
 * So beyond `POSTED_PLAUSIBLE_DAYS` the field is treated as **unknown, not as
 * evidence of staleness** — precisely the rule the Fit Score already follows,
 * because scoring a reposted requisition as ancient would invent a fact the
 * employer never stated. Inside the bound it is believed and preferred over
 * `firstSeenAt`, since "when applications opened" beats "when our crawler
 * arrived". The corpus supports believing it there: `postedAt` is never in the
 * future and never later than `firstSeenAt` on any of the 1,909 rows that
 * carry one.
 *
 * Scholarship sources publish no posting date at all (scholarships.com, UNL
 * and UNR are 0% covered), so for those rows freshness necessarily falls back
 * to `firstSeenAt` and says so.
 */

import { NEUTRAL_PRIOR } from "./fit";

export interface TimingInput {
  /** When our pipeline first saw this posting. */
  firstSeenAt: Date;
  /** Last poll in which the board still listed it. */
  lastSeenAt: Date;
  /** Set when it vanished from the board. */
  closedAt?: Date | null;
  /** Employer-stated deadline, when published. */
  deadlineAt?: Date | null;
  /**
   * Employer-stated posting date, when published.
   *
   * Believed only inside `POSTED_PLAUSIBLE_DAYS` — see the module comment.
   */
  postedAt?: Date | null;
  now?: Date;
}

/** Which evidence a timing score actually rests on. */
export type TimingSignal = "deadline" | "posted" | "first_seen" | "verification";

export interface TimingReason {
  signal: TimingSignal;
  /** Short chip text, e.g. "closes in 6 days". */
  label: string;
  /** One-line explanation, same contract as `ScoreReason.detail`. */
  detail: string;
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
  /**
   * Whether the posting opened to applicants recently — the "new today"
   * badge's real question, now answered from `postedAt` where we have a
   * believable one and `firstSeenAt` otherwise.
   */
  ageDays: number | null;
  /** Which of the two age sources `ageDays` came from. */
  ageBasis: "posted" | "first_seen";
  /** Whole days until the stated deadline; null when none is stated. */
  daysUntilDeadline: number | null;
  /**
   * How many of the score's inputs were actually available, out of how many
   * exist. Same contract as `FitResult.knownDimensions` — a score resting on
   * one signal must not look as confident as one resting on three.
   */
  knownSignals: number;
  totalSignals: number;
  reasons: TimingReason[];
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Past this, a stated posting date is treated as unknown rather than as an
 * old posting. Set from the live corpus: believable dates cluster inside a
 * few months, while the tail runs back to 2012 on roles that are demonstrably
 * open, which is reposted-requisition noise rather than age.
 */
export const POSTED_PLAUSIBLE_DAYS = 365;

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
 * Whole UTC calendar days between two moments.
 *
 * Calendar days, not elapsed hours — the same correction the deadline
 * reminders needed. A deadline stored at midnight on the 15th, read late on
 * the 14th, is "tomorrow" to a person and 0.4 elapsed days to a subtraction;
 * reporting the second produced a subject line saying "closes today" above a
 * body saying "Closes: 2026-08-15". These are dates, and the midnight is an
 * artifact of parsing them.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / DAY);
}

/**
 * Deadline pressure, as a continuous curve.
 *
 * Logarithmic rather than linear: the difference between "closes in 2 days"
 * and "closes in 9 days" changes what a student does this evening, while the
 * difference between 200 and 207 days changes nothing. A linear ramp spends
 * most of its range on the part nobody acts on.
 */
function deadlinePressure(daysLeft: number): number {
  if (daysLeft <= 2) return 100;
  return Math.round(Math.min(100, Math.max(20, 100 - 15 * Math.log(daysLeft / 2))));
}

/**
 * Freshness pressure — how much of the applicant pile is already ahead of you.
 *
 * Same shape and the same reasoning: day 1 versus day 8 is the difference
 * between being read and being screened, day 200 versus day 207 is not.
 */
function freshnessPressure(ageDays: number): number {
  if (ageDays <= 1) return 100;
  return Math.round(Math.min(100, Math.max(20, 100 - 16 * Math.log(ageDays))));
}

/**
 * How much to trust that this is still open, from how recently we re-observed
 * it.
 *
 * A multiplier rather than a subtraction, so it scales the distribution
 * instead of compressing it — the failure the old anchor had. Deliberately
 * gentle: `closedAt` and the link checker are the real signals that something
 * is gone, and this only reflects that a posting we have not looked at in a
 * fortnight is a slightly weaker call to action than one confirmed an hour
 * ago.
 */
function verificationFactor(daysSinceSeen: number): number {
  if (daysSinceSeen <= 2) return 1;
  if (daysSinceSeen >= 21) return 0.8;
  return 1 - (0.2 * (daysSinceSeen - 2)) / 19;
}

/**
 * Score urgency.
 *
 * Returns the stronger of the two pressures, damped by how recently we last
 * confirmed the posting exists. A closed posting is 0 and says so; everything
 * else reports which signals it could actually read.
 */
export function scoreTiming(input: TimingInput): TimingResult {
  const now = input.now ?? new Date();
  const hours = Math.max(0, (now.getTime() - input.firstSeenAt.getTime()) / HOUR);
  const isClosed = Boolean(input.closedAt);

  const liveness = isClosed
    ? `closed ${humanAgo(now.getTime() - input.closedAt!.getTime())}`
    : `confirmed live ${humanAgo(now.getTime() - input.lastSeenAt.getTime())}`;

  /*
   * The posting date is believed only inside the plausibility bound. Outside
   * it, `postedAt` is discarded and freshness falls back to `firstSeenAt`,
   * which is a weaker claim we can actually stand behind, rather than
   * reporting a 2012 date as a fourteen-year-old vacancy.
   */
  const postedDays = input.postedAt ? calendarDaysBetween(input.postedAt, now) : null;
  const postedIsPlausible =
    postedDays !== null && postedDays >= 0 && postedDays <= POSTED_PLAUSIBLE_DAYS;

  const firstSeenDays = calendarDaysBetween(input.firstSeenAt, now);
  const ageDays = postedIsPlausible ? postedDays! : firstSeenDays;
  const ageBasis: "posted" | "first_seen" = postedIsPlausible ? "posted" : "first_seen";

  const daysUntilDeadline = input.deadlineAt
    ? calendarDaysBetween(now, input.deadlineAt)
    : null;

  const daysSinceSeen = calendarDaysBetween(input.lastSeenAt, now);
  const reasons: TimingReason[] = [];

  if (isClosed) {
    return {
      score: 0,
      label: "closed",
      liveness,
      hoursSinceFirstSeen: hours,
      isClosed,
      ageDays,
      ageBasis,
      daysUntilDeadline,
      knownSignals: 0,
      totalSignals: 3,
      reasons: [
        {
          signal: "verification",
          label: "closed",
          detail: "This is no longer listed on the source we poll.",
        },
      ],
    };
  }

  if (daysUntilDeadline !== null && daysUntilDeadline < 0) {
    return {
      score: 0,
      label: "deadline passed",
      liveness,
      hoursSinceFirstSeen: hours,
      isClosed,
      ageDays,
      ageBasis,
      daysUntilDeadline,
      knownSignals: 1,
      totalSignals: 3,
      reasons: [
        {
          signal: "deadline",
          label: "deadline passed",
          detail: `The stated deadline was ${-daysUntilDeadline} day(s) ago.`,
        },
      ],
    };
  }

  /* --- the two pressures --- */

  let deadlineScore: number | null = null;
  if (daysUntilDeadline !== null) {
    deadlineScore = deadlinePressure(daysUntilDeadline);
    reasons.push({
      signal: "deadline",
      label:
        daysUntilDeadline === 0
          ? "closes today"
          : daysUntilDeadline === 1
            ? "closes tomorrow"
            : `closes in ${daysUntilDeadline} days`,
      detail: `The source states a deadline ${daysUntilDeadline} day(s) out.`,
    });
  }

  const freshnessScore = freshnessPressure(Math.max(0, ageDays));
  reasons.push(
    ageBasis === "posted"
      ? {
          signal: "posted",
          label: ageDays <= 1 ? "posted today" : `posted ${ageDays}d ago`,
          detail: `The employer states this was posted ${ageDays} day(s) ago.`,
        }
      : {
          signal: "first_seen",
          label: ageDays <= 1 ? "first seen today" : `first seen ${ageDays}d ago`,
          detail:
            input.postedAt
              ? `The source states a posting date we do not believe (over ${POSTED_PLAUSIBLE_DAYS} days old on an open listing, which is usually a reused requisition), so this counts from when we first saw it — ${ageDays} day(s) ago.`
              : `This source publishes no posting date, so this counts from when we first saw it — ${ageDays} day(s) ago.`,
        },
  );

  // The stronger of the two, not their average — see the module comment.
  const base = deadlineScore === null ? freshnessScore : Math.max(deadlineScore, freshnessScore);

  const factor = verificationFactor(daysSinceSeen);
  reasons.push({
    signal: "verification",
    label:
      daysSinceSeen <= 0
        ? "checked today"
        : daysSinceSeen === 1
          ? "checked yesterday"
          : `checked ${daysSinceSeen}d ago`,
    detail:
      factor < 1
        ? `We have not re-confirmed this listing in ${daysSinceSeen} days, so it is a slightly weaker call to action.`
        : "We re-confirmed this listing on the source within the last two days.",
  });

  const score = Math.round(Math.min(100, Math.max(1, base * factor)));

  /* --- the label, chosen from the strongest true statement --- */

  /*
   * "NEW" MEANS NEW, AND ONLY THE EMPLOYER CAN TELL US THAT.
   *
   * The label only says "new" when it rests on a believable `postedAt`. On
   * the `first_seen` fallback it says "found", because that is the fact we
   * actually hold — the same rule the saved-search alerts follow, where new
   * means *new to us* and the email says so. The old version called a row
   * "new today" on the strength of our own crawler arriving, which on a
   * bulk-ingested corpus labelled 2,080 simultaneously-imported rows as new
   * on the same day.
   */
  let label: string;
  if (daysUntilDeadline !== null && daysUntilDeadline <= 7) {
    label =
      daysUntilDeadline === 0
        ? "closes today"
        : daysUntilDeadline === 1
          ? "closes tomorrow"
          : `closes in ${daysUntilDeadline} days`;
  } else if (ageBasis === "posted" && ageDays <= 0) {
    label = "posted today";
  } else if (ageBasis === "posted" && ageDays === 1) {
    label = "posted yesterday";
  } else if (ageBasis === "posted" && ageDays <= 7) {
    label = "posted this week";
  } else if (ageBasis === "first_seen" && ageDays <= 0) {
    label = "found today";
  } else if (ageBasis === "first_seen" && ageDays === 1) {
    label = "found yesterday";
  } else if (daysUntilDeadline !== null && daysUntilDeadline <= 30) {
    label = `closes in ${daysUntilDeadline} days`;
  } else if (ageDays <= 30) {
    label = "still open";
  } else {
    label = "long-listed";
  }

  /*
   * WHAT THE MARKER COUNTS IS WHAT WE COULD READ, NOT WHAT SCORED WELL.
   *
   * `FitResult.knownDimensions` counts dimensions that contributed, not
   * dimensions that came out favourably, and this follows it. Verification is
   * therefore always known — `lastSeenAt` is never absent, and a listing we
   * checked three weeks ago is a *stale* reading, not a missing one. Getting
   * this wrong first time reported 1-of-3 on 3,777 of 3,788 rows, which is
   * not a confidence marker, it is a constant.
   */
  const knownSignals =
    (deadlineScore !== null ? 1 : 0) + (ageBasis === "posted" ? 1 : 0) + 1;

  return {
    score,
    label,
    liveness,
    hoursSinceFirstSeen: hours,
    isClosed,
    ageDays,
    ageBasis,
    daysUntilDeadline,
    // Never zero: freshness always contributes something, even when it falls
    // back to first_seen. Reported as at least 1 so the marker cannot read as
    // "we know nothing" on a score we did compute.
    knownSignals,
    totalSignals: 3,
    reasons,
  };
}

/* ------------------------------------------------------------------ *
 * Display helpers — what a student actually reads on a row
 * ------------------------------------------------------------------ */

/** "today" / "yesterday" / "Aug 14" — calendar-relative, never elapsed hours. */
export function relativeDayLabel(then: Date, now: Date): string {
  const days = calendarDaysBetween(then, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export interface TimingDisplay {
  /** "verified today" — what WE confirmed, never what we were told. */
  verified: string;
  /** "posted Aug 12", or null when no believable date exists. */
  posted: string | null;
  /** "closes in 6 days", or null when none is stated. */
  closes: string | null;
}

/**
 * The three date phrases a row shows.
 *
 * Split from `scoreTiming` because they are presentation, and kept honest
 * separately: `verified` is the only one that describes something we did, so
 * it is the only one phrased as our own claim. `posted` is attributed to the
 * employer and omitted entirely rather than guessed when we have no
 * believable date — an absent posting date is not "posted a long time ago".
 */
export function describeTiming(
  input: {
    lastSeenAt: Date;
    postedAt?: Date | null;
    deadlineAt?: Date | null;
    closedAt?: Date | null;
    freshnessTier?: "live_polled" | "periodic_check" | "unverified_static";
  },
  now: Date = new Date(),
): TimingDisplay {
  const verifiedWord = relativeDayLabel(input.lastSeenAt, now);

  // The tier distinction survives: only sub-hour ATS polling earns
  // "confirmed live". Everything else says what it actually is.
  const verified = input.closedAt
    ? `closed ${relativeDayLabel(input.closedAt, now)}`
    : input.freshnessTier === "live_polled"
      ? `confirmed live ${verifiedWord}`
      : input.freshnessTier === "unverified_static"
        ? `imported ${verifiedWord}, not re-checked`
        : `checked ${verifiedWord}`;

  const postedDays = input.postedAt ? calendarDaysBetween(input.postedAt, now) : null;
  const posted =
    postedDays !== null && postedDays >= 0 && postedDays <= POSTED_PLAUSIBLE_DAYS
      ? `posted ${relativeDayLabel(input.postedAt!, now)}`
      : null;

  let closes: string | null = null;
  if (input.deadlineAt) {
    const d = calendarDaysBetween(now, input.deadlineAt);
    closes =
      d < 0
        ? "deadline passed"
        : d === 0
          ? "closes today"
          : d === 1
            ? "closes tomorrow"
            : `closes in ${d} days`;
  }

  return { verified, posted, closes };
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

/**
 * The timing number to *sort* by. Never the number to show.
 *
 * Exactly the transformation `rankingScore` applies to fit, and for exactly
 * the same reason: unknown signals are dropped rather than penalised, so a row
 * whose timing rests on 1 of 3 signals can score as high as one resting on all
 * 3. Sorting on the displayed number would push the postings we understand
 * *least* to the top — the bug that ranking bit for fit, and it would bite
 * identically here.
 *
 * Shrinks toward the same `NEUTRAL_PRIOR` fit shrinks toward, deliberately.
 * The two are blended against each other in the feed's ranking, and two scales
 * pulling toward two different neutrals would not add up to anything.
 *
 * The displayed score and its `N of M` marker are left alone.
 */
export function rankingTiming(timing: TimingResult): number {
  if (timing.totalSignals === 0) return timing.score;

  const confidence = timing.knownSignals / timing.totalSignals;
  return timing.score * confidence + NEUTRAL_PRIOR * (1 - confidence);
}
