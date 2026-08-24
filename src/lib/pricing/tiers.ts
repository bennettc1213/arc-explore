/**
 * The single source of truth for what each pricing tier includes.
 *
 * EVERY GATING DECISION IN THIS CODEBASE MUST READ FROM THIS FILE. No
 * component, action or route may hardcode `tier === "edge"` or a price —
 * they call `evaluateFeature` (or one of the small helpers below it) and
 * render whatever it returns. That is what makes "$6.99" a one-line change
 * instead of a grep-and-pray across every gated surface.
 *
 * This module is pure — no database import, no `"use server"`. It has to be
 * safe to import from a client component (a locked badge needs the label and
 * price without a round trip), and it has to be safe to import from
 * `db/schema.ts`'s consumers without creating an import cycle. Anything that
 * needs the database — reading a user's actual tier, reading how many times
 * they have used a capped tool — lives in `entitlements.ts` and `usage.ts`,
 * which import *this* file, never the other way around.
 *
 * STATUS, NOT A SEPARATE LIST. Five tools were named explicitly as
 * "reserved but not built" for the Apply tier: scholarship autofill, the
 * reusable answer bank, one-click reapply, submission confirmation, and the
 * semester recap. Two more turned out to need the same treatment once this
 * was actually cross-checked against the codebase — the Smart Resume
 * converter (CLAUDE.md already forbids inventing its structure) and
 * "priority freshest listings" (no ranking-boost mechanism exists to gate).
 * Rather than track "reserved" as a separate concept from "built", every
 * feature below carries one `status: "live" | "coming_soon"` flag, and
 * `evaluateFeature` is the only place that flag is read. A `coming_soon`
 * feature is unusable on every tier regardless of its configured limits —
 * the limits still say what it will unlock once built, so the UI can render
 * "Apply — coming soon" instead of a number nobody can act on.
 */

import { PLAN_IDS, type PlanId } from "@/db/schema";
import type { FitResult, ScoreReason } from "../score/fit";

export const TIER_IDS = PLAN_IDS;
export type TierId = PlanId;

export const TIER_LABELS: Record<TierId, string> = {
  free: "See it",
  edge: "Edge",
  apply: "Apply",
};

/**
 * Monthly price in whole US dollars and cents. The one place a price is
 * spelled out as a number — everywhere else imports this.
 *
 * NO BILLING PROVIDER READS OR WRITES THIS YET. There is no Stripe product,
 * no checkout session, no webhook. This constant is what a pricing page
 * displays and what a future checkout flow would pass to whichever payment
 * processor gets wired up; changing it here does not change what anyone is
 * actually charged until that flow exists. See FIXES.md.
 */
export const TIER_PRICE_USD: Record<TierId, number> = {
  free: 0,
  edge: 6.99,
  apply: 14.99,
};

export const TIER_TAGLINES: Record<TierId, string> = {
  free: "see it",
  edge: "generate with it",
  apply: "apply with it",
};

/**
 * How far timing may move a posting in the feed's ranking, per tier, measured
 * in points on the same 0–100 scale the fit ranking uses.
 *
 * A BOUNDED BONUS, NOT A BLEND, AND THE CORPUS DECIDED THAT. The first cut
 * blended the two scores (`fit × (1−w) + timing × w`) and was measured across
 * six weights against all 3,788 live rows. It has no usable setting: from
 * w=0.2 to w=0.5 it moved 2–3 rows of the top 20 and the mean timing score
 * barely shifted, because the top of the fit ranking is a large tie group that
 * timing *already* ordered as the tiebreaker. Turn it up far enough to bite
 * (w=0.7) and the top 20's mean fit fell from 98.7 to 83.7 with a **minimum of
 * 22** — a blend cannot buy timing without spending fit, and a posting closing
 * tomorrow that does not match you is not a recommendation, it is a countdown.
 *
 * A bonus centred on the neutral prior fixes exactly that. An urgent listing
 * gains at most this many points, a stale one loses at most this many, and a
 * listing with average timing moves not at all — so a strong match can be
 * reordered against a comparable one but cannot be displaced by something that
 * merely closes soon. It is also a number that can be stated in words: "Apply
 * lets timing move a listing up to 20 points".
 *
 * **MEASURED HONESTLY, THE EFFECT IS SMALL, AND THE REASON IS WORTH KNOWING.**
 * Swept over 0/5/10/15/20/30/50 points against all 3,788 live rows: the result
 * is **identical from 5 points upward**. It saturates immediately because
 * timing was *already* the tiebreaker in `rank()`, and the top of the fit
 * ranking is one large tie group — so within the part of the feed anyone
 * actually reads, free is already ordered by timing, and a monotonic bonus
 * cannot reorder what is already in that order. All the bonus can do is pull a
 * lower-fit row *across* a fit gap, which is precisely the trade the bound
 * exists to refuse.
 *
 * What it does buy, measured on the top 20: a signed-out visitor goes from
 * **10 to 13** rows carrying a real stated deadline, a filled CS profile from
 * 1 to 2, and the worst timing score in that CS top 20 rises from 29 to 49 —
 * with mean fit unchanged (98.7 → 98.4) and minimum fit unchanged (84). A
 * strict improvement, and a modest one. Making it larger would require making
 * free's ranking *worse*, which is a product decision and not this file's to
 * take. Recorded in FIXES.md.
 *
 * **FREE IS 0 BECAUSE FREE MUST NOT GET WORSE, NOT BECAUSE FREE IS PUNISHED.**
 * Timing was already the tiebreaker in `rank()` and still is at 0 points, so a
 * free feed is byte-for-byte what it was before this existed. Paid plans add
 * something; nothing was taken away to create the gap. That is the difference
 * between a paid tier and a degraded one.
 */
