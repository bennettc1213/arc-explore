/**
 * Scholarship Fit Score — deterministic rules, same rules as `fit.ts`.
 *
 * Deliberately a sibling of `scoreFit`, not a branch inside it. Internships
 * are scored on work_auth / term / field / location / skills — dimensions that
 * mean nothing for a scholarship, which carries none of them (locations are
 * empty, skills are empty, term is an academic year or absent). A scholarship
 * has three things worth scoring instead:
 *
 *  - **field**: does its stated eligibility or title line up with the student's
 *    major/interests? A scholarship that says "for computer science students"
 *    against a CS profile is a strong match; one aimed at a different field is
 *    likely an ineligibility, not just a preference.
 *  - **award**: how large is the stated amount. Bigger is better for a student
 *    choosing between opportunities, so this is a scored dimension — but it is
 *    a labelled heuristic, and an unstated amount drops out as unknown rather
 *    than scoring a miss.
 *  - **competition**: whether the sponsor is a link-building content-marketing
 *    award (stamped at ingest — see `scholarships/classify.ts`). These are real
 *    and winnable, but they are not the same kind of award as an institutional
 *    fund, so they take a down-rank in the fit — the roadmap's "competition-
 *    level heuristic", honestly proxied by sponsor type because no source
 *    publishes applicant counts. Always known: the flag defaults to false.
 *
 * Same honesty contract as `fit.ts`: every point is explained, unknown is
 * dropped not penalised, and the number is never presented as odds.
 */

import type { ScoreProfile, FitResult, ScoreReason } from "./fit";
import { fieldsForProfile, fieldsFromDegreeLanguage } from "./fit";

export interface ScholarshipScorePosting {
  title: string;
  sponsorName?: string | null;
  /** Lower bound of the stated award, or the exact figure when equal to max. */
  amountMin?: number | null;
  amountMax?: number | null;
  /** Stamped at ingest by `scholarships/classify.ts`. Defaults to false. */
  isContentMarketing?: boolean;
  /** Raw eligibility bullets as the source states them. */
  eligibility?: string[];
}

interface Dimension {
  /** 0–1, or null when unknown and therefore excluded from the average. */
  value: number | null;
  weight: number;
  reason: ScoreReason;
}

/** Award-size tiers. A $250 award is small but not zero — never a 0. */
function awardValue(amount: number): number {
  if (amount >= 10_000) return 1;
  if (amount >= 5_000) return 0.85;
  if (amount >= 2_500) return 0.7;
  if (amount >= 1_000) return 0.55;
  if (amount >= 500) return 0.4;
  return 0.3;
}

function scoreField(profile: ScoreProfile, posting: ScholarshipScorePosting): Dimension {
  const mine = fieldsForProfile(profile);

  if (mine.length === 0) {
    return {
      value: null,
      weight: 35,
      reason: {
        label: "your field unknown",
        dimension: "field",
        kind: "unknown",
        detail: "Add your major or interests to score how well this scholarship matches.",
      },
    };
  }

  const text = [posting.title, posting.sponsorName ?? "", ...(posting.eligibility ?? [])]
    .filter(Boolean)
    .join(" ");
  // Degree-language only. The role-title regexes ("security", "systems") are
  // correct in a job title and wrong in scholarship prose — see
  // `fieldsFromDegreeLanguage` for why.
  const theirs = fieldsFromDegreeLanguage(text);

  if (theirs.length === 0) {
    return {
      value: null,
      weight: 35,
      reason: {
        label: "field not stated",
        dimension: "field",
        kind: "unknown",
        detail: "This scholarship does not state a field of study.",
      },
    };
  }

  const overlap = theirs.filter((t) => mine.includes(t));
  if (overlap.length > 0) {
    return {
      value: 1,
      weight: 35,
      reason: {
        label: `matches ${overlap[0].replace("_", "/")}`,
        dimension: "field",
        kind: "good",
        detail: `This scholarship is for ${overlap.map((o) => o.replace("_", "/")).join(", ")}, which matches your profile.`,
      },
    };
  }

  return {
    value: 0.15,
    weight: 35,
    reason: {
      label: "different field",
      dimension: "field",
      kind: "bad",
      detail: `This scholarship targets ${theirs[0].replace("_", "/")}, which is outside your stated interests — you may not be eligible.`,
    },
  };
}

function scoreAward(posting: ScholarshipScorePosting): Dimension {
  const amount = posting.amountMin ?? posting.amountMax;

  if (amount === null || amount === undefined || amount <= 0) {
    return {
      value: null,
      weight: 35,
      reason: {
        label: "amount not stated",
        dimension: "award",
        kind: "unknown",
        detail: "The award amount is not stated on the source listing.",
      },
    };
  }

  return {
    value: awardValue(amount),
    weight: 35,
    reason: {
      label: `$${amount.toLocaleString("en-US")}`,
      dimension: "award",
      kind: amount >= 2_500 ? "good" : "unknown",
      detail: `Stated award of $${amount.toLocaleString("en-US")}.`,
    },
  };
}

function scoreCompetition(posting: ScholarshipScorePosting): Dimension {
  if (posting.isContentMarketing) {
    return {
      value: 0.25,
      weight: 30,
      reason: {
        label: "link-building award",
        dimension: "competition",
        kind: "bad",
        detail:
          "Run by a law firm or agency for inbound links rather than by an institution. Real and winnable, but not the same kind of award as an institutional fund.",
      },
    };
  }

  return {
    value: 1,
    weight: 30,
    reason: {
      label: "institutional award",
      dimension: "competition",
      kind: "good",
      detail: "Sponsored by an institution rather than a link-building content-marketing firm.",
    },
  };
}

/**
 * Score how well a scholarship fits a profile.
 *
 * Competition is always knowable (the flag defaults to false at ingest), so a
 * scholarship always carries at least one known dimension — the score is only
 * null when that rule changes.
 */
export function scoreScholarshipFit(
  profile: ScoreProfile,
  posting: ScholarshipScorePosting,
): FitResult {
  const dims = [scoreField(profile, posting), scoreAward(posting), scoreCompetition(posting)];

  const reasons = dims.map((d) => d.reason);
  const scored = dims.filter((d) => d.value !== null);

  if (scored.length === 0) {
    return {
      score: null,
      reasons,
      blocked: false,
      knownDimensions: 0,
      totalDimensions: dims.length,
      skills: { matched: [], missing: [] },
    };
  }

  const totalWeight = scored.reduce((sum, d) => sum + d.weight, 0);
  const weighted = scored.reduce((sum, d) => sum + d.weight * (d.value as number), 0);

  return {
    score: Math.round((weighted / totalWeight) * 100),
    reasons,
    blocked: false,
    knownDimensions: scored.length,
    totalDimensions: dims.length,
    skills: { matched: [], missing: [] },
  };
}
