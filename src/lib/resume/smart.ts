/**
 * Smart Resume converter: deterministic, no model call.
 *
 * THE STRUCTURING LOGIC, AS THE OWNER CHOSE IT (2026-11-15). The roadmap line
 * said "using the resume-structuring logic you provide" and CLAUDE.md forbade
 * inventing one. The owner's answer was "both": an ATS-standard layout as the
 * base, plus an optional pass that tailors it to one listing. What that means
 * here, exactly:
 *
 *  ATS STANDARD (always)
 *   1. One fixed section order: contact, education, experience, projects,
 *      skills. One column, plain headings (the renderer is `ResumeSheet`'s
 *      sibling and shares its stylesheet).
 *   2. Dates normalised to one shape ("Jun 2025 – Aug 2025", "Present").
 *      A date we cannot read is printed verbatim, never guessed.
 *   3. Experience in reverse-chronological order by end date. Entries with no
 *      readable date keep their original relative order, after the dated ones.
 *   4. Bullets within an entry ordered strongest first: quantified, then not
 *      opening with a weak phrase, then original order. Each bullet carries the
 *      critique engine's own flags (`weakOpener`, `isQuantified`) so the
 *      student sees what to fix; we never rewrite one.
 *   5. A one-page budget: when the resume runs over `ONE_PAGE_BULLET_BUDGET`
 *      bullets, at most `MAX_BULLETS_PER_ENTRY` per entry within that budget;
 *      always at most `MAX_PROJECTS` projects. What
 *      does not fit is returned as `omitted`, not deleted, so nothing the
 *      student wrote silently disappears.
 *   6. Skills de-duplicated case-insensitively, original spelling kept.
 *
 *  TAILORED (when a listing is given)
 *   7. The listing's skills come from `postings.skills`, plus anything
 *      `extractSkills` reads out of its title and eligibility text.
 *   8. Entries are ranked by how many of those skills they demonstrate
 *      (chronology breaks ties), bullets that demonstrate one move first, and
 *      matching skills lead the skills line.
 *   9. Listing skills the resume does not show are reported as `missingSkills`.
 *      They are NEVER added to the resume. Claiming a skill the student did not
 *      state is the single worst failure this product can have (see
 *      `types.ts`).
 *
 * WHAT THIS NEVER DOES: write a sentence, add a skill, compose a summary, or
 * alter a bullet's words. Every string in the output came from the parsed
 * resume (whitespace collapsed, dates reformatted). That is what lets it skip
 * a model call: a model pass would add cost, latency and the chance of
 * inventing a claim on a document that goes to an employer.
 */

import { isQuantified, weakOpener } from "./critique";
import type { ParsedResume } from "./types";
import { extractSkills } from "../score/skills";

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

export const MAX_BULLETS_PER_ENTRY = 5;
export const ONE_PAGE_BULLET_BUDGET = 16;
export const MAX_PROJECTS = 4;
const LONG_BULLET_WORDS = 45;

export type BulletFlag = "weak_opener" | "no_metric" | "too_long";

export interface SmartBullet {
  text: string;
  flags: BulletFlag[];
  /** Listing skills this bullet demonstrates (tailored mode only). */
  matched: string[];
}

export interface SmartExperience {
  heading: string;
  /** Normalised when we could read it, verbatim when we could not. */
  dates: string | null;
  /** False when `dates` is the verbatim string because it did not parse. */
  datesNormalised: boolean;
  location: string | null;
  bullets: SmartBullet[];
  /** Bullets left off by the one-page budget, as written. */
  omitted: string[];
  matched: string[];
}

export interface SmartProject {
  name: string;
  link: string | null;
  description: string | null;
  matched: string[];
}

export interface SmartTarget {
  title: string;
  company: string;
  skills: readonly string[];
  eligibility?: readonly string[];
}

