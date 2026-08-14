/**
 * Normalization + dedup identity.
 *
 * Every adapter funnels through here so that the same role arriving from two
 * different feeds produces the same `canonicalHash` and collapses into one
 * posting the user sees once.
 *
 * Rule that shows up repeatedly below: we normalize *for matching* but never
 * mutate what we display. Employer names, job titles, and people's names are
 * rendered exactly as authored — `normalizedX` fields exist only to join on.
 */

import { createHash } from "node:crypto";

/* ------------------------------------------------------------------ *
 * Company names
 * ------------------------------------------------------------------ */

/** Legal/marketing suffixes that carry no identity signal. */
const COMPANY_SUFFIXES = [
  "inc",
  "inc.",
  "llc",
  "l.l.c.",
  "ltd",
  "ltd.",
  "limited",
  "corp",
  "corp.",
  "corporation",
  "co",
  "co.",
  "company",
  "plc",
  "gmbh",
  "ag",
  "sa",
  "nv",
  "bv",
  "pte",
  "pty",
  "llp",
  "lp",
  "group",
  "holdings",
  "the",
];

/**
 * Lowercase, strip punctuation and corporate suffixes, collapse whitespace.
 * "Goldman Sachs & Co. LLC" and "goldman sachs" both become "goldman sachs".
 *
 * Display name is untouched — see the module note.
 */
export function normalizeCompanyName(raw: string): string {
  if (!raw) return "";
  let s = raw
    .toLowerCase()
    .normalize("NFKD")
    // Strip accents so "Nestlé" matches "Nestle".
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove suffix tokens from the end, repeatedly ("Foo Inc. Group" -> "foo").
  // Also strip a dangling conjunction, so "Goldman Sachs & Co. LLC" reduces to
  // "goldman sachs" rather than leaving a trailing "and".
  let tokens = s.split(" ");
  let changed = true;
  while (changed && tokens.length > 1) {
    changed = false;
    const last = tokens[tokens.length - 1];
    if (COMPANY_SUFFIXES.includes(last) || last === "and") {
      tokens.pop();
      changed = true;
    }
  }
  // A leading "the" carries no identity either.
  if (tokens.length > 1 && tokens[0] === "the") tokens = tokens.slice(1);

  s = tokens.join(" ").trim();
  return s;
}

/* ------------------------------------------------------------------ *
 * Titles
 * ------------------------------------------------------------------ */

/**
 * Normalize a job title for dedup: drop requisition ids, bracketed noise, and
 * any embedded term.
 *
 * The term is stripped deliberately. It is a separate component of the
 * canonical hash, and feeds disagree about where they put it — Greenhouse
 * writes "Intern (Summer 2027)" while Simplify writes "Intern - Summer 2027".
 * Leaving it in the title would split one role into two postings.
 */
