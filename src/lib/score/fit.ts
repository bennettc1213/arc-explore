/**
 * Fit scoring — deterministic rules, no LLM, no fabrication.
 *
 * Two rules govern this file:
 *
 *  1. **Every point is explained.** A score with no reasons is a bug. The UI
 *     renders the reason list beside the number, so a user can always see why
 *     something ranked where it did.
 *
 *  2. **Unknown never means bad.** Where a posting does not state something —
 *     and most do not state work authorization or term — the dimension is
 *     dropped from the weighted average rather than scored as a miss. Guessing
 *     would invent a constraint the employer never wrote, which is exactly the
 *     failure mode this product exists to avoid.
 *
 * This is NOT a probability of winning the role. That requires outcome data we
 * do not have yet (see `applications` in the schema). Nothing here should ever
 * be labelled as odds in the UI.
 */

import type { WorkAuth } from "../ingest/normalize";
import { extractSkills, matchSkills } from "./skills";

export interface ScoreProfile {
  major?: string | null;
  gradYear?: number | null;
  /** "us_citizen" | "permanent_resident" | "needs_sponsorship" */
  workAuth?: string | null;
  targetLocations?: string[];
  /** Free-form interest areas, matched against our field taxonomy. */
  targetVerticals?: string[];
  openToRemote?: boolean;
  /**
   * Canonical skills the user's resume demonstrates.
   *
   * Empty when they have not uploaded one, which drops the dimension rather
   * than scoring it as a miss — a student without a resume is unknown, not
   * unqualified.
   */
  skills?: string[];
}

export interface ScorePosting {
  title: string;
  term?: string | null;
  locations?: string[];
  isRemote?: boolean;
  workAuth?: WorkAuth | string | null;
  descriptionText?: string | null;
  /**
   * Skills already extracted for this posting, from `postings.skills`.
   *
   * Supplied by the feed so extraction happens once at ingest rather than for
   * every visitor. Omit it and we fall back to extracting from the text here,
   * which keeps this function usable standalone and in tests.
   */
  skills?: string[];
}

export interface ScoreReason {
  /** Short label for the UI chip. */
  label: string;
  /** Which dimension produced this. */
  dimension: "work_auth" | "term" | "field" | "location" | "skills" | "award" | "competition";
  /** "good" raises the score, "bad" lowers it, "unknown" is informational. */
  kind: "good" | "bad" | "unknown";
  /** One-line human explanation. */
  detail: string;
}

export interface FitResult {
  /** 0–100, or null when we know too little to score honestly. */
  score: number | null;
  reasons: ScoreReason[];
  /** True when a hard requirement rules the user out entirely. */
  blocked: boolean;
  /**
   * How many dimensions actually contributed, out of how many exist.
   *
   * This must be shown wherever the score is. Because unknown dimensions are
   * excluded from the average rather than counted as misses, a posting we
   * barely understand can reach 100 on a single known dimension — the same
   * number as one that matched on all five. Without this the score silently
   * overstates its own confidence, which would undercut the whole premise of
   * not showing numbers we cannot stand behind.
   */
  knownDimensions: number;
  totalDimensions: number;
  /**
   * The keyword gap: skills this posting names, split by whether the user's
   * resume demonstrates them.
   *
   * Populated even when the dimension could not be scored — a student with no
   * resume still benefits from seeing what a role asks for. `missing` is the
   * most directly actionable thing on the page: it is the only place the app
   * tells someone what to go and learn.
   */
  skills: { matched: string[]; missing: string[] };
}

/* ------------------------------------------------------------------ *
 * Field taxonomy
 * ------------------------------------------------------------------ */

const FIELDS = {
  software: /\b(software|swe|backend|back-end|frontend|front-end|full[- ]?stack|developer|programming|platform|infrastructure|devops|systems?|security|mobile|ios|android|web)\b/i,
  data_ai: /\b(data|machine learning|ml|a\.?i\.?|artificial intelligence|analytics|research scientist|nlp|computer vision|deep learning|statistics)\b/i,
  hardware: /\b(hardware|electrical|mechanical|embedded|firmware|circuit|pcb|avionics|robotics|manufacturing|aerospace|thermal|structural|test engineer|integration|assembly|harness|environmental test|quality engineer|reliability)\b/i,
  quant_finance: /\b(quant|quantitative|trading|trader|investment|finance|financial|banking|actuarial|portfolio|risk|treasury|accounting|audit)\b/i,
  product: /\b(product manager|product management|\bpm\b|product design|ux|user experience)\b/i,
  business: /\b(business|marketing|sales|operations|consulting|strategy|human resources|\bhr\b|recruit|communications|policy|legal|supply chain|procurement)\b/i,
} as const;

