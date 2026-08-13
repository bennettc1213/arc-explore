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

import { mapLimit } from "./http";
import { orgsDueForPoll, upsertOrg } from "./persist";
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
  orgsPolled: number;
  orgsSkippedForTime: number;
  notModified: number;
  postingsSeen: number;
  postingsNew: number;
  postingsClosed: number;
  postingsReopened: number;
  closeSuppressed: number;
  errors: number;
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
  let postingsClosed = 0;
  let postingsReopened = 0;
  let closeSuppressed = 0;
  let errors = 0;
  const errorSamples: string[] = [];

  await mapLimit(due, concurrency, async (org) => {
    if (Date.now() - startedAt > budgetMs) {
      orgsSkippedForTime++;
      return;
    }

    const res = await pollOrg({
      id: org.id,
      name: org.name,
      atsType: org.atsType,
      atsSlug: org.atsSlug,
      etag: org.etag,
    });

    if (!res.ok) {
      errors++;
      // A handful of samples, not every failure — the row is for diagnosis,
      // not a log dump.
      if (errorSamples.length < 10) errorSamples.push(`${org.name}: ${res.error}`);
      return;
    }

    orgsPolled++;
    const o = res.outcome;
    if (o.notModified) notModified++;
    postingsSeen += o.totalOnBoard;
    postingsNew += o.inserted;
    postingsClosed += o.closed;
    postingsReopened += o.reopened;
    if (o.closeSuppressed) closeSuppressed++;
  });

  // Runs on its own cadence: once ETags are warm most boards answer 304, so a
  // posting that missed enrichment on its first pass would otherwise never get
  // a description — leaving its work-auth permanently unknown.
  const backfill = await backfillDescriptions(backfillLimit);

  const result: TierAResult = {
    runId,
    orgsPolled,
    orgsSkippedForTime,
    notModified,
    postingsSeen,
    postingsNew,
    postingsClosed,
    postingsReopened,
    closeSuppressed,
    errors,
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
    detail: {
      due: due.length,
      orgsSkippedForTime,
      notModified,
      postingsReopened,
      closeSuppressed,
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
    detail: {
      recordsScanned: result.recordsScanned,
      companiesFound: result.companiesFound,
      pollable: result.pollable,
      created,
      alreadyKnown,
      skippedForCap,
      byAts: result.byAts,
      durationMs: result.durationMs,
    },
  });

  return result;
}