export interface SmartResume {
  mode: "ats" | "tailored";
  target: { title: string; company: string } | null;
  name: string | null;
  contact: string[];
  education: string[];
  experiences: SmartExperience[];
  projects: SmartProject[];
  omittedProjects: string[];
  skills: string[];
  /** Listing skills the resume demonstrates. Empty in ATS mode. */
  matchedSkills: string[];
  /** Listing skills the resume does not show. Reported, never added. */
  missingSkills: string[];
  /** What the converter did, in sentences a student can check. */
  notes: string[];
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const FULL_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEASON_MONTH: Record<string, number> = { spring: 2, summer: 5, fall: 8, autumn: 8, winter: 11 };
const SEASON_LABEL: Record<string, string> = { spring: "Spring", summer: "Summer", fall: "Fall", autumn: "Fall", winter: "Winter" };

/** One end of a range. `sort` is year*12+month; Present is +Infinity. */
interface DatePoint {
  label: string;
  sort: number;
}

function parsePoint(raw: string): DatePoint | null {
  const s = raw.trim().toLowerCase().replace(/\.$/, "");
  if (/^(present|current|now|ongoing|today)$/.test(s)) return { label: "Present", sort: Number.POSITIVE_INFINITY };

  // "Jun 2025", "June 2025", "Sept. 2025"
  let m = s.match(/^([a-z]{3,9})\.?\s+((?:19|20)\d{2})$/);
  if (m) {
    const word = m[1];
    const year = Number(m[2]);
    if (SEASON_MONTH[word] !== undefined) return { label: `${SEASON_LABEL[word]} ${year}`, sort: year * 12 + SEASON_MONTH[word] };
    // Exact names only: a prefix test would read "Marketing 2025" as March.
    const idx = MONTHS.indexOf(word.slice(0, 3));
    if (idx >= 0 && (word === MONTHS[idx] || word === FULL_MONTHS[idx] || word === "sept")) {
      return { label: `${MONTH_LABEL[idx]} ${year}`, sort: year * 12 + idx };
    }
    return null;
  }

  // "06/2025", "6/2025", "2025-06"
  m = s.match(/^(\d{1,2})\/((?:19|20)\d{2})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) {
    const idx = Number(m[1]) - 1;
    return { label: `${MONTH_LABEL[idx]} ${m[2]}`, sort: Number(m[2]) * 12 + idx };
  }
  m = s.match(/^((?:19|20)\d{2})-(\d{1,2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    const idx = Number(m[2]) - 1;
    return { label: `${MONTH_LABEL[idx]} ${m[1]}`, sort: Number(m[1]) * 12 + idx };
  }

  // A bare year sorts as December so "2024" ranks after "Jun 2024".
  m = s.match(/^((?:19|20)\d{2})$/);
  if (m) return { label: m[1], sort: Number(m[1]) * 12 + 11 };

  return null;
}

export interface NormalisedDates {
  label: string;
  /** Sort key of the END of the range (or the single date). */
  end: number;
}

/**
 * Read a resume date string into one display shape.
 *
 * Returns null when any part is unreadable. The caller then prints the
 * original, because a reformatted date that is wrong is worse than an ugly one
 * that is right.
 */
export function normaliseDates(raw: string | null): NormalisedDates | null {
  if (!raw) return null;
  const parts = raw.split(/\s*(?:–|—|-|\bto\b|\buntil\b|\bthrough\b)\s*/i).filter((p) => p.trim().length > 0);
  // "2025-06" splits on its hyphen; try the whole string as one point first.
  const whole = parsePoint(raw);
  if (whole) return { label: whole.label, end: whole.sort };
  if (parts.length !== 2) return null;
  const start = parsePoint(parts[0]);
  const end = parsePoint(parts[1]);
  if (!start || !end) return null;
  if (start.label === end.label) return { label: start.label, end: end.sort };
  return { label: `${start.label} – ${end.label}`, end: end.sort };
}

/* ------------------------------------------------------------------ *
 * Bullets
 * ------------------------------------------------------------------ */

function clean(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function bulletFlags(text: string): BulletFlag[] {
  const flags: BulletFlag[] = [];
  if (weakOpener(text)) flags.push("weak_opener");
  if (!isQuantified(text)) flags.push("no_metric");
  if (text.split(/\s+/).filter(Boolean).length > LONG_BULLET_WORDS) flags.push("too_long");
  return flags;
}

function matchedIn(wanted: ReadonlySet<string>, ...texts: string[]): string[] {
  if (wanted.size === 0) return [];
  return extractSkills(...texts).filter((s) => wanted.has(s));
}

/** Strongest first. Stable: equal bullets keep the student's order. */
function rankBullets(bullets: SmartBullet[]): SmartBullet[] {
  const strength = (b: SmartBullet) =>
    b.matched.length * 100 + (b.flags.includes("no_metric") ? 0 : 10) + (b.flags.includes("weak_opener") ? 0 : 5);
  return bullets
    .map((b, i) => ({ b, i }))
    .sort((x, y) => strength(y.b) - strength(x.b) || x.i - y.i)
    .map(({ b }) => b);
}

/* ------------------------------------------------------------------ *
 * The converter
 * ------------------------------------------------------------------ */

/** The listing skills tailoring may rank against. */
export function targetSkills(target: SmartTarget): string[] {
  const set = new Set<string>(target.skills);
  for (const s of extractSkills(target.title, ...(target.eligibility ?? []))) set.add(s);
  return [...set];
}

export function buildSmartResume(parsed: ParsedResume, target: SmartTarget | null = null): SmartResume {
  const wantedList = target ? targetSkills(target) : [];
  const wanted = new Set(wantedList);
  const tailoring = target !== null && wanted.size > 0;
  const notes: string[] = [];

  /* contact and education: order fixed, content as stated */
  const contact = [parsed.email, parsed.phone, ...parsed.links].filter((v): v is string => Boolean(v)).map(clean);
  const education = [
    parsed.school,
    parsed.major,
    parsed.gradYear ? `Class of ${parsed.gradYear}` : null,
    parsed.gpa !== null ? `GPA ${parsed.gpa}` : null,
  ].filter((v): v is string => Boolean(v));

  /* experience */
  let unreadableDates = 0;
  const built = parsed.experiences
    .filter((e) => e.role || e.organization || e.bullets.length > 0)
    .map((e, index) => {
      const norm = normaliseDates(e.dates);
      if (e.dates && !norm) unreadableDates++;
      const bullets = rankBullets(
        e.bullets.map(clean).filter(Boolean).map((text) => ({ text, flags: bulletFlags(text), matched: matchedIn(wanted, text) })),
      );
      const entryMatched = [...new Set([...matchedIn(wanted, e.role ?? "", e.organization ?? ""), ...bullets.flatMap((b) => b.matched)])];
      return {
        index,
        end: norm?.end ?? null,
        entry: {
          heading: [e.role, e.organization].filter(Boolean).map((s) => clean(s as string)).join(" — ") || "—",
          dates: norm?.label ?? (e.dates ? clean(e.dates) : null),
          datesNormalised: Boolean(norm),
          location: e.location ? clean(e.location) : null,
          bullets,
          omitted: [] as string[],
          matched: entryMatched,
        } satisfies SmartExperience,
      };
    });

  const chronological = (a: (typeof built)[number], b: (typeof built)[number]) => {
    if (a.end !== null && b.end !== null) return b.end - a.end || a.index - b.index;
    if (a.end !== null) return -1;
    if (b.end !== null) return 1;
    return a.index - b.index;
  };
  built.sort((a, b) => (tailoring ? b.entry.matched.length - a.entry.matched.length : 0) || chronological(a, b));

  // One-page budget, spent in display order. Every entry keeps at least one
  // bullet, so a role never prints as a bare heading because older roles
  // happened to sit lower.
  //
  // The caps bind only when the resume is actually over budget. Measured on
  // the live corpus: a resume parsed into one headless entry with 8 bullets
  // lost 3 of them to the per-entry cap while the whole document fit a page
  // with room to spare.
  const totalBullets = built.reduce((n, b) => n + b.entry.bullets.length, 0);
  const overBudget = totalBullets > ONE_PAGE_BULLET_BUDGET;
  let budget = ONE_PAGE_BULLET_BUDGET;
  let omittedBullets = 0;
  const experiences = built.map(({ entry }, i) => {
    const entriesLeft = built.length - i - 1;
    const allowance = overBudget
      ? Math.max(1, Math.min(MAX_BULLETS_PER_ENTRY, budget - entriesLeft))
      : entry.bullets.length;
    const keep = entry.bullets.slice(0, allowance);
    const omitted = entry.bullets.slice(allowance).map((b) => b.text);
    budget -= keep.length;
    omittedBullets += omitted.length;
    return { ...entry, bullets: keep, omitted };
  });

  /* projects */
  const projectRows = parsed.projects
    .filter((p) => p.name || p.description)
    .map((p, index) => ({
      index,
      project: {
        name: p.name ? clean(p.name) : "Project",
        link: p.link ? clean(p.link) : null,
        description: p.description ? clean(p.description) : null,
        matched: matchedIn(wanted, p.name ?? "", p.description ?? ""),
      } satisfies SmartProject,
    }));
  if (tailoring) projectRows.sort((a, b) => b.project.matched.length - a.project.matched.length || a.index - b.index);
  const projects = projectRows.slice(0, MAX_PROJECTS).map((r) => r.project);
  const omittedProjects = projectRows.slice(MAX_PROJECTS).map((r) => r.project.name);

  /* skills: de-duplicated, matching ones first when tailoring */
  const seen = new Set<string>();
  const skillRows: Array<{ raw: string; matched: boolean; index: number }> = [];
  parsed.skills.forEach((raw, index) => {
    const s = clean(raw);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) return;
    seen.add(key);
    skillRows.push({ raw: s, matched: matchedIn(wanted, s).length > 0, index });
  });
  const duplicates = parsed.skills.length - skillRows.length;
  if (tailoring) skillRows.sort((a, b) => Number(b.matched) - Number(a.matched) || a.index - b.index);
  const skills = skillRows.map((r) => r.raw);

  /* what the resume shows of the listing, and what it does not */
  const shown = new Set<string>();
  if (tailoring) {
    // `built` still holds bullets the page budget left off: a skill shown only
    // in an omitted bullet is on the resume, so it is not "missing".
    for (const e of built) e.entry.matched.forEach((s) => shown.add(s));
    for (const p of projectRows) p.project.matched.forEach((s) => shown.add(s));
    for (const s of skills) matchedIn(wanted, s).forEach((m) => shown.add(m));
  }
  const matchedSkills = wantedList.filter((s) => shown.has(s));
  const missingSkills = tailoring ? wantedList.filter((s) => !shown.has(s)) : [];

  /* notes, in the order the student would check them */
  notes.push("Sections are in the standard order: contact, education, experience, projects, skills.");
  if (target && !tailoring) {
    notes.push(
      `${target.company}'s listing names no skills we can read, so there was nothing to tailor against. This is the standard layout.`,
    );
  }
  if (tailoring) {
    notes.push(
      `Ordered for ${target!.title} at ${target!.company}: entries and bullets that show its skills come first, and matching skills lead your skills line.`,
    );
  } else if (experiences.length > 1) {
    notes.push("Experience is newest first, by end date.");
  }
  if (unreadableDates > 0) {
    notes.push(`${unreadableDates} date${unreadableDates === 1 ? "" : "s"} could not be read and ${unreadableDates === 1 ? "is" : "are"} printed exactly as you wrote ${unreadableDates === 1 ? "it" : "them"}.`);
  }
  if (omittedBullets > 0 || omittedProjects.length > 0) {
    const parts = [
      omittedBullets > 0 ? `${omittedBullets} bullet${omittedBullets === 1 ? "" : "s"}` : null,
      omittedProjects.length > 0 ? `${omittedProjects.length} project${omittedProjects.length === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    notes.push(`${parts.join(" and ")} left off to fit one page. They are listed below the sheet, not deleted.`);
  }
  if (duplicates > 0) notes.push(`${duplicates} repeated skill${duplicates === 1 ? "" : "s"} removed.`);
  notes.push("No wording was changed. Every line is from your resume.");

  return {
    mode: tailoring ? "tailored" : "ats",
    target: target ? { title: target.title, company: target.company } : null,
    name: parsed.name ? clean(parsed.name) : null,
    contact,
    education,
    experiences,
    projects,
    omittedProjects,
    skills,
    matchedSkills,
    missingSkills,
    notes,
  };
}

/** The allowance key: one resume revision, converted for one target. */
export function smartResumeGrantKey(revisionKey: string, listingId: string | null): string {
  return `${revisionKey}|${listingId ?? "ats"}`;
}