type FieldKey = keyof typeof FIELDS;

/** The fields a field taxonomy member can live under. */
export type { FieldKey };

/**
 * Maps a stated major onto the fields it plausibly leads to.
 *
 * Degree-language only: every alternative names a field of study, not a role.
 * That is what lets this pattern set double as the scholarship field matcher —
 * scholarship titles and eligibility criteria say "computer science", not
 * "backend engineer". `\bcs\b` is word-bounded on both sides because `cs\b`
 * alone matched the trailing "cs" inside "Omics", "Physics" and "Mechanics".
 */
const MAJOR_TO_FIELDS: Array<{ re: RegExp; fields: FieldKey[] }> = [
  { re: /computer science|\bcs\b|software|computer engineering|cyber[- ]?security/i, fields: ["software", "data_ai"] },
  { re: /data science|statistics|machine learning|artificial intelligence|\bai\b/i, fields: ["data_ai", "software"] },
  { re: /electrical|mechanical|aerospace|robotics|biomedical engineering|materials/i, fields: ["hardware"] },
  { re: /math|physics/i, fields: ["quant_finance", "data_ai"] },
  { re: /finance|accounting|economics/i, fields: ["quant_finance", "business"] },
  { re: /business|marketing|management|supply chain/i, fields: ["business", "product"] },
  { re: /design|human[- ]computer/i, fields: ["product"] },
  { re: /political science|public policy|law|sociology|psychology/i, fields: ["business"] },
];

/**
 * Fields named in free text — a title, an eligibility criteria line, a major.
 *
 * Matches both the role-title regexes and the major patterns: "computer
 * science" is not in the role regexes (they name jobs, not degrees), yet it is
 * the most common thing a scholarship eligibility line says. The scholarship
 * Fit Score feeds eligibility text through this; the internship scorer keeps
 * using it on the title only.
 */
export function fieldsFromText(text: string): FieldKey[] {
  const out = new Set<FieldKey>();

  for (const key of Object.keys(FIELDS) as FieldKey[]) {
    if (FIELDS[key].test(text)) out.add(key);
  }
  for (const { re, fields } of MAJOR_TO_FIELDS) {
    if (re.test(text)) fields.forEach((f) => out.add(f));
  }
  return [...out];
}

/**
 * Fields named by degree-language in free text — the `MAJOR_TO_FIELDS`
 * patterns only, never the role-title regexes.
 *
 * A role word ("security", "systems", "web") is a field marker in a job title
 * but noise in scholarship prose: "The Social Security Disability Advocacy
 * Scholarship" is not an infosec award. Scholarship titles, sponsors and
 * eligibility criteria state *degree* words — "computer science", "mechanical
 * engineering" — which is exactly what these patterns match, so this is the
 * variant the scholarship Fit Score feeds text through.
 */
export function fieldsFromDegreeLanguage(text: string): FieldKey[] {
  const out = new Set<FieldKey>();

  for (const { re, fields } of MAJOR_TO_FIELDS) {
    if (re.test(text)) fields.forEach((f) => out.add(f));
  }
  return [...out];
}

export function fieldsForProfile(p: ScoreProfile): FieldKey[] {
  const out = new Set<FieldKey>();

  for (const v of p.targetVerticals ?? []) {
    for (const key of Object.keys(FIELDS) as FieldKey[]) {
      if (key === v || FIELDS[key].test(v)) out.add(key);
    }
  }
  if (p.major) {
    for (const { re, fields } of MAJOR_TO_FIELDS) {
      if (re.test(p.major)) fields.forEach((f) => out.add(f));
    }
  }
  return [...out];
}

