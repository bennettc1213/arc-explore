/**
 * Resume critique — deterministic, no model call.
 *
 * The parse already turned the document into structure. Sending it back to a
 * model to be told what is wrong with it would add cost, latency and
 * nondeterminism, and would let it invent a problem that is not there — the
 * same failure this codebase refuses everywhere else. Every finding below is
 * something we counted.
 *
 * ON "ATS COMPATIBILITY". That phrase is the most oversold idea in the resume
 * industry: nobody selling a score has the parser the employer actually runs,
 * so the number is invented. We are in an unusual position to be honest about
 * it — **we are a machine that just read this resume.** When `machine_readable`
 * reports a missing email, that is not a guess about some other parser's
 * behaviour, it is a fact about ours: a competent reader was handed this
 * document and could not find it. That claim we can stand behind, and it is
 * the only ATS claim in here.
 *
 * The corollary is that we cannot see the document itself — tables, columns,
 * images, fonts and header/footer placement are all invisible by the time we
 * hold a `ParsedResume`. So we never assert those. We report what went missing
 * and name them as likely causes, which is the true shape of the evidence.
 */

import type { ParsedResume } from "./types";

export type CritiqueSection =
  | "contact"
  | "education"
  | "experience"
  | "skills"
  | "projects"
  | "links";

export type DimensionKey =
  | "machine_readable"
  | "completeness"
  | "quantified"
  | "bullet_language";

export interface Finding {
  section: CritiqueSection;
  /** Which dimension's headroom this finding sits in — drives ordering. */
  dimension: DimensionKey;
  severity: "high" | "medium" | "low";
  /** What is wrong, in the student's own terms. */
  title: string;
  /** What to do about it. Always an instruction, never a diagnosis. */
  fix: string;
  /** The offending text verbatim, when there is a specific line to point at. */
  evidence?: string;
}

export interface CritiqueDimension {
  key: DimensionKey;
  label: string;
  /** 0–100, or null when there is nothing to assess. */
  score: number | null;
  /** What we counted, so the number is auditable rather than asserted. */
  detail: string;
  weight: number;
}

export interface Critique {
  /** 0–100, or null when the resume is too empty to say anything about. */
  score: number | null;
  dimensions: CritiqueDimension[];
  /** Ordered by how much fixing each would move the score. */
  findings: Finding[];
  knownDimensions: number;
  totalDimensions: number;
  /** Total bullets found across every experience entry. */
  bulletCount: number;
}

/* ------------------------------------------------------------------ *
 * Quantity detection
 * ------------------------------------------------------------------ */

/**
 * Dates and version numbers that read as quantities but are not achievements.
 *
 * Stripped before we look for numbers, because "Built the pipeline in Summer
 * 2025 using Python 3.11" contains three digit sequences and quantifies
 * nothing. Telling a student that bullet is already quantified would be worse
 * than saying nothing — it teaches them the wrong lesson about their own
 * writing.
 *
 * Bare years are deliberately kept unless they sit in date-shaped context, so
 * "2,500 daily users" and "reached 1500 signups" still count.
 */
const DATE_CONTEXT = new RegExp(
  [
    // Ranges first, and greedy about an opening preposition. "from 2023 to
    // 2025" must be consumed whole: let the bare-preposition rule below take
    // "from 2023" and the trailing "2025" survives as a phantom quantity.
    /\b(?:from\s+)?(?:19|20)\d{2}\s*(?:[–—-]|to)\s*(?:(?:19|20)\d{2}|present|current|now)\b/,
    // Month or season followed by a year.
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}\b/,
    /\b(?:spring|summer|fall|autumn|winter)\s+(?:19|20)\d{2}\b/,
    // A single year introduced by a preposition. "to" is deliberately absent:
    // it would swallow the metric in "grew to 2000 users".
    /\b(?:in|since|during|by|from|until|through|of)\s+(?:19|20)\d{2}\b/,
  ]
    .map((r) => r.source)
    .join("|"),
  "gi",
);

