/**
 * Which standing profile a student should build first.
 *
 * The requirement is "tech-track students toward GitHub, everyone toward
 * LinkedIn, **without forcing both**". The last clause is the design: a page
 * that presents two equal calls to action has not routed anyone, it has just
 * moved the decision back onto someone who came here to be told. So this
 * returns one primary and at most one secondary, and the secondary is offered
 * rather than urged.
 *
 * LinkedIn is the floor for everyone, including the tech track — a software
 * student with a strong GitHub and no LinkedIn is still invisible to most
 * recruiters, because most recruiters search LinkedIn. GitHub is added on top
 * when the evidence says the student writes code, and is never the *only*
 * recommendation.
 */

import { SKILLS } from "../score/skills";

import { INTEREST_OPTIONS, type UserProfile } from "./types";

/**
 * Verticals where public code is evidence a recruiter will actually open.
 *
 * `product` and `business` are excluded deliberately. A design portfolio and a
 * case-competition record are what those tracks are judged on; pushing a
 * business student to build a GitHub profile would be advice that costs them a
 * weekend and returns nothing.
 */
const TECH_VERTICALS = new Set(["software", "data_ai", "hardware", "quant_finance"]);

/** Canonical skills that are technical, i.e. everything except the business group. */
const TECH_SKILLS = new Set(SKILLS.filter((s) => s.group !== "business").map((s) => s.name));

/** Enough technical skills on a resume to call it evidence rather than noise. */
const TECH_SKILL_THRESHOLD = 3;

export type PresenceTarget = "github" | "linkedin";

export interface PresenceRouting {
  /** Build this one first. */
  primary: PresenceTarget;
  /** Worth doing after, or null when it genuinely is not. */
  secondary: PresenceTarget | null;
  /** Why we said so, in terms of what we counted. Shown to the student. */
  because: string;
  /** True when the recommendation rests on the resume rather than a stated interest. */
  fromResume: boolean;
}

/**
 * Route a student.
 *
 * Reads stated interests *and* resume skills, because the two disagree in a way
 * that matters: a business major with Python, SQL and React on their resume is
 * on the tech track whatever they ticked, and a student who ticked "software"
 * before uploading anything is telling us where they are heading. Either is
 * enough; neither is required.
 */
export function routePresence(
  profile: UserProfile | null,
  resumeSkills: readonly string[] = [],
): PresenceRouting {
  const stated = (profile?.targetVerticals ?? []).filter((v) => TECH_VERTICALS.has(v));
  const technical = resumeSkills.filter((s) => TECH_SKILLS.has(s));

  if (stated.length > 0) {
    // The stored value is a key ("data_ai"); the label is what a person reads.
    const named = stated.map((v) => INTEREST_OPTIONS.find((o) => o.value === v)?.label ?? v);
    return {
      primary: "github",
      secondary: "linkedin",
      because: `you are targeting ${named.join(" and ")}, and public code is the one credential in that track a recruiter can check for themselves`,
      fromResume: false,
    };
  }

  if (technical.length >= TECH_SKILL_THRESHOLD) {
    return {
      primary: "github",
      secondary: "linkedin",
      because: `your resume names ${technical.length} technical skills (${technical.slice(0, 3).join(", ")}), and that is the track where public code counts`,
      fromResume: true,
    };
  }

  return {
    primary: "linkedin",
    // Not "github, later". For a student with no technical signal, a GitHub
    // profile is a weekend spent on a page nobody in their field will open.
    secondary: null,
    because:
      profile && (profile.targetVerticals.length > 0 || resumeSkills.length > 0)
        ? "nothing you have told us points at a track where recruiters open source code, and LinkedIn is where your field is actually searched"
        : "it is where nearly every recruiter searches first, whatever you end up doing",
    fromResume: false,
  };
}