/**
 * The fields an internship posting is in.
 *
 * Exported because the feed's category filter must ask this exact question.
 * If the filter derived fields its own way, a row could show a "matches
 * software" chip and then be missing from the software category — the filter
 * and the score have to be the same judgement or one of them is lying.
 */
export function fieldsForPosting(posting: ScorePosting): FieldKey[] {
  // Title only. Descriptions mention every adjacent discipline and would make
  // nearly every posting match nearly every field.
  return fieldsFromText(posting.title);
}

/* ------------------------------------------------------------------ *
 * Dimensions
 * ------------------------------------------------------------------ */

interface Dimension {
  /** 0–1, or null when unknown and therefore excluded from the average. */
  value: number | null;
  weight: number;
  reason: ScoreReason | null;
  blocking?: boolean;
}

function scoreWorkAuth(profile: ScoreProfile, posting: ScorePosting): Dimension {
  const need = profile.workAuth;
  const req = posting.workAuth;

  if (!req) {
    return {
      value: null,
      weight: 25,
      reason: {
        label: "work auth not stated",
        dimension: "work_auth",
        kind: "unknown",
        detail: "This posting does not state a work-authorization requirement.",
      },
    };
  }

  if (!need) {
    return {
      value: null,
      weight: 25,
      reason: {
        label: "your work auth unknown",
        dimension: "work_auth",
        kind: "unknown",
        detail: "Add your work authorization to your profile to score this.",
      },
    };
  }

  const isCitizen = need === "us_citizen";
  const needsSponsorship = need === "needs_sponsorship";

  if (req === "citizenship_required" && !isCitizen) {
    return {
      value: 0,
      weight: 25,
      blocking: true,
      reason: {
        label: "requires U.S. citizenship",
        dimension: "work_auth",
        kind: "bad",
        detail: "This role requires U.S. citizenship, which does not match your profile.",
      },
    };
  }

  if (req === "no_sponsorship" && needsSponsorship) {
    return {
      value: 0,
      weight: 25,
      blocking: true,
      reason: {
        label: "no sponsorship offered",
        dimension: "work_auth",
        kind: "bad",
        detail: "This employer states they do not sponsor, and you need sponsorship.",
      },
    };
  }

  if (req === "sponsorship_offered" && needsSponsorship) {
    return {
      value: 1,
      weight: 25,
      reason: {
        label: "sponsors visas",
        dimension: "work_auth",
        kind: "good",
        detail: "This employer states sponsorship is available.",
      },
    };
  }

  return {
    value: 1,
    weight: 25,
    reason: {
      label: "work auth OK",
      dimension: "work_auth",
      kind: "good",
      detail: "Your work authorization satisfies this posting's stated requirement.",
    },
  };
}

/** Parses "Summer 2027" into a comparable season/year pair. */
function parseTerm(term?: string | null): { season: string; year: number } | null {
  if (!term) return null;
  const m = term.match(/^(Spring|Summer|Fall|Winter)\s+(\d{4})$/i);
  if (!m) return null;
  return { season: m[1].toLowerCase(), year: Number(m[2]) };
}

function scoreTerm(profile: ScoreProfile, posting: ScorePosting): Dimension {
  const parsed = parseTerm(posting.term);

  if (!parsed) {
    return {
      value: null,
      weight: 20,
      reason: {
        label: "term not stated",
        dimension: "term",
        kind: "unknown",
        detail: "This posting does not say which term it is for.",
      },
    };
  }

  if (!profile.gradYear) {
    return {
      value: null,
      weight: 20,
      reason: {
        label: "your grad year unknown",
        dimension: "term",
        kind: "unknown",
        detail: `Posting is for ${posting.term}. Add your graduation year to score this.`,
      },
    };
  }

  // An internship is normally done in the summers before graduating. A term
  // after graduation is usually a mismatch; well before is usually fine.
  const yearsBeforeGrad = profile.gradYear - parsed.year;

  if (yearsBeforeGrad < 0) {
    return {
      value: 0.15,
      weight: 20,
      reason: {
        label: `${posting.term} is after you graduate`,
        dimension: "term",
        kind: "bad",
        detail: `This runs in ${parsed.year}, after your ${profile.gradYear} graduation.`,
      },
    };
  }

  if (yearsBeforeGrad === 0 || yearsBeforeGrad === 1) {
    return {
      value: 1,
      weight: 20,
      reason: {
        label: `${posting.term} fits your timeline`,
        dimension: "term",
        kind: "good",
        detail: `You graduate in ${profile.gradYear}, so ${posting.term} lines up well.`,
      },
    };
  }

  return {
    value: 0.55,
    weight: 20,
    reason: {
      label: `${posting.term} is early for you`,
      dimension: "term",
      kind: "unknown",
      detail: `This is ${yearsBeforeGrad} years before your ${profile.gradYear} graduation.`,
    },
  };
}

