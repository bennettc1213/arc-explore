/**
 * Award-amount parsing, shared across scholarship sources.
 *
 * Sources state award values as free prose, and the shapes vary more than
 * they look: "Up to $2,000 total per student", "Between $4,000-$8,000",
 * "$16,000-20,000" (no second dollar sign), "$1,411.05", "Varies",
 * "$0.00", "about $450,000 to 225 students", and plenty that are genuinely
 * unparseable.
 *
 * The output is the report's four-field representation:
 *   - amountPerAwardMin / amountPerAwardMax (the per-student figure)
 *   - awardsCount
 *   - programTotal
 *   - status: exact | range | varies | unparseable
 *
 * A per-award amount is *never* guessed from a program total alone, and a
 * program total is *never* displayed as a single-recipient award.
 */

export type AwardStatus = "exact" | "range" | "varies" | "unparseable";

export interface ParsedAward {
  /** Per-award lower bound, when known. */
  amountPerAwardMin: number | null;
  /** Per-award upper bound, when known. */
  amountPerAwardMax: number | null;
  /** Number of awards the source states, when known. */
  awardsCount: number | null;
  /** Known program-wide total, never confused with a single award. */
  programTotal: number | null;
  /** Normalized shape of what we could read. */
  status: AwardStatus;
  /** True when the per-award amount was computed from total / count. */
  isEstimated: boolean;
  /**
   * The source stated a dollar figure the parser could not read, as opposed to
   * stating none. This is the legacy flag; new code should prefer `status`.
   */
  needsReview: boolean;
}

const FIGURE_RE = /\$\s*([\d,]+(?:\.\d+)?)/g;

