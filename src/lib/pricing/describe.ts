/**
 * Plan promises in words — the one place a limit becomes a sentence.
 *
 * Pricing, onboarding, the landing page and the portal all render from here,
 * so none of them carries a number of its own. Pure.
 */

import { FREE_RANKED_RESULTS } from "@/lib/feed-trim";

import { MAX_DIGEST_ITEMS as DIGEST_ITEMS } from "@/lib/digest/select";
import {
  ALERT_CADENCE_LABEL,
  FEATURES,
  SAVED_SEARCH_CEILING,
  type FeatureKey,
  type TierId,
} from "./tiers";

/** What one plan gets of one feature, or null when it gets none. */
export function allowanceWords(feature: FeatureKey, tier: TierId): string | null {
  const entry = FEATURES[feature];
  const limit = entry.limits[tier];

  if (feature === "feed_full_depth") {
    return limit === 0 ? `top ${FREE_RANKED_RESULTS} ranked matches per search` : "every match, a page at a time";
  }
  if (feature === "fit_score_full") {
    return limit === 0 ? "fit labels with confidence" : "included";
  }
  if (feature === "saved_search_alerts") {
    return limit === null
      ? `up to ${SAVED_SEARCH_CEILING} saved searches, ${ALERT_CADENCE_LABEL[tier]} alerts`
      : `${limit} saved search, ${ALERT_CADENCE_LABEL[tier]} alerts`;
  }
  if (feature === "weekly_digest") return `weekly, up to ${DIGEST_ITEMS} matches`;
  if (limit === 0) return null;
  if (limit === null) return entry.meter === "none" ? "included" : "unlimited";
  if (entry.meter === "capacity") return feature === "tracker" ? `${limit} active at a time` : `${limit} at a time`;
  if (entry.meter === "period") return `${limit} every 30 days`;
  return `${limit}`;
}

/** The rows of the plan comparison, in the order a student reads them. */
export const COMPARISON_ROWS: readonly FeatureKey[] = [
  "feed_browse",
  "feed_full_depth",
  "fit_score_full",
  "fit_score_gap_closer",
  "tracker",
  "deadline_reminders",
  "weekly_digest",
  "saved_search_alerts",
  "resume_critique",
  "cover_letter",
  "github_tools",
  "linkedin_tools",
  "essay_reviewer",
  "priority_freshest_listings",
];
