/**
 * Skill extraction — the bridge between a parsed resume and a job description.
 *
 * Deterministic, like the rest of the scoring engine. No LLM call per posting:
 * we have ~1,900 open postings and re-score every one on every feed render, so
 * this has to be fast, free, and repeatable. More importantly it has to be
 * *explainable* — the UI shows a student exactly which skills matched and which
 * are missing, and "the model thought so" is not an explanation.
 *
 * The hard part is not the vocabulary, it is the false positives. A naive
 * word-match reports that every posting mentioning "we go fast" wants Go, and
 * that a résumé containing "the R&D team" knows R. A wrong skill here is worse
 * than a missing one: it inflates a score and then tells the student a reason
 * that is visibly untrue, which costs trust in every other number on the page.
 * So ambiguous short names are matched only in forms that cannot mean anything
 * else, and every alias below is anchored.
 */

export interface Skill {
  /** Canonical display name, shown to the user as authored here. */
  readonly name: string;
  /** Matched case-insensitively against text. Anchored at word boundaries. */
  readonly aliases: readonly string[];
  readonly group: SkillGroup;
}

export type SkillGroup =
  | "language"
  | "frontend"
  | "backend"
  | "data"
  | "infra"
  | "business";

/**
 * The vocabulary.
 *
 * Deliberately finite. An open-ended extractor produces noise like "team",
 * "communication" and "fast-paced", which match everything and therefore
 * discriminate nothing.
 */
export const SKILLS: readonly Skill[] = [
  // --- languages ---
  { name: "Python", group: "language", aliases: ["python"] },
  { name: "JavaScript", group: "language", aliases: ["javascript", "java script", "es6", "ecmascript"] },
  { name: "TypeScript", group: "language", aliases: ["typescript"] },
  // "java" must not match inside "javascript" — the alias matcher anchors on
  // word boundaries, and "javascript" is one word, so \bjava\b cannot hit it.
  { name: "Java", group: "language", aliases: ["java"] },
  // "C" alone is unmatchable in prose; require a qualifier that cannot be
  // anything else. Same for the rest of the one-letter and short names.
  { name: "C++", group: "language", aliases: ["c\\+\\+", "cpp"] },
  { name: "C#", group: "language", aliases: ["c#", "c sharp", "csharp"] },
  { name: "C", group: "language", aliases: ["c programming", "embedded c", "c/c\\+\\+", "ansi c"] },
  { name: "Go", group: "language", aliases: ["golang", "go programming", "go lang"] },
  { name: "Rust", group: "language", aliases: ["rust programming", "rust\\b(?= developer| engineer)", "rustlang"] },
  { name: "R", group: "language", aliases: ["r programming", "r studio", "rstudio", "\\br\\b(?=[,/] python)"] },
  { name: "SQL", group: "data", aliases: ["sql"] },
  { name: "MATLAB", group: "language", aliases: ["matlab"] },
  { name: "Swift", group: "language", aliases: ["swift"] },
  { name: "Kotlin", group: "language", aliases: ["kotlin"] },
  { name: "Scala", group: "language", aliases: ["scala"] },
  { name: "Ruby", group: "language", aliases: ["ruby", "ruby on rails"] },
  { name: "PHP", group: "language", aliases: ["php"] },
  { name: "Verilog", group: "language", aliases: ["verilog", "systemverilog"] },
  { name: "VHDL", group: "language", aliases: ["vhdl"] },

  // --- frontend ---
  { name: "React", group: "frontend", aliases: ["react", "react\\.js", "reactjs"] },
  { name: "Next.js", group: "frontend", aliases: ["next\\.js", "nextjs"] },
  { name: "Vue", group: "frontend", aliases: ["vue", "vue\\.js", "vuejs"] },
  { name: "Angular", group: "frontend", aliases: ["angular"] },
  { name: "HTML/CSS", group: "frontend", aliases: ["html", "css", "tailwind", "sass", "scss"] },

  // --- backend / platform ---
  { name: "Node.js", group: "backend", aliases: ["node\\.js", "nodejs", "node js"] },
  { name: "Django", group: "backend", aliases: ["django"] },
  { name: "Flask", group: "backend", aliases: ["flask"] },
  { name: "Spring", group: "backend", aliases: ["spring boot", "spring framework"] },
  { name: "REST APIs", group: "backend", aliases: ["rest api", "restful", "rest apis"] },
  { name: "GraphQL", group: "backend", aliases: ["graphql"] },
  { name: "gRPC", group: "backend", aliases: ["grpc"] },
  { name: "Microservices", group: "backend", aliases: ["microservice", "microservices"] },

  // --- data / ml ---
  { name: "PostgreSQL", group: "data", aliases: ["postgresql", "postgres"] },
  { name: "MySQL", group: "data", aliases: ["mysql"] },
  { name: "MongoDB", group: "data", aliases: ["mongodb", "mongo db"] },
  { name: "Redis", group: "data", aliases: ["redis"] },
  { name: "Spark", group: "data", aliases: ["apache spark", "pyspark", "spark"] },
  { name: "Hadoop", group: "data", aliases: ["hadoop"] },
  { name: "Pandas", group: "data", aliases: ["pandas"] },
  { name: "NumPy", group: "data", aliases: ["numpy"] },
  { name: "PyTorch", group: "data", aliases: ["pytorch", "torch"] },
  { name: "TensorFlow", group: "data", aliases: ["tensorflow", "tensor flow"] },
  { name: "scikit-learn", group: "data", aliases: ["scikit-learn", "scikit learn", "sklearn"] },
  { name: "Machine Learning", group: "data", aliases: ["machine learning", "deep learning", "neural network"] },
  { name: "NLP", group: "data", aliases: ["nlp", "natural language processing"] },
  { name: "Computer Vision", group: "data", aliases: ["computer vision", "opencv"] },
  { name: "Tableau", group: "data", aliases: ["tableau"] },
  { name: "Power BI", group: "data", aliases: ["power bi", "powerbi"] },

  // --- infrastructure ---
  { name: "AWS", group: "infra", aliases: ["aws", "amazon web services"] },
  { name: "GCP", group: "infra", aliases: ["gcp", "google cloud"] },
  { name: "Azure", group: "infra", aliases: ["azure"] },
  { name: "Docker", group: "infra", aliases: ["docker", "containeriz"] },
  { name: "Kubernetes", group: "infra", aliases: ["kubernetes", "k8s"] },
  { name: "Terraform", group: "infra", aliases: ["terraform"] },
  { name: "CI/CD", group: "infra", aliases: ["ci/cd", "continuous integration", "jenkins", "github actions"] },
  { name: "Git", group: "infra", aliases: ["git", "github", "gitlab", "version control"] },
  { name: "Linux", group: "infra", aliases: ["linux", "unix"] },

  // --- business / finance ---
  { name: "Excel", group: "business", aliases: ["excel", "microsoft excel", "advanced excel"] },
  { name: "PowerPoint", group: "business", aliases: ["powerpoint", "power point"] },
  { name: "Financial Modeling", group: "business", aliases: ["financial modeling", "financial modelling", "dcf", "valuation model"] },
  { name: "Accounting", group: "business", aliases: ["accounting", "gaap", "bookkeeping"] },
  { name: "Salesforce", group: "business", aliases: ["salesforce"] },
  { name: "SAP", group: "business", aliases: ["\\bsap\\b"] },
  { name: "Bloomberg", group: "business", aliases: ["bloomberg terminal", "bloomberg"] },
  { name: "Market Research", group: "business", aliases: ["market research", "competitive analysis"] },
  { name: "Figma", group: "business", aliases: ["figma"] },
];

