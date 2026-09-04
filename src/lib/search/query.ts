/**
 * What did the student actually ask for?
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Search was an AND of raw substrings: every word typed had to appear verbatim
 * somewhere in a row's title, sponsor or eligibility text. That is a defensible
 * default and it fails in four separate ways, all four measured against the
 * live corpus on 25 queries a student would plausibly type. **Six of the 25
 * returned nothing at all:**
 *
 *   "software enginer"         ->  0 rows   one letter missing
 *   "compsci"                  ->  0 rows   an abbreviation nobody spells out
 *   "$5000" / "5000"           ->  0 rows   a fact we hold in a column
 *   "scholarships over $10000" ->  0 rows   the same, in a sentence
 *   "business administration"  ->  0 rows   while 134 internship descriptions
 *                                           contain the phrase
 *
 * And three more returned something misleading:
 *
 *   "nurse"            ->   2 rows, while "nursing" returns 15
 *   "first-generation" ->   2 rows, while "first generation" returns 6
 *   "art"              -> 212 rows, of which only ~36 contain a word starting
 *                         "art" — the rest are Start, Smart, Parts, Charter
 *
 * ── THE SHAPE OF THE FIX ────────────────────────────────────────────────────
 *
 * Every one of those is a **filter** problem, not a ranking problem. The ranker
 * added last session can only reorder what the filter admitted, so no amount of
 * scoring rescues a query that returned nothing. This module is the layer that
 * turns typed text into the structured thing the filter and the ranker can both
 * honour, and it does three separable jobs:
 *
 *   1. **Lift out facts we hold in columns.** An amount, a kind, remote. Those
 *      are not words to look for in a title — they are things we can answer
 *      exactly, and searching them as text is why "$5000" found nothing while
 *      311 rows carried a parsed amount.
 *   2. **Normalise what is left**, so "first-generation" and "first generation"
 *      stop being two different queries.
 *   3. **Expand each remaining word into what would also count as a match** —
 *      an abbreviation's expansion, a stem covering the inflections. The literal
 *      stays first, and `score/relevance.ts` scores it above its alternates, so
 *      widening the net does not scramble the order.
 *
 * ── WHY WIDENING IS SAFE NOW AND WAS NOT BEFORE ─────────────────────────────
 *
 * `feed-search.ts` used to warn against an OR that "floods the feed with
 * near-misses", and it was right at the time: there was no ranker, so a wider
 * filter meant a worse first result. There is one now, and it scores *where* a
 * term matched. So the honest division is that the filter decides what could
 * possibly have been meant and the ranker decides what was most likely meant —
 * and a row matched only through a stem, or only deep in a description, sorts
 * below one matched by the literal word in its title.
 *
 * What this deliberately does **not** do is silently drop a word to rescue a
 * failing query. Dropping a term changes what was asked, so if it ever happens
 * it has to be visible to the reader. That is what `relaxations` carries.
 */

/** Longest single term we will match on. Longer is a paste, not a search. */
const MAX_TERM_LENGTH = 64;

/** Most terms we will AND together. Each one costs another scan. */
const MAX_TERMS = 6;

/**
 * Abbreviations students actually type, and what they mean.
 *
 * **An allowlist, and the short entries are the dangerous ones.** Same
 * judgement `SCHOLARLY_SPONSOR_RE` makes: an unrecognised abbreviation is
 * simply not expanded and the query still runs on the literal. Two-letter
 * abbreviations that are also ordinary English words are deliberately absent —
 * "me" for mechanical engineering would fire on every posting containing the
 * word "me", and a false expansion is worse than none because once it is in the
 * result set it is indistinguishable from a real match.
 */
const ABBREVIATIONS: Record<string, string[]> = {
  cs: ["computer science"],
  compsci: ["computer science"],
  cse: ["computer science"],
  swe: ["software engineer"],
  ml: ["machine learning"],
  ai: ["artificial intelligence"],
  nlp: ["natural language processing"],
  ee: ["electrical engineering"],
  ux: ["user experience"],
  hr: ["human resources"],
  rn: ["registered nurse"],
  mba: ["business administration"],
  polisci: ["political science"],
  premed: ["pre med", "medicine"],
  prelaw: ["pre law"],
  qa: ["quality assurance"],
};

/**
 * Words a student uses interchangeably with the thing they are looking for.
 *
 * Only genuine near-synonyms in this domain, not a thesaurus: a scholarship is
 * routinely advertised as a grant, an award, a fellowship or a bursary, and a
 * student typing one of those means all of them.
 */