/** Tokens where digits are part of a name: ES6, S3, EC2, HTTP/2, COVID-19. */
const IDENTIFIER_WITH_DIGITS = /\b[A-Za-z][A-Za-z+#._/-]*\d+(?:\.\d+)*\b/g;

/** Versions written with a space: React 18, Java 17, Python 3.11. */
const SPACED_VERSION =
  /\b(?:react|node|java|python|angular|vue|php|ruby|rust|swift|kotlin|scala|\.net|ios|android|windows|ubuntu|postgres|postgresql|mysql|redis|kafka|spark|tensorflow|pytorch|next\.?js|express|django|laravel|bootstrap|tailwind)\s+v?\d+(?:\.\d+)*\b/gi;

/** A magnitude stated in words rather than digits still quantifies. */
const MAGNITUDE_WORD =
  /\b(?:hundreds?|thousands?|millions?|billions?|doubled|tripled|quadrupled|halved)\b/i;

export function isQuantified(bullet: string): boolean {
  const stripped = bullet
    .replace(DATE_CONTEXT, " ")
    .replace(SPACED_VERSION, " ")
    .replace(IDENTIFIER_WITH_DIGITS, " ");

  return /\d/.test(stripped) || MAGNITUDE_WORD.test(stripped);
}

/* ------------------------------------------------------------------ *
 * Bullet language
 * ------------------------------------------------------------------ */

/**
 * Openers that describe a job description rather than an accomplishment.
 *
 * Kept tight on purpose. Every entry here is a phrase that states the student
 * was near the work without saying what they did to it — a claim their
 * strongest bullet could always replace. Borderline verbs are left out: a
 * critique that flags good writing gets ignored wholesale.
 */
const WEAK_OPENERS: Array<{ re: RegExp; phrase: string }> = [
  { re: /^\s*responsible for\b/i, phrase: "Responsible for" },
  { re: /^\s*duties included\b/i, phrase: "Duties included" },
  { re: /^\s*tasked with\b/i, phrase: "Tasked with" },
  { re: /^\s*worked (?:on|with|as)\b/i, phrase: "Worked on" },
  { re: /^\s*helped (?:to |with |out )?\b/i, phrase: "Helped" },
  { re: /^\s*assisted (?:with |in )?\b/i, phrase: "Assisted with" },
  { re: /^\s*participated in\b/i, phrase: "Participated in" },
  { re: /^\s*involved (?:in|with)\b/i, phrase: "Involved in" },
  { re: /^\s*in charge of\b/i, phrase: "In charge of" },
  { re: /^\s*exposure to\b/i, phrase: "Exposure to" },
  { re: /^\s*gained experience\b/i, phrase: "Gained experience" },
  { re: /^\s*familiar with\b/i, phrase: "Familiar with" },
];

export function weakOpener(bullet: string): string | null {
  return WEAK_OPENERS.find((w) => w.re.test(bullet))?.phrase ?? null;
}

const MAX_BULLET_WORDS = 45;
const MIN_BULLET_WORDS = 4;

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** First N characters, cut on a word boundary, for quoting a line back. */
function quote(s: string, max = 110): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, t.lastIndexOf(" ", max))}…`;
}

/* ------------------------------------------------------------------ *
 * Dimensions
 * ------------------------------------------------------------------ */

interface Assessed {
  dimension: CritiqueDimension;
  findings: Finding[];
}

/**
 * What our parser could not recover from the document.
 *
 * This is the honest core of the "ATS" claim — see the file header. Each miss
 * names the likely document-level cause without asserting it, because by this
 * point the layout is gone and we genuinely cannot tell.
 */
function assessMachineReadable(r: ParsedResume): Assessed {
  const findings: Finding[] = [];
  const checks: Array<{ ok: boolean; label: string }> = [];

  checks.push({ ok: Boolean(r.email), label: "email" });
  if (!r.email) {
    findings.push({
      section: "contact",
      dimension: "machine_readable",
      severity: "high",
      title: "We could not find an email address",
      fix: "Put your email as plain text in the body of the first page, not in a header, footer, text box or image — those are the places a parser most often cannot reach. If it is already there, it may be inside a graphic.",
    });
  }

  checks.push({ ok: Boolean(r.name), label: "name" });
  if (!r.name) {
    findings.push({
      section: "contact",
      dimension: "machine_readable",
      severity: "high",
      title: "We could not find your name",
      fix: "Your name should be the first plain-text line of the document. If it is set as an image or a decorative banner, a parser reads the file as anonymous.",
    });
  }

  const hasExperience = r.experiences.length > 0;
  checks.push({ ok: hasExperience, label: "work history" });
  if (!hasExperience) {
    findings.push({
      section: "experience",
      dimension: "machine_readable",
      severity: "high",
      title: "We could not find any work history",
      fix: "If you have experience on this resume, the section heading and entries are not parsing — a two-column layout is the usual cause, because the columns interleave into nonsense when read in order.",
    });
  }

  const missingDates = r.experiences.filter((e) => !e.dates);
  checks.push({ ok: hasExperience && missingDates.length === 0, label: "dates on every role" });
  if (missingDates.length > 0) {
    findings.push({
      section: "experience",
      dimension: "machine_readable",
      severity: "medium",
      title: `${missingDates.length} of ${r.experiences.length} roles have no readable dates`,
      fix: "Put a date range on the same line as each role, in one consistent format such as “Jun 2025 – Aug 2025”. Recruiters filter on recency, and a role with no date cannot be filtered into anything.",
      evidence: missingDates[0].role ?? missingDates[0].organization ?? undefined,
    });
  }

  const missingOrg = r.experiences.filter((e) => !e.organization || !e.role);
  checks.push({ ok: hasExperience && missingOrg.length === 0, label: "employer and title on every role" });
  if (missingOrg.length > 0) {
    findings.push({
      section: "experience",
      dimension: "machine_readable",
      severity: "medium",
      title: `${missingOrg.length} of ${r.experiences.length} roles are missing an employer or a job title`,
      fix: "Each entry needs both, as text, on its own line. One of the two went missing here, which usually means they are on a line the parser split differently than you see it.",
      evidence: missingOrg[0].organization ?? missingOrg[0].role ?? undefined,
    });
  }

  const emptyBullets = r.experiences.filter((e) => e.bullets.length === 0);
  checks.push({ ok: hasExperience && emptyBullets.length === 0, label: "bullets under every role" });
  if (emptyBullets.length > 0 && hasExperience) {
    findings.push({
      section: "experience",
      dimension: "machine_readable",
      severity: "medium",
      title: `${emptyBullets.length} of ${r.experiences.length} roles have no readable bullet points`,
      fix: "Describe what you did under each role as separate bulleted lines. A role with a title and no content reads to a machine as a job you listed but did not describe.",
      evidence: emptyBullets[0].organization ?? emptyBullets[0].role ?? undefined,
    });
  }

  const passed = checks.filter((c) => c.ok).length;

  return {
    dimension: {
      key: "machine_readable",
      label: "machine readable",
      score: Math.round((passed / checks.length) * 100),
      detail: `${passed} of ${checks.length} fields we look for came through cleanly.`,
      weight: 30,
    },
    findings,
  };
}

const MIN_SKILLS = 6;

/**
 * Whether the expected sections are present and carry enough to be useful.
 *
 * Projects are conditional rather than required. A student with three
 * internships does not need them; a student with one and nothing else has a
 * page that cannot answer "what have you built", and that is when the absence
 * is worth raising.
 */
function assessCompleteness(r: ParsedResume): Assessed {
  const findings: Finding[] = [];
  const checks: boolean[] = [];

  const hasEducation = Boolean(r.school);
  checks.push(hasEducation);
  if (!hasEducation) {
    findings.push({
      section: "education",
      dimension: "completeness",
      severity: "high",
      title: "No school found",
      fix: "Add an education section with your institution. For a student this is the section that establishes eligibility for the whole internship category.",
    });
  }

  checks.push(Boolean(r.gradYear));
  if (!r.gradYear) {
    findings.push({
      section: "education",
      dimension: "completeness",
      severity: "high",
      title: "No graduation date found",
      fix: "State your expected graduation as a month and year. Nearly every internship is scoped to a class year, so a resume without one is hard to place — and it is what we score the term dimension against.",
    });
  }

  checks.push(Boolean(r.major));
  if (!r.major) {
    findings.push({
      section: "education",
      dimension: "completeness",
      severity: "medium",
      title: "No major found",
      fix: "Put your degree and field on the education entry, e.g. “B.S. Computer Science”.",
    });
  }

  const enoughSkills = r.skills.length >= MIN_SKILLS;
  checks.push(enoughSkills);
  if (!enoughSkills) {
    findings.push({
      section: "skills",
      dimension: "completeness",
      severity: r.skills.length === 0 ? "high" : "medium",
      title:
        r.skills.length === 0
          ? "No skills section found"
          : `Only ${r.skills.length} skill${r.skills.length === 1 ? "" : "s"} listed`,
      fix: `List the languages, frameworks and tools you have actually used, as a plain comma-separated line. This is the section our matching reads first — every skill you leave off is a posting we cannot match you to.`,
    });
  }

  const hasLinks = r.links.length > 0;
  checks.push(hasLinks);
  if (!hasLinks) {
    findings.push({
      section: "links",
      dimension: "completeness",
      severity: "medium",
      title: "No links found",
      fix: "Add a GitHub, portfolio or LinkedIn URL near your contact details. It is the only part of a resume that lets someone verify the rest of it.",
    });
  }

  // Conditional: only a gap when there is little experience to stand on.
  const thinExperience = r.experiences.length < 2;
  if (thinExperience) {
    const hasProjects = r.projects.length > 0;
    checks.push(hasProjects);
    if (!hasProjects) {
      findings.push({
        section: "projects",
        dimension: "completeness",
        severity: "high",
        title: "No projects, and little work history to stand on",
        fix: "With fewer than two roles listed, projects are what show you can build. Add two or three with a one-line description and a link — for a first internship they carry more weight than another line of coursework.",
      });
    }
  }

  const passed = checks.filter(Boolean).length;

  return {
    dimension: {
      key: "completeness",
      label: "section completeness",
      score: Math.round((passed / checks.length) * 100),
      detail: `${passed} of ${checks.length} expected sections are present and populated.`,
      weight: 25,
    },
    findings,
  };
}

/** Full credit at this share of bullets carrying a number. */
const QUANTIFIED_TARGET = 0.5;

function assessQuantified(bullets: string[]): Assessed {
  if (bullets.length === 0) {
    return {
      dimension: {
        key: "quantified",
        label: "quantified achievements",
        score: null,
        detail: "No bullet points to assess.",
        weight: 25,
      },
      findings: [],
    };
  }

  const quantified = bullets.filter(isQuantified);
  const share = quantified.length / bullets.length;
  // Capped rather than scaled past the target: a resume where every single
  // line carries a metric is not better than one where half do, it reads as
  // padded. The target is where the returns stop.
  const score = Math.round(Math.min(1, share / QUANTIFIED_TARGET) * 100);

  const findings: Finding[] = [];
  if (share < QUANTIFIED_TARGET) {
    /*
     * Prefer an example that is otherwise well-written.
     *
     * Two reasons. It teaches better — a strong line missing only a number
     * shows exactly what "add a metric" means, where a line that is also badly
     * opened muddles two lessons. And the bullet-language finding quotes the
     * weak ones, so picking one here would print the same sentence twice in a
     * row, which reads as a bug rather than as two problems.
     */
    const unquantified = bullets.filter((b) => !isQuantified(b));
    // Whichever line the language check will quote, so we can step around it
    // even when every bullet is weak — which is precisely the resume that
    // needs this panel most.
    const languageWillQuote = bullets.find((b) => weakOpener(b));
    const example =
      unquantified.find((b) => !weakOpener(b)) ??
      unquantified.find((b) => b !== languageWillQuote) ??
      unquantified[0];
    findings.push({
      section: "experience",
      dimension: "quantified",
      severity: share === 0 ? "high" : "medium",
      title:
        quantified.length === 0
          ? `None of your ${bullets.length} bullets carry a number`
          : `${quantified.length} of ${bullets.length} bullets carry a number`,
      fix: "Add scale or outcome to your strongest lines — how many users, how much faster, how many records, how much money, how many people on the team. “Improved performance” and “cut p95 latency from 800ms to 120ms” describe the same work, and only one of them is evidence.",
      evidence: example ? quote(example) : undefined,
    });
  }

  return {
    dimension: {
      key: "quantified",
      label: "quantified achievements",
      score,
      detail: `${quantified.length} of ${bullets.length} bullets state a number or magnitude.`,
      weight: 25,
    },
    findings,
  };
}

function assessBulletLanguage(bullets: string[]): Assessed {
  if (bullets.length === 0) {
    return {
      dimension: {
        key: "bullet_language",
        label: "bullet language",
        score: null,
        detail: "No bullet points to assess.",
        weight: 20,
      },
      findings: [],
    };
  }

  const findings: Finding[] = [];

  const weak = bullets
    .map((b) => ({ bullet: b, phrase: weakOpener(b) }))
    .filter((x): x is { bullet: string; phrase: string } => x.phrase !== null);

  const tooLong = bullets.filter((b) => words(b) > MAX_BULLET_WORDS);
  const tooShort = bullets.filter((b) => words(b) < MIN_BULLET_WORDS);

  if (weak.length > 0) {
    findings.push({
      section: "experience",
      dimension: "bullet_language",
      severity: weak.length > bullets.length / 3 ? "high" : "medium",
      title: `${weak.length} bullet${weak.length === 1 ? "" : "s"} open with a phrase that describes the job, not your work`,
      fix: `Start with what you did: “Built”, “Shipped”, “Reduced”, “Automated”, “Led”. “${weak[0].phrase}” tells a reader you were near the work without saying what you changed about it.`,
      evidence: quote(weak[0].bullet),
    });
  }

  if (tooLong.length > 0) {
    findings.push({
      section: "experience",
      dimension: "bullet_language",
      severity: "low",
      title: `${tooLong.length} bullet${tooLong.length === 1 ? " runs" : "s run"} long`,
      fix: `Keep bullets under about ${MAX_BULLET_WORDS} words, or split them in two. A resume is scanned before it is read, and a paragraph-length bullet gets skipped whole.`,
      evidence: quote(tooLong[0]),
    });
  }

  if (tooShort.length > 0) {
    findings.push({
      section: "experience",
      dimension: "bullet_language",
      severity: "low",
      title: `${tooShort.length} bullet${tooShort.length === 1 ? " is" : "s are"} a fragment`,
      fix: "Say what you did and what came of it. A few words on their own read as a list of tools rather than an accomplishment.",
      evidence: quote(tooShort[0]),
    });
  }

  const clean = bullets.length - new Set([...weak.map((w) => w.bullet), ...tooLong, ...tooShort]).size;

  return {
    dimension: {
      key: "bullet_language",
      label: "bullet language",
      score: Math.round((clean / bullets.length) * 100),
      detail: `${clean} of ${bullets.length} bullets open strongly and are a workable length.`,
      weight: 20,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

const SEVERITY_RANK: Record<Finding["severity"], number> = { high: 0, medium: 1, low: 2 };

/**
 * Critique a parsed resume.
 *
 * The same rule as fit scoring applies: a dimension with nothing to look at is
 * dropped from the average rather than counted as a failure. A resume whose
 * bullets did not parse is not punished for bullets it does not appear to
 * have — `bullet_language` and `quantified` go null, and `machine_readable`
 * says separately, in plain terms, that we could not read any.
 *
 * The first two dimensions can always be assessed, so in practice the score is
 * never null: a document we got nothing out of scores near zero and says why,
 * which is a truthful answer rather than an absent one.
 */
export function critiqueResume(parsed: ParsedResume): Critique {
  const bullets = parsed.experiences.flatMap((e) => e.bullets);

  const assessed = [
    assessMachineReadable(parsed),
    assessCompleteness(parsed),
    assessQuantified(bullets),
    assessBulletLanguage(bullets),
  ];

  const dimensions = assessed.map((a) => a.dimension);
  const scored = dimensions.filter((d) => d.score !== null);

  const totalWeight = scored.reduce((s, d) => s + d.weight, 0);
  const score =
    scored.length === 0
      ? null
      : Math.round(
          scored.reduce((s, d) => s + d.weight * (d.score as number), 0) / totalWeight,
        );

  /*
   * Ordered by how much fixing each one moves the number.
   *
   * A dimension's headroom is what it has left to gain, weighted by how much
   * it counts: a 40%-scored dimension worth 30 outranks a 90%-scored one worth
   * 25. Findings inside the same dimension share its headroom and fall back to
   * severity, so the most damaging thing to fix is always first — rather than
   * the list being ordered by whichever check happened to run first.
   */
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
    bulletCount: bullets.length,
  };
}