function scoreField(profile: ScoreProfile, posting: ScorePosting): Dimension {
  const mine = fieldsForProfile(profile);
  const theirs = fieldsForPosting(posting);

  if (mine.length === 0) {
    return {
      value: null,
      weight: 25,
      reason: {
        label: "your field unknown",
        dimension: "field",
        kind: "unknown",
        detail: "Add your major or interests to score how well this matches.",
      },
    };
  }

  if (theirs.length === 0) {
    return {
      value: null,
      weight: 25,
      reason: {
        label: "role field unclear",
        dimension: "field",
        kind: "unknown",
        detail: "This title does not clearly indicate a field.",
      },
    };
  }

  const overlap = theirs.filter((t) => mine.includes(t));
  if (overlap.length > 0) {
    return {
      value: 1,
      weight: 25,
      reason: {
        label: `matches ${overlap[0].replace("_", "/")}`,
        dimension: "field",
        kind: "good",
        detail: `This role is in ${overlap.map((o) => o.replace("_", "/")).join(", ")}, which matches your profile.`,
      },
    };
  }

  return {
    value: 0.2,
    weight: 25,
    reason: {
      label: "different field",
      dimension: "field",
      kind: "bad",
      detail: `This role looks like ${theirs[0].replace("_", "/")}, which is outside your stated interests.`,
    },
  };
}

