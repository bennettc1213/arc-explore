import { getFeed } from "../feed";
import { toScoreProfile } from "../profile/types";
import { getProfile, getLatestResume } from "../profile/store";
import { skillsFromParsedResume } from "../score/skills";

import { composeAlert, sendAlert, type AlertMatch } from "./email";
import { alertCandidates, markNotified } from "./store";
import { filtersToQuery, type SavedFilters } from "./types";

/**
 * The saved-search alert job.
 *
 * DRY-RUN BY DEFAULT, like the deadline reminders and unlike every other script
 * here. A mistake in an ingest run is a bad row we fix; a mistake in this one
 * lands in somebody else's inbox and cannot be recalled. `--send` is the mode
 * you ask for by name.
 */

/** Matches listed per alert. More than this and the email is a feed. */
const MAX_MATCHES = 25;

export interface AlertPlan {
  searchId: string;
  userId: string;
  email: string;
  name: string;
  matchCount: number;
  matches: AlertMatch[];
  filters: SavedFilters;
}

export interface AlertSummary {
  considered: number;
  withMatches: number;
  sent: number;
  failed: Array<{ searchId: string; error: string }>;
  plans: AlertPlan[];
}

/**
 * What would go out.
 *
 * Scored against each student's own profile, because a saved search still
 * ranks — an alert is a small feed, and the ordering that makes the feed useful
 * makes the email useful for the same reason.
 */
export async function planAlerts(
  candidates: Awaited<ReturnType<typeof alertCandidates>>,
): Promise<AlertPlan[]> {
  const plans: AlertPlan[] = [];

  for (const c of candidates) {
    const [profile, resume] = await Promise.all([
      getProfile(c.userId),
      getLatestResume(c.userId),
    ]);
    const scoreProfile = toScoreProfile(
      profile,
      resume ? skillsFromParsedResume(resume.parsed) : [],
    );

    const { items } = await getFeed(scoreProfile, {
      ...c.filters,
      // The whole point: only rows we first saw since we last wrote to them.
      newSince: c.lastNotifiedAt,
      limit: MAX_MATCHES,
    });

    if (items.length === 0) continue;

    plans.push({
      searchId: c.searchId,
      userId: c.userId,
      email: c.email,
      name: c.name,
      matchCount: items.length,
      filters: c.filters,
      matches: items.map((i) => ({
        id: i.id,
        title: i.title,
        company: i.company ?? "",
        kind: i.kind,
        deadlineAt: i.deadlineAt,
      })),
    });
  }

  return plans;
}

export async function runAlerts(
  options: { send?: boolean; now?: Date } = {},
): Promise<AlertSummary> {
  const now = options.now ?? new Date();
  // Fetched once and threaded through: planning and sending need the same
  // rows, and querying twice risks acting on a set we did not plan against.
  const candidates = await alertCandidates();
  const plans = await planAlerts(candidates);

  const summary: AlertSummary = {
    considered: candidates.length,
    withMatches: plans.length,
    sent: 0,
    failed: [],
    plans,
  };

  if (!options.send) return summary;

  const byId = new Map(candidates.map((c) => [c.searchId, c]));

  for (const plan of plans) {
    const candidate = byId.get(plan.searchId);
    if (!candidate) continue;

    try {
      await sendAlert(
        composeAlert({
          email: plan.email,
          searchId: plan.searchId,
          searchName: plan.name,
          feedQuery: filtersToQuery(plan.filters),
          matches: plan.matches,
          unsubscribeToken: candidate.unsubscribeToken,
        }),
      );
      // Only after the send succeeds. Moving the watermark first would mean a
      // failed send silently swallows the postings it was going to report —
      // the student never hears about them and nothing records that.
      await markNotified(plan.searchId, now);
      summary.sent++;
    } catch (err) {
      summary.failed.push({
        searchId: plan.searchId,
        error: err instanceof Error ? err.message : "send failed",
      });
    }
  }

  return summary;
}
