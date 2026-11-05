/**
 * Which saved searches alert, and how often — one definition, no database.
 *
 * Used by the feed's saved-search panel, the alert job and the digest's
 * duplicate suppression, so the three can never disagree about which of a
 * student's searches is "on". The plan rules come from `tiers.ts`; nothing
 * here, and nothing in SQL, restates them.
 */

import { DAY_MS } from "@/lib/pricing/allowance";
import {
  ALERT_INTERVAL_DAYS,
  FEATURES,
  SAVED_SEARCH_CEILING,
  type TierId,
} from "@/lib/pricing/tiers";

export interface AlertingInput {
  id: string;
  notify: boolean;
  createdAt: Date;
  freeAlertPickedAt: Date | null;
}

/** How many saved searches this plan may hold. */
export function savedSearchLimit(tier: TierId): number {
  return FEATURES.saved_search_alerts.limits[tier] ?? SAVED_SEARCH_CEILING;
}

/**
 * The searches whose alerts are actually active.
 *
 * On Free, one search holds the alert slot: the most recent the student
 * picked, else the newest. It alerts only while its own alerts are on, and
 * turning it off (or unsubscribing from its email) does NOT hand the slot to
 * another search — an unsubscribe must make email stop, never start a
 * different one. A downgrade pauses the rest without touching them: filters,
 * names and `notify` flags are all kept, and upgrading resumes them.
 *
 * On Pro, every search with alerts on, up to the operational ceiling.
 */
export function alertingSearchIds(searches: readonly AlertingInput[], tier: TierId): Set<string> {
  const limit = savedSearchLimit(tier);
  if (tier === "free") {
    const slot = searches.slice().sort((a, b) => {
      const pa = a.freeAlertPickedAt?.getTime() ?? -Infinity;
      const pb = b.freeAlertPickedAt?.getTime() ?? -Infinity;
      if (pa !== pb) return pb - pa;
      return b.createdAt.getTime() - a.createdAt.getTime();
    }).slice(0, limit);
    return new Set(slot.filter((s) => s.notify).map((s) => s.id));
  }
  const on = searches
    .filter((s) => s.notify)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return new Set(on.slice(0, limit).map((s) => s.id));
}

/** The search holding a Free account's single alert slot, alerting or not. */
export function freeAlertSlot(searches: readonly AlertingInput[]): string | null {
  const ids = alertingSearchIds(searches.map((s) => ({ ...s, notify: true })), "free");
  return [...ids][0] ?? null;
}

/**
 * Slack for scheduler drift. The job runs once a day at a fixed minute, and
 * GitHub's scheduler can start it late; without slack, a run five minutes
 * early relative to the last one would push a "daily" alert to two days.
 */
export const ALERT_SLACK_MS = 3 * 3_600_000;

/** Whether a search on this plan may email again at `now`. */
export function alertDue(lastNotifiedAt: Date, now: Date, tier: TierId): boolean {
  return now.getTime() - lastNotifiedAt.getTime() >= ALERT_INTERVAL_DAYS[tier] * DAY_MS - ALERT_SLACK_MS;
}

export interface DueInput extends AlertingInput {
  userId: string;
  plan: TierId;
  lastNotifiedAt: Date;
}

/**
 * Narrow every search with alerts on to the ones that may email now: the
 * plan's active set and the plan's cadence (weekly on Free, daily on Pro).
 */
export function dueSearches<T extends DueInput>(
  all: readonly T[],
  now: Date,
): { due: T[]; paused: number; notDue: number } {
  const byUser = new Map<string, T[]>();
  for (const c of all) byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), c]);
  const due: T[] = [];
  let paused = 0;
  let notDue = 0;
  for (const rows of byUser.values()) {
    const active = alertingSearchIds(rows, rows[0].plan);
    for (const r of rows) {
      if (!r.notify) continue;
      if (!active.has(r.id)) paused++;
      else if (!alertDue(r.lastNotifiedAt, now, r.plan)) notDue++;
      else due.push(r);
    }
  }
  return { due, paused, notDue };
}
