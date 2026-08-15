/**
 * Profile shape, validation and the bridge into scoring.
 *
 * Kept free of database imports so it can be unit-tested without a connection —
 * and so the form, the scorer and the store all agree on one definition of what
 * a profile is.
 */

import { z } from "zod";

import type { ScoreProfile } from "../score/fit";

/* ------------------------------------------------------------------ *
 * Options the UI offers
 * ------------------------------------------------------------------ */

export const WORK_AUTH_VALUES = ["us_citizen", "permanent_resident", "needs_sponsorship"] as const;
export type WorkAuthValue = (typeof WORK_AUTH_VALUES)[number];

export const WORK_AUTH_OPTIONS: ReadonlyArray<{ value: WorkAuthValue; label: string }> = [
  { value: "us_citizen", label: "U.S. citizen" },
  { value: "permanent_resident", label: "permanent resident" },
  { value: "needs_sponsorship", label: "need sponsorship" },
];

/**
 * Interest areas.
 *
 * These values are the field keys in `score/fit.ts` — the scorer matches a
 * posting's title against the same taxonomy, so picking one here is what makes
 * field scoring work for someone whose major does not imply their target
 * (a math major aiming at software, say).
 */
export const INTEREST_VALUES = [
  "software",
  "data_ai",
  "hardware",
  "quant_finance",
  "product",
  "business",
] as const;
export type InterestValue = (typeof INTEREST_VALUES)[number];

export const INTEREST_OPTIONS: ReadonlyArray<{ value: InterestValue; label: string }> = [
  { value: "software", label: "software engineering" },
  { value: "data_ai", label: "data / ai / ml" },
  { value: "hardware", label: "hardware / embedded" },
  { value: "quant_finance", label: "quant / finance" },
  { value: "product", label: "product / design" },
  { value: "business", label: "business / consulting" },
];

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** Trims, then turns "" into null — an empty form field means "not stated",
 *  and "not stated" must reach the scorer as null so the dimension is dropped
 *  rather than scored as a miss. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable();

const currentYear = new Date().getFullYear();

export const profileInputSchema = z.object({
  displayName: optionalText(120),
  school: optionalText(160),
  major: optionalText(160),
  gradYear: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : v.trim()))
    .transform((v) => (v === "" ? null : Number(v)))
    .nullable()
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= currentYear - 10 && v <= currentYear + 10),
      { message: `graduation year should be between ${currentYear - 10} and ${currentYear + 10}` },
    ),
  gpa: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : v.trim()))
    .transform((v) => (v === "" ? null : Number(v)))
    .nullable()
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 4.5), {
      message: "gpa should be between 0 and 4.5",
    }),
  workAuth: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s === "" || (WORK_AUTH_VALUES as readonly string[]).includes(s), {
      message: "unrecognised work authorization",
    })
    .transform((s) => (s === "" ? null : (s as WorkAuthValue)))
    .nullable(),
  targetVerticals: z.array(z.enum(INTEREST_VALUES)).max(6),
  targetLocations: z.array(z.string().trim().min(1).max(80)).max(12),
  openToRemote: z.boolean(),
  portfolioUrl: optionalText(300).refine(
    (v) => v === null || /^https?:\/\/\S+\.\S+/.test(v),
    { message: "portfolio should be a full URL starting with http" },
  ),
  /**
   * Stored as the handle, not the URL — it is what every GitHub API path needs.
   * A pasted profile URL is accepted and reduced to the handle, because that is
   * what students actually have to hand.
   */
  githubUsername: z
    .string()
    .trim()
    .max(300)
    .transform((s) => (s.length === 0 ? null : parseGitHubHandle(s)))
    .nullable()
    .refine((v) => v !== "", { message: "that is not a GitHub username" }),
  /**
   * Kept so a student can get back to their own profile from here. It is never
   * fetched — see CLAUDE.md. Nothing in this codebase loads this URL.
   */
  linkedinUrl: optionalText(300).refine(
    (v) => v === null || /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/\S+/i.test(v),
    { message: "that should be a linkedin.com profile URL" },
  ),
});

/**
 * A GitHub handle out of whatever was pasted.
 *
 * Duplicated from `lib/github/types.ts` rather than imported: this module is
 * the schema the whole app validates profiles against, and importing the GitHub
 * module here would drag its types into every page that touches a profile.
 * Returns "" for unparseable input so the refine above can reject it — null
 * means "not stated", which is a different thing.
 */
function parseGitHubHandle(raw: string): string {
  let s = raw.trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i);
  if (url) s = url[1];
  s = s.replace(/^@/, "").replace(/\/+$/, "");
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(s) ? s : "";
}

export type ProfileInput = z.infer<typeof profileInputSchema>;

/** A stored profile: the validated input plus who it belongs to. */
export interface UserProfile extends ProfileInput {
  id: string;
}

/** Splits "San Francisco, New York" into distinct, trimmed entries. */
export function parseLocations(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 12);
}

export const EMPTY_PROFILE_INPUT: ProfileInput = {
  displayName: null,
  school: null,
  major: null,
  gradYear: null,
  gpa: null,
  workAuth: null,
  targetVerticals: [],
  targetLocations: [],
  openToRemote: true,
  portfolioUrl: null,
  githubUsername: null,
  linkedinUrl: null,
};

/* ------------------------------------------------------------------ *
 * Bridge to scoring
 * ------------------------------------------------------------------ */

/**
 * The subset of a profile the fit scorer reads.
 *
 * Deliberately lossy — GPA, school and portfolio are stored for the cold-email
 * generator (M4), and must never leak into a fit score. A 3.9 GPA does not make
 * a posting fit better; claiming it did would be exactly the kind of invented
 * signal this product is built to avoid.
 */
export function toScoreProfile(
  profile: UserProfile | null,
  /**
   * Canonical skills from the user's resume, if they have uploaded one.
   *
   * Passed in rather than stored on the profile because it is derived: the
   * resume is the source of truth, and re-deriving means a better extractor
   * improves everyone's scores without a migration.
   */
  resumeSkills: string[] = [],
): ScoreProfile {
  if (!profile) {
    return {
      targetVerticals: [],
      targetLocations: [],
      openToRemote: true,
      skills: resumeSkills,
    };
  }
  return {
    major: profile.major,
    gradYear: profile.gradYear,
    workAuth: profile.workAuth,
    targetVerticals: profile.targetVerticals,
    targetLocations: profile.targetLocations,
    openToRemote: profile.openToRemote,
    skills: resumeSkills,
  };
}

/**
 * The five fields this predicate reads, and nothing more.
 *
 * Typed as a subset rather than as the whole `UserProfile` so a caller holding
 * a raw `profiles` row — the metrics count, which reads the table directly —
 * can ask the question without first running the row through the store's
 * narrowing mapper. A `UserProfile` still satisfies it, so every existing
 * caller is unaffected.
 */
export type UsableProfileFields = Pick<
  UserProfile,
  "major" | "gradYear" | "workAuth" | "targetVerticals" | "targetLocations"
>;

/** True when at least one answer can actually move a score. */
export function isProfileUsable(profile: UsableProfileFields | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.major ||
      profile.gradYear ||
      profile.workAuth ||
      profile.targetVerticals.length > 0 ||
      profile.targetLocations.length > 0,
  );
}
