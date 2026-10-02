/**
 * The scheduled ingestion runs.
 *
 * Two shapes, matching the two workflows:
 *
 *  - **Tier A (fast, every 20 min)** — poll each registered company's own ATS.
 *    This is the freshness engine. A posting present in the response is
 *    verifiably live right now; one that has vanished gets `closedAt` set. That
 *    second half only works because this runs *repeatedly* — a single poll can
 *    never close anything, because closure is defined by absence from a later
 *    response.
 *
 *  - **Tier B (daily)** — read the Simplify repo for company names only and
 *    enroll them in the registry, where Tier A takes over. No listing content
 *    is stored: that repo carries no license, and its data measured 50% stale
 *    on postings older than 30 days, so routing around it is both cleaner
 *    legally and better data.
 */

import { deriveRunStatus, type RunStatus } from "@/db/schema";
import { mapLimit } from "./http";
import { orgsDueForPoll, upsertOrg, type PollOutcome } from "./persist";
import { backfillDescriptions, pollOrg } from "./poll";
import { finishRun, startRun } from "./runs";
import { discoverOrgs } from "./sources/simplify";

/* ------------------------------------------------------------------ *
 * Tier A
 * ------------------------------------------------------------------ */

export interface TierAOptions {
  /**
   * Boards to poll this run.
   *
   * Sized to cover the entire registry every cycle, not to ration it. M1's
   * gate is that a new posting surfaces within 30 minutes; if this is smaller
   * than the registry, rotation stretches full coverage across several runs
   * and that gate quietly stops holding — at 250 against 820 boards, coverage
   * takes 55 minutes. Measured cost is ~50s per 240 boards at concurrency 6,
   * so covering everything is cheap. `budgetMs` is the real guard.
   */
  limit?: number;
  /** Parallel boards in flight. Low on purpose — we are a guest on these APIs. */
  concurrency?: number;
  /** Stop starting new boards after this long, so a slow upstream cannot let
   *  one run overlap the next. Work already started is allowed to finish. */
  budgetMs?: number;
  /**
   * Open postings to backfill JD text for after polling.
   *
   * Sized so a fresh SmartRecruiters intake converges over a few hours rather
   * than days — that source is the majority of the corpus and publishes no
   * description in its list payload, so until this runs, work authorization
   * and term are unknown for most of the feed.
   */
  backfillLimit?: number;
}

export interface TierAResult {
  runId: string;
  /** The four-way outcome, recorded on the run row itself. */
  status: RunStatus;
  orgsPolled: number;
  orgsSkippedForTime: number;
  notModified: number;
  postingsSeen: number;
  postingsNew: number;
  /** Known rows this poll rewrote. */
  postingsUpdated: number;
  /** Known rows this poll confirmed unchanged. */
  postingsUnchanged: number;
  postingsMissing1: number;
  postingsClosed: number;
  postingsReopened: number;
  /** Dropped by the early-career filter or minimum validation. */
  postingsRejected: number;
  closeSuppressed: number;
  /** Close suppressions by cause, so a run full of them is explainable. */
  suppressedByCause: Record<string, number>;
  errors: number;
  /** Boards read only partially. Counted separately from hard failures. */
  incomplete: number;
  errorSamples: string[];
  backfill: { attempted: number; enriched: number };
  durationMs: number;
}