/**
 * Anchor an alias for prose matching.
 *
 * `\b` is a boundary between a word and a non-word character, so it only works
 * next to a word character. Wrapping "c\+\+" as `\bc\+\+\b` can never match:
 * after the final "+" there is no word character for the boundary to sit
 * against, so the pattern fails on every input including "C++" itself. Anchors
 * therefore go on only the ends that can carry one.
 */
function anchor(alias: string): string {
  if (alias.includes("\\b") || alias.includes("(?=")) return alias; // already anchored
  const startsWord = /^[\\]?[a-z0-9]/i.test(alias);
  const endsWord = /[a-z0-9]$/i.test(alias);
  return `${startsWord ? "\\b" : ""}${alias}${endsWord ? "\\b" : ""}`;
}

/** One pattern per skill, built once at module load. */
const PATTERNS: ReadonlyArray<{ skill: Skill; re: RegExp }> = SKILLS.map((skill) => ({
  skill,
  re: new RegExp(skill.aliases.map(anchor).join("|"), "i"),
}));

/* ------------------------------------------------------------------ *
 * Explicit skill lists
 * ------------------------------------------------------------------ */

/** Strip regex syntax back to the literal text an alias stands for. */
function literalOf(alias: string): string | null {
  if (alias.includes("(?=") || alias.includes("\\b")) return null; // context-dependent
  return alias.replace(/\\(.)/g, "$1");
}

function normToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),;•|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/, "");
}

/**
 * Canonical name for an exactly-stated skill.
 *
 * A resume's skills section is a different kind of text from a job
 * description. "Go" in the sentence "we go fast" is noise, but "Go" as an entry
 * in a comma-separated skills list is unambiguous — the student put it there on
 * purpose. So explicit lists get exact-token lookup, including the short names
 * that are deliberately unmatchable in prose. Anything else and every student
 * who writes the tidy one-line skills header their career centre taught them
 * silently loses Go, R and C.
 */