function readWholeDollars(rawDigits: string): number | null {
  const cleaned = rawDigits.replace(/^\$\s*/, "").replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function allZerosOrPunctuation(s: string): boolean {
  return /^[0.]+$/.test(s);
}

function looksLikeMalformedZero(rawDigits: string): boolean {
  // "$0.00" -> "0.00" -> all zeros/period -> honest zero/varies.
  // "$,000" -> ",000" -> starts with non-digit -> malformed.
  return rawDigits.length === 0 || /^[^\d]/.test(rawDigits);
}

function countAwards(raw: string): number | null {
  const m = raw.match(/(\d+)\s*(?:awards?|scholarships?|recipients?|students?|grants?|winners?|finalists?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function totalAmount(raw: string): { total: number; count?: number } | null {
  // Explicit total language, but not when the figure is immediately followed
  // by "per student/recipient/award" — that is a per-award ceiling.
  const leading = raw.match(
    /(?:total|program|fund|awarded|available|awards?\s+totaling)\s*(?:of\s*)?\$\s*([\d,]+(?:\.\d+)?)(?!\s*per\b)/i,
  );
  if (leading) return { total: readWholeDollars(leading[1])! };

  const trailing = raw.match(
    /\$\s*([\d,]+(?:\.\d+)?)\s*(?:total|overall|in\s+total|program)(?!\s*per\b)/i,
  );
  if (trailing) return { total: readWholeDollars(trailing[1])! };

  // "about $450,000 to 225 students" — total and count in one phrase.
  const paired = raw.match(
    /\$\s*([\d,]+(?:\.\d+)?)\s*(?:to|for)\s*(\d+)\s*(?:students?|recipients?|awards?|scholarships?)/i,
  );
  if (paired) {
    const total = readWholeDollars(paired[1]);
    const count = Number(paired[2]);
    if (total !== null && Number.isFinite(count) && count > 0) {
      return { total, count };
    }
  }

  return null;
}

function perAwardRange(raw: string): { min: number; max: number } | null {
  const m = raw.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:-|–|—|to)\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (!m) return null;
  const a = readWholeDollars(m[1]);
  const b = readWholeDollars(m[2]);
  if (a === null || b === null) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function perAwardUpTo(raw: string): number | null {
  const m = raw.match(/up to\s*\$\s*([\d,]+(?:\.\d+)?)/i);
  return m ? readWholeDollars(m[1]) : null;
}

function singleDollarFigure(raw: string): number | null {
  const figures = raw.match(FIGURE_RE) ?? [];
  if (figures.length !== 1) return null;
  return readWholeDollars(figures[0]);
}

function hasDollarFigure(raw: string): boolean {
  return raw.includes("$");
}

/**
 * Parse an award-amount line into the four-field representation.
 *
 * Order matters: program-total language has to be checked before a bare dollar
 * figure, or "$450,000 to 225 students" reads as a $450,000 per-award award.
 */
export function parseAmount(raw: string): ParsedAward {
  const text = raw.trim();

  // Honest silence or "Varies" is not a parse failure.
  if (text === "" || /^varies$/i.test(text)) {
    return {
      amountPerAwardMin: null,
      amountPerAwardMax: null,
      awardsCount: null,
      programTotal: null,
      status: "varies",
      isEstimated: false,
      needsReview: false,
    };
  }

  const totalResult = totalAmount(text);
  const total = totalResult?.total ?? null;
  const totalAndCount = totalResult?.count;
  const count = totalAndCount ?? countAwards(text);

  // Both total and count -> explicit, tested per-award estimate.
  if (total !== null && count !== null) {
    const estimated = Math.round(total / count);
    return {
      amountPerAwardMin: estimated,
      amountPerAwardMax: estimated,
      awardsCount: count,
      programTotal: total,
      status: "exact",
      isEstimated: true,
      needsReview: false,
    };
  }

  // Known program total with no count: store the total, no per-award amount.
  if (total !== null) {
    return {
      amountPerAwardMin: null,
      amountPerAwardMax: null,
      awardsCount: null,
      programTotal: total,
      status: "varies",
      isEstimated: false,
      needsReview: false,
    };
  }

  // Count + a single per-award figure: derive the total, but the per-award
  // amount is source-stated, not estimated.
  if (count !== null) {
    const perAward = singleDollarFigure(text);
    if (perAward !== null) {
      return {
        amountPerAwardMin: perAward,
        amountPerAwardMax: perAward,
        awardsCount: count,
        programTotal: perAward * count,
        status: "exact",
        isEstimated: false,
        needsReview: false,
      };
    }
    return {
      amountPerAwardMin: null,
      amountPerAwardMax: null,
      awardsCount: count,
      programTotal: null,
      status: "varies",
      isEstimated: false,
      needsReview: false,
    };
  }

  // Per-award range.
  const range = perAwardRange(text);
  if (range) {
    return {
      amountPerAwardMin: range.min,
      amountPerAwardMax: range.max,
      awardsCount: null,
      programTotal: null,
      status: "range",
      isEstimated: false,
      needsReview: false,
    };
  }

  // "Up to $X" states a ceiling, not an exact amount.
  const upTo = perAwardUpTo(text);
  if (upTo !== null) {
    return {
      amountPerAwardMin: null,
      amountPerAwardMax: upTo,
      awardsCount: null,
      programTotal: null,
      status: "range",
      isEstimated: false,
      needsReview: false,
    };
  }

  // A single bare dollar figure is treated as a stated per-award amount only
  // when it is the only monetary figure in the text. If multiple figures are
  // present and none matched the rules above, we cannot safely choose one.
  const figures = text.match(FIGURE_RE) ?? [];
  if (figures.length === 1) {
    const digits = figures[0].replace(/^\$\s*/, "");
    const value = readWholeDollars(digits);

    if (value !== null) {
      return {
        amountPerAwardMin: value,
        amountPerAwardMax: value,
        awardsCount: null,
        programTotal: null,
        status: "exact",
        isEstimated: false,
        needsReview: false,
      };
    }

    // "$0" or "$0.00" was handled above; any other zero-shaped figure is
    // malformed.
    if (allZerosOrPunctuation(digits)) {
      return {
        amountPerAwardMin: null,
        amountPerAwardMax: null,
        awardsCount: null,
        programTotal: null,
        status: "varies",
        isEstimated: false,
        needsReview: false,
      };
    }

    if (looksLikeMalformedZero(digits)) {
      return {
        amountPerAwardMin: null,
        amountPerAwardMax: null,
        awardsCount: null,
        programTotal: null,
        status: "unparseable",
        isEstimated: false,
        needsReview: true,
      };
    }
  }

  // Multiple figures we could not structure -> unreadable, not silent.
  if (figures.length > 1) {
    return {
      amountPerAwardMin: null,
      amountPerAwardMax: null,
      awardsCount: null,
      programTotal: null,
      status: "unparseable",
      isEstimated: false,
      needsReview: true,
    };
  }

  // Text had a `$` but no figure we could read.
  if (hasDollarFigure(text)) {
    return {
      amountPerAwardMin: null,
      amountPerAwardMax: null,
      awardsCount: null,
      programTotal: null,
      status: "unparseable",
      isEstimated: false,
      needsReview: true,
    };
  }

  return {
    amountPerAwardMin: null,
    amountPerAwardMax: null,
    awardsCount: null,
    programTotal: null,
    status: "varies",
    isEstimated: false,
    needsReview: false,
  };
}