function normalizeLoc(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreLocation(profile: ScoreProfile, posting: ScorePosting): Dimension {
  const targets = (profile.targetLocations ?? []).filter(Boolean);

  if (posting.isRemote && profile.openToRemote !== false) {
    return {
      value: 1,
      weight: 20,
      reason: {
        label: "remote",
        dimension: "location",
        kind: "good",
        detail: "This role is remote.",
      },
    };
  }

  if (targets.length === 0) {
    return {
      value: null,
      weight: 20,
      reason: {
        label: "no location preference",
        dimension: "location",
        kind: "unknown",
        detail: "Add preferred locations to score this.",
      },
    };
  }

  const locs = posting.locations ?? [];
  if (locs.length === 0) {
    return {
      value: null,
      weight: 20,
      reason: {
        label: "location not stated",
        dimension: "location",
        kind: "unknown",
        detail: "This posting does not list a location.",
      },
    };
  }

  const normTargets = targets.map(normalizeLoc);
  const hit = locs.find((l) => {
    const n = normalizeLoc(l);
    return normTargets.some((t) => n.includes(t) || t.includes(n));
  });

  if (hit) {
    return {
      value: 1,
      weight: 20,
      reason: {
        label: hit,
        dimension: "location",
        kind: "good",
        detail: `Located in ${hit}, which is on your list.`,
      },
    };
  }

  return {
    value: 0.25,
    weight: 20,
    reason: {
      label: locs[0],
      dimension: "location",
      kind: "bad",
      detail: `Located in ${locs.slice(0, 2).join(", ")}, outside your preferred locations.`,
    },
  };
}

/**
 * Resume skills against the skills a posting names.
 *
 * This is the dimension that makes a resume do something. Everything else in
 * this file reasons from what a student typed into a form; this reasons from
 * what they actually built.
 *
 * Both sides can be silent, and silence is not a miss. Most postings we hold
 * name no recognisable skills at all — a SmartRecruiters listing before its
 * description is backfilled, or a role genuinely described in prose — and a
 * student who has not uploaded a resume has said nothing either way. In both
 * cases the dimension drops out of the average instead of dragging the score
 * down for something nobody claimed.
 */
function scoreSkills(profile: ScoreProfile, posting: ScorePosting): Dimension & {
  match: { matched: string[]; missing: string[] };
} {
  const mine = profile.skills ?? [];
  // Prefer what ingest already derived. Title is included in the fallback
  // because "Machine Learning Intern" states a skill even when the description
  // is missing entirely.
  const theirs = posting.skills ?? extractSkills(posting.title, posting.descriptionText);
  const match = matchSkills(mine, theirs);

  if (match.coverage === null) {
    const reason: ScoreReason =
      theirs.length === 0
        ? {
            label: "no skills named",
            dimension: "skills",
            kind: "unknown",
            detail: "This posting does not name specific tools or technologies.",
          }
        : {
            label: "no resume yet",
            dimension: "skills",
            kind: "unknown",
            detail: `This role names ${theirs.slice(0, 3).join(", ")}. Upload a resume to score against it.`,
          };
    return { value: null, weight: 25, reason, match: { matched: match.matched, missing: match.missing } };
  }

  const { matched, missing } = match;

  if (matched.length === 0) {
    return {
      value: 0,
      weight: 25,
      reason: {
        label: "no skill overlap",
        dimension: "skills",
        kind: "bad",
        detail: `This role names ${theirs.slice(0, 4).join(", ")}, none of which are on your resume.`,
      },
      match,
    };
  }

  return {
    value: match.coverage,
    weight: 25,
    reason: {
      label: `${matched.slice(0, 3).join(", ")}${matched.length > 3 ? ` +${matched.length - 3}` : ""}`,
      dimension: "skills",
      kind: "good",
      detail:
        `Your resume shows ${matched.join(", ")}.` +
        (missing.length > 0 ? ` Not shown: ${missing.join(", ")}.` : ""),
    },
    match,
  };
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

/** What a posting is worth before we know anything about it. */
const NEUTRAL_PRIOR = 50;

/**
 * The number to *sort* by. Never the number to show.
 *
 * Because unknown dimensions are dropped rather than penalised, a posting we
 * understand on one dimension out of five can score 100 — and then outrank a
 * posting we understand on four that scored 90. Observed live: the top of the
 * feed filled with `fit 100 1/5` rows whose only known dimension was a single
 * shared skill. Every one of those numbers is honest on its own; the ordering
 * they produced was not, because it put the least-understood postings first.
 *
 * So ranking shrinks the score toward a neutral prior in proportion to how
 * little the score rests on. A confident 90 beats a speculative 100, and two
 * equal scores order by how much we actually know.
 *
 * The displayed score is deliberately left alone. Shrinking that would mean
 * showing a number that is not what the stated reasons add up to, and the
 * `knownDimensions` marker already tells the user how much it rests on.
 */
export function rankingScore(fit: FitResult): number {
  if (fit.score === null) return -1;
  if (fit.totalDimensions === 0) return fit.score;

  const confidence = fit.knownDimensions / fit.totalDimensions;
  return fit.score * confidence + NEUTRAL_PRIOR * (1 - confidence);
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Score how well a posting fits a profile.
 *
 * Returns `score: null` when every dimension is unknown — we would rather show
 * "not enough information" than a confident-looking number derived from
 * nothing.
 */
export function scoreFit(profile: ScoreProfile, posting: ScorePosting): FitResult {
  const skills = scoreSkills(profile, posting);

  const dims = [
    scoreWorkAuth(profile, posting),
    scoreTerm(profile, posting),
    scoreField(profile, posting),
    scoreLocation(profile, posting),
    skills,
  ];

  const reasons = dims.map((d) => d.reason).filter((r): r is ScoreReason => r !== null);
  const blocked = dims.some((d) => d.blocking);

  const scored = dims.filter((d) => d.value !== null);
  if (scored.length === 0) {
    return {
      score: null,
      reasons,
      blocked,
      knownDimensions: 0,
      totalDimensions: dims.length,
      skills: skills.match,
    };
  }

  const totalWeight = scored.reduce((sum, d) => sum + d.weight, 0);
  const weighted = scored.reduce((sum, d) => sum + d.weight * (d.value as number), 0);
  const score = Math.round((weighted / totalWeight) * 100);

  return {
    score,
    reasons,
    blocked,
    knownDimensions: scored.length,
    totalDimensions: dims.length,
    skills: skills.match,
  };
}