const TOKEN_MAP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const skill of SKILLS) {
    map.set(normToken(skill.name), skill.name);
    for (const alias of skill.aliases) {
      const literal = literalOf(alias);
      if (literal) map.set(normToken(literal), skill.name);
    }
  }
  return map;
})();

/**
 * Resolve an explicitly-listed skill to its canonical name, or null.
 *
 * Exact match only. Substring matching here would map "Google Cloud Platform
 * administration" to five different skills and re-introduce every false
 * positive the prose matcher exists to avoid.
 */
export function canonicalSkill(raw: string): string | null {
  return TOKEN_MAP.get(normToken(raw)) ?? null;
}

/** Canonical skills from a list the user stated outright. */
export function skillsFromList(items: readonly unknown[]): string[] {
  const found = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    // Split "Go, Python" and "Python / SQL" — resumes vary.
    for (const part of item.split(/[,/]| and /i)) {
      const canonical = canonicalSkill(part);
      if (canonical) found.add(canonical);
    }
  }
  // Vocabulary order, so output never reorders between renders.
  return SKILLS.filter((s) => found.has(s.name)).map((s) => s.name);
}

/**
 * Every skill from the vocabulary named in the text.
 *
 * Returns canonical names, deduped, in vocabulary order so output is stable —
 * a score that reorders its own reasons between renders looks broken.
 */
export function extractSkills(...sources: (string | null | undefined)[]): string[] {
  const text = sources.filter(Boolean).join("\n");
  if (!text.trim()) return [];

  const found: string[] = [];
  for (const { skill, re } of PATTERNS) {
    if (re.test(text)) found.push(skill.name);
  }
  return found;
}

/**
 * How many of a posting's skills a candidate needs before the match is "full".
 *
 * Internship postings list aspirational stacks — twelve technologies for a role
 * that genuinely uses three. Scoring linear coverage would put almost every
 * student in the 20s and make the number useless for ranking. Matching five of
 * a posting's named skills is a strong signal; beyond that we are measuring the
 * employer's verbosity, not the candidate.
 */
export const SATURATION = 5;

export interface SkillMatch {
  /** Skills named by both the resume and the posting. */
  matched: string[];
  /** Skills the posting names that the resume does not. The keyword gap. */
  missing: string[];
  /** 0–1, saturating — see SATURATION. Null when either side named nothing. */
  coverage: number | null;
}

export function matchSkills(
  resumeSkills: readonly string[],
  postingSkills: readonly string[],
): SkillMatch {
  // Either side being silent is unknown, not zero. A posting whose description
  // we never fetched must not look like a posting the student is unqualified
  // for — that is the difference between "we don't know" and "you don't match".
  if (resumeSkills.length === 0 || postingSkills.length === 0) {
    return { matched: [], missing: [...postingSkills], coverage: null };
  }

  const mine = new Set(resumeSkills);
  const matched = postingSkills.filter((s) => mine.has(s));
  const missing = postingSkills.filter((s) => !mine.has(s));

  const target = Math.min(postingSkills.length, SATURATION);
  const coverage = Math.min(1, matched.length / target);

  return { matched, missing, coverage };
}

/**
 * Pull every skill a resume demonstrates, not just the ones it lists.
 *
 * A skills section is a claim; a bullet that says "rebuilt the ingest path in
 * Go" is evidence. Reading both means a student is not penalised for a tidy
 * one-line skills header, which is exactly the resume style that gets taught.
 */
export function skillsFromParsedResume(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const p = parsed as {
    skills?: unknown;
    experiences?: unknown;
    projects?: unknown;
  };

  const found = new Set<string>();

  // The skills section is an explicit list — exact-token matched, so short
  // names like Go and R survive.
  if (Array.isArray(p.skills)) for (const s of skillsFromList(p.skills)) found.add(s);

  // Everything else is prose, and gets the conservative matcher.
  const parts: string[] = [];

  if (Array.isArray(p.experiences)) {
    for (const e of p.experiences) {
      if (!e || typeof e !== "object") continue;
      const exp = e as { role?: unknown; bullets?: unknown };
      if (typeof exp.role === "string") parts.push(exp.role);
      if (Array.isArray(exp.bullets)) {
        parts.push(exp.bullets.filter((b) => typeof b === "string").join(" "));
      }
    }
  }

  if (Array.isArray(p.projects)) {
    for (const pr of p.projects) {
      if (!pr || typeof pr !== "object") continue;
      const proj = pr as { name?: unknown; description?: unknown };
      if (typeof proj.name === "string") parts.push(proj.name);
      if (typeof proj.description === "string") parts.push(proj.description);
    }
  }

  for (const s of extractSkills(...parts)) found.add(s);

  return SKILLS.filter((s) => found.has(s.name)).map((s) => s.name);
}