export async function runTierA(opts: TierAOptions = {}): Promise<TierAResult> {
  const limit = opts.limit ?? 1200;
  const concurrency = opts.concurrency ?? 6;
  const budgetMs = opts.budgetMs ?? 10 * 60_000;
  const backfillLimit = opts.backfillLimit ?? 150;

  const startedAt = Date.now();
  const runId = await startRun("A", "ats-direct");

  const due = await orgsDueForPoll(limit);

  let orgsPolled = 0;
  let orgsSkippedForTime = 0;
  let notModified = 0;
  let postingsSeen = 0;
  let postingsNew = 0;
  let postingsUpdated = 0;
  let postingsUnchanged = 0;
  let postingsMissing1 = 0;
  let postingsClosed = 0;
  let postingsReopened = 0;
  let postingsRejected = 0;
  let closeSuppressed = 0;
  let errors = 0;
  let incomplete = 0;
  const suppressedByCause: Record<string, number> = {};
  const errorSamples: string[] = [];

  /** Fold one board's outcome into the run totals. */
  const accumulate = (o: PollOutcome) => {
    postingsSeen += o.totalOnBoard;
    postingsNew += o.inserted;
    postingsUpdated += o.updated;
    postingsUnchanged += o.unchanged;
    postingsMissing1 += o.missing1;
    postingsClosed += o.closed;
    postingsReopened += o.reopened;
    postingsRejected += o.rejected;
    if (o.closeSuppressed) {
      closeSuppressed++;
      const cause = o.closeSuppressedReason ?? "unknown";
      suppressedByCause[cause] = (suppressedByCause[cause] ?? 0) + 1;
    }
  };

  await mapLimit(due, concurrency, async (org) => {
    if (Date.now() - startedAt > budgetMs) {
      orgsSkippedForTime++;
      return;
    }

    // `runId` makes this poll idempotent. A CI retry, an overlapping cycle, or
    // a manual re-poll would otherwise re-apply the same absence and close
    // listings that only went missing once.
    const res = await pollOrg(
      {
        id: org.id,
        name: org.name,
        atsType: org.atsType,
        atsSlug: org.atsSlug,
        etag: org.etag,
      },
      { runId },
    );

    if (!res.ok) {
      errors++;
      // A partial read is counted apart from a hard failure: the two mean
      // different things and an operator debugging a stale board needs to know
      // which one it was.
      if (res.incomplete) incomplete++;
      // A partial read still persisted the rows it did fetch. Crediting them
      // here is the difference between "this poll did nothing" and "this poll
      // did half the work and we know why".
      if (res.outcome) accumulate(res.outcome);
      // A handful of samples, not every failure — the row is for diagnosis,
      // not a log dump.
      if (errorSamples.length < 10) errorSamples.push(`${org.name}: ${res.error}`);
      return;
    }

    orgsPolled++;
    if (res.outcome.notModified) notModified++;
    accumulate(res.outcome);
  });

  /*
   * `changed` is what separates "the run worked and nothing moved" from "the run
   * did not work". A steady-state run — every board 304, or every row
   * unchanged — is the system doing exactly its job, and it must not be
   * reported as a failure or it will be alerted on every cycle.
   */
  const changed =
    postingsNew + postingsUpdated + postingsClosed + postingsReopened + postingsMissing1;

  const status = deriveRunStatus({
    attempted: due.length,
    succeeded: orgsPolled,
    changed,
  });

  // Runs on its own cadence: once ETags are warm most boards answer 304, so a
  // posting that missed enrichment on its first pass would otherwise never get
  // a description — leaving its work-auth permanently unknown.
  const backfill = await backfillDescriptions(backfillLimit);

  const result: TierAResult = {
    runId,
    status,
    orgsPolled,
    orgsSkippedForTime,
    notModified,
    postingsSeen,
    postingsNew,
    postingsUpdated,
    postingsUnchanged,
    postingsMissing1,
    postingsClosed,
    postingsReopened,
    postingsRejected,
    closeSuppressed,
    suppressedByCause,
    errors,
    incomplete,
    errorSamples,
    backfill,
    durationMs: Date.now() - startedAt,
  };

  await finishRun(runId, {
    orgsPolled,
    postingsSeen,
    postingsNew,
    postingsClosed,
    errors,
    status,
    detail: {
      due: due.length,
      orgsSkippedForTime,
      notModified,
      postingsUpdated,
      postingsUnchanged,
      postingsMissing1,
      postingsReopened,
      postingsRejected,
      closeSuppressed,
      suppressedByCause,
      incomplete,
      backfill,
      errorSamples,
      durationMs: result.durationMs,
    },
  });

  return result;
}

/* ------------------------------------------------------------------ *
 * Tier B
 * ------------------------------------------------------------------ */

export interface TierBOptions {
  /** Ceiling on new companies enrolled per run, so the registry grows at a
   *  pace Tier A's polling budget can actually keep up with. */
  maxNewOrgs?: number;
  /** Include companies whose listings are marked inactive. Their presence
   *  still tells us the company hires interns, which is all we take. */
  includeInactive?: boolean;
}

export interface TierBResult {
  runId: string;
  recordsScanned: number;
  companiesFound: number;
  pollable: number;
  created: number;
  alreadyKnown: number;
  skippedForCap: number;
  byAts: Record<string, number>;
  errors: number;
  durationMs: number;
}

export async function runTierB(opts: TierBOptions = {}): Promise<TierBResult> {
  const maxNewOrgs = opts.maxNewOrgs ?? 400;
  const startedAt = Date.now();
  const runId = await startRun("B", "simplify-discovery");

  const discovery = await discoverOrgs({ includeInactive: opts.includeInactive ?? true });

  // Only companies we can actually poll are worth a registry row; an unknown
  // ATS gives Tier A nothing to call.
  const pollable = discovery.orgs.filter((o) => o.atsType !== "unknown" && o.atsSlug);

  let created = 0;
  let alreadyKnown = 0;
  let skippedForCap = 0;
  let errors = 0;

  for (const org of pollable) {
    if (created >= maxNewOrgs) {
      skippedForCap++;
      continue;
    }
    try {
      const res = await upsertOrg(org);
      if (res.created) created++;
      else alreadyKnown++;
    } catch {
      errors++;
    }
  }

  const result: TierBResult = {
    runId,
    recordsScanned: discovery.recordsScanned,
    companiesFound: discovery.orgs.length,
    pollable: pollable.length,
    created,
    alreadyKnown,
    skippedForCap,
    byAts: discovery.byAts,
    errors,
    durationMs: Date.now() - startedAt,
  };

  await finishRun(runId, {
    // Discovery enrolls companies; it polls none and stores no listings.
    orgsPolled: 0,
    postingsSeen: 0,
    postingsNew: 0,
    postingsClosed: 0,
errors,
    // Discovery enrolls companies; it creates real state, so a run that added
    // nothing is `successful_no_changes` rather than a bare success. Reading the
    // repo is one atomic step — if it threw we never reach `finishRun` — so the
    // only partial state available here is "some inserts failed".
    status: deriveRunStatus({
      attempted: pollable.length,
      succeeded: pollable.length - errors,
      changed: created,
    }),
    detail: {
      recordsScanned: result.recordsScanned,
      companiesFound: result.companiesFound,
      pollable: result.pollable,
      created: result.created,
      alreadyKnown: result.alreadyKnown,
      skippedForCap: result.skippedForCap,
      byAts: result.byAts,
      durationMs: result.durationMs,
    },
  });

  return result;
}
