/**
 * The single source of truth for what each pricing tier includes.
 *
 * EVERY GATING DECISION IN THIS CODEBASE MUST READ FROM THIS FILE. No
 * component, action or route may hardcode `tier === "apply"` or a price —
 * they call `evaluateFeature` (or one of the small helpers below it) and
 * render whatever it returns. That is what makes a price a one-line change
 * instead of a grep-and-pray across every gated surface.
 *
 * This module is pure — no database import, no `"use server"`. It has to be
 * safe to import from a client component (a locked badge needs the label and
 * price without a round trip), and it has to be safe to import from
 * `db/schema.ts`'s consumers without creating an import cycle. Anything that
 * needs the database — reading a user's actual tier, reading a tool's
 * allowance — lives in `entitlements.ts` and `grants.ts`, which import *this*
 * file, never the other way around.
 *
 * STATUS, NOT A SEPARATE LIST. Every feature carries one
 * `status: "live" | "unverified" | "coming_soon"` flag beside its plan limits.
 * A `coming_soon` feature is unusable on every plan regardless of its limits;
 * the limits still say what it will unlock, so a locked badge can say "Pro —
 * not built yet" rather than nothing. Plan membership and readiness are
 * separate: see `isCurrentBenefit`.
 */

import { PLAN_IDS, type PlanId } from "@/db/schema";
import type { FitResult, ScoreReason } from "../score/fit";
import { presentAssessment } from "../score/v2/presentation";

export const TIER_IDS = PLAN_IDS;
export type TierId = PlanId;

/**
 * User-facing plan names. The paid plan's internal id stays `apply` — renaming
 * a stored identifier buys nothing — but every surface says "Pro".
 */
export const TIER_LABELS: Record<TierId, string> = {
  free: "Free",
  apply: "Pro",
};

/**
 * Monthly price in whole US dollars and cents. The one place a price is
 * spelled out as a number — everywhere else imports this.
 *
 * THIS IS THE DISPLAYED PRICE, NOT THE CHARGED ONE. Stripe charges whatever
 * `STRIPE_PRICE_APPLY_MONTHLY` points at. `lib/pricing/checkout-quote.ts`
 * reads that price from Stripe and refuses checkout when it disagrees with
 * this number, so the page can never advertise one amount and charge another.
 * Changing this constant does not change any Stripe price.
 */
export const TIER_PRICE_USD: Record<TierId, number> = {
  free: 0,
  apply: 20,
};

export const TIER_TAGLINES: Record<TierId, string> = {
  free: "find and organize",
  apply: "spend less time applying",
};

export function autofillFeature(kind: string): "extension_autofill_internships" | "extension_autofill_scholarships" {
  return kind === "scholarship" ? "extension_autofill_scholarships" : "extension_autofill_internships";
}

/**
 * The length of a free tool allowance, in days.
 *
 * NOT A CALENDAR MONTH AND NOT A BILLING CYCLE. A free account has no
 * subscription to reset against, so each tool keeps its own clock: the first
 * successful new use starts a period, and that tool renews this many days
 * later (UTC instants, no date rounding). Say "every 30 days", never "per
 * month". The arithmetic lives in `allowance.ts`.
 */
export const ALLOWANCE_PERIOD_DAYS = 30;

/**
 * How often saved-search alerts may email, per plan.
 *
 * Daily is the fastest cadence the scheduler actually runs
 * (`.github/workflows/search-alerts.yml`, once a day). Nothing faster is
 * claimed: an alert can only report a posting after ingestion has found it.
 */
export const ALERT_INTERVAL_DAYS: Record<TierId, number> = {
  free: 7,
  apply: 1,
};

export const ALERT_CADENCE_LABEL: Record<TierId, string> = {
  free: "weekly",
  apply: "daily",
};

/**
 * An operational ceiling on saved searches, not a plan limit. It bounds what
 * one account costs the nightly alert job. Pro is "multiple saved searches"
 * up to this; Free's commercial limit is `FEATURES.saved_search_alerts`.
 */
export const SAVED_SEARCH_CEILING = 20;

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

/**
 * What a numeric limit counts.
 *
 *  - `none`      no count; the limit is only 0 (excluded) or null (included).
 *  - `capacity`  how many may exist at once (active tracker rows, saved searches).
 *                Frees up when one is finished or removed.
 *  - `period`    successful new uses per `ALLOWANCE_PERIOD_DAYS`, per tool.
 *                See `allowance.ts`.
 */
