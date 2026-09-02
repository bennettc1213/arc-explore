/**
 * Tags a scholarship as a content-marketing award.
 *
 * WHAT THIS IS. A large share of UNL's external list is law-firm inbound-link
 * marketing: a $1,000 essay contest run to earn backlinks, not an endowed
 * fund. They are real and a student can really win one, so they stay in the
 * corpus — but they are not the same kind of opportunity as an institutional
 * award, and a student deserves to be able to tell which is which.
 *
 * WHAT THIS IS NOT. It is a tag, not a filter. Nothing hides a row. It now
 * feeds the scholarship Fit Score's competition dimension (`scholarship-
 * fit.ts`) — this comment used to say that dimension didn't exist yet; it
 * shipped and reads this flag directly. Tagging at ingest means the signal
 * was already on every row when that dimension landed, rather than needing a
 * full re-scrape.
 *
 * It is a heuristic over a sponsor's *name*, which is all the source gives
 * us. It will be wrong at the edges — a legitimate bar-association memorial
 * fund under the ceiling could be caught. That is why it is a tag and not a
 * filter: being wrong costs a mislabel, not a hidden opportunity.
 */

/**
 * Legal-practice markers in a sponsor name.
 *
 * Word-bounded rather than a bare substring match. On the live 312-row
 * corpus a substring `/law/i` also catches surnames — Lawrence, Lawson,
 * Harlow — and `/esq/i` would catch any word containing those three letters.
 * `\b` around the ambiguous tokens keeps every genuine firm (verified: the
 * bounded and unbounded patterns select the same rows in the current corpus)
 * while making the false-positive class impossible rather than merely absent
 * today. `P.C.` and the entity suffixes are matched on their own terms since
 * a trailing period is already a word boundary.
 */
const LEGAL_RE =
  /\b(?:law|laws|lawyer|lawyers|attorney|attorneys|legal|esq|esquire|llp|lpa|pllc)\b|\bp\.c\./i;

/**
 * Marketing/advertising-agency markers in a sponsor name.
 *
 * Found missing by reading a real row: "Red Egg Marketing Scholarship"
 * carries no legal language at all, so `LEGAL_RE` alone was blind to it —
 * same shape of award (small-dollar, sponsor's own brand as the prize name),
 * a different industry running the identical backlink play. Word-bounded for
 * the same reason `LEGAL_RE` is: an unbounded `/market/i` would catch
 * "Farmers Market Alliance" and any number of legitimate community funds.
 */
const MARKETING_RE = /\b(?:marketing|advertising|agency|agencies)\b/i;

/**
 * Institutional markers that override either signal.
 *
 * A law *school*, a university legal clinic, a bar association memorial fund
 * or a legal-aid foundation is an institution that happens to be legal, not a
 * firm buying links — and the same holds for a marketing *program* or
 * *department* housed at a university or foundation.
 */
const INSTITUTIONAL_RE = /school|universit|college|foundation|bar association|legal aid/i;

/**
 * Content-marketing awards cluster at $500–$5,000.
 *
 * Raised from $1,500 after two real rows were measured as misses:
 * "RMD Law Scholarship" ($2,500) and "Burress Injury Law Underdog" ($5,000)
 * are both textbook link-building awards — a firm's own name as the prize,
 * a one-off essay contest — and both sat above the old ceiling untagged.
 * $1,500 was assuming a firm committing real money couldn't be running a
 * marketing play; the corpus says firms committing up to $5,000 still are.
 * The cost of raising it is bounded by the same reasoning the original
 * ceiling used: this is a down-rank tag, not a filter, so a false positive
 * here costs one mislabeled row, not a hidden opportunity.
 */
export const CONTENT_MARKETING_MAX_AMOUNT = 5000;

export interface ContentMarketingInput {
  sponsorName: string;
  amountMin: number | null;
  amountMax: number | null;
}

/**
 * True only when all three conditions hold. An unknown amount returns false:
 * the rule requires the award to be small, and "we could not read the amount"
 * is not evidence that it is. Same rule as everywhere else here — an absent
 * fact never stands in for a convenient one.
 */
export function isContentMarketing({
  sponsorName,
  amountMin,
  amountMax,
}: ContentMarketingInput): boolean {
  if (!LEGAL_RE.test(sponsorName) && !MARKETING_RE.test(sponsorName)) return false;
  if (INSTITUTIONAL_RE.test(sponsorName)) return false;

  // The ceiling is what makes an award small. A firm offering $250–$5,000 is
  // committing real money at the top end, so the floor alone would mislabel it.
  const ceiling = amountMax ?? amountMin;
  if (ceiling === null) return false;

  return ceiling <= CONTENT_MARKETING_MAX_AMOUNT;
}
