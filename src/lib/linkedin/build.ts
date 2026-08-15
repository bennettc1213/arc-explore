/**
 * LinkedIn profile builder — deterministic, no model call, no network call.
 *
 * WHY DETERMINISTIC, WHEN THE COVER LETTER USES A MODEL. The checker one panel
 * away penalises clichés: "passionate about", "hard-working", "eager to learn".
 * A model writing this section would produce those phrases sometimes — they are
 * the statistical centre of every LinkedIn About ever written — and we would be
 * generating text our own checker fails. A deterministic builder can *guarantee*
 * it never emits one, and `build.test.ts` asserts exactly that by running the
 * generated draft back through `checkLinkedIn`.
 *
 * WHAT IT IS AND IS NOT. A scaffold, not a finished profile. Every fact in it
 * comes from the student's profile or their parsed resume; everything else is
 * the same literal `[YOUR SPECIFIC DETAIL: …]` marker the cover letter and the
 * README generator use. The student writes the specifics — which is the right
 * division of labour, because the specifics are the only part a reader will
 * remember, and they are the part we genuinely do not know.
 */

import { slotMarker } from "../cover-letter/types";
import { INTEREST_OPTIONS, type UserProfile } from "../profile/types";
import { isQuantified, weakOpener } from "../resume/critique";
import type { ParsedResume } from "../resume/types";
import { skillsFromParsedResume } from "../score/skills";

import { HEADLINE_MAX } from "./types";

export interface BuilderInput {
  profile: UserProfile | null;
  resume: ParsedResume | null;
  accountEmail: string | null;
}

export interface BulletRewrite {
  /** The line as it stands on their resume. */
  before: string;
  /** The same line, restated against the pattern, with the gaps marked. */
  after: string;
  /** What was wrong with it — one of ours, not a generic lecture. */
  reason: string;
}

export interface LinkedInDraft {
  headline: string;
  about: string;
  bullets: BulletRewrite[];
  /** Every placeholder across the headline and about, in order. */
  slots: string[];
  /** Facts we used and where each came from. */
  sources: Array<{ fact: string; from: "profile" | "resume" | "account" }>;
}

const SLOT_RE = /\[YOUR SPECIFIC DETAIL: [^\]\n]+\]/g;

function slotsIn(...texts: string[]): string[] {
  return [...new Set(texts.flatMap((t) => t.match(SLOT_RE) ?? []))];
}

/** "software engineering" from the "software" key the profile stores. */
function verticalLabel(key: string): string {
  return INTEREST_OPTIONS.find((o) => o.value === key)?.label ?? key;
}

/** Strip a degree prefix so "B.S. Computer Science" reads as a subject. */
function subject(major: string): string {
  return major.replace(/^\s*(?:b\.?[as]\.?|m\.?[as]\.?|ph\.?d\.?|bachelors?|masters?)\s*(?:of|in)?\s*/i, "").trim() || major;
}

const HEADLINE_SKILLS = 3;
const ABOUT_SKILLS = 6;

/* ------------------------------------------------------------------ *
 * Headline
 * ------------------------------------------------------------------ */

/**
 * The student headline pattern, in the order the fields matter.
 *
 * Subject and school first because it is the claim a reader can verify at a
 * glance, stack second because it is what recruiter search matches on, target
 * last because it is the thing most students omit entirely and the thing that
 * gets them filtered *into* a list. Trimmed to LinkedIn's own 220 characters —
 * generating a headline the platform would truncate is the same failure the
 * checker flags.
 */
export function buildHeadline(input: BuilderInput, skills: string[]): string {
  const { profile, resume } = input;
  const parts: string[] = [];

  const major = profile?.major ?? resume?.major ?? null;
  const school = profile?.school ?? resume?.school ?? null;

  if (major && school) parts.push(`${subject(major)} @ ${school}`);
  else if (major) parts.push(subject(major));
  else if (school) parts.push(`${slotMarker("your major")} @ ${school}`);
  else parts.push(slotMarker("your major and school"));

  parts.push(skills.length > 0 ? skills.slice(0, HEADLINE_SKILLS).join(", ") : slotMarker("your three strongest tools"));

  const vertical = profile?.targetVerticals[0];
  const target = vertical ? verticalLabel(vertical) : slotMarker("the field you are targeting");
  parts.push(`Seeking ${slotMarker("term, e.g. Summer 2027")} ${target} internship`);

  const headline = parts.join(" | ");
  // Never emit something LinkedIn would cut. Dropping the middle keeps the
  // verifiable claim and the target, which are the two that survive being seen
  // in a search result.
  if (headline.length <= HEADLINE_MAX) return headline;
  return [parts[0], parts[2]].join(" | ").slice(0, HEADLINE_MAX);
}

/* ------------------------------------------------------------------ *
 * About
 * ------------------------------------------------------------------ */

/**
 * The strongest line on the resume, for the evidence paragraph.
 *
 * A quantified, strongly-opened bullet is preferred because it is the one the
 * student already wrote well — quoting it back is the highest-value thing we
 * can do with the About section, and it is theirs, so quoting it asserts
 * nothing we invented.
 */