export function normalizeTitle(raw: string): string {
  if (!raw) return "";
  return (
    raw
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      // Bracketed noise first, so "(Summer 2027)" goes wholesale.
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      // Season + year, wherever it sits: "- Summer 2027", "fall '26".
      .replace(/\b(spring|summer|fall|autumn|winter)\s*'?\d{2,4}\b/g, " ")
      // Requisition ids. Deliberately NOT `\d{4,}` — that ate 4-digit years
      // and left a bare season behind. Require a letter-dash prefix, a hash,
      // or a run of 5+ digits.
      .replace(/\b[a-z]{1,4}[-#]\d{3,}\b/g, " ")
      .replace(/#\d+\b/g, " ")
      .replace(/\b\d{5,}\b/g, " ")
      // A lone trailing year ("Analyst 2027") is a term marker, not identity.
      .replace(/\b(19|20)\d{2}\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

/**
 * Tracking params to drop. Note `gh_jid` is deliberately NOT here — for
 * Greenhouse it is the job identifier, not tracking, and stripping it would
 * collapse every posting at a company into one URL.
 */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gh_src",
  "source",
  "ref",
  "referrer",
  "src",
  "trackingid",
  "lever-source",
  "lever-origin",
];

/** Strip tracking params and trailing slashes so the same job yields one URL. */
export function canonicalUrl(raw: string): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.protocol = "https:";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const p of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.includes(p.toLowerCase())) u.searchParams.delete(p);
    }
    // Normalize a trailing path slash — "/jobs/" and "/jobs" are one page.
    // Done on pathname, not the whole string, so a "/" inside a query value
    // is left alone.
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    // Stable param order so two orderings hash identically.
    u.searchParams.sort();
    return u.toString();
  } catch {
    return raw.trim();
  }
}

/* ------------------------------------------------------------------ *
 * Locations
 * ------------------------------------------------------------------ */

const REMOTE_RE = /\b(remote|work from home|wfh|virtual|anywhere)\b/i;

export function isRemoteLocation(locations: string[]): boolean {
  return locations.some((l) => REMOTE_RE.test(l));
}

/** Trim, drop empties, dedupe, and sort so location order can't split a hash. */
export function normalizeLocations(raw: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (!r) continue;
    const cleaned = r.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out.sort();
}

/* ------------------------------------------------------------------ *
 * Opportunity classification
 *
 * ATS feeds return a company's ENTIRE job board — Bosch alone returns 4,758
 * roles. Filtering to early-career is what keeps the corpus relevant.
 * ------------------------------------------------------------------ */

/**
 * `\bintern\b` deliberately does not match "internal" or "international",
 * because the word boundary requires a non-word char after "intern".
 */
/**
 * `student trainee` / `student volunteer` / `student research assistant` are
 * the U.S. federal naming convention, added alongside the existing regional
 * entries ("industrial placement" is British, "práctica" Spanish) for the same
 * reason: the opportunity is an internship, the employer just does not use the
 * word. OPM titles a Pathways Internship Program position "Student Trainee
 * (Administrative)", and on the live USAJobs student scope only 1 of the 22
 * genuine student postings contained "intern" at all.
 *
 * Each is a two-word phrase rather than a bare noun, deliberately. "Trainee"
 * alone matches "Management Trainee", a permanent job, and "student" alone
 * matches any posting that mentions students.
 */
const INTERNSHIP_RE =
  /\b(intern|interns|internship|internships|co-?op|summer analyst|industrial placement|placement student|student placement|práctica|student trainee|student volunteer|student research assistant)\b/i;

const NEW_GRAD_RE =
  /\b(new grad|new graduate|university grad|recent graduate|entry[- ]level|campus hire|graduate (program|programme|analyst|scheme)|early career|rotational program)\b/i;

/** Roles that merely *mention* interns but are not early-career positions. */
const SENIORITY_EXCLUDE_RE =
  /\b(senior|staff|principal|lead|manager|director|head of|vp|vice president|chief|architect)\b/i;

/**
 * Roles that *run* an internship rather than being one — "Intern Program
 * Coordinator", "Internship Manager". Allows filler words between, which a
 * strict two-word pattern missed.
 */
const SUPERVISOR_RE =
  /\bintern(ship)?s?\b[\w\s]{0,20}?\b(manager|coordinator|supervisor|mentor|recruiter|lead|partner)\b/i;

/**
 * Evergreen "talent pool" rows that sit on a board permanently collecting
 * speculative applications. They are not openings, and surfacing one as a fresh
 * opportunity is exactly the noise this product exists to remove.
 *
 * Seen live on Samsung Research America's board:
 *   "Don't see internships you are looking for?"
 */
const EVERGREEN_RE =
  /(?:do\s?n'?t|does\s?n'?t|can\s?n?'?t|did\s?n'?t)\s+(?:see|find)\b|\b(?:general|speculative|prospective|future)\s+(?:\w+\s+)?(?:application|interest|opportunit)|\btalent\s+(?:pool|community|network)\b|\bjoin our talent\b|\bintroduce yourself\b|\bkeep me in mind\b/i;

export type OpportunityKind = "internship" | "new_grad" | "other";

/** Longer than this is prose, not a structured field. See classifyOpportunity. */
const MAX_HINT_LENGTH = 60;

/**
 * Classify a posting as internship / new-grad / other.
 *
 * Classification is driven by the TITLE, deliberately.
 *
 * Measured on OpenAI's live Ashby board: classifying against description text
 * produced 17 matches, *all seventeen of them false positives*. Job descriptions
 * routinely mention internships in benefits and EEO boilerplate — "internships"
 * appeared in 16 unrelated senior postings, "entry-level" in another. Every
 * genuine early-career role announces itself in its title.
 *
 * @param structuredHint Optional SHORT structured field such as Ashby's
 *   `employmentType` ("Intern") or SmartRecruiters' `experienceLevel`
 *   ("internship"). Never pass a description — anything over
 *   {@link MAX_HINT_LENGTH} characters is ignored as a safety net.
 */
export function classifyOpportunity(title: string, structuredHint?: string | null): OpportunityKind {
  const safeTitle = title ?? "";
  const hint =
    structuredHint && structuredHint.length <= MAX_HINT_LENGTH ? structuredHint : "";

  // A permanently-open talent pool is not an opportunity.
  if (EVERGREEN_RE.test(safeTitle)) return "other";
  if (SUPERVISOR_RE.test(safeTitle)) return "other";
  // A senior role that merely mentions interns is not an early-career opening.
  if (SENIORITY_EXCLUDE_RE.test(safeTitle)) return "other";

  if (INTERNSHIP_RE.test(safeTitle)) return "internship";

  // The hint may promote to `internship` only.
  //
  // Measured on Bosch's live board: an "Internship" hint added 92 genuine roles
  // the title regex could not see because they are not in English
  // ("Pflichtpraktikum...", "Praktikum in HR") — SmartRecruiters normalizes
  // experienceLevel to English, which buys us language independence.
  //
  // An "Entry Level" hint added 132 roles that are NOT early-career at all
  // ("Customer Support Agent", "Field Calibration Technician - Remote"). In ATS
  // taxonomy "Entry Level" means a junior permanent job, not a campus program,
  // so it is deliberately not honored here.
  if (INTERNSHIP_RE.test(hint)) return "internship";

  // New-grad is title-driven only, for the same reason.
  if (NEW_GRAD_RE.test(safeTitle)) return "new_grad";
  return "other";
}

/* ------------------------------------------------------------------ *
 * Term detection
 * ------------------------------------------------------------------ */

const SEASONS = ["spring", "summer", "fall", "autumn", "winter"] as const;

/**
 * Pull "Summer 2027" out of a title or description. Returns null when absent —
 * we never guess a term, per the honest-slots rule.
 */
export function detectTerm(...sources: (string | null | undefined)[]): string | null {
  const hay = sources.filter(Boolean).join(" ");
  if (!hay) return null;

  const seasons = SEASONS.join("|");
  // Employers write it both ways: "Fall 2026" and "2026 Fall Intern". Missing
  // the reversed form left 73% of a live sample with an unknown term.
  const forward = new RegExp(`\\b(${seasons})\\s*'?(\\d{4}|\\d{2})\\b`, "i");
  const reversed = new RegExp(`\\b(\\d{4})\\s+(${seasons})\\b`, "i");

  let season: string;
  let year: string;

  const f = hay.match(forward);
  if (f) {
    season = f[1];
    year = f[2];
  } else {
    const r = hay.match(reversed);
    if (!r) return null;
    year = r[1];
    season = r[2];
  }

  season = season.toLowerCase();
  if (season === "autumn") season = "fall";
  if (year.length === 2) year = `20${year}`;

  return `${season[0].toUpperCase()}${season.slice(1)} ${year}`;
}

/* ------------------------------------------------------------------ *
 * Work authorization
 *
 * The Simplify `sponsorship` field is 98% "Other" (1,611 of 1,644 active), so
 * it is unusable. We derive from JD text instead, and return null rather than
 * guessing when the text says nothing.
 * ------------------------------------------------------------------ */

export type WorkAuth = "citizenship_required" | "no_sponsorship" | "sponsorship_offered" | null;

/**
 * Export-control boilerplate. Critically, this language contains the word
 * "sponsorship" while having nothing to do with visas.
 *
 * Real example from Cloudflare's board that produced a false positive on all
 * 12 of their internships:
 *
 *   "...your authorization to receive software or technology controlled under
 *    these U.S. export laws WITHOUT SPONSORSHIP for an export license."
 *
 * That is an EAR/ITAR export licence, not immigration sponsorship. Telling an
 * international student a company will not sponsor them, when the posting says
 * no such thing, is precisely the fabricated signal this product exists to
 * avoid — so any sentence matching this is excluded from visa analysis.
 */
const EXPORT_CONTROL_RE =
  /\b(export (control|law|licen[sc]e|regulation)|itar|ear\b|deemed export|technology controlled|controlled under)\b/i;

/**
 * Terms that mark a sentence as genuinely about immigration status.
 *
 * Note the `\w*` on the two stems. They were previously written as
 * `work authoriz` inside a group closed by `\b`, which can never match: the
 * boundary requires a non-word character after "authoriz", and the word is
 * always "authorization" or "authorised". Both branches were dead, so any
 * posting that said "work authorization … sponsorship" without ever using the
 * literal word "visa" failed this gate and was recorded as "not stated".
 * Anchors on truncated stems have to be spelled out.
 */
const VISA_CONTEXT_RE =
  /\b(visas?\b|immigration\b|work authoriz\w*|work authoris\w*|employment authoriz\w*|authoriz\w+ to work|authoris\w+ to work|h-?1b\b|f-?1\b|opt\b|cpt\b|green card\b|right to work\b|work permit\b|sponsorship for employment\b)/i;

/**
 * Ways employers say "we will not sponsor".
 *
 * Every branch here was taken from live posting text, not invented. Measured on
 * a 1,882-posting corpus, 341 postings stated a work-authorization requirement
 * and the original three-branch pattern caught 87 of them — so three of every
 * four employers who told us were being recorded as "not stated".
 *
 * The asymmetry that governs this pattern: a missed match costs a dropped
 * scoring dimension (honest, per the unknown-is-not-bad rule), while a false
 * match tells someone an employer will not sponsor them when it might. So the
 * bar for adding a branch is a phrasing observed verbatim in real postings, and
 * every branch still has to clear the sentence-level `sponsor` +
 * VISA_CONTEXT_RE + not-export-control gate above.
 *
 * Deliberately NOT matched: "open to candidates who are legally authorized to
 * work in the United States". Someone on OPT *is* legally authorized, so that
 * sentence does not actually say what it appears to.
 */
const NO_SPONSORSHIP_RE = new RegExp(
  [
    // "we are unable to sponsor" / "cannot provide"
    String.raw`\b(not able|unable|cannot|can ?not|are n'?t able)\s+to\s+(sponsor|provide|offer|support)`,
    String.raw`\bdo(es)?\s+not\s+(offer|provide|sponsor|support)`,
    String.raw`\bno\s+(visa\s+)?sponsorship\b`,
    String.raw`\bwill\s+not\s+sponsor\b`,
    // "without sponsorship" and its longer forms: "without the need for
    // sponsorship", "without requiring sponsorship now or in the future"
    String.raw`\bwithout\s+(the\s+)?(need\s+for\s+|requiring\s+|needing\s+)?sponsorship\b`,
    // "ineligible" only — "eligible for sponsorship" is the opposite claim
    String.raw`\bineligible\s+for\s+sponsorship\b`,
    String.raw`\bnot\s+eligible\s+for\s+(visa\s+)?sponsorship\b`,
    // "must not require work visa sponsorship from us now or in the future"
    String.raw`\bmust\s+not\s+require\b[^.]{0,40}\bsponsorship\b`,
    // "Sponsorship for US employment authorization is not available";
    // "Future sponsorship for work authorization unavailable"
    String.raw`\bsponsorship\b[^.]{0,60}?\b(is\s+)?(not\s+available|unavailable|not\s+offered|not\s+provided)\b`,
  ].join("|"),
  "i",
);

/** Split into sentences so each claim is judged in its own context. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n+/).filter((s) => s.trim().length > 0);
}

/**
 * Derive work-authorization requirements from posting text.
 *
 * Returns null rather than guessing — the Simplify `sponsorship` field is 98%
 * "Other" (1,611 of 1,644 active) and therefore unusable, and a wrong answer
 * here actively misleads the people it matters most to.
 *
 * Analysis is per-sentence, because JD boilerplate mixes export-control and
 * immigration language freely and a document-wide regex conflates them.
 */
export function detectWorkAuth(...sources: (string | null | undefined)[]): WorkAuth {
  const raw = sources.filter(Boolean).join(" ");
  if (!raw.trim()) return null;

  // Citizenship/clearance requirements are real hiring restrictions even when
  // they originate from ITAR, so they are checked before the export-control
  // exclusion and against the whole text.
  if (
    /\b(u\.?s\.?\s*citizenship (is )?(required|mandatory)|must be a u\.?s\.?\s*citizen|u\.?s\.?\s*citizens? only|active security clearance|security clearance (is )?required|must be a u\.?s\.?\s*person)\b/i.test(
      raw,
    )
  ) {
    return "citizenship_required";
  }

  const relevant = sentences(raw).filter(
    (s) => /sponsor/i.test(s) && !EXPORT_CONTROL_RE.test(s),
  );

  for (const s of relevant) {
    // Only trust a sponsorship claim that is demonstrably about immigration.
    if (!VISA_CONTEXT_RE.test(s)) continue;

    if (NO_SPONSORSHIP_RE.test(s)) {
      return "no_sponsorship";
    }
    if (/\b(sponsorship (is )?(available|offered|provided)|we (will )?sponsor|do sponsor|offer sponsorship)\b/i.test(s)) {
      return "sponsorship_offered";
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Canonical identity
 * ------------------------------------------------------------------ */

export interface CanonicalInput {
  companyName: string;
  title: string;
  locations: string[];
  term?: string | null;
}

/**
 * Stable dedup key. Location is folded in because the same title genuinely
 * runs as separate reqs per city; term because Summer 2026 and Summer 2027 are
 * different opportunities.
 */
export function canonicalHash(input: CanonicalInput): string {
  const parts = [
    normalizeCompanyName(input.companyName),
    normalizeTitle(input.title),
    normalizeLocations(input.locations).join("|").toLowerCase(),
    (input.term ?? "").toLowerCase(),
  ];
  return createHash("sha256").update(parts.join("::")).digest("hex").slice(0, 32);
}