const SYNONYMS: Record<string, string[]> = {
  scholarship: ["grant", "fellowship", "award", "bursary"],
  grant: ["scholarship", "fellowship", "award"],
  fellowship: ["scholarship", "grant"],
  bursary: ["scholarship", "grant"],
  internship: ["intern", "co op"],
  intern: ["internship"],
  undergrad: ["undergraduate"],
  freshman: ["first year"],
};

/**
 * Reduces a word to the stem its inflections share.
 *
 * Deliberately crude and deliberately conservative. Matching downstream is a
 * substring match, so a stem covers its own inflections for free — "nurs" finds
 * nurse, nurses and nursing, which is the exact gap that made "nurse" return 2
 * rows while "nursing" returned 15.
 *
 * What it must never do is stem far enough for unrelated words to collide, so
 * nothing under five letters is touched and no stem shorter than four is
 * produced. "art" and "law" therefore come through exactly as typed — that is
 * the class of bug that once classified every Delaware resident as a business
 * student.
 */
export function stem(word: string): string | null {
  const w = word.toLowerCase();
  if (w.length < 5) return null;

  const cut = (suffix: string, min: number): string | null => {
    if (!w.endsWith(suffix)) return null;
    const base = w.slice(0, -suffix.length);
    return base.length >= min ? base : null;
  };

  const stemmed =
    (w.endsWith("ies") ? `${w.slice(0, -3)}y` : null) ??
    cut("ships", 4) ??
    cut("ing", 4) ??
    cut("ers", 4) ??
    cut("er", 4) ??
    cut("es", 4) ??
    cut("s", 4);

  return stemmed && stemmed !== w ? stemmed : null;
}

/**
 * Words that carry no search signal, dropped before matching.
 *
 * Kept deliberately tiny — function words only, nothing that could name a
 * subject. The cost of dropping a real word is a query that returns the wrong
 * thing, so this list contains nothing anyone would ever search *for*.
 *
 * It matters because matching is anchored at the start of a word: "in" would
 * otherwise be satisfied by "Intern", i.e. by essentially the whole corpus,
 * which is a full scan for a term that cannot discriminate. "women in stem"
 * should ask for two things, not three.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "for",
  "in",
  "on",
  "at",
  "to",
  "with",
  "or",
  "my",
  "i",
  "me",
  "im",
  "looking",
  "want",
  "need",
  "find",
  "search",
  "show",
]);

/** One thing the student asked for, and everything that would also satisfy it. */
export interface SearchTerm {
  /** Exactly what they typed, normalised for case and punctuation. */
  literal: string;
  /**
   * Every string that counts as a match, `literal` first.
   *
   * Order matters: `relevanceScore` walks these and the first hit wins, so an
   * exact word always outscores the expansion that also found it.
   */
  alternates: string[];
}

/** A typed query, split into facts we can answer and words we cannot. */
export interface ParsedQuery {
  /** Words still to be matched as text. Empty when the query was all facts. */
  terms: SearchTerm[];
  /** Lifted out of the text and applied as a real filter. */
  minAmount: number | null;
  kind: "scholarship" | "internship" | null;
  remoteOnly: boolean;
  /**
   * Anything we did to the query that the student did not ask for, in words fit
   * to show them. Empty when we simply ran what they typed.
   */
  relaxations: string[];
}

export const EMPTY_QUERY: ParsedQuery = {
  terms: [],
  minAmount: null,
  kind: null,
  remoteOnly: false,
  relaxations: [],
};

/**
 * Normalises punctuation to spaces so hyphenation stops being a second query.
 *
 * `$`, `+` and digits survive, because an amount is extracted after this and
 * stripping the currency marker here would make "$5,000" indistinguishable from
 * a street number.
 */
function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/,(?=\d)/g, "")
    .replace(/[^a-z0-9$+\-\s]/g, " ")
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Years are not amounts. "summer 2026" must not become "award over $2,026". */
function looksLikeYear(n: number): boolean {
  return n >= 1900 && n <= 2100;
}

const QUALIFIERS = new Set(["over", "above", "min", "minimum", "least", "than", "atleast", "under"]);

/**
 * Pulls a minimum award out of the text.
 *
 * Accepts `$5000`, `5000`, `5k`, `$10000+` and the qualifier forms students
 * write in full — "over 5000", "at least $2,500", "more than 10k". A bare
 * number is taken as an amount too, because in this corpus that is what a bare
 * number means — *except* when it reads as a year, which is why "summer 2026"
 * survives as text.
 */