export type FeatureMeter = "none" | "capacity" | "period";

export interface FeatureEntitlement {
  key: FeatureKey;
  label: string;
  description: string;
  status: FeatureStatus;
  meter: FeatureMeter;
  /** What one unit of a `period` meter is, in words a student can check. */
  useMeans?: string;
  /**
   * Per-tier limit. `null` = unlimited. `0` = not included on that tier at
   * all. A positive integer is read through `meter`: concurrent capacity, or
   * successful new uses per allowance period.
   *
   * These are the INTENDED limits regardless of build status — a
   * `coming_soon` feature still states what it will unlock, so a locked
   * badge can say "Apply" rather than nothing.
   */
  limits: Record<TierId, number | null>;
}

/**
 * Every feature entitlement this product has committed to, plan by plan —
 * the approved Free/Pro matrix (docs/free-pro-plans.md). Free's own list
 * first, then what Pro adds, then what is not built.
 */
export const FEATURES: Record<FeatureKey, FeatureEntitlement> = {
  feed_browse: {
    key: "feed_browse",
    label: "Search and open every listing",
    description:
      "Search, filter and open any internship or scholarship, with its source link, " +
      "verification and freshness facts, eligibility and work-authorization warnings, and " +
      "scam, lottery and marketing flags. Never limited, never paywalled.",
    status: "live",
    meter: "none",
    limits: { free: null, apply: null },
  },
  feed_full_depth: {
    key: "feed_full_depth",
    label: "Full ranked results",
    description:
      "Free shows your top 20 ranked matches for each search and filter combination; " +
      "change the filters and you get that search's top 20. Pro shows the whole ranked " +
      "list, a page at a time.",
    status: "live",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  deadline_reminders: {
    key: "deadline_reminders",
    label: "Deadline reminders",
    description: "Email reminders on tracked opportunities that publish a deadline.",
    status: "live",
    meter: "none",
    limits: { free: null, apply: null },
  },
  fit_score_full: {
    key: "fit_score_full",
    label: "Numerical fit scores and factor explanations",
    description:
      "The 0–100 fit score with each factor explained. Free sees a Strong / Good / Low label " +
      "and the same confidence marker. Eligibility conflicts and unknown requirements are " +
      "shown on every plan. A fit score is not a probability of being selected.",
    status: "live",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  fit_score_gap_closer: {
    key: "fit_score_gap_closer",
    label: "Gap-closing guidance",
    description: "Which listed skills you are missing for a listing, so you know what to add.",
    status: "live",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  resume_critique: {
    key: "resume_critique",
    label: "Resume critique",
    description: "ATS-compatibility and completeness findings against your parsed resume.",
    status: "live",
    meter: "period",
    useMeans: "critiquing a resume revision that has not been critiqued before",
    limits: { free: 1, apply: null },
  },
  smart_resume: {
    key: "smart_resume",
    label: "Smart Resume + PDF",
    description:
      "The Smart Resume converter and its PDF export. Blocked on resume-structuring logic " +
      "that has not been supplied.",
    status: "coming_soon",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  cover_letter: {
    key: "cover_letter",
    label: "Cover letter drafts",
    description:
      "A grounded first draft for one opportunity, editable paragraph by paragraph. " +
      "AI generations are limited to 30 an hour on every plan to protect the service.",
    status: "live",
    meter: "period",
    useMeans: "drafting a letter for an opportunity you have not drafted for before",
    limits: { free: 1, apply: null },
  },
  github_tools: {
    key: "github_tools",
    label: "GitHub audit + README builder",
    description: "The profile audit, pin recommendations and README generator for one GitHub account.",
    status: "live",
    meter: "period",
    useMeans: "auditing a GitHub account you have not audited before",
    limits: { free: 1, apply: null },
  },
  linkedin_tools: {
    key: "linkedin_tools",
    label: "LinkedIn check + builder",
    description: "The headline/About draft and the pasted-text profile checker.",
    status: "live",
    meter: "period",
    useMeans: "starting a 72-hour LinkedIn session",
    limits: { free: 1, apply: null },
  },
  tracker: {
    key: "tracker",
    label: "Application tracker",
    description:
      "Track opportunities from saved to applied to decision. The limit counts active " +
      "opportunities only; finished ones and your full history never count.",
    status: "live",
    meter: "capacity",
    limits: { free: 10, apply: null },
  },
  essay_reviewer: {
    key: "essay_reviewer",
    label: "Essay / SOP reviewer",
    description: "Prompt coverage, specificity, clarity and structure feedback.",
    status: "live",
    meter: "period",
    useMeans: "starting a 72-hour essay review session",
    limits: { free: 1, apply: null },
  },
  saved_search_alerts: {
    key: "saved_search_alerts",
    label: "Saved searches with alerts",
    description:
      "Save a search and get an email when it finds something new. Free alerts weekly on one " +
      "saved search; Pro alerts daily on several.",
    status: "live",
    meter: "capacity",
    limits: { free: 1, apply: null },
  },
  weekly_digest: {
    key: "weekly_digest",
    label: "Weekly digest",
    description:
      "One email a week with up to six new matches above the relevance floor. Nothing is " +
      "sent in a week with nothing worth sending.",
    status: "live",
    meter: "none",
    limits: { free: null, apply: null },
  },
  deadline_triage: {
    key: "deadline_triage",
    label: "Deadline triage",
    description: "A what-to-do-this-week view across everything you're tracking. Not built yet.",
    status: "coming_soon",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  extension_autofill_internships: {
    key: "extension_autofill_internships",
    label: "Autofill & apply — internships",
    description:
      "Autofill supported applications from your Instela profile. Answer missing questions as you go; " +
      "reusable facts are saved for next time. Review and submit on the official form. Requires the Chrome extension.",
    // Built and tested, including source-level safety invariants — but never
    // loaded into Chrome and driven with a real session (FIXES.md §3). It is
    // therefore not listed as a current Pro benefit; see `isCurrentBenefit`.
    status: "unverified",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  extension_autofill_scholarships: {
    key: "extension_autofill_scholarships",
    label: "Autofill & apply — scholarships",
    description:
      "Autofill standard fields on supported scholarship forms and answer one-time questions in an Instela prompt. " +
      "Some portals need a separate tab and per-site extension access. Currently in testing.",
    status: "unverified",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  answer_bank: {
    key: "answer_bank",
    label: "Reusable answer bank",
    description: "Save and reuse answers to recurring application questions. Not built yet.",
    status: "coming_soon",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  one_click_reapply: {
    key: "one_click_reapply",
    label: "One-click reapply",
    description: "Refile a past application to a similar posting. Not built yet.",
    status: "coming_soon",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  priority_freshest_listings: {
    key: "priority_freshest_listings",
    label: "Timing-weighted ranking",
    description:
      "Lets how soon something closes, and how recently it was posted, move a listing up to " +
      "20 points. A modest effect, and it never promotes a listing that fits you worse.",
    status: "live",
    meter: "none",
    limits: { free: 0, apply: null },
  },
  semester_recap: {
    key: "semester_recap",
    label: "Semester recap",
    description: "A summary of the term's activity across the tracker. Not built yet.",
    status: "coming_soon",
    meter: "none",
    limits: { free: 0, apply: null },
  },
};

/**
 * Whether a feature belongs on the list of things a subscriber gets today.
 *
 * Plan entitlement and release readiness are separate questions. A feature can
 * belong to Pro and still be unavailable (`coming_soon`) or unproven
 * (`unverified`); neither is sold as a current benefit.
 */
export function isCurrentBenefit(feature: FeatureKey): boolean {
  return FEATURES[feature].status === "live";
}

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

export type FitBucket = "strong" | "good" | "low" | "check" | "unscored";

export const FIT_BUCKET_LABELS: Record<FitBucket, string> = {
  strong: "Strong Fit",
  good: "Good Fit",
  low: "Low Fit",
  check: "Check eligibility",
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
  assessment?: import("@/lib/score/v2/types").PresentedAssessment;
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
  /**
   * How much a locked score is holding back, as COUNTS only — never the skill
   * names or the reasons themselves. Lets the Free plan say "Pro shows the 3
   * skills you match and the 1 you're missing" without sending any of them.
   * Set only when `locked` is true.
   */
  lockedCounts?: { matched: number; missing: number };
}

export interface PresentFitOptions {
  /**
   * The viewer's profile has the four minimum fields (major, graduation year,
   * state/location preference, work authorization). When false, no fit label or
   * percentage-like score may be returned — the score is treated as unknown.
   */
  profileReady: boolean;
}

/**
 * Shapes a `FitResult` for the viewer's tier — the discovery/scoring half of
 * the two gating patterns (the other is quantity caps, in `allowance.ts` and `grants.ts`).
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
export function presentFit(
  fit: FitResult,
  tier: TierId,
  options: PresentFitOptions,
): PresentedFit {
  const { profileReady } = options;
  if (fit.assessment) {
    const assessment = fit.assessment;
    const full = evaluateFeature(tier, "fit_score_full").usable;
    const gap = evaluateFeature(tier, "fit_score_gap_closer").usable;
    const failed = assessment.eligibility.state === "fail";
    // Never serialize rawFit, priority.rank, or hidden factor values on a bucketed plan.
    return {
      score: !failed && full ? fit.score : null,
      known: fit.knownDimensions, total: fit.totalDimensions,
      bucketLabel: failed ? "Check eligibility" : !full && fit.score !== null ? FIT_BUCKET_LABELS[bucketFitScore(fit.score)] : null,
      reasons: full ? fit.reasons : [],
      skills: { matched: full ? fit.skills.matched : [], missing: gap ? fit.skills.missing : [] },
      locked: !full && fit.score !== null,
      ...(!full && fit.score !== null && !failed
        ? { lockedCounts: { matched: fit.skills?.matched.length ?? 0, missing: gap ? 0 : (fit.skills?.missing.length ?? 0) } }
        : {}),
      assessment: presentAssessment(assessment, full),
    };
  }

  // A fit label or percentage-like output may only be shown against an actual
  // student profile. When the profile is incomplete, the score is treated as
  // genuinely unknown for presentation purposes, even if the server computed a
  // ranking score for ordering.
  if (!profileReady) {
    return {
      score: null,
      known: 0,
      total: fit.totalDimensions,
      reasons: [],
      skills: { matched: [], missing: [] },
      bucketLabel: null,
      locked: false,
    };
  }

  // High-confidence conflicts (location, education-level) are already known
  // from the data and must not be labelled Strong Fit. Show "Check eligibility"
  // instead and keep the reasons so the user can see why.
  if (fit.blocked) {
    return {
      score: null,
      known: fit.knownDimensions,
      total: fit.totalDimensions,
      reasons: fit.reasons,
      skills: { matched: [], missing: [] },
      bucketLabel: FIT_BUCKET_LABELS.check,
      locked: false,
    };
  }

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
    // Eligibility conflicts and unknown requirements are safety information,
    // not paid guidance: they survive the bucket on every plan.
    reasons: eligibilityReasons(fit.reasons),
    skills: { matched: [], missing: [] },
    bucketLabel: FIT_BUCKET_LABELS[bucketFitScore(fit.score)],
    locked: true,
    lockedCounts: { matched: fit.skills?.matched.length ?? 0, missing: fit.skills?.missing.length ?? 0 },
  };
}

/**
 * "Pro shows the exact score, the 3 skills you match and the 1 you're missing."
 *
 * Built from `lockedCounts`, so every number in the sentence is one the
 * server computed for this row and this student; a zero is simply left out
 * rather than advertised.
 */
export function lockedFitTeaser(counts: { matched: number; missing: number } | undefined): string {
  const parts = ["the exact score"];
  if (counts && counts.matched > 0) {
    parts.push(`the ${counts.matched} skill${counts.matched === 1 ? "" : "s"} you match`);
  }
  if (counts && counts.missing > 0) {
    parts.push(`the ${counts.missing} you're missing`);
  }
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${TIER_LABELS.apply} shows ${list}`;
}

/** Dimensions that decide whether a student may apply at all. */
const ELIGIBILITY_DIMENSIONS: ReadonlySet<ScoreReason["dimension"]> = new Set(["work_auth", "location", "term"]);

/**
 * The reasons every plan sees: conflicts ("bad") and unknowns on the
 * eligibility dimensions. What Pro adds is the score, the positive factors and
 * the gap-closing guidance — never whether a student is allowed to apply.
 */
export function eligibilityReasons(reasons: readonly ScoreReason[]): ScoreReason[] {
  return reasons.filter((r) => r.kind !== "good" && ELIGIBILITY_DIMENSIONS.has(r.dimension));
}