export function strongestBullet(resume: ParsedResume | null): { bullet: string; where: string } | null {
  if (!resume) return null;
  const candidates = resume.experiences.flatMap((e) =>
    e.bullets.map((b) => ({ bullet: b, where: e.organization ?? e.role ?? "" })),
  );
  if (candidates.length === 0) return null;
  return (
    candidates.find((c) => isQuantified(c.bullet) && !weakOpener(c.bullet)) ??
    candidates.find((c) => isQuantified(c.bullet)) ??
    candidates.find((c) => !weakOpener(c.bullet)) ??
    candidates[0]
  );
}

export function buildAbout(input: BuilderInput, skills: string[]): string {
  const { profile, resume, accountEmail } = input;
  const paragraphs: string[] = [];

  const major = profile?.major ?? resume?.major ?? null;
  const school = profile?.school ?? resume?.school ?? null;
  const gradYear = profile?.gradYear ?? resume?.gradYear ?? null;

  /*
   * Paragraph one carries the fold.
   *
   * LinkedIn hides everything past roughly the first three lines behind "see
   * more", and the checker marks an opening with no specific in it as a
   * high-severity finding. So the concrete facts — subject, school, tools — go
   * first, ahead of any framing.
   */
  const study = major ? `${subject(major)}` : slotMarker("your major");
  const at = school ? ` at ${school}` : "";
  const grad = gradYear ? `, graduating ${gradYear}` : "";
  const stack = skills.length > 0 ? skills.slice(0, ABOUT_SKILLS).join(", ") : slotMarker("the tools you actually use");
  paragraphs.push(
    `I study ${study}${at}${grad}. I work mostly in ${stack}, and what I am building right now is ${slotMarker("the project you would talk about unprompted")}.`,
  );

  const strongest = strongestBullet(resume);
  if (strongest) {
    const where = strongest.where ? ` at ${strongest.where}` : "";
    paragraphs.push(`Most recently${where}: ${strongest.bullet}`);
  } else {
    paragraphs.push(
      `The thing I would point at first: ${slotMarker("one project or job, what you did, and what came of it — with a number in it")}.`,
    );
  }

  const vertical = profile?.targetVerticals[0];
  const target = vertical ? verticalLabel(vertical) : slotMarker("the field you are targeting");
  paragraphs.push(
    `I am looking for a ${slotMarker("term, e.g. Summer 2027")} internship in ${target}${
      profile?.targetLocations.length ? `, ideally in ${profile.targetLocations.slice(0, 3).join(" or ")}` : ""
    }${profile?.openToRemote ? ", and I am open to remote" : ""}.`,
  );

  const email = accountEmail ?? resume?.email ?? null;
  const portfolio = profile?.portfolioUrl ?? null;
  const contact = [email, portfolio].filter(Boolean).join(" · ");
  paragraphs.push(
    contact
      ? `Reach me at ${contact}.`
      : `Reach me at ${slotMarker("the email you want recruiters to use")}.`,
  );

  return paragraphs.join("\n\n");
}

/* ------------------------------------------------------------------ *
 * Bullet rewrites
 * ------------------------------------------------------------------ */

/** How many of the student's own weak lines we restate. */
const REWRITE_LIMIT = 4;

/**
 * The pattern, applied to lines already on their resume.
 *
 * Grounded rather than generic: a template page telling a student to "use
 * strong verbs" teaches nothing, where the same advice printed directly above
 * their own sentence is a specific edit they can make in a minute. The rewrite
 * never invents the number — it marks where one belongs.
 */
export function rewriteBullets(resume: ParsedResume | null): BulletRewrite[] {
  if (!resume) return [];
  const out: BulletRewrite[] = [];

  for (const experience of resume.experiences) {
    for (const bullet of experience.bullets) {
      if (out.length >= REWRITE_LIMIT) return out;

      const weak = weakOpener(bullet);
      const unquantified = !isQuantified(bullet);
      if (!weak && !unquantified) continue;

      // Strip the weak opener so what is left is the actual work described.
      const core = weak
        ? bullet.replace(/^\s*\S+(?:\s+\S+){0,2}?\s+/, "").replace(/^(?:to|the|a|an)\s+/i, "")
        : bullet.replace(/[.\s]+$/, "");

      const after = weak
        ? `${slotMarker("a verb: Built / Shipped / Automated / Cut / Led")} ${core}${
            unquantified ? `, ${slotMarker("what came of it, with a number")}` : ""
          }`
        : `${core}, ${slotMarker("what came of it, with a number")}`;

      out.push({
        before: bullet,
        after,
        reason: weak
          ? unquantified
            ? `opens with “${weak}” and states no outcome`
            : `opens with “${weak}”`
          : "states no outcome",
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export function buildLinkedInDraft(input: BuilderInput): LinkedInDraft {
  const sources: LinkedInDraft["sources"] = [];
  const note = (fact: string, from: LinkedInDraft["sources"][number]["from"]) =>
    sources.push({ fact, from });

  const skills = input.resume ? skillsFromParsedResume(input.resume) : [];
  if (skills.length > 0) note("your skills", "resume");
  if (input.profile?.major || input.profile?.school) note("major and school", "profile");
  else if (input.resume?.major || input.resume?.school) note("major and school", "resume");
  if (input.profile?.targetVerticals.length) note("the field you are targeting", "profile");
  if (input.accountEmail) note("email", "account");

  const headline = buildHeadline(input, skills);
  const about = buildAbout(input, skills);
  const bullets = rewriteBullets(input.resume);
  if (bullets.length > 0) note("your own experience bullets", "resume");

  return { headline, about, bullets, slots: slotsIn(headline, about), sources };
}
