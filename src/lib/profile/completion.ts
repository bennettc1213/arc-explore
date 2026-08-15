/**
 * Profile completion — what each blank field actually costs you.
 *
 * Free of database imports so every rule here is unit-testable.
 *
 * THIS IS THE GAMIFICATION LINE, AND IT IS DELIBERATELY NOT POINTS.
 *
 * The roadmap asked for "points for profile completion, applying, and
 * referrals". Two of those three are not built, on purpose:
 *
 *  - **Points for applying rewards volume**, and this project has already
 *    refused that on the record. The auto-submit refusal cites poor mass-apply
 *    response rates and employers filtering for exactly that behaviour; paying
 *    students in points to do more of it contradicts that in the same product.
 *  - **Referrals need a referral system**, which does not exist.
 *
 * And completion itself is reported as *coverage*, not as a score. A points
 * total is a number you can raise without anything about your outcomes
 * changing — which is the whole complaint this codebase makes about the GitHub
 * contribution graph, one panel over in the audit. What is true here instead is
 * concrete: every dimension of every Fit Score that we cannot compute is
 * **dropped from the average**, so an incomplete profile does not produce a bad
 * score, it produces a *thin* one. Filling a field in does not earn a badge, it
 * makes a number mean more. That is worth saying plainly, and it is the only
 * honest reason a student has to do it.
 *
 * WHAT IS DELIBERATELY NOT ON THE LIST. GPA, display name, portfolio URL, the
 * GitHub handle and the LinkedIn URL are all storable and none of them feeds
 * either scorer. Listing them would inflate the meter with items whose
 * completion changes nothing — checklist padding, and the fastest way to make
 * the number meaningless. Every item below unblocks a named scoring dimension.
 */

import type { UserProfile } from "./types";

export type CompletionKey = "field" | "work_auth" | "grad_year" | "locations" | "resume";

/**
 * Corpus counts, so each item can say how much it is worth *here*.
 *
 * Every field is nullable and a null renders as no number rather than a zero —
 * the same contract the GitHub audit follows for a check it could not run.
 */
export interface CompletionCorpus {
  /** Open internships that state a work-authorization requirement. */
  statesWorkAuth: number | null;
  /** Open internships whose term we can parse. */
  statesTerm: number | null;
  /** Open, non-remote internships that list a location. */
  statesLocation: number | null;
  /** Open internships naming at least one skill. */
  namesSkills: number | null;
  /** Open postings of **either kind** whose field the taxonomy can derive. */
  statesField: number | null;
}

export const EMPTY_CORPUS: CompletionCorpus = {
  statesWorkAuth: null,
  statesTerm: null,
  statesLocation: null,
  namesSkills: null,
  statesField: null,
};

export interface CompletionItem {
  key: CompletionKey;
  label: string;
  done: boolean;
  /** The scoring dimension this unblocks, named the way the scorer names it. */
  unlocks: string;
  /**
   * Open postings whose own data means this field would change their score.
   *
   * Null when we cannot count it honestly. Never zero as a stand-in.
   */
  postings: number | null;
  href: string;
  cta: string;
}

export interface ProfileCompletion {
  items: CompletionItem[];
  done: number;
  total: number;
  /** Whole percent, done/total. See below for why it is not weighted. */
  percent: number;
  /** The incomplete item worth doing first, or null when there is none. */
  next: CompletionItem | null;
}

/**
 * Has the profile said enough for the field dimension to run?
 *
 * Either a major or a stated interest suffices — `fieldsForProfile` reads both,
 * and requiring both would report a gap a student does not have.
 */
function hasField(p: UserProfile | null): boolean {
  return Boolean(p?.major?.trim()) || (p?.targetVerticals?.length ?? 0) > 0;
}

/**
 * Completion, ordered by what to do next.
 *
 * THE PERCENTAGE IS AN UNWEIGHTED COUNT, which is a decision rather than
 * laziness. Weighting each item by how many postings it affects would be a
 * truer measure of impact — and it would also mean the meter *falls* when we
 * ingest a batch of postings that state a location, because the denominator
 * moved under a student who did nothing. A completion number that drops while
 * you sleep is not a completion number. The per-item counts carry the impact
 * story; the headline stays stable.
 */
export function profileCompletion(
  profile: UserProfile | null,
  resumeSkills: string[],
  corpus: CompletionCorpus = EMPTY_CORPUS,
): ProfileCompletion {
  const items: CompletionItem[] = [
    {
      key: "field",
      label: "your major or interests",
      done: hasField(profile),
      // Named first because it is the only item on this list that a
      // scholarship score reads at all — the other two scholarship dimensions
      // (award, competition) are facts about the posting, not about you.
      unlocks: "the field dimension on both scores — and it is the only thing a scholarship score reads about you",
      postings: corpus.statesField,
      href: "/profile#intake",
      cta: "add your major",
    },
    {
      key: "work_auth",
      label: "work authorization",
      done: Boolean(profile?.workAuth),
      unlocks: "the work-authorization dimension, worth 25 of an internship score",
      postings: corpus.statesWorkAuth,
      href: "/profile#intake",
      cta: "set work authorization",
    },
    {
      key: "grad_year",
      label: "graduation year",
      done: Boolean(profile?.gradYear),
      unlocks: "the term dimension — whether a Summer 2027 posting is for you or a year early",
      postings: corpus.statesTerm,
      href: "/profile#intake",
      cta: "add your graduation year",
    },
    {
      key: "locations",
      label: "preferred locations",
      done: (profile?.targetLocations?.length ?? 0) > 0,
      // Stated honestly: a remote role already scores on location without this,
      // so the item is worth exactly the non-remote postings and no more.
      unlocks: "the location dimension on roles that are not remote",
      postings: corpus.statesLocation,
      href: "/profile#intake",
      cta: "add locations",
    },
    {
      key: "resume",
      label: "a resume",
      done: resumeSkills.length > 0,
      unlocks: "the skills dimension, plus the keyword gap on every listing and the resume critique",
      postings: corpus.namesSkills,
      href: "/resume",
      cta: "upload a resume",
    },
  ];

  const done = items.filter((i) => i.done).length;

  // Incomplete first, and within those by how many postings each would affect.
  // An item we cannot count sorts after ones we can rather than to the top:
  // "unknown impact" is not "highest impact".
  const ordered = [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return 0;
    return (b.postings ?? -1) - (a.postings ?? -1);
  });

  return {
    items: ordered,
    done,
    total: items.length,
    percent: Math.round((done / items.length) * 100),
    next: ordered.find((i) => !i.done) ?? null,
  };
}
