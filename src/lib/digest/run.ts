import { getFeed } from "../feed";
import { getLatestResume, getProfile } from "../profile/store";
import { isProfileUsable } from "../profile/types";
import { toScoringProfile as toScoreProfile } from "../score/v2/profile";
import { TIMING_PRIORITY_POINTS, FIT_BUCKET_LABELS, bucketFitScore, evaluateFeature } from "../pricing/tiers";
import { alertingSearchIds } from "../searches/alerting";
import { skillsFromParsedResume } from "../score/skills";
import { listSearches } from "../searches/store";

import { composeDigest, sendDigest, type DigestItem } from "./email";
import {
  digestDue,
  pickDigestItems,
  subtractCovered,
  worthSending,
  MAX_DIGEST_ITEMS,
} from "./select";
import { digestCandidates, markDigested, type DigestCandidate } from "./store";

/**
 * The weekly digest job.
 *
 * DRY-RUN BY DEFAULT, like the reminders and the alerts and unlike every other
 * script here. A mistake in an ingest run is a row we fix; a mistake in this one
 * lands in somebody else's inbox and cannot be recalled.
 */

/**
 * How many new rows we rank before trimming.
 *
 * The digest is unfiltered, so a week's intake is the whole candidate pool.
 * This bounds what a single profile costs to plan; the cap on what is *sent* is
 * `MAX_DIGEST_ITEMS`, and the gap between the two is the ranking headroom that
 * makes the six actually the best six rather than the first six.
 */
const RANK_POOL = 400;

/**
 * The cap on the "already covered by an alert" lookup.
 *
 * Above the whole corpus on purpose. `getFeed` defaults to 500, and against
 * real data that default quietly cost us: a saved search over every scholarship
 * covered 237 of the 288 in the digest pool rather than all of them, because
 * the two queries rank different row sets and therefore break ties differently
 * at the 500 mark. Truncation here does not fail loudly — it just lets a
 * duplicate through into somebody's inbox, which is the exact thing this lookup
 * exists to prevent. Only ids are read, so the cost of asking for all of them
 * is a wider id set and nothing else.
 */
const COVERED_POOL = 10_000;

export interface DigestPlan {
  userId: string;
  email: string;
  displayName: string | null;
  items: DigestItem[];
  /** New rows seen, before the floor and the cap. */
  considered: number;
  /** Withheld because one of their notifying saved searches covers it. */
  coveredBySearches: number;
}

export type SkipReason =
  | "not_entitled"
  | "not_due"
  | "empty_profile"
  | "nothing_new"
  | "nothing_above_floor";

export interface DigestSummary {
  candidates: number;
  due: number;
  planned: number;
  sent: number;
  skipped: Record<SkipReason, number>;
  failed: Array<{ userId: string; error: string }>;
  plans: DigestPlan[];
}

/**
 * Postings this student's own saved-search alerts already report.
 *
 * Built by running their searches through the same `getFeed` the alert job
 * uses, rather than by re-implementing the filters here — one taxonomy, one
 * judgement, the rule `feed.ts` already follows for the category filter.
 *
 * THE WINDOW IS `max(search.createdAt, lastDigestAt)`, and both halves matter.
 * A saved search alerts on everything first seen after it was created: its
 * watermark starts at creation and only ever advances on a successful send, so
 * the union of everything it has reported plus everything it is about to report
 * is exactly "first seen since creation". Clamping that to the digest window
 * costs nothing — rows older than `lastDigestAt` are not digest candidates
 * anyway — and keeps the query bounded for a search saved months ago.
 */
async function coveredIds(
  candidate: DigestCandidate,
  scoreProfile: Parameters<typeof getFeed>[0],
): Promise<Set<string>> {
  // Only searches that actually alert on this plan cover anything: a Free
  // account's paused extras send nothing, so their rows must stay eligible
  // for the digest rather than being suppressed by an email that never goes.
  const all = await listSearches(candidate.userId);
  const alerting = alertingSearchIds(all, candidate.plan);
  const searches = all.filter((s) => alerting.has(s.id));
  const covered = new Set<string>();

  for (const search of searches) {
    const since =
      search.createdAt > candidate.lastDigestAt ? search.createdAt : candidate.lastDigestAt;
    const { items } = await getFeed(scoreProfile, {
      ...search.filters,
      newSince: since,
      limit: COVERED_POOL,
      timingPoints: TIMING_PRIORITY_POINTS[candidate.plan],
    });
    for (const item of items) covered.add(item.id);
  }

  return covered;
}

