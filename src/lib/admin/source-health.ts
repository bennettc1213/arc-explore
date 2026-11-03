/**
 * Is each source we read from actually working?
 *
 * Pure: no database import, so the rules are testable with a fixed clock. The
 * store (`sources-store.ts`) gathers the facts; this decides what they mean.
 *
 * HEALTH IS JUDGED FROM WHAT A RUN DID, NEVER FROM `ingest_runs.status`.
 * Measured 2026-11-03: a scholarship run that failed outright because
 * `PARSE_API_KEY` was unset, read nothing and recorded one error is stored as
 * `successful_complete`, and so is a run that is still in progress (the column
 * defaults to it at insert). Trusting the label would paint both green. What a
 * run read, how many errors it hit and whether it finished are the evidence.
 */

export type SourceKind = "internship" | "scholarship";

export type SourceHealth = "healthy" | "degraded" | "failing" | "stale" | "never_run";

export interface SourceDefinition {
  /** `posting_sources.source` for the rows this source writes. */
  key: string;
  label: string;
  kind: SourceKind;
  /** How it is read, in plain words. */
  method: string;
  /** `ingest_runs.tier` its runs are recorded under. */
  runTier: string;
  /** `ingest_runs.source` to match, or null when one run covers a whole tier
   *  (every ATS family is polled in the same tier A run). */
  runSource: string | null;
  /** Older than this since the last finished run means the schedule stopped. */
  staleAfterHours: number;
  /** One line on the schedule it is meant to run on. */
  cadence: string;
}

/**
 * Every source the ingest scripts write today. Keys match what persist writes
 * to `posting_sources.source`; a key seen in the data but missing here still
 * gets a row on the page (see `classifySource` with no definition), so a new
 * adapter cannot go unwatched just because nobody added it to this list.
 */
export const SOURCE_CATALOGUE: readonly SourceDefinition[] = [
  ...(["greenhouse", "lever", "ashby", "smartrecruiters"] as const).map((key) => ({
    key,
    label: { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", smartrecruiters: "SmartRecruiters" }[key],
    kind: "internship" as const,
    method: "employer job boards, public API",
    runTier: "A",
    runSource: null,
    // Triggered every 20 minutes by n8n; three missed runs is a real outage.
    staleAfterHours: 1.5,
    cadence: "every 20 min",
  })),
  {
    key: "usajobs",
    label: "USAJobs",
    kind: "internship",
    method: "federal jobs API (key)",
    runTier: "usajobs",
    runSource: "usajobs",
    staleAfterHours: 30,
    cadence: "daily",
  },
  ...(
    [
      ["unl", "University of Nebraska–Lincoln", "university page scrape"],
      ["unr", "University of Nevada, Reno", "university page scrape"],
      ["iup", "Indiana University of Pennsylvania", "university page scrape"],
      ["cftexas", "Communities Foundation of Texas", "foundation portal scrape"],
      ["scholarshipscom", "Scholarships.com", "aggregator, via Parse (metered)"],
      ["scholarshipportal", "ScholarshipPortal", "aggregator, via Parse (metered)"],
    ] as const
  ).map(([key, label, method]) => ({
    key,
    label,
    kind: "scholarship" as const,
    method,
    runTier: "scholarships",
    runSource: key,
    // Weekly on Sundays; a day of slack for GitHub's scheduler.
    staleAfterHours: 8 * 24,
    cadence: "weekly",
  })),
];

export interface RunFacts {
  startedAt: Date;
  /** Null while the run is still going. */
  finishedAt: Date | null;
  postingsSeen: number;
  postingsNew: number;
  errors: number;
  /** `detail.error`, when the run recorded why it gave up. */
  errorMessage: string | null;
}

export interface BoardFacts {
  total: number;
  /** Five or more consecutive failed polls. */
  failing: number;
}

export interface SourceFacts {
  open: number;
  new24h: number;
  new7d: number;
  /** Latest finished run for this source. */
  lastRun: RunFacts | null;
  /** A run newer than `lastRun` that has not finished yet. */
  runningSince: Date | null;
  /** ATS families only. */
  boards: BoardFacts | null;
}

export interface SourceVerdict {
  health: SourceHealth;
  /** One sentence a person can act on. */
  reason: string;
}

/** Share of a family's boards failing before the family itself is degraded. */
export const BOARD_FAILURE_TOLERANCE = 0.25;

export function classifySource(
  def: Pick<SourceDefinition, "staleAfterHours"> | null,
  facts: SourceFacts,
  now: Date,
): SourceVerdict {
  const run = facts.lastRun;
  if (!run) {
    return facts.runningSince
      ? { health: "never_run", reason: "first run is in progress" }
      : { health: "never_run", reason: "no run has ever been recorded" };
  }

  // A failure outranks staleness: "stale" would send someone to the scheduler
  // when the actual problem is a missing key.
  if (run.errors > 0 && run.postingsSeen === 0) {
    return {
      health: "failing",
      reason: run.errorMessage ?? `last run read nothing and hit ${run.errors} error${run.errors === 1 ? "" : "s"}`,
    };
  }

  if (def) {
    const ageHours = (now.getTime() - run.startedAt.getTime()) / 3_600_000;
    if (ageHours > def.staleAfterHours) {
      return { health: "stale", reason: `last run was ${formatAge(run.startedAt, now)}; the schedule has stopped` };
    }
  }

  if (run.postingsSeen === 0) {
    return { health: "degraded", reason: "last run finished but read nothing" };
  }

  if (facts.open === 0) {
    return {
      health: "degraded",
      reason: `last run read ${run.postingsSeen} listings and none of them is open`,
    };
  }

  if (facts.boards && facts.boards.total > 0) {
    const share = facts.boards.failing / facts.boards.total;
    if (share > BOARD_FAILURE_TOLERANCE) {
      return {
        health: "degraded",
        reason: `${facts.boards.failing} of ${facts.boards.total} boards have failed 5+ polls in a row`,
      };
    }
  }

  if (run.errors > 0) {
    // Tier A runs always carry a few board errors (deleted boards, timeouts);
    // that is normal as long as the run still read listings.
    return {
      health: "healthy",
      reason: `read ${run.postingsSeen.toLocaleString("en-US")} listings; ${run.errors} board error${run.errors === 1 ? "" : "s"}`,
    };
  }

  return { health: "healthy", reason: `read ${run.postingsSeen.toLocaleString("en-US")} listings` };
}

/** "4 min ago", "3 h ago", "2 days ago". */
export function formatAge(then: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** New rows per day over the last week, to one decimal. */
export function perDay(new7d: number): number {
  return Math.round((new7d / 7) * 10) / 10;
}
