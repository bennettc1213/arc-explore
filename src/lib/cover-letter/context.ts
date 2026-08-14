/**
 * Cover letter grounding — the only facts the generator may assert.
 *
 * This module decides what a letter may *honestly* say. It assembles the
 * candidate's facts (profile + parsed resume), the posting's own facts, and
 * the evidence entries that actually support the application — and, crucially,
 * the list of gaps: specifics the letter will need that we do not have.
 *
 * Everything here is deterministic. No model is consulted, so every rule is
 * unit-testable, and so the generator cannot drift: it receives exactly this
 * context, and the anti-fabrication prompt in `generate.ts` tells it that
 * anything not in this context is a lie. This is the same contract as
 * `lib/resume/types.ts` — a parsed resume is the only source the email
 * generator may quote from.
 */

import type { FeedItem } from "../feed";
import type { ParsedResume } from "../resume/types";
import { extractSkills, skillsFromParsedResume } from "../score/skills";
import type { UserProfile } from "../profile/types";

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

export interface CandidateFacts {
  name: string | null;
  email: string | null;
  phone: string | null;
  school: string | null;
  major: string | null;
  gradYear: number | null;
  gpa: number | null;
  /** Canonical skills the resume demonstrates. */
  skills: string[];
  portfolioUrl: string | null;
  workAuth: string | null;
  /** Profile interest areas — allowed as a *direction*, never as a claim. */
  targetVerticals: string[];
}

export interface PostingFacts {
  kind: "internship" | "scholarship";
  title: string;
  company: string;
  term: string | null;
  locations: string[];
  isRemote: boolean;
  workAuth: string | null;
  /** Canonical skills the posting names, from `postings.skills`. */
  skills: string[];
  eligibility: string[];
  amountMin: number | null;
  amountMax: number | null;
  deadlineAt: Date | null;
  /** A content-marketing scholarship is a sponsor marketing themselves; a
   *  letter to one must not be written as if it were a merit award. */
  isContentMarketing: boolean;
}

export interface EvidenceEntry {
  kind: "experience" | "project";
  /** "role at organization" or project name — the honest heading. */
  title: string;
  dates: string | null;
  /** Bullets/description as written on the resume — quoted verbatim. */
  bullets: string[];
  /** The posting's skills this entry actually demonstrates. */
  matchedSkills: string[];
}

export interface CoverLetterContext {
  candidate: CandidateFacts;
  posting: PostingFacts;
  /** Ranked entries the letter can stand on. Empty = no support found. */
  evidence: EvidenceEntry[];
  /** Human-readable gaps the student must fill before sending. */
  gaps: string[];
}

/* ------------------------------------------------------------------ *
 * Posting facts
 * ------------------------------------------------------------------ */

/** The feed item's own fields, narrowed to what a letter may assert. */
export function toPostingFacts(item: FeedItem): PostingFacts {
  return {
    kind: item.kind,
    title: item.title,
    company: item.company,
    term: item.term,
    locations: item.locations,
    isRemote: item.isRemote,
    workAuth: item.workAuth,
    skills: item.skills,
    eligibility: item.eligibility,
    amountMin: item.amountMin,
    amountMax: item.amountMax,
    deadlineAt: item.deadlineAt,
    isContentMarketing: item.isContentMarketing,
  };
}

/* ------------------------------------------------------------------ *
 * Evidence selection
 * ------------------------------------------------------------------ */

const MAX_EVIDENCE_ENTRIES = 3;
const MAX_EVIDENCE_BULLETS = 4;

/**
 * The resume entries that actually support an application.
 *
 * An entry "supports" it when it demonstrates at least one skill the posting
 * names. Entries are ranked by how many of the posting's skills they carry;
 * an entry that shares none is left out entirely — a letter padded with
 * unrelated experience is a letter that wastes the reader's time, and worse,
 * one that invites the generator to invent a connection.
 */