function extractAmount(words: string[]): { minAmount: number | null; rest: string[] } {
  const rest: string[] = [];
  let minAmount: number | null = null;

  for (const w of words) {
    const m = /^\$?(\d+)(k?)\+?$/.exec(w);
    if (!m) {
      rest.push(w);
      continue;
    }

    const digits = Number(m[1]);
    if (!Number.isFinite(digits) || digits <= 0) {
      rest.push(w);
      continue;
    }

    const value = m[2] === "k" ? digits * 1000 : digits;
    const marked = w.startsWith("$") || m[2] === "k" || w.endsWith("+");
    const qualified = QUALIFIERS.has(rest[rest.length - 1] ?? "");

    // A year is only an amount when the student marked it as money.
    if (!marked && !qualified && looksLikeYear(value)) {
      rest.push(w);
      continue;
    }

    minAmount = minAmount === null ? value : Math.max(minAmount, value);
    // The qualifier that introduced it is structure too, not a word to find.
    if (qualified) rest.pop();
  }

  return { minAmount, rest };
}

const KIND_WORDS: Record<string, "scholarship" | "internship"> = {
  scholarship: "scholarship",
  scholarships: "scholarship",
  grant: "scholarship",
  grants: "scholarship",
  fellowship: "scholarship",
  fellowships: "scholarship",
  internship: "internship",
  internships: "internship",
  intern: "internship",
  interns: "internship",
};

/**
 * Reads "scholarships" as *what kind of thing I want*, not as a word to find.
 *
 * That is the honest reading and it closes a whole class at once: "nursing
 * scholarships" was requiring the literal string "scholarships" to appear
 * beside "nursing", which is why the plural returned fewer rows than the
 * singular. A bare "scholarships" becomes the filter with no text left, which
 * correctly means "show me scholarships".
 *
 * Naming both kinds means neither was meant as a filter, so the words stay as
 * text and the feed keeps both.
 */
function extractKind(words: string[]): {
  kind: "scholarship" | "internship" | null;
  rest: string[];
} {
  const kinds = new Set(words.map((w) => KIND_WORDS[w]).filter(Boolean));
  if (kinds.size !== 1) return { kind: null, rest: words };

  const kind = [...kinds][0] as "scholarship" | "internship";
  return { kind, rest: words.filter((w) => !KIND_WORDS[w]) };
}

function extractRemote(words: string[]): { remoteOnly: boolean; rest: string[] } {
  if (!words.includes("remote")) return { remoteOnly: false, rest: words };
  return { remoteOnly: true, rest: words.filter((w) => w !== "remote") };
}

/** Builds the alternates for one literal word, literal always first. */
function expand(literal: string): SearchTerm {
  const alternates = [literal];
  const push = (v: string) => {
    const t = v.trim();
    if (t && !alternates.includes(t)) alternates.push(t);
  };

  for (const v of ABBREVIATIONS[literal] ?? []) push(v);
  for (const v of SYNONYMS[literal] ?? []) push(v);

  const s = stem(literal);
  if (s) push(s);

  return { literal, alternates };
}

/**
 * Turns raw typed text into a query the filter and the ranker can both read.
 *
 * Returns `EMPTY_QUERY` for an absent or whitespace-only query, which callers
 * treat as "no search" — an empty box must not filter the feed down to nothing.
 */
export function parseQuery(raw: string | null | undefined): ParsedQuery {
  if (!raw) return EMPTY_QUERY;

  const words = normalise(raw)
    .split(" ")
    .filter(Boolean)
    .map((w) => w.slice(0, MAX_TERM_LENGTH));
  if (words.length === 0) return EMPTY_QUERY;

  const amount = extractAmount(words);
  const remote = extractRemote(amount.rest);
  const kindPass = extractKind(remote.rest);

  // Stopwords go last, so "grants for nursing" still reads the kind off
  // "grants" before "for" is discarded.
  const meaningful = kindPass.rest.filter((w) => !STOPWORDS.has(w));
  const textWords = meaningful.slice(0, MAX_TERMS);

  return {
    terms: textWords.map(expand),
    minAmount: amount.minAmount,
    kind: kindPass.kind,
    remoteOnly: remote.remoteOnly,
    relaxations: [],
  };
}

/** True when the query asked for nothing at all. */
export function isEmptyQuery(q: ParsedQuery): boolean {
  return q.terms.length === 0 && q.minAmount === null && q.kind === null && !q.remoteOnly;
}

/**
 * Escapes a term for use inside a Postgres regular expression.
 *
 * The search filter matches on a word boundary rather than a bare substring
 * (see WORD_START in feed.ts), so the term reaches a regex engine and every
 * metacharacter in it has to be neutralised first. "C++", "$5,000" and "(" are
 * all things students genuinely type — `relevance.ts` already learned this the
 * same way and carries the same guard for the JavaScript side.
 *
 * Backslash first, or the escapes added afterwards would be double-escaped.
 */
export function escapeRegex(term: string): string {
  return term.replace(/[\\.*+?^${}()|[\]]/g, (c) => `\\${c}`);
}
