/**
 * Which tool a Scout was started from, and what that changes.
 *
 * A bare `/scout` asks "internships, scholarships or both?" before anything
 * else. A student who already clicked "Internships" has answered that, so each
 * discovery tool deep-links here with `?for=` and Scout opens already pointed
 * at it, in that tool's own words. The point of the entry is to start with a
 * few questions rather than a screen of ranked results.
 *
 * Pure: no React, no database. `scoutHref` is the one place a Scout URL is
 * built, so the portal tiles and the Explore header cannot disagree about the
 * parameter's spelling.
 */

import type { ScoutPreferences } from "./types";

export const SCOUT_FOCUSES = ["internships", "scholarships", "merit"] as const;
export type ScoutFocus = (typeof SCOUT_FOCUSES)[number];

/** Unknown or repeated values are ignored, never echoed — it comes from a URL. */
export function scoutFocusFrom(raw: unknown): ScoutFocus | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SCOUT_FOCUSES.find((focus) => focus === value) ?? null;
}

export function scoutHref(focus: ScoutFocus | null): string {
  return focus ? `/scout?for=${focus}` : "/scout";
}

/**
 * Is this `/explore` URL a plain "take me to internships" entry, as opposed to a
 * search or a filtered view? An entry shows a Scout start screen rather than a
 * screen of ranked results, so people begin with a few questions and are not
 * handed the whole list. Anything that says what the student wants to see — a
 * query, a filter, an explicit view — is not an entry and renders the results.
 *
 * Returns null for "not an entry"; otherwise the tool to Scout (null = both).
 * `view=deck` still counts as an entry: it is what the retired Cards links sent.
 */
export function exploreEntryFocus(params: Record<string, string | string[] | undefined>): { focus: ScoutFocus | null } | null {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  for (const key of Object.keys(params)) {
    if (params[key] === undefined) continue;
    if (key === "kind" || key === "focus") continue;
    if (key === "view" && first("view") === "deck") continue;
    return null;
  }
  if (first("focus") === "merit") return { focus: "merit" };
  if (first("kind") === "internship") return { focus: "internships" };
  if (first("kind") === "scholarship") return { focus: "scholarships" };
  return { focus: null };
}

/** Where "browse the full list instead" goes: the results, for the same tool. */
export function exploreBrowseHref(focus: ScoutFocus | null): string {
  if (focus === "merit") return "/explore?kind=scholarship&focus=merit&view=list";
  if (focus === "internships") return "/explore?kind=internship&view=list";
  if (focus === "scholarships") return "/explore?kind=scholarship&view=list";
  return "/explore?view=list";
}

/** The preferences a focus fixes. Everything else stays the student's to answer. */
export function focusPreferences(focus: ScoutFocus): Pick<ScoutPreferences, "kind" | "merit"> {
  if (focus === "internships") return { kind: "internship", merit: false };
  // Merit awards are scholarships a college or sponsor gives for merit, so the
  // kind is scholarship and the feed's merit filter is what narrows it.
  return { kind: "scholarship", merit: focus === "merit" };
}

export interface ScoutFocusCopy {
  /** Short noun for buttons: "Start a Scout for internships". */
  noun: string;
  kicker: string;
  heading: string;
  intro: string;
  /** Example fields offered as one-tap suggestions. */
  suggestions: readonly string[];
}

const GENERAL_FIELDS = ["Civil engineering", "Nursing", "Computer science", "Environmental science", "Business", "Education"];

export const SCOUT_COPY: Record<ScoutFocus | "all", ScoutFocusCopy> = {
  all: {
    noun: "opportunities",
    kicker: "INSTELA SCOUT",
    heading: "A little more you. A lot more possibility.",
    intro: "Tell your Scout what you're looking for. Give it a direction worth following.",
    suggestions: GENERAL_FIELDS,
  },
  internships: {
    noun: "internships",
    kicker: "INTERNSHIP SCOUT",
    heading: "Start with the work you want to do.",
    intro: "Name a field and where you'd work. Your Scout looks through the internships in the Instela index and brings back a short list.",
    suggestions: ["Software engineering", "Civil engineering", "Nursing", "Marketing", "Data science", "Finance"],
  },
  scholarships: {
    noun: "scholarships",
    kicker: "SCHOLARSHIP SCOUT",
    heading: "Start with what you're studying.",
    intro: "Name your field and a few details. Your Scout looks through the scholarships in the Instela index and brings back a short list.",
    suggestions: GENERAL_FIELDS,
  },
  merit: {
    noun: "college merit awards",
    kicker: "MERIT AWARD SCOUT",
    heading: "Start with the college you're eyeing.",
    intro: "Name a field and, if you have one in mind, a college. Your Scout looks for merit awards that the sources state in their own words. Coverage varies by college.",
    suggestions: GENERAL_FIELDS,
  },
};

export function scoutCopy(focus: ScoutFocus | null): ScoutFocusCopy {
  return SCOUT_COPY[focus ?? "all"];
}

/** The button label for a tool: tailored, but always the same verb. */
export function scoutButtonLabel(focus: ScoutFocus | null): string {
  return focus ? `Start a Scout for ${SCOUT_COPY[focus].noun}` : "Start a Scout";
}
