/**
 * Award-amount parsing, shared across scholarship sources.
 *
 * Sources state award values as free prose, and the shapes vary more than
 * they look: "Up to $2,000 total per student", "Between $4,000-$8,000",
 * "$16,000-20,000" (no second dollar sign), "$1,411.05", and plenty that
 * are genuinely unparseable ("Varies — up to the full cost of tuition").
 */

export interface ParsedAmount {
  min: number | null;
  max: number | null;
  /**
   * The source stated something monetary that we could not read.
   *
   * This is the difference between the two ways an amount ends up null, and
   * they are not the same fact. "Varies" is the source declining to state a
   * number — nothing is wrong and there is nothing to fix. "$,000" is the
   * source stating a number we failed to parse, which means either their typo
   * or our bug, and a human should look. Collapsing both into a bare null
   * would bury every parser regression in the same silence as the honest
   * blanks. Surfaced by `npm run ingest:status`.
   */
  needsReview: boolean;
}

/** Any `$` at all — the marker that the cell was *meant* to carry a figure. */
const MONETARY_RE = /\$/;

/**
 * Zero is never a real award, so it is never a real parse.
 *
 * Sources have typos: UNL publishes a row whose amount cell reads "$,000",
 * missing the leading digit entirely. Stripping the comma leaves "$000",
 * which matches as a perfectly well-formed zero. Storing that would put a
 * confident "$0" on screen — an assertion the scholarship awards nothing,
 * which is false — when the honest answer is that we could not read it.
 */
function positiveOrNull(n: number): number | null {
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * No bounds. Flags for review only when the raw text carried a `$`, so a
 * source that simply says "Varies" never lands in the review queue.
 */
function none(raw: string): ParsedAmount {
  return { min: null, max: null, needsReview: MONETARY_RE.test(raw) };
}

/**
 * Parse an award line into whole-dollar bounds.
 *
 * Order matters, the same lesson as the resume critique's date-range regex:
 * a range or "up to" has to be checked before a bare dollar figure, or "up
 * to $10,000" reads as an exact $10,000 rather than a ceiling. Anything that
 * doesn't match a known shape returns both null rather than guessing — a
 * wrong number here is worse than an honest blank, since a student would
 * filter on it.
 */
export function parseAmount(raw: string): ParsedAmount {
  const text = raw.replace(/,/g, "");

  // Second `$` is optional: UNL writes "$16,000-20,000".
  const range = text.match(/\$(\d+)\s*(?:-|–|—|to)\s*\$?(\d+)/i);
  if (range) {
    const a = positiveOrNull(Number(range[1]));
    const b = positiveOrNull(Number(range[2]));
    // A half-readable range is not a range. Both ends have to survive, or
    // we would publish a bound the source never stated.
    if (a === null || b === null) return none(raw);
    return { min: Math.min(a, b), max: Math.max(a, b), needsReview: false };
  }

  const upTo = text.match(/up to\s*\$(\d+)/i);
  if (upTo) {
    const max = positiveOrNull(Number(upTo[1]));
    return max === null ? none(raw) : { min: null, max, needsReview: false };
  }

  // Exactly one figure means a stated amount. More than one means prose we
  // are not confident reading ("$500 for books and $1,000 for tuition"), so
  // it falls through to null rather than picking one arbitrarily.
  const dollarFigures = text.match(/\$(\d+)/g);
  if (dollarFigures && dollarFigures.length === 1) {
    const n = positiveOrNull(Number(dollarFigures[0].slice(1)));
    return n === null ? none(raw) : { min: n, max: n, needsReview: false };
  }

  return none(raw);
}