export function evidenceForPosting(
  parsed: ParsedResume,
  postingSkills: readonly string[],
): EvidenceEntry[] {
  const wanted = new Set(postingSkills);

  const scoreEntry = (textParts: string[]): { matchedSkills: string[]; count: number } => {
    const matched = new Set<string>();
    for (const skill of extractSkills(...textParts)) {
      if (wanted.has(skill)) matched.add(skill);
    }
    const matchedSkills = [...matched];
    return { matchedSkills, count: matchedSkills.length };
  };

  const entries: Array<EvidenceEntry & { count: number }> = [];

  for (const e of parsed.experiences) {
    if (!e.role && !e.organization) continue;
    const { matchedSkills, count } = scoreEntry([e.role ?? "", e.organization ?? "", ...e.bullets]);
    if (count === 0) continue;
    entries.push({
      kind: "experience",
      title: [e.role, e.organization].filter(Boolean).join(" at ") || "a past role",
      dates: e.dates,
      bullets: e.bullets.slice(0, MAX_EVIDENCE_BULLETS),
      matchedSkills,
      count,
    });
  }

  for (const p of parsed.projects) {
    if (!p.name && !p.description) continue;
    const { matchedSkills, count } = scoreEntry([p.name ?? "", p.description ?? ""]);
    if (count === 0) continue;
    entries.push({
      kind: "project",
      title: p.name || "a project",
      dates: null,
      bullets: (p.description ? [p.description] : []).slice(0, MAX_EVIDENCE_BULLETS),
      matchedSkills,
      count,
    });
  }

  // Experiences before projects on ties — paid evidence outranks coursework.
  entries.sort((a, b) => b.count - a.count || (a.kind === "experience" ? -1 : 1));
  return entries
    .slice(0, MAX_EVIDENCE_ENTRIES)
    .map(({ kind, title, dates, bullets, matchedSkills }) => ({
      kind,
      title,
      dates,
      bullets,
      matchedSkills,
    }));
}

/* ------------------------------------------------------------------ *
 * Gaps — the honest "you will need to fill this in" list
 * ------------------------------------------------------------------ */

/**
 * What the letter will require that we do not have.
 *
 * These become `[YOUR SPECIFIC DETAIL: …]` slots in the generated text and the
 * "fill these before you send it" list on the page. A gap is never filled by a
 * guess — it is surfaced.
 */
export function gapsToFlag(input: {
  candidate: CandidateFacts;
  evidence: EvidenceEntry[];
  posting: PostingFacts;
}): string[] {
  const gaps: string[] = [];
  if (!input.candidate.name) gaps.push("your name for the sign-off");
  if (!input.candidate.email) gaps.push("a contact email");
  if (input.posting.kind === "internship" && !input.candidate.portfolioUrl) {
    gaps.push("a portfolio or GitHub link for the signature block");
  }
  if (input.evidence.length === 0) {
    gaps.push(
      "a specific detail to stand on — nothing on your resume names this role's skills yet",
    );
  }
  return gaps;
}

/* ------------------------------------------------------------------ *
 * Assembling the context
 * ------------------------------------------------------------------ */

export function buildCoverLetterContext(input: {
  profile: UserProfile | null;
  parsed: ParsedResume;
  posting: FeedItem;
}): CoverLetterContext {
  const candidate: CandidateFacts = {
    name: input.parsed.name,
    email: input.parsed.email,
    phone: input.parsed.phone,
    school: input.parsed.school,
    major: input.parsed.major,
    gradYear: input.parsed.gradYear,
    gpa: input.parsed.gpa,
    skills: skillsFromParsedResume(input.parsed),
    portfolioUrl: input.profile?.portfolioUrl ?? null,
    workAuth: input.profile?.workAuth ?? null,
    targetVerticals: input.profile?.targetVerticals ?? [],
  };

  const posting = toPostingFacts(input.posting);
  const evidence = evidenceForPosting(input.parsed, posting.skills);
  const gaps = gapsToFlag({ candidate, evidence, posting });

  return { candidate, posting, evidence, gaps };
}
