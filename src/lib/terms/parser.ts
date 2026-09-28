/**
 * Deterministic term parser.
 *
 * Terms are explicit (stated in the title or description), inferred from the
 * listing's own first-seen date, or honestly unknown. No LLM, no guesses.
 */

export type TermSource = "explicit" | "inferred" | "unknown";
export type TermSeason = "summer" | "fall" | "spring" | "winter" | "co-op";

export interface TermParseResult {
  /** Display term, e.g. "Summer 2027". Null when source is unknown. */
  term: string | null;
  termSource: TermSource;
  termSeason: TermSeason | null;
  termYear: number | null;
  /** Raw source text that justified an explicit term, for audit. */
  termRaw: string | null;
}

interface ExplicitMatch {
  term: string;
  season: TermSeason;
  year: number;
  raw: string;
}

const SEASON_ALIASES: Record<string, TermSeason> = {
  spring: "spring",
  summer: "summer",
  fall: "fall",
  autumn: "fall",
  winter: "winter",
};

const SEASON_NAMES = Object.keys(SEASON_ALIASES).join("|");

// "Summer 2027", "Summer '27", "Co-op 2027", "2027 Fall", "2027 Co-op"
const PATTERNS = [
  new RegExp(`\\b(${SEASON_NAMES})\\s*'?(\\d{4}|\\d{2})\\b`, "i"),
  new RegExp(`\\b(co-?op)\\s*'?(\\d{4}|\\d{2})\\b`, "i"),
  new RegExp(`\\b(\\d{4})\\s+(${SEASON_NAMES})\\b`, "i"),
  new RegExp(`\\b(\\d{4})\\s+(co-?op)\\b`, "i"),
];

function normalizeYear(y: string): number {
  if (y.length === 2) return 2000 + Number(y);
  return Number(y);
}

function normalizeSeason(s: string): TermSeason {
  const key = s.toLowerCase().replace(/-/g, "");
  if (key === "coop" || key === "co-op") return "co-op";
  return SEASON_ALIASES[key] ?? "summer";
}

/**
 * Canonical display string for a structured term. Exported so any layer that
 * needs to render a term from `term_season`/`term_year` produces byte-identical
 * text to the parser.
 */
export function displayTerm(season: TermSeason, year: number): string {
  const label = season === "co-op" ? "Co-op" : `${season[0].toUpperCase()}${season.slice(1)}`;
  return `${label} ${year}`;
}

function findExplicitTermIn(text: string): ExplicitMatch | null {
  for (const pattern of PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;

    let seasonRaw: string;
    let yearRaw: string;

    if (m[1] && /^\d{4}$/.test(m[1])) {
      // Year-first pattern: 2027 Fall
      yearRaw = m[1];
      seasonRaw = m[2];
    } else {
      seasonRaw = m[1];
      yearRaw = m[2];
    }

    const season = normalizeSeason(seasonRaw);
    const year = normalizeYear(yearRaw);

    // Reject implausible years that would be parsing artefacts.
    if (year < 2000 || year > 2100) continue;

    return {
      term: displayTerm(season, year),
      season,
      year,
      raw: m[0],
    };
  }
  return null;
}

function findExplicitTerm(
  title: string | null | undefined,
  description: string | null | undefined,
): ExplicitMatch | null {
  if (title) {
    const m = findExplicitTermIn(title);
    if (m) return m;
  }
  if (description) {
    const m = findExplicitTermIn(description);
    if (m) return m;
  }
  return null;
}

function inferFromFirstSeen(firstSeenAt: Date): TermParseResult {
  const month = firstSeenAt.getUTCMonth() + 1; // 1-12
  const year = firstSeenAt.getUTCFullYear();
  // July-January -> next summer; February-June -> that calendar year's summer.
  const termYear = month >= 7 ? year + 1 : year;
  return {
    term: `Summer ${termYear}`,
    termSource: "inferred",
    termSeason: "summer",
    termYear,
    termRaw: null,
  };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse the term for a single listing.
 *
 * Title is searched before description. If neither contains an explicit term
 * and a first-seen date is supplied, the term is inferred. Otherwise it is
 * unknown.
 */
export function parseTerm(
  title: string | null | undefined,
  description: string | null | undefined,
  firstSeenAt: Date | string | null | undefined,
): TermParseResult {
  const explicit = findExplicitTerm(title, description);
  if (explicit) {
    return {
      term: explicit.term,
      termSource: "explicit",
      termSeason: explicit.season,
      termYear: explicit.year,
      termRaw: explicit.raw,
    };
  }

  const seen = toDate(firstSeenAt);
  if (seen) {
    return inferFromFirstSeen(seen);
  }

  return {
    term: null,
    termSource: "unknown",
    termSeason: null,
    termYear: null,
    termRaw: null,
  };
}

/**
 * Return only an explicit term, if any. Useful for stable deduplication keys
 * that must not change when inference rules change.
 */
export function parseExplicitTerm(
  title: string | null | undefined,
  description: string | null | undefined,
): Pick<TermParseResult, "term" | "termSeason" | "termYear" | "termRaw"> | null {
  const explicit = findExplicitTerm(title, description);
  if (!explicit) return null;
  return {
    term: explicit.term,
    termSeason: explicit.season,
    termYear: explicit.year,
    termRaw: explicit.raw,
  };
}
