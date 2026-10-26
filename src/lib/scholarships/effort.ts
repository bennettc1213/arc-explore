/**
 * How long a scholarship application is likely to take — the ONE place this
 * estimate is defined.
 *
 * It is an estimate and the UI must say so ("~3 hrs"), never present it as a
 * measurement. Every number below is a planning heuristic, not an observation:
 * nobody has timed a student writing an essay for us.
 *
 *   hours = BASE + PER_ESSAY × essays + PER_LETTER × letters
 *              + PER_EXTRA_DOCUMENT × extra documents
 *   rounded to the nearest ROUND_TO.
 *
 * UNKNOWN IS UNKNOWN. If the essay count or the recommendation-letter count is
 * not known, the effort is not known — `estimateEffort` returns null, and the
 * card reads "Effort unknown". Defaulting a missing essay count to zero would
 * make every listing we know nothing about look like a five-minute win, which
 * is exactly the row a student would act on first. The same "unknown is
 * dropped, never scored as a miss" rule the Fit Score follows.
 *
 * Measured 2026-10-26: no scholarship row stores an essay or letter count —
 * there is no column for either — so today this returns null for every
 * listing. `effortInputsFor` is the single seam where that data gets wired in
 * once it exists (see FIXES.md).
 */

/** Fixed overhead: reading the listing, filling in the form, submitting. */
export const BASE_HOURS = 0.5;
/** One written essay or personal statement. */
export const HOURS_PER_ESSAY = 2;
/** Asking for, chasing and submitting one recommendation letter. */
export const HOURS_PER_LETTER = 1.5;
/** Each extra required document — a transcript, a FAFSA SAR, a portfolio. */
export const HOURS_PER_EXTRA_DOCUMENT = 0.5;
/** Estimates are shown at this granularity; anything finer would be false precision. */
export const ROUND_TO_HOURS = 0.5;

export interface EffortInputs {
  essays: number | null;
  letters: number | null;
  /**
   * Required documents beyond the form itself. Unknown counts as none: the
   * formula's gate is essays and letters, which dominate the total, and a
   * transcript is half an hour either way.
   */
  extraDocuments?: number | null;
}

export interface Effort {
  /** Estimated hours, rounded to ROUND_TO_HOURS. */
  hours: number;
  essays: number;
  letters: number;
}

function knownCount(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

export function roundToStep(hours: number, step = ROUND_TO_HOURS): number {
  return Math.round(hours / step) * step;
}

/** Null when the essay or letter count is unknown — never a guess. */
export function estimateEffort(input: EffortInputs): Effort | null {
  if (!knownCount(input.essays) || !knownCount(input.letters)) return null;
  const extra = knownCount(input.extraDocuments) ? input.extraDocuments : 0;
  const raw =
    BASE_HOURS +
    HOURS_PER_ESSAY * input.essays +
    HOURS_PER_LETTER * input.letters +
    HOURS_PER_EXTRA_DOCUMENT * extra;
  return { hours: roundToStep(raw), essays: input.essays, letters: input.letters };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "~3 hrs, 1 essay, 0 letters", or "Effort unknown". */
export function formatEffort(effort: Effort | null): string {
  if (!effort) return "Effort unknown";
  const hours = effort.hours === 1 ? "~1 hr" : `~${effort.hours} hrs`;
  return `${hours}, ${plural(effort.essays, "essay", "essays")}, ${plural(effort.letters, "letter", "letters")}`;
}

/**
 * What we know about a listing's requirements.
 *
 * Returns nulls today because no stored field carries these counts. Takes no
 * listing yet because there is nothing on one to read; when a column lands it
 * takes the row, and this is the one function to change — every caller, the
 * Plan view's ranking included, reads effort through here.
 */
export function effortInputsFor(): EffortInputs {
  return { essays: null, letters: null, extraDocuments: null };
}
