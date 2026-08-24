/**
 * How well a posting matches what the student actually typed.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Search used to *filter* and never *rank*. `getFeed` pushed an
 * AND-of-substrings into SQL, and whatever survived was then ordered by fit
 * score — so the query decided membership and had no say at all in position.
 * Measured against the live corpus before this was written:
 *
 *   "engineering" -> 396 rows, top hit "National Garden Clubs Inc. Scholarship"
 *   "nursing"     ->  15 rows, top hit "Reno Rodeo Foundation Scholarship"
 *
 * Both of those genuinely contain the term somewhere — the garden club's
 * eligibility prose mentions engineering — so the filter was right and the
 * ordering was the entire problem. A student who types a word and gets an
 * unrelated award first concludes the search is broken, and they are not wrong.
 *
 * ── WHERE A TERM APPEARS IS THE SIGNAL ──────────────────────────────────────
 *
 * Every row reaching this function already contains every term, so relevance
 * cannot be about *whether* it matched. It is about **where**, and how
 * squarely. A term in the title is what the award is called; the same term
 * buried in eligibility boilerplate is a passing mention. Matching a whole word
 * beats matching inside a longer one — "art" inside "particle" is not an arts
 * scholarship, and that is the same class of error the taxonomy's `\blaw\b`
 * boundary bug already cost this project once.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * No stemming, no synonyms, no fuzzy matching. `ilike` substring matching is
 * what the SQL filter does, and a ranker that scored on a different notion of
 * "match" than the filter would order rows by a rule the result set was never
 * selected under. Typo tolerance is a real gap — "software enginer" returns
 * nothing at all — but it belongs in the filter, not here, and it is recorded
 * in FIXES.md rather than half-built.
 */

/** Points a single term can earn, best-match-wins per field. */
const TITLE_WORD = 10;
const TITLE_PART = 6;
const SPONSOR_WORD = 4;
const SPONSOR_PART = 2;
const ELIGIBILITY_WORD = 2;
const ELIGIBILITY_PART = 1;

/** The most one term can score — a whole word in the title, at the front. */
const TITLE_LEAD_BONUS = 2;
const MAX_PER_TERM = TITLE_WORD + TITLE_LEAD_BONUS;

export interface RelevanceTarget {
  title: string;
  /** Organisation or sponsor — whoever is named on the row. */
  company?: string | null;
  eligibility?: string[];
}

/** Escapes a term for use inside a RegExp — a query is user input. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match, the same idea as the taxonomy's `\b` boundaries. */
function hasWord(haystack: string, term: string): boolean {
  return new RegExp(`\\b${escapeRe(term)}\\b`, "i").test(haystack);
}

function scoreTerm(term: string, title: string, company: string, eligibility: string): number {
  const lower = term.toLowerCase();

  if (hasWord(title, term)) {
    // Leading the title is the strongest statement a row can make about what
    // it is: "Nursing Scholarship" over "Foundation Scholarship for Nursing".
    const lead = title.toLowerCase().startsWith(lower) ? TITLE_LEAD_BONUS : 0;
    return TITLE_WORD + lead;
  }
  if (title.toLowerCase().includes(lower)) return TITLE_PART;
  if (company && hasWord(company, term)) return SPONSOR_WORD;
  if (company && company.toLowerCase().includes(lower)) return SPONSOR_PART;
  if (eligibility && hasWord(eligibility, term)) return ELIGIBILITY_WORD;
  if (eligibility && eligibility.toLowerCase().includes(lower)) return ELIGIBILITY_PART;
  return 0;
}

/**
 * 0–100, where 100 means every term is a whole word leading the title.
 *
 * Returns 0 for an empty query so callers can treat "no search" as "relevance
 * says nothing", rather than as a score every row ties on.
 */
export function relevanceScore(target: RelevanceTarget, terms: string[]): number {
  if (terms.length === 0) return 0;

  const title = target.title ?? "";
  const company = target.company ?? "";
  const eligibility = (target.eligibility ?? []).join(" ");

  let total = 0;
  for (const term of terms) total += scoreTerm(term, title, company, eligibility);

  let score = (total / (terms.length * MAX_PER_TERM)) * 100;

  /*
   * The whole query appearing contiguously in the title is a different kind of
   * evidence from its words appearing separately — "computer science" as a
   * phrase means the row is about computer science, while "computer" and
   * "science" scattered through a title might be a computer lab endowment from
   * a science foundation. Applied as a closing multiplier toward 100 so it can
   * only ever promote within the band the terms already earned.
   */
  if (terms.length > 1) {
    const phrase = terms.join(" ").toLowerCase();
    if (title.toLowerCase().includes(phrase)) score += (100 - score) * 0.5;
  }

  return Math.round(Math.min(100, score));
}