/** What would go out, and why anyone was skipped. */
export async function planDigests(
  candidates: DigestCandidate[],
  now: Date,
): Promise<{ plans: DigestPlan[]; skipped: Record<SkipReason, number>; due: number }> {
  const plans: DigestPlan[] = [];
  const skipped: Record<SkipReason, number> = {
    not_entitled: 0,
    not_due: 0,
    empty_profile: 0,
    nothing_new: 0,
    nothing_above_floor: 0,
  };
  let due = 0;

  for (const candidate of candidates) {
    if (!evaluateFeature(candidate.plan, "weekly_digest").usable) {
      skipped.not_entitled++;
      continue;
    }
    if (!digestDue(candidate.lastDigestAt, now)) {
      skipped.not_due++;
      continue;
    }
    due++;

    const [profile, resume] = await Promise.all([
      getProfile(candidate.userId),
      getLatestResume(candidate.userId),
    ]);

    // An empty profile produces a ranking with nothing to rank against, so the
    // "six worth a look" claim would be six arbitrary rows. Silence is the
    // honest output, and it is also why defaulting the digest on costs a
    // signed-up-but-never-filled-in user nothing.
    if (!isProfileUsable(profile)) {
      skipped.empty_profile++;
      continue;
    }

    const scoreProfile = toScoreProfile(
      profile,
      resume ? skillsFromParsedResume(resume.parsed) : [],
      resume?.parsed,
    );

    const { items } = await getFeed(scoreProfile, {
      newSince: candidate.lastDigestAt,
      // Blocked rows are dropped by the selector rather than here, so the
      // "considered" count reports what actually turned up in the week.
      limit: RANK_POOL,
      // The subscriber's own timing weight — a digest that recommended on a
      // different ranking than their feed shows would be two answers to one
      // question.
      timingPoints: TIMING_PRIORITY_POINTS[candidate.plan],
    });

    if (items.length === 0) {
      skipped.nothing_new++;
      continue;
    }

    const covered = await coveredIds(candidate, scoreProfile);
    const uncovered = subtractCovered(items, covered);
    const selection = pickDigestItems(uncovered, MAX_DIGEST_ITEMS);

    if (!worthSending(selection)) {
      skipped.nothing_above_floor++;
      continue;
    }

    const fullScore = evaluateFeature(candidate.plan, "fit_score_full").usable;
    plans.push({
      userId: candidate.userId,
      email: candidate.email,
      displayName: candidate.displayName,
      considered: items.length,
      coveredBySearches: items.length - uncovered.length,
      items: selection.picked.map((i) => ({
        id: i.id,
        title: i.title,
        company: i.company ?? "",
        kind: i.kind,
        deadlineAt: i.deadlineAt,
        // The same server-side shaping as the feed: Free gets the label, never
        // the number. An email is a surface like any other.
        score: fullScore ? i.fit.score : null,
        label: !fullScore && i.fit.score !== null ? FIT_BUCKET_LABELS[bucketFitScore(i.fit.score)] : null,
        knownDimensions: i.fit.knownDimensions,
        totalDimensions: i.fit.totalDimensions,
      })),
    });
  }

  return { plans, skipped, due };
}

export async function runDigests(
  options: { send?: boolean; now?: Date } = {},
): Promise<DigestSummary> {
  const now = options.now ?? new Date();
  const candidates = await digestCandidates();
  const { plans, skipped, due } = await planDigests(candidates, now);

  const summary: DigestSummary = {
    candidates: candidates.length,
    due,
    planned: plans.length,
    sent: 0,
    skipped,
    failed: [],
    plans,
  };

  if (!options.send) return summary;

  const byId = new Map(candidates.map((c) => [c.userId, c]));

  for (const plan of plans) {
    const candidate = byId.get(plan.userId);
    if (!candidate) continue;

    try {
      await sendDigest(
        composeDigest({
          email: plan.email,
          displayName: plan.displayName,
          items: plan.items,
          considered: plan.considered,
          coveredBySearches: plan.coveredBySearches,
          unsubscribeToken: candidate.unsubscribeToken,
        }),
      );
      // Only after the send succeeds — see store.markDigested.
      await markDigested(plan.userId, now);
      summary.sent++;
    } catch (err) {
      summary.failed.push({
        userId: plan.userId,
        error: err instanceof Error ? err.message : "send failed",
      });
    }
  }

  return summary;
}
