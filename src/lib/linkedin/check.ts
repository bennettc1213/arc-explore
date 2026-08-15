/**
 * LinkedIn profile checker — deterministic, no model call, no network call.
 *
 * NO NETWORK CALL IS THE POINT. See `types.ts`: fetching a LinkedIn profile is
 * the one thing that could end this project, so this scores text the student
 * pasted and nothing else. Everything below is counted off that text.
 *
 * THE HONEST LIMIT, WHICH THE UI ALSO STATES. The GitHub audit can say "we
 * fetched your profile and there is no README". This cannot. It can only say
 * "the text you gave us has no numbers in it", and if they pasted the wrong
 * thing, the score is about the wrong thing. That is a real weakness of the
 * paste-in design and it is still the right design.
 *
 * WHY THE EXPERIENCE RULES ARE IMPORTED RATHER THAN RESTATED. `isQuantified`
 * and `weakOpener` come from `resume/critique.ts` — the same functions, not a
 * second copy. A student who is told on one page that "Responsible for" is weak
 * and on another that it is fine has been given two products' worth of advice
 * by one product. Restating the regexes would guarantee that drift eventually.
 */

import { isQuantified, weakOpener } from "../resume/critique";
import { extractSkills } from "../score/skills";

import {
  ABOUT_FOLD,
  ABOUT_MAX,
  HEADLINE_MAX,
  SKILLS_MAX,
  parseBulletLines,
  parseSkillList,
  type LinkedInInput,
} from "./types";

export type CheckSection = "headline" | "about" | "experience" | "skills" | "recommendations";

export type DimensionKey = CheckSection;

export interface Finding {
  section: CheckSection;
  dimension: DimensionKey;
  severity: "high" | "medium" | "low";
  title: string;
  /** Always an instruction, never a diagnosis. */
  fix: string;
  evidence?: string;
}

export interface CheckDimension {
  key: DimensionKey;
  label: string;
  /** 0–100, or null when the student pasted nothing to assess. */
  score: number | null;
  detail: string;
  weight: number;
}

export interface LinkedInCheck {
  score: number | null;
  dimensions: CheckDimension[];
  findings: Finding[];
  knownDimensions: number;
  totalDimensions: number;
  /** Canonical skills recognised in what they pasted — feeds the gap panel. */
  recognisedSkills: string[];
}

interface Assessed {
  dimension: CheckDimension;
  findings: Finding[];
}

