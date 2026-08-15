/**
 * Essay / statement-of-purpose review: shapes and shared vocabulary.
 *
 * Free of database and network imports on purpose — the reviewer runs in the
 * student's own browser, so an essay pasted here is never sent to us. That is
 * the same guarantee the LinkedIn checker makes, and it matters more here: a
 * personal statement is the most personal document a student will write for
 * this process, and a scholarship essay is often about the hardest thing that
 * has happened to them.
 */

export const MAX_ESSAY_CHARS = 20_000;
export const MAX_PROMPT_CHARS = 2_000;

export interface EssayInput {
  /** What the scholarship or programme actually asked. */
  prompt: string;
  essay: string;
  /** Stated word limit, when the application gives one. Null means unstated. */
  wordLimit: number | null;
}

export const EMPTY_ESSAY_INPUT: EssayInput = { prompt: "", essay: "", wordLimit: null };

/* ------------------------------------------------------------------ *
 * Tokenizing
 * ------------------------------------------------------------------ */

/**
 * Words that carry no topic. Kept deliberately short: the point is to find what
 * the *prompt* is asking about, and an over-eager stop list throws away the
 * verbs that carry the ask ("describe", "explain", "overcome").
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "that", "this", "these", "those",
  "of", "in", "on", "at", "to", "for", "with", "from", "by", "as", "is", "are", "was", "were",
  "be", "been", "being", "am", "do", "does", "did", "have", "has", "had", "will", "would",
  "shall", "should", "can", "could", "may", "might", "must", "you", "your", "yours", "i", "me",
  "my", "we", "our", "us", "it", "its", "they", "them", "their", "he", "she", "his", "her",
  "not", "no", "so", "up", "out", "about", "into", "over", "any", "all", "each", "more", "most",
  "other", "some", "such", "own", "same", "too", "very", "just", "also", "how", "what", "when",
  "where", "who", "whom", "which", "why", "please", "words", "word", "essay", "maximum", "max",
  "limit", "least", "one", "two", "three",
]);

/**
 * Prompt scaffolding: the words that tell the *student* what to do, as opposed
 * to naming what the essay should be about.
 *
 * These must not become coverage terms. An essay never needs to contain the
 * word "describe", and flagging its absence would put noise at the top of the
 * findings list — which is worse than saying nothing, because a student who
 * sees one obviously silly finding stops trusting the rest of them.
 *
 * Kept separate from the general stop list so the distinction stays legible:
 * this is a judgement about essay prompts specifically, not about English.
 */
const PROMPT_SCAFFOLD = new Set([
  "describe", "explain", "discuss", "tell", "share", "write", "address", "detail", "outline",
  "reflect", "consider", "provide", "give", "state", "identify", "elaborate", "respond",
  "answer", "include", "submit", "statement", "personal", "applicant", "application",
  "question", "prompt", "response", "paragraph", "page", "pages", "characters",
  // Generic nouns that stand in for the real subject.
  "time", "times", "example", "examples", "instance", "situation", "moment", "thing", "things",
  "something", "anything", "way", "ways", "life", "yourself",
]);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Crude suffix stripping, so "overcame" and "overcome" are not different topics.
 *
 * Deliberately not a real stemmer. A full Porter implementation would be
 * another dependency for a gain we cannot measure, and an over-aggressive stem
 * produces false matches — which here means telling a student they covered
 * something they did not, the one error this check must not make.
 */
export function stem(word: string): string {
  let w = word.replace(/'s$/, "");
  for (const suffix of ["ingly", "edly", "ing", "ies", "ied", "es", "ed", "ly", "s"]) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  /*
   * Drop a trailing "e" last, and this line is load-bearing.
   *
   * Without it "challenges" strips to "challeng" while "challenge" stays whole,
   * so a prompt asking about challenges would not match an essay that uses the
   * singular — reporting a gap the student does not have, which is the one
   * error this check must never make.
   */
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Distinct topical terms in a prompt, stemmed, in the order they appear. */
export function promptTerms(prompt: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words(prompt)) {
    if (w.length < 3 || STOPWORDS.has(w) || PROMPT_SCAFFOLD.has(w)) continue;
    const s = stem(w);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Every stemmed word in a text, as a set, for coverage lookups. */
export function stemSet(text: string): Set<string> {
  return new Set(words(text).map(stem));
}
