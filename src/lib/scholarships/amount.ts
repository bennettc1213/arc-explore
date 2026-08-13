/**
 * Award-amount parsing, shared across scholarship sources.
 *
 * Sources state award values as free prose, and the shapes vary more than
 * they look: "Up to $2,000 total per student", "Between $4,000-$8,000",
 * "$16,000-20,000" (no second dollar sign), "$1,411.05", and plenty that
 * are genuinely unparseable ("Varies — up to the full cost of tuition").
 */

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
const NONE = { min: null, max: null } as const;

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

export function parseAmount(raw: string): { min: number | null; max: number | null } {
  const text = raw.replace(/,/g, "");

  // Second `$` is optional: UNL writes "$16,000-20,000".
  const range = text.match(/\$(\d+)\s*(?:-|–|—|to)\s*\$?(\d+)/i);
  if (range) {
    const a = positiveOrNull(Number(range[1]));
    const b = positiveOrNull(Number(range[2]));
    // A half-readable range is not a range. Both ends have to survive, or
    // we would publish a bound the source never stated.
    if (a === null || b === null) return NONE;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  const upTo = text.match(/up to\s*\$(\d+)/i);
  if (upTo) {
    const max = positiveOrNull(Number(upTo[1]));
    return max === null ? NONE : { min: null, max };
  }

  // Exactly one figure means a stated amount. More than one means prose we
  // are not confident reading ("$500 for books and $1,000 for tuition"), so
  // it falls through to null rather than picking one arbitrarily.
  const dollarFigures = text.match(/\$(\d+)/g);
  if (dollarFigures && dollarFigures.length === 1) {
    const n = positiveOrNull(Number(dollarFigures[0].slice(1)));
    return n === null ? NONE : { min: n, max: n };
  }

  return NONE;
}