function quote(s: string, max = 110): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, t.lastIndexOf(" ", max))}…`;
}

/* ------------------------------------------------------------------ *
 * Headline
 * ------------------------------------------------------------------ */

/**
 * LinkedIn's auto-generated headline.
 *
 * When a student fills in "Student" and their school, LinkedIn writes this for
 * them and most people never change it. It is the highest-weighted text field
 * on the profile for LinkedIn's own search, so leaving it as the default is the
 * single most common and most costly thing wrong with a student profile —
 * which is why it gets its own high-confidence check rather than being folded
 * into a general "too short".
 */
const DEFAULT_HEADLINE =
  /^\s*(?:student|undergraduate|undergrad|graduate student|masters? student|phd student)\s+at\s+\S.*$/i;

/** Words that say what someone does, as opposed to where they are enrolled. */
const ROLE_NOUNS =
  /\b(engineer|engineering|developer|dev|programmer|analyst|scientist|researcher|designer|architect|consultant|accountant|marketer|strategist|manager|founder|intern|internship|technician|writer|editor|nurse|teacher|educator|paralegal|advisor)\b/i;

/** A stated target — the thing recruiters filter on and students omit. */
const SEEKING =
  /\b(seeking|open to|looking for|available for|recruiting for|targeting)\b/i;

/**
 * Phrases that occupy space without making a claim.
 *
 * Kept tight for the same reason `WEAK_OPENERS` is: a checker that flags decent
 * writing gets ignored wholesale. Every entry is a phrase that would survive
 * being deleted with no loss of information.
 */
const CLICHES: Array<{ re: RegExp; phrase: string }> = [
  // "passionate", not "passionate about": the noun phrase "a passionate
  // student" is the same filler and is at least as common.
  { re: /\bpassionate\b/i, phrase: "passionate" },
  { re: /\bhard[- ]working\b/i, phrase: "hard-working" },
  { re: /\bteam player\b/i, phrase: "team player" },
  { re: /\bdetail[- ]oriented\b/i, phrase: "detail-oriented" },
  { re: /\bresults[- ]driven\b/i, phrase: "results-driven" },
  { re: /\bself[- ]starter\b/i, phrase: "self-starter" },
  { re: /\bgo[- ]getter\b/i, phrase: "go-getter" },
  { re: /\bthink(?:ing)? outside the box\b/i, phrase: "thinking outside the box" },
  { re: /\bwear(?:s|ing)? many hats\b/i, phrase: "wearing many hats" },
  { re: /\baspiring\b/i, phrase: "aspiring" },
  { re: /\beager to learn\b/i, phrase: "eager to learn" },
  { re: /\bproven track record\b/i, phrase: "proven track record" },
];

export function clichesIn(text: string): string[] {
  return CLICHES.filter((c) => c.re.test(text)).map((c) => c.phrase);
}

function assessHeadline(input: LinkedInInput): Assessed {
  const headline = input.headline.trim();
  const findings: Finding[] = [];

  if (!headline) {
    return {
      dimension: {
        key: "headline",
        label: "headline",
        score: null,
        detail: "Nothing pasted.",
        weight: 30,
      },
      findings: [],
    };
  }

  const checks: boolean[] = [];

  const isDefault = DEFAULT_HEADLINE.test(headline);
  checks.push(!isDefault);
  if (isDefault) {
    findings.push({
      section: "headline",
      dimension: "headline",
      severity: "high",
      title: "This is the headline LinkedIn wrote for you",
      fix: `“${quote(headline, 60)}” is what LinkedIn generates from your school and enrolment status. It is also the highest-weighted text on your profile for LinkedIn's own search, so it is the most expensive field to leave on the default. Replace it with what you do and what you want: role, stack, and what you are looking for.`,
      evidence: headline,
    });
  }

  const overLimit = headline.length > HEADLINE_MAX;
  checks.push(!overLimit);
  if (overLimit) {
    findings.push({
      section: "headline",
      dimension: "headline",
      severity: "medium",
      title: `Your headline is ${headline.length} characters — LinkedIn allows ${HEADLINE_MAX}`,
      fix: `LinkedIn will cut it. Trim to ${HEADLINE_MAX} and put the most specific words first, since the front of the line is what shows in search results and comment threads.`,
    });
  }

  // A headline under about a third of the field is leaving the most
  // search-weighted text on the profile mostly empty.
  const usesTheField = headline.length >= 60 || isDefault;
  checks.push(headline.length >= 60);
  if (!usesTheField && !isDefault) {
    findings.push({
      section: "headline",
      dimension: "headline",
      severity: "medium",
      title: `Your headline uses ${headline.length} of ${HEADLINE_MAX} available characters`,
      fix: "There is room for your target role, your stack and what you are looking for. This is the one field that follows you into every search result, comment and connection request.",
      evidence: headline,
    });
  }

  const skills = extractSkills(headline);
  const namesRole = ROLE_NOUNS.test(headline);
  const saysWhatYouDo = skills.length > 0 || namesRole;
  checks.push(saysWhatYouDo);
  if (!saysWhatYouDo) {
    findings.push({
      section: "headline",
      dimension: "headline",
      severity: "high",
      title: "Your headline does not say what you do",
      fix: "Name the work, not just the enrolment — “Software Engineering” or “Data Analysis” or the tools you use. A recruiter filtering for a skill cannot find a headline that only states where you are a student.",
      evidence: headline,
    });
  }

  const statesTarget = SEEKING.test(headline);
  checks.push(statesTarget);
  if (!statesTarget) {
    findings.push({
      section: "headline",
      dimension: "headline",
      severity: "low",
      title: "Your headline does not say what you are looking for",
      fix: "Add it plainly: “Seeking Summer 2027 software engineering internship”. Recruiters search this field, and students who state a term and a target get filtered *into* lists rather than out of them.",
    });
  }

  const cliches = clichesIn(headline);
  checks.push(cliches.length === 0);
  if (cliches.length > 0) {
    findings.push({
      section: "headline",
      dimension: "headline",
      severity: "medium",
      title: `Your headline spends characters on ${cliches.length === 1 ? "a phrase that" : "phrases that"} could be deleted`,
      fix: "Every one of these survives deletion with no loss of information, and they are competing for the most valuable line on your profile. Replace them with something only you could have written.",
      evidence: cliches.join(", "),
    });
  }

  const passed = checks.filter(Boolean).length;
  return {
    dimension: {
      key: "headline",
      label: "headline",
      score: Math.round((passed / checks.length) * 100),
      detail: `${passed} of ${checks.length} checks passed on ${headline.length} characters.`,
      weight: 30,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * About
 * ------------------------------------------------------------------ */

/** Third-person self-description reads as a bio someone else wrote. */
const THIRD_PERSON_OPENER = /^\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:is|has|works|studies|brings)\b/;

const FIRST_PERSON = /\b(?:I|I'm|I've|my|me)\b/i;

function assessAbout(input: LinkedInInput): Assessed {
  const about = input.about.trim();
  const findings: Finding[] = [];

  if (!about) {
    return {
      dimension: { key: "about", label: "about section", score: 0, detail: "Nothing pasted.", weight: 25 },
      findings: [
        {
          section: "about",
          dimension: "about",
          severity: "high",
          title: "You have no About section",
          fix: "Write three or four short paragraphs: what you work on, one thing you built and what came of it, what you are looking for, and how to reach you. It is the only place on the profile where you get to write in your own voice at length.",
        },
      ],
    };
  }

  const checks: boolean[] = [];

  const overLimit = about.length > ABOUT_MAX;
  checks.push(!overLimit);
  if (overLimit) {
    findings.push({
      section: "about",
      dimension: "about",
      severity: "medium",
      title: `Your About section is ${about.length} characters — LinkedIn allows ${ABOUT_MAX}`,
      fix: `Cut it to ${ABOUT_MAX}. The rest is not being displayed to anyone.`,
    });
  }

  const substantial = about.length >= 400;
  checks.push(substantial);
  if (!substantial) {
    findings.push({
      section: "about",
      dimension: "about",
      severity: "medium",
      title: `Your About section is ${about.length} characters of ${ABOUT_MAX}`,
      fix: "Three or four short paragraphs is the working length. There is room here for the one project you would actually talk about in an interview, and that is what makes the section worth reading.",
    });
  }

  /*
   * The fold.
   *
   * LinkedIn truncates About behind a "…see more" link, so the opening is the
   * only part most readers ever see. An opening that spends it on throat-
   * clearing has spent the whole section.
   */
  const opening = about.slice(0, ABOUT_FOLD);
  const openingSpecific = /\d/.test(opening) || extractSkills(opening).length > 0;
  checks.push(openingSpecific);
  if (!openingSpecific) {
    findings.push({
      section: "about",
      dimension: "about",
      severity: "high",
      title: "Nothing specific appears before the “see more” fold",
      fix: "LinkedIn hides everything after roughly the first three lines. Put a real detail up there — a technology, a number, the thing you built — because for most readers the opening is the entire section.",
      evidence: quote(opening, 140),
    });
  }

  const firstPerson = FIRST_PERSON.test(about) && !THIRD_PERSON_OPENER.test(about);
  checks.push(firstPerson);
  if (!firstPerson) {
    findings.push({
      section: "about",
      dimension: "about",
      severity: "low",
      title: "Your About section is written in the third person",
      fix: "Write it as yourself. A profile that refers to you by name reads as copy someone else produced, and on LinkedIn the About section is the one place a reader expects your own voice.",
      evidence: quote(about, 100),
    });
  }

  const cliches = clichesIn(about);
  checks.push(cliches.length === 0);
  if (cliches.length > 0) {
    findings.push({
      section: "about",
      dimension: "about",
      severity: cliches.length > 2 ? "high" : "medium",
      title: `${cliches.length} phrase${cliches.length === 1 ? "" : "s"} here could appear on anyone's profile`,
      fix: "Swap each one for the specific thing behind it. “Passionate about data” and “I spent a summer cleaning 40,000 rows of survey data by hand and then wrote the script that did it in four minutes” are the same claim, and only one of them is evidence.",
      evidence: cliches.join(", "),
    });
  }

  const contactable = /@|\bmailto:|https?:\/\/|\bemail me\b|\breach me\b|\bget in touch\b/i.test(about);
  checks.push(contactable);
  if (!contactable) {
    findings.push({
      section: "about",
      dimension: "about",
      severity: "low",
      title: "There is no way to contact you in your About section",
      fix: "End with your email or a portfolio link. Recruiters who cannot message you without a connection request will often simply move on.",
    });
  }

  const passed = checks.filter(Boolean).length;
  return {
    dimension: {
      key: "about",
      label: "about section",
      score: Math.round((passed / checks.length) * 100),
      detail: `${passed} of ${checks.length} checks passed on ${about.length} characters.`,
      weight: 25,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Experience
 * ------------------------------------------------------------------ */

const QUANTIFIED_TARGET = 0.5;

function assessExperience(input: LinkedInInput): Assessed {
  const bullets = parseBulletLines(input.experience);
  const findings: Finding[] = [];

  if (bullets.length === 0) {
    return {
      dimension: {
        key: "experience",
        label: "experience bullets",
        score: null,
        detail: "Nothing pasted.",
        weight: 20,
      },
      findings: [],
    };
  }

  const quantified = bullets.filter(isQuantified);
  const weak = bullets
    .map((b) => ({ bullet: b, phrase: weakOpener(b) }))
    .filter((x): x is { bullet: string; phrase: string } => x.phrase !== null);

  const share = quantified.length / bullets.length;
  if (share < QUANTIFIED_TARGET) {
    findings.push({
      section: "experience",
      dimension: "experience",
      severity: share === 0 ? "high" : "medium",
      title:
        quantified.length === 0
          ? `None of your ${bullets.length} experience lines carry a number`
          : `${quantified.length} of ${bullets.length} experience lines carry a number`,
      fix: "Add scale or outcome — how many users, how much faster, how many records, how much money. These are the same rules our resume critique applies, deliberately: your LinkedIn and your resume are read by the same people and should not be graded against different standards.",
      evidence: quote(bullets.find((b) => !isQuantified(b) && !weakOpener(b)) ?? bullets[0]),
    });
  }

  if (weak.length > 0) {
    findings.push({
      section: "experience",
      dimension: "experience",
      severity: weak.length > bullets.length / 3 ? "high" : "medium",
      title: `${weak.length} line${weak.length === 1 ? "" : "s"} open with a phrase that describes the job, not your work`,
      fix: `Start with what you did: “Built”, “Shipped”, “Reduced”, “Automated”, “Led”. “${weak[0].phrase}” says you were near the work without saying what you changed about it.`,
      evidence: quote(weak[0].bullet),
    });
  }

  const cliches = clichesIn(input.experience);
  if (cliches.length > 0) {
    findings.push({
      section: "experience",
      dimension: "experience",
      severity: "low",
      title: `${cliches.length} filler phrase${cliches.length === 1 ? "" : "s"} in your experience text`,
      fix: "Delete them. In an experience entry they take the place of the specific thing you actually did.",
      evidence: cliches.join(", "),
    });
  }

  const clean = bullets.length - new Set(weak.map((w) => w.bullet)).size;
  const quantifiedScore = Math.min(1, share / QUANTIFIED_TARGET);
  const languageScore = clean / bullets.length;
  const score = Math.round(((quantifiedScore + languageScore) / 2) * 100);

  return {
    dimension: {
      key: "experience",
      label: "experience bullets",
      score,
      detail: `${quantified.length} of ${bullets.length} lines state a number; ${clean} of ${bullets.length} open strongly.`,
      weight: 20,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Skills
 * ------------------------------------------------------------------ */

/** Below this, a profile is missing most of the searches it could appear in. */
const SKILLS_TARGET = 15;

function assessSkills(input: LinkedInInput): Assessed {
  const listed = parseSkillList(input.skills);
  const findings: Finding[] = [];

  if (listed.length === 0) {
    return {
      dimension: { key: "skills", label: "skills", score: null, detail: "Nothing pasted.", weight: 15 },
      findings: [],
    };
  }

  if (listed.length > SKILLS_MAX) {
    findings.push({
      section: "skills",
      dimension: "skills",
      severity: "low",
      title: `You listed ${listed.length} skills — LinkedIn caps the profile at ${SKILLS_MAX}`,
      fix: `Keep the ${SKILLS_MAX} you would defend in an interview and drop the rest.`,
    });
  } else if (listed.length < SKILLS_TARGET) {
    findings.push({
      section: "skills",
      dimension: "skills",
      severity: "medium",
      title: `You have ${listed.length} skill${listed.length === 1 ? "" : "s"} listed of ${SKILLS_MAX} allowed`,
      fix: `Recruiter search on LinkedIn matches against this list directly, so every slot you leave empty is a search you cannot appear in. Aim for ${SKILLS_TARGET} or more, all things you would defend in an interview.`,
    });
  }

  const recognised = extractSkills(listed.join(", "));

  const score = Math.round(Math.min(1, listed.length / SKILLS_TARGET) * 100);
  return {
    dimension: {
      key: "skills",
      label: "skills",
      score: listed.length > SKILLS_MAX ? 100 : score,
      detail: `${listed.length} listed, ${recognised.length} of which our matcher also recognises from real postings.`,
      weight: 15,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Recommendations
 * ------------------------------------------------------------------ */

function assessRecommendations(input: LinkedInInput): Assessed {
  const n = input.recommendations;
  if (n === null) {
    // Not stated is not zero. Dropping the dimension is the same rule the fit
    // score follows everywhere else.
    return {
      dimension: {
        key: "recommendations",
        label: "recommendations",
        score: null,
        detail: "Not stated.",
        weight: 10,
      },
      findings: [],
    };
  }

  const findings: Finding[] = [];
  if (n === 0) {
    findings.push({
      section: "recommendations",
      dimension: "recommendations",
      severity: "medium",
      title: "You have no recommendations",
      fix: "Ask two people who have actually seen you work — a manager from a summer job, a professor whose project you did well in, a teammate. Offer to write theirs first; that is what makes the ask easy to say yes to. One specific paragraph beats five generic ones.",
    });
  } else if (n < 2) {
    findings.push({
      section: "recommendations",
      dimension: "recommendations",
      severity: "low",
      title: "You have one recommendation",
      fix: "A second, from someone in a different context, is worth more than the first was — two people independently vouching reads differently from one.",
    });
  }

  const score = n === 0 ? 0 : n === 1 ? 60 : n === 2 ? 85 : 100;
  return {
    dimension: {
      key: "recommendations",
      label: "recommendations",
      score,
      detail: `${n} recommendation${n === 1 ? "" : "s"}, as you reported.`,
      weight: 10,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

const SEVERITY_RANK: Record<Finding["severity"], number> = { high: 0, medium: 1, low: 2 };

export function checkLinkedIn(input: LinkedInInput): LinkedInCheck {
  const assessed = [
    assessHeadline(input),
    assessAbout(input),
    assessExperience(input),
    assessSkills(input),
    assessRecommendations(input),
  ];

  const dimensions = assessed.map((a) => a.dimension);
  const scored = dimensions.filter((d) => d.score !== null);
  const totalWeight = scored.reduce((s, d) => s + d.weight, 0);
  const score =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((s, d) => s + d.weight * (d.score as number), 0) / totalWeight);

  const headroom = new Map<DimensionKey, number>(
    dimensions.map((d) => [d.key, d.score === null ? 0 : ((100 - d.score) / 100) * d.weight]),
  );

  const findings = assessed
    .flatMap((a) => a.findings)
    .sort(
      (a, b) =>
        (headroom.get(b.dimension) ?? 0) - (headroom.get(a.dimension) ?? 0) ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );

  return {
    score,
    dimensions,
    findings,
    knownDimensions: scored.length,
    totalDimensions: dimensions.length,
    recognisedSkills: extractSkills(input.skills, input.headline, input.about, input.experience),
  };
}
