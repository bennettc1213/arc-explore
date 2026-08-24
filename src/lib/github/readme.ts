/**
 * Profile README generator — deterministic, no model call.
 *
 * WHY NO MODEL, WHEN THE COVER LETTER USES ONE. Three reasons, and the first is
 * the one that decided it:
 *
 *  1. **Every fact in a README must be exact.** Repository names, URLs and
 *     languages are copied verbatim out of the API response here. A model
 *     retyping "instela" as "instella" produces a README with a dead link on
 *     the first page a recruiter opens, and nothing about the output would
 *     look wrong enough to catch — it is wrong by one character, in a string
 *     nobody proofreads. A cover letter is prose and needs a
 *     writer; a README is a scaffold around a list of facts we already hold.
 *  2. **`/github` is a public page with no login.** A generate button wired to
 *     a model on an unauthenticated form is a bill any visitor can run up.
 *  3. The same reasoning `resume/critique.ts` already gives: a model pass here
 *     would add cost, latency and the chance of inventing something.
 *
 * WHAT IT WILL NOT INVENT. Anything we do not hold becomes the same literal
 * `[YOUR SPECIFIC DETAIL: …]` marker the cover letter uses, so a student can
 * never publish a README asserting something no source of ours ever said. The
 * markers are listed back to them before they copy it.
 *
 * WHAT IT WILL NOT WRITE. Badge walls, animated banners, trophy widgets and
 * streak counters. The audit measures README length *after stripping images*,
 * on the grounds that a wall of shields.io badges is not text a reader gets
 * anything from — a generator that emitted them would fail the advice the
 * audit gives one panel away.
 */

import { markerSlotsFromText, slotMarker } from "../cover-letter/types";
import type { ParsedResume } from "../resume/types";
import type { UserProfile } from "../profile/types";

import { rankShowcaseRepos, type GhSnapshot } from "./types";

/** Repos listed under "what I've built". Six, matching the pin slots. */
const SHOWCASE_LIMIT = 6;

/** Languages named in the stack line. */
const LANGUAGE_LIMIT = 6;

/** Skills appended to the stack line from the resume. */
const SKILL_LIMIT = 10;

export interface ReadmeInput {
  snapshot: GhSnapshot;
  /** Null for a signed-out visitor — the README is thinner, not broken. */
  profile: UserProfile | null;
  resume: ParsedResume | null;
  /** The magic-link address, which is the one we know works. */
  accountEmail: string | null;
}

export interface GeneratedReadme {
  markdown: string;
  /** Every unfilled placeholder, in the order they appear. */
  slots: string[];
  /** Facts we used and where each came from, so nothing is unattributable. */
  sources: Array<{ fact: string; from: "github" | "profile" | "resume" | "account" }>;
}

/**
 * Placeholders in generated markdown.
 *
 * Uses the strict scanner from the cover-letter module — `slotsFromText` would
 * match any bracketed capitalised phrase, which in markdown means every link
 * label (`[LinkedIn](…)`) would be reported as a missing fact.
 */
export function readmeSlots(markdown: string): string[] {
  return markerSlotsFromText(markdown);
}

/** Languages the student's own repositories are actually written in. */
export function languagesInUse(snap: GhSnapshot): string[] {
  const counts = new Map<string, number>();
  for (const repo of snap.repos) {
    if (repo.isFork || !repo.language) continue;
    counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, LANGUAGE_LIMIT)
    .map(([lang]) => lang);
}

/** A markdown link, or plain text when there is nothing to link to. */
function link(label: string, url: string | null): string {
  return url ? `[${label}](${url})` : label;
}

function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** The first resume link matching a host, e.g. a LinkedIn profile. */
function linkMatching(resume: ParsedResume | null, re: RegExp): string | null {
  return normalizeUrl(resume?.links.find((l) => re.test(l)) ?? null);
}