export const TIMING_PRIORITY_POINTS: Record<TierId, number> = {
  free: 0,
  edge: 10,
  apply: 20,
};

export function tierRank(tier: TierId): number {
  return TIER_IDS.indexOf(tier);
}

export function tierAtLeast(tier: TierId, minimum: TierId): boolean {
  return tierRank(tier) >= tierRank(minimum);
}

/* ------------------------------------------------------------------ *
 * Feature catalog
 * ------------------------------------------------------------------ */

export const FEATURE_KEYS = [
  "feed_browse",
  "feed_full_depth",
  "deadline_reminders",
  "fit_score_full",
  "fit_score_gap_closer",
  "resume_critique",
  "smart_resume",
  "cover_letter",
  "github_tools",
  "linkedin_tools",
  "tracker",
  "essay_reviewer",
  "saved_search_alerts",
  "weekly_digest",
  "deadline_triage",
  "extension_autofill_internships",
  "extension_autofill_scholarships",
  "answer_bank",
  "one_click_reapply",
  "priority_freshest_listings",
  "semester_recap",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * How finished a feature actually is.
 *
 * THREE STATES, NOT TWO, AND THE MIDDLE ONE IS THE POINT. This codebase
 * distinguishes everywhere between what we built and what we *watched work* —
 * it is the same distinction as "confirmed live" versus "checked as of", and
 * as the two-observation rule before closing a listing. A pricing page is the
 * last place that distinction should collapse, because here it is the
 * difference between a description and a promise someone pays for.
 *
 *  - `live`          built, and exercised end to end.
 *  - `unverified`    built and unit-tested, but never driven end to end by a
 *                    human. It should work. Nobody has watched it. Sold with
 *                    that said out loud rather than discovered afterwards.
 *  - `coming_soon`   not built. Gated AND disabled on every tier, including
 *                    the one that pays for it.
 */
export type FeatureStatus = "live" | "unverified" | "coming_soon";

export interface FeatureEntitlement {
  key: FeatureKey;
  label: string;
  description: string;
  status: FeatureStatus;
  /**
   * Per-tier limit. `null` = unlimited. `0` = not included on that tier at
   * all. A positive integer = that many uses before the tier is exhausted —
   * see `usage.ts` for what "a use" means per feature (a lifetime count for
   * most of these; there is no billing cycle to reset against yet, which is
   * called out below and in FIXES.md).
   *
   * These are the INTENDED limits regardless of build status — a
   * `coming_soon` feature still states what it will unlock, so a locked
   * badge can say "Apply" rather than nothing.
   */
  limits: Record<TierId, number | null>;
}

/**
 * Every feature entitlement this product has committed to, tier by tier.
 *
 * Ordered to match the tier writeup: Free's own list first, then what Edge
 * adds, then what Apply adds — so this file reads the same way the pricing
 * page will.
 */
export const FEATURES: Record<FeatureKey, FeatureEntitlement> = {
  feed_browse: {
    key: "feed_browse",
    label: "Search every listing",
    description:
      "Search and filter the whole corpus — every internship and scholarship, on every tier. " +
      "Filters, search and opening any listing are never limited.",
    status: "live",
    limits: { free: null, edge: null, apply: null },
  },
  feed_full_depth: {
    key: "feed_full_depth",
    label: "See every match, not just the daily 20",
    description:
      "Free shows your 20 highest-ranked matches, re-ranked as new postings arrive and " +
      "deadlines approach. Paid shows the full ranked list.",
    status: "live",
    limits: { free: 0, edge: null, apply: null },
  },
  deadline_reminders: {
    key: "deadline_reminders",
    label: "Deadline reminders",
    description: "Email reminders on saved items with a stated deadline.",
    status: "live",
    limits: { free: null, edge: null, apply: null },
  },
  fit_score_full: {
    key: "fit_score_full",
    label: "Full Fit Score",
    description:
      "The 0–100 score and the known/total confidence marker. Free sees a bucketed label — " +
      "Strong / Good / Low Fit — instead of the number.",
    status: "live",
    limits: { free: 0, edge: null, apply: null },
  },
  fit_score_gap_closer: {
    key: "fit_score_gap_closer",
    label: "Fit Score gap-closer",
    description: "The \"why this score\" breakdown and the missing-skills list per listing.",
    status: "live",
    limits: { free: 0, edge: null, apply: null },
  },
  resume_critique: {
    key: "resume_critique",
    label: "Resume critique",
    description: "ATS-compatibility and completeness findings against your parsed resume.",
    status: "live",
    limits: { free: 1, edge: null, apply: null },
  },
  smart_resume: {
    key: "smart_resume",
    label: "Smart Resume + PDF",
    description:
      "The Smart Resume converter and its PDF export. Blocked on resume-structuring logic " +
      "CLAUDE.md says not to invent — see FIXES.md.",
    status: "coming_soon",
    limits: { free: 0, edge: null, apply: null },
  },
  cover_letter: {
    key: "cover_letter",
    label: "Cover letter drafts",
    description: "A grounded first draft per listing, editable paragraph by paragraph.",
    status: "live",
    limits: { free: 1, edge: null, apply: null },
  },
  github_tools: {
    key: "github_tools",
    label: "GitHub builder + audit",
    description: "The README generator, pin recommendations, and the profile audit.",
    status: "live",
    limits: { free: 1, edge: null, apply: null },
  },
  linkedin_tools: {
    key: "linkedin_tools",
    label: "LinkedIn builder + checker",
    description: "The headline/About draft and the pasted-text profile checker.",
    status: "live",
    limits: { free: 1, edge: null, apply: null },
  },
  tracker: {
    key: "tracker",
    label: "Application tracker",
    description: "Track postings through Saved → Applied → Decision.",
    status: "live",
    limits: { free: 5, edge: null, apply: null },
  },
  essay_reviewer: {
    key: "essay_reviewer",
    label: "Essay / SOP reviewer",
    description: "Prompt coverage, specificity, clarity and structure feedback.",
    status: "live",
    limits: { free: 0, edge: null, apply: null },
  },
  saved_search_alerts: {
    key: "saved_search_alerts",
    label: "Saved-search alerts",
    description: "Email when a saved search finds something new.",
    status: "live",
    limits: { free: 0, edge: null, apply: null },
  },
  weekly_digest: {
    key: "weekly_digest",
    label: "Weekly digest",
    description: "A weekly email of new matches, reserving slots so internships aren't crowded out.",
    status: "live",
    limits: { free: 0, edge: null, apply: null },
  },
  deadline_triage: {
    key: "deadline_triage",
    label: "Deadline triage",
    description: "\"What to do this week\" across everything you're tracking. Not built yet.",
    status: "coming_soon",
    limits: { free: 0, edge: null, apply: null },
  },
  extension_autofill_internships: {
    key: "extension_autofill_internships",
    label: "Autofill & apply — internships",
    description:
      "The browser extension autofills the employer's real Greenhouse/Lever/Ashby/SmartRecruiters " +
      "form; you review and press submit. Includes the confirmation email and auto-tracked " +
      "Submitted status. Requires installing the extension in Chrome.",
    // Built, and 616 tests cover it including source-level safety invariants —
    // but FIXES.md §3 records that it has never been loaded into Chrome and
    // driven with a real session, and every ATS form actually read so far
    // produced at least one bug that reading it was the only way to find. So
    // it is sold as unverified rather than as finished.
    status: "unverified",
    limits: { free: 0, edge: 0, apply: null },
  },
  extension_autofill_scholarships: {
    key: "extension_autofill_scholarships",
    label: "Autofill & apply — scholarships",
    description:
      "Scholarship application sites are bespoke, not a handful of ATS platforms — this has not " +
      "been built. Not built yet.",
    status: "coming_soon",
    limits: { free: 0, edge: 0, apply: null },
  },
  answer_bank: {
    key: "answer_bank",
    label: "Reusable answer bank",
    description: "Save and reuse answers to recurring application questions. Not built yet.",
    status: "coming_soon",
    limits: { free: 0, edge: 0, apply: null },
  },
  one_click_reapply: {
    key: "one_click_reapply",
    label: "One-click reapply",
    description: "Refile a past application to a similar posting. Not built yet.",
    status: "coming_soon",
    limits: { free: 0, edge: 0, apply: null },
  },
  priority_freshest_listings: {
    key: "priority_freshest_listings",
    label: "Timing-weighted ranking",
    description:
      "Paid plans let how soon something closes, and how freshly it was posted, move a listing " +
      "up the ranking — Edge by up to 10 points, Apply by up to 20. Measured on the live " +
      "corpus this is a real but modest shift: 13 of a signed-out top 20 carry a stated " +
      "deadline instead of 10. It never promotes a listing that fits you worse.",
    status: "live",
    limits: { free: 0, edge: null, apply: null },
  },
  semester_recap: {
    key: "semester_recap",
    label: "Semester recap",
    description: "A summary of the term's activity across the tracker. Not built yet.",
    status: "coming_soon",
    limits: { free: 0, edge: 0, apply: null },
  },
};

/* ------------------------------------------------------------------ *
 * Evaluation — the one function every gate calls
 * ------------------------------------------------------------------ */

/** The tier's stated limit for this feature, ignoring build status. */
export function intendedLimitFor(tier: TierId, feature: FeatureKey): number | null {
  return FEATURES[feature].limits[tier];
}

export function isFeatureLive(feature: FeatureKey): boolean {
  return FEATURES[feature].status === "live";
}

/**
 * Whether a feature is finished enough to be *used* — as opposed to finished
 * enough to be trusted without a caveat.
 *
 * `unverified` passes: the code exists and its tests pass, so refusing to run
 * it would be worse than running it with the caveat printed. Only
 * `coming_soon` is genuinely unusable.
 */
export function isFeatureUsable(feature: FeatureKey): boolean {
  return FEATURES[feature].status !== "coming_soon";
}

/** Short badge text for a status, or null when there is nothing to caveat. */
export function statusNote(status: FeatureStatus): string | null {
  if (status === "coming_soon") return "not built yet";
  if (status === "unverified") return "built, not yet verified end-to-end";
  return null;
}

/** The cheapest tier whose stated limits include this feature at all. */
export function minimumTierFor(feature: FeatureKey): TierId {
  for (const t of TIER_IDS) {
    if (intendedLimitFor(t, feature) !== 0) return t;
  }
  return "apply";
}

export type FeatureAccessReason = "ok" | "coming_soon" | "not_included" | "limit_reached";

export interface FeatureAccess {
  /** Whether this specific call may proceed right now. */
  usable: boolean;
  status: FeatureStatus;
  /** Whether the tier's stated limits include this feature, independent of
   *  whether it has shipped. */
  included: boolean;
  unlimited: boolean;
  limit: number | null;
  /** null when unlimited, not included, or usage does not apply. */
  remaining: number | null;
  minimumTier: TierId;
  reason: FeatureAccessReason;
}

/**
 * Evaluate one feature for one viewer.
 *
 * `usedCount` is the caller's job to supply — this module has no database
 * access, by design (see the module comment). For an unlimited or
 * not-included feature the count is irrelevant and may be omitted.
 */
export function evaluateFeature(
  tier: TierId,
  feature: FeatureKey,
  usedCount = 0,
): FeatureAccess {
  const entry = FEATURES[feature];
  const limit = intendedLimitFor(tier, feature);
  const included = limit !== 0;
  const unlimited = limit === null;
  const minimumTier = minimumTierFor(feature);

  if (entry.status === "coming_soon") {
    return {
      usable: false,
      status: entry.status,
      included,
      unlimited,
      limit,
      remaining: null,
      minimumTier,
      reason: "coming_soon",
    };
  }

  if (!included) {
    return {
      usable: false,
      status: entry.status,
      included,
      unlimited,
      limit,
      remaining: null,
      minimumTier,
      reason: "not_included",
    };
  }

  if (unlimited) {
    return {
      usable: true,
      status: entry.status,
      included,
      unlimited,
      limit,
      remaining: null,
      minimumTier,
      reason: "ok",
    };
  }

  const remaining = Math.max(limit - usedCount, 0);
  return {
    usable: remaining > 0,
    status: entry.status,
    included,
    unlimited,
    limit,
    remaining,
    minimumTier,
    reason: remaining > 0 ? "ok" : "limit_reached",
  };
}

/* ------------------------------------------------------------------ *
 * Fit Score presentation — discovery/scoring stays full access, lower
 * fidelity on free, per the roadmap's own two-pattern split (this one;
 * generation tools are the other, handled by evaluateFeature's limits).
 * ------------------------------------------------------------------ */

export type FitBucket = "strong" | "good" | "low" | "unscored";

export const FIT_BUCKET_LABELS: Record<FitBucket, string> = {
  strong: "Strong Fit",
  good: "Good Fit",
  low: "Low Fit",
  unscored: "Not enough info",
};

/**
 * Buckets a 0–100 score into the three-way label free tier sees.
 *
 * Thresholds deliberately reuse `ScoreBadge`'s own "strong" cutoff (70) so
 * the bucketed word and the full number never disagree at the boundary a
 * student could compare by upgrading mid-session.
 */
export function bucketFitScore(score: number | null): FitBucket {
  if (score === null) return "unscored";
  if (score >= 70) return "strong";
  if (score >= 40) return "good";
  return "low";
}

export interface PresentedFit {
  /** Null on free tier (bucketed instead) or when genuinely unscored. */
  score: number | null;
  known?: number;
  total?: number;
  reasons: ScoreReason[];
  skills: { matched: string[]; missing: string[] };
  /** Set only when the viewer is seeing the bucketed version. */
  bucketLabel: string | null;
  /** True when the full number/reasons exist but this viewer cannot see them. */
  locked: boolean;
}

/**
 * Shapes a `FitResult` for the viewer's tier — the discovery/scoring half of
 * the two gating patterns (the other is quantity caps, in `usage.ts`).
 *
 * SERVER-SIDE, NOT A CSS TRICK. Callers run this in an RSC before the
 * reasons array or the numeric score is ever handed to a child component,
 * so a free-tier viewer's rendered HTML genuinely does not contain the
 * number — there is nothing to find in view-source, and no client-side
 * toggle could reveal it because the server never sent it.
 *
 * A null score (nothing to bucket) always passes through unbucketed on
 * every tier — "not enough information to score this yet" is not a paid
 * insight, it is the honest absence of one, the same rule `ScoreBadge`
 * already follows.
 *
 * Lives in this pure module rather than beside `getUserTier` so it is
 * testable without a database connection, the same split `allowlist.ts`
 * makes from `admin/auth.ts`.
 */
export function presentFit(fit: FitResult, tier: TierId): PresentedFit {
  const fullScore = fit.score === null || evaluateFeature(tier, "fit_score_full").usable;
  const gapCloser = fit.score === null || evaluateFeature(tier, "fit_score_gap_closer").usable;

  if (fullScore) {
    return {
      score: fit.score,
      known: fit.knownDimensions,
      total: fit.totalDimensions,
      reasons: fit.reasons,
      skills: gapCloser ? fit.skills : { matched: fit.skills.matched, missing: [] },
      bucketLabel: null,
      locked: false,
    };
  }

  /*
   * THE CONFIDENCE MARKER SURVIVES THE PAYWALL, DELIBERATELY.
   *
   * `known`/`total` are carried through even though the number itself is
   * withheld. `FitResult` states the rule this obeys: the marker "must be
   * shown wherever the score is", because an unknown dimension is dropped
   * rather than counted as a miss, so a posting understood on one dimension
   * out of five reaches the same 100 as one understood on all five.
   *
   * Withholding it was tried first and was visibly wrong on live data:
   * signed out (empty profile, so almost everything is unknown) the feed
   * rendered fifty consecutive rows reading a confident "Strong Fit" with
   * nothing saying what that rested on. Bucketing is allowed to lower the
   * FIDELITY of the score — that is the paid/free split — but it may not
   * quietly strip the thing that stops the score overstating itself. A free
   * tier that is less precise is a product decision; a free tier that is
   * less honest is a different thing, and not one this codebase ships.
   */
  return {
    score: null,
    known: fit.knownDimensions,
    total: fit.totalDimensions,
    reasons: [],
    skills: { matched: [], missing: [] },
    bucketLabel: FIT_BUCKET_LABELS[bucketFitScore(fit.score)],
    locked: true,
  };
}
