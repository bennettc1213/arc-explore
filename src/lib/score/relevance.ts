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
 * No fuzzy matching, and no notion of "match" the filter does not share. A
 * ranker scoring on a different rule from the one the result set was selected
 * under would order rows by something that never decided membership.
 *
 * Stemming and synonyms therefore live in `search/query.ts`, which is what the
 * filter reads too, and arrive here already expanded as `alternates`. This
 * function's only added judgement about them is that **the word the student
 * actually typed outranks anything we guessed they might have meant** — see
 * ALTERNATE_WEIGHT.
 */

/** Points a single term can earn, best-match-wins per field. */
const TITLE_WORD = 10;
const TITLE_PART = 6;
const SPONSOR_WORD = 4;
const SPONSOR_PART = 2;
const ELIGIBILITY_WORD = 2;
const ELIGIBILITY_PART = 1;

/** Skills are structured rather than prose, so a hit is worth an eligibility hit. */
const SKILL_WORD = 2;

/** The most one term can score — a whole word in the title, at the front. */
const TITLE_LEAD_BONUS = 2;
const MAX_PER_TERM = TITLE_WORD + TITLE_LEAD_BONUS;

/**
 * What a match through an expansion is worth against the literal word.
 *
 * An alternate is evidence the student *might* have meant this; the literal is
 * what they typed. So an expansion must never outrank the word itself, and this
 * is set where a whole-word title hit via an alternate scores exactly what a
 * *partial* title hit via the literal scores (10 x 0.6 = 6 = TITLE_PART). That
 * is the honest equivalence: "we found your word inside a longer one" and "we
 * found a word you probably meant" are about equally good guesses.
 */
const ALTERNATE_WEIGHT = 0.6;

export interface RelevanceTarget {
  title: string;
  /** Organisation or sponsor — whoever is named on the row. */
  company?: string | null;
  eligibility?: string[];
  /** Canonical skills the posting names, where it named any. */
  skills?: string[];
}

/**
 * One term as `search/query.ts` produced it: what was typed, plus everything
 * that would also count. `alternates[0]` is always the literal.
 */
export interface RelevanceTerm {
  literal: string;
  alternates: string[];
}

/** Escapes a term for use inside a RegExp — a query is user input. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match, the same idea as the taxonomy's `\b` boundaries. */
function hasWord(haystack: string, term: string): boolean {
  return new RegExp(`\\b${escapeRe(term)}\\b`, "i").test(haystack);
}

function scoreOne(
  term: string,
  title: string,
  company: string,
  eligibility: string,
  skills: string,
): number {
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
  if (skills && hasWord(skills, term)) return SKILL_WORD;
  if (eligibility && hasWord(eligibility, term)) return ELIGIBILITY_WORD;
  if (eligibility && eligibility.toLowerCase().includes(lower)) return ELIGIBILITY_PART;
  return 0;
}

/**
 * Best score across a term's alternates, with the literal privileged.
 *
 * A row reaching this function matched the query *somewhere* — possibly in a
 * description, which the feed deliberately does not carry into memory (see
 * FEED_SELECT). Such a row simply scores 0 on that term and sorts below rows
 * that matched somewhere we can see, which is the correct ordering and costs
 * no extra column.
 */
function scoreTerm(
  term: RelevanceTerm,
  title: string,
  company: string,
  eligibility: string,
  skills: string,
): number {
  let best = scoreOne(term.literal, title, company, eligibility, skills);

  for (let i = 1; i < term.alternates.length; i++) {
    const v = scoreOne(term.alternates[i], title, company, eligibility, skills) * ALTERNATE_WEIGHT;
    if (v > best) best = v;
  }
  return best;
}

/**
 * 0–100, where 100 means every term is a whole word leading the title.
 *
 * Returns 0 for an empty query so callers can treat "no search" as "relevance
 * says nothing", rather than as a score every row ties on.
 */
export function relevanceScore(target: RelevanceTarget, terms: RelevanceTerm[]): number {
  if (terms.length === 0) return 0;

  const title = target.title ?? "";
  const company = target.company ?? "";
  const eligibility = (target.eligibility ?? []).join(" ");
  const skills = (target.skills ?? []).join(" ");

  let total = 0;
  for (const term of terms) total += scoreTerm(term, title, company, eligibility, skills);

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
    const phrase = terms.map((t) => t.literal).join(" ").toLowerCase();
    if (title.toLowerCase().includes(phrase)) score += (100 - score) * 0.5;
  }

  return Math.round(Math.min(100, score));
}