export function generateProfileReadme(input: ReadmeInput): GeneratedReadme {
  const { snapshot: snap, profile, resume, accountEmail } = input;
  const sources: GeneratedReadme["sources"] = [];
  const note = (fact: string, from: GeneratedReadme["sources"][number]["from"]) =>
    sources.push({ fact, from });

  /* --- identity ------------------------------------------------- */

  let name: string;
  if (profile?.displayName) {
    name = profile.displayName;
    note("your name", "profile");
  } else if (resume?.name) {
    name = resume.name;
    note("your name", "resume");
  } else if (snap.user.name) {
    name = snap.user.name;
    note("your name", "github");
  } else {
    name = slotMarker("your name");
  }

  const lines: string[] = [`## Hi, I'm ${name}`, ""];

  /* --- the one-line who-you-are --------------------------------- */

  const school = profile?.school ?? resume?.school ?? null;
  const major = profile?.major ?? resume?.major ?? null;
  const gradYear = profile?.gradYear ?? resume?.gradYear ?? null;

  if (school || major || gradYear) {
    if (profile?.school || profile?.major || profile?.gradYear) note("school, major, graduation", "profile");
    else note("school, major, graduation", "resume");

    const study = major ? `${major} student` : "Student";
    const at = school ? ` at ${school}` : "";
    const when = gradYear ? `, graduating ${gradYear}` : "";
    lines.push(`${study}${at}${when}.`);
  } else {
    lines.push(`${slotMarker("what you study and where")}.`);
  }

  // What they build. We have a direction (target verticals) but never a claim
  // about what they have shipped, so this is a slot rather than a guess.
  lines.push(`I build ${slotMarker("what you build, in six words")}.`);
  lines.push("");

  /* --- currently ------------------------------------------------ */

  lines.push(`**Currently:** ${slotMarker("what you are working on right now")}`);
  lines.push("");

  /* --- stack ---------------------------------------------------- */

  const languages = languagesInUse(snap);
  if (languages.length > 0) note(`languages across ${snap.repos.length} public repos`, "github");

  const resumeSkills = (resume?.skills ?? [])
    .filter((s) => !languages.some((l) => l.toLowerCase() === s.toLowerCase()))
    .slice(0, SKILL_LIMIT);
  if (resumeSkills.length > 0) note("skills", "resume");

  const stack = [...languages, ...resumeSkills];
  if (stack.length > 0) {
    lines.push(`**Stack:** ${stack.join(" · ")}`);
  } else {
    lines.push(`**Stack:** ${slotMarker("the languages and tools you actually use")}`);
  }
  lines.push("");

  /* --- what I've built ------------------------------------------ */

  const showcase = rankShowcaseRepos(snap.repos).slice(0, SHOWCASE_LIMIT);
  if (showcase.length > 0) {
    note(`${showcase.length} repositories, verbatim`, "github");
    lines.push("### What I've built");
    lines.push("");
    for (const repo of showcase) {
      // The description is the student's own sentence about their own repo, so
      // it is quotable. Where they never wrote one, the README says so rather
      // than describing a project we have not read.
      const description =
        repo.description ?? slotMarker(`one line on what ${repo.name} does`);
      lines.push(`- **[${repo.name}](${repo.htmlUrl})** — ${description}`);
    }
    lines.push("");
  }

  /* --- reach me ------------------------------------------------- */

  const linkedin = linkMatching(resume, /linkedin\.com/i);
  const portfolio = normalizeUrl(profile?.portfolioUrl ?? snap.user.blog);
  const email = accountEmail ?? resume?.email ?? null;

  if (profile?.portfolioUrl) note("portfolio link", "profile");
  else if (snap.user.blog) note("website link", "github");
  if (linkedin) note("linkedin link", "resume");
  if (accountEmail) note("email", "account");
  else if (resume?.email) note("email", "resume");

  lines.push("### Reach me");
  lines.push("");
  lines.push(`- ${linkedin ? link("LinkedIn", linkedin) : slotMarker("your LinkedIn URL")}`);
  lines.push(`- ${portfolio ? link("Portfolio", portfolio) : slotMarker("your portfolio or personal site")}`);
  lines.push(`- ${email ?? slotMarker("the email you want recruiters to use")}`);

  const markdown = `${lines.join("\n").trimEnd()}\n`;
  return { markdown, slots: readmeSlots(markdown), sources };
}
