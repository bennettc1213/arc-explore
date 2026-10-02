/**
 * Pagination completeness: the one thing every adapter must be able to prove.
 *
 * ## Why this file exists
 *
 * Closing a listing is destructive. The two-miss rule exists so that a single
 * flaky absence never retires a real opportunity, and that rule is only sound if
 * "absent" means *the source did not list it* rather than *we did not manage to
 * read all of it*.
 *
 * A naive `fetchBoard` that concatenates pages and returns them has quietly
 * thrown that guarantee away. If page 3 of 4 times out and the adapter swallows
 * the error, the result is a short board that looks authoritative: every posting
 * on the missing page is now "absent", accrues a strike, and two polls later is
 * closed. No error is ever raised, no counter moves, and the run reports
 * `successfulComplete: true`.
 *
 * So completeness is tracked as data, not as an absence of exceptions. An
 * adapter accumulates pages into a {@link PageLedger} and reports what actually
 * happened. A dropped page sets `complete = false`, which the lifecycle engine
 * already treats as "absence means nothing".
 *
 * ## The rule
 *
 * `complete` is false if and only if we are missing at least one row the source
 * told us exists. It stays true when the source genuinely has nothing, because
 * zero rows is a complete answer when the source says it has zero rows.
 */

import { classifyOpportunity } from "./normalize";
import type { SourcePosting } from "./types";

/** Why a fetch stopped short, in the words an operator can act on. */
export type IncompleteReason =
  /** A page request failed, but earlier pages survived. */
  | "page_failed"
  /** The source's own total exceeded what we were willing to fetch. */
  | "page_cap_reached"
  /** The source reported a total but returned a short page for it. */
  | "short_page"
  /** A 200 response whose body was not the shape the adapter expects. */
  | "malformed_response";

export interface FetchCompleteness {
  /**
   * True only when we hold every row the source published.
   *
   * False is the load-bearing value: it suppresses absence, so nothing is
   * closed and no miss strike is advanced on the strength of rows we never saw.
   */
  complete: boolean;
  /** Why, when not complete. First failure wins, so it names the root cause. */
  reason?: IncompleteReason;
  /** Source-supplied error text for the page that failed, if any. */
  detail?: string;
  /** Pages actually retrieved. */
  pagesFetched: number;
  /**
   * Total the source claims exists, when it says so. Null for sources that do
   * not publish a total (Lever, Ashby).
   */
  claimedTotal: number | null;
}

export const COMPLETE: FetchCompleteness = {
  complete: true,
  pagesFetched: 1,
  claimedTotal: null,
};

/** A board that returned nothing at all, and told us that is all there is. */
export function completeEmpty(claimedTotal: number | null = 0): FetchCompleteness {
  return { complete: true, pagesFetched: 1, claimedTotal };
}

export function incomplete(
  reason: IncompleteReason,
  pagesFetched: number,
  claimedTotal: number | null = null,
  detail?: string,
): FetchCompleteness {
  return { complete: false, reason, pagesFetched, claimedTotal, detail };
}

/**
 * Accumulates rows from a paginated source and tracks whether we got them all.
 *
 * Intended use is one instance per `fetchBoard` call, fed once per page:
 *
 * ```ts
 * const ledger = new PageLedger();
 * for (let page = 0; page < MAX_PAGES; page++) {
 *   const res = await getJson(url(page));
 *   if (!res.data) return ledger.failed("page_failed", page + 1);
 *   ledger.addPage(res.data.content ?? [], res.data.totalFound ?? null);
 *   if (ledger.shouldStop(page, res.data)) break;
 * }
 * return ledger.completeness();
 * ```
 */
export class PageLedger {
  private readonly rows: unknown[] = [];
  private claimedTotal: number | null = null;
  private failure: { reason: IncompleteReason; detail?: string } | null = null;
  private pagesFetched = 0;

  /** Record one retrieved page. */
  addPage<T>(rows: readonly T[], claimedTotal: number | null = null): void {
    this.pagesFetched++;
    this.rows.push(...rows);
    // A source that publishes a total is trusted to keep publishing it; take
    // the last one seen rather than a max, so a mid-run shrink is noticed.
    if (claimedTotal !== null) this.claimedTotal = claimedTotal;
  }

  /** Record a page that could not be retrieved. First failure wins. */
  fail(reason: IncompleteReason, detail?: string): void {
    if (this.failure) return;
    this.failure = { reason, detail };
  }

  /**
   * The `claimedTotal` from the most recent page, for a caller's pagination
   * decision. Null before any page has been added.
   */
  get total(): number | null {
    return this.claimedTotal;
  }

  /** How many rows we hold, across all pages. */
  get size(): number {
    return this.rows.length;
  }

  /** How many pages we actually retrieved. */
  get pages(): number {
    return this.pagesFetched;
  }

  /**
   * Did the cap truncate us?
   *
   * True when we stopped because of our own page ceiling while the source still
   * had more to give. Without this check a `for (page < MAX)` loop looks
   * identical to "the source ran out", and the safety valve silently becomes a
   * data-loss bug.
   */
  hitCap(cap: number, rowsSoFar: number): boolean {
    return this.pagesFetched >= cap && this.claimedTotal !== null && rowsSoFar < this.claimedTotal;
  }

  /**
   * A page that came back short while the source claims more exist.
   *
   * Distinct from a hard failure: the request succeeded, the response was just
   * fewer rows than `totalFound` promised. Treated as incomplete because the
   * missing rows are exactly the ones we would then call absent.
   */
  shortPage(rowsInPage: number): boolean {
    return this.claimedTotal !== null && rowsInPage > 0 && this.rows.length < this.claimedTotal;
  }

  /** Final verdict, failure taking precedence over a clean finish. */
  completeness(): FetchCompleteness {
    if (this.failure) {
      return incomplete(this.failure.reason, this.pagesFetched, this.claimedTotal, this.failure.detail);
    }
    if (this.claimedTotal !== null && this.rows.length < this.claimedTotal) {
      return incomplete("short_page", this.pagesFetched, this.claimedTotal);
    }
    return { complete: true, pagesFetched: this.pagesFetched, claimedTotal: this.claimedTotal };
  }
}

/* ------------------------------------------------------------------ *
 * Stable row identity
 * ------------------------------------------------------------------ */

/**
 * The identity an adapter must give a row for dedup to survive replay.
 *
 * `postings.posting_sources` has a unique index on `(source, source_id)`, so
 * `sourceId` is already the real key. What is *not* acceptable is substituting
 * mutable employer-authored text: a role retitled from "Software Engineer Intern"
 * to "SWE Intern, Summer" must resolve to the same row, not become a second
 * listing and strand the first as a duplicate that then closes on its own.
 *
 * So: `sourceId` when the source exposes a stable one, `null` otherwise. An
 * adapter that cannot supply one is not usable for reconciliation and should
 * fail loudly rather than quietly dedup on a title.
 */
export function rowIdentity(posting: Pick<SourcePosting, "source" | "sourceId" | "url">): {
  source: string;
  sourceId: string | null;
} {
  const sourceId = posting.sourceId?.trim();
  if (sourceId) return { source: posting.source, sourceId };

  // A URL is a last resort, and only when it identifies one row rather than one
  // board. Strip the origin first: the slash in `https://example.com/` is part of
  // the URL syntax, not evidence of a row, so testing the raw string would let
  // every posting on a board collapse onto the board's own root.
  const path = posting.url?.trim().replace(/^https?:\/\/[^/]+/, "") ?? "";
  const identifiesRow = path.length > 0 && path !== "/";
  return { source: posting.source, sourceId: identifiesRow ? posting.url.trim() : null };
}

/**
 * A row is a reconciliation candidate only if we can identify it.
 *
 * A row with no stable id must be dropped rather than ingested under a
 * title-derived key, because a title changes and the duplicate it becomes is
 * indistinguishable from a real second posting.
 */
export function isIdentifiable(posting: Pick<SourcePosting, "source" | "sourceId" | "url">): boolean {
  return rowIdentity(posting).sourceId !== null;
}

/* ------------------------------------------------------------------ *
 * Minimum schema validation
 * ------------------------------------------------------------------ */

export interface ValidationResult {
  valid: SourcePosting[];
  rejected: number;
}

/**
 * The minimum a row must carry to be worth storing.
 *
 * Deliberately shallow. A missing description or deadline renders as an honest
 * slot and is normal for several sources; a missing title or apply URL means we
 * have nothing to show a student, so the row is not a listing.
 */
export function validateRows(postings: readonly SourcePosting[]): ValidationResult {
  const valid: SourcePosting[] = [];
  let rejected = 0;
  for (const p of postings) {
    if (!p.title?.trim() || !p.url?.trim() || !p.companyName?.trim()) {
      rejected++;
      continue;
    }
    valid.push(p);
  }
  return { valid, rejected };
}

/* ------------------------------------------------------------------ *
 * Enrichment status
 * ------------------------------------------------------------------ */

/**
 * How far a row got through the pipeline.
 *
 * Tracked as a value rather than implied by which columns happen to be null, so
 * a scoring failure is recorded as a scoring failure and cannot be mistaken for
 * "this listing was never verified". Requirement 8 of INS-013: a temporary model
 * failure must not mislabel or delete a verified listing.
 */
export type EnrichmentStatus = "not_attempted" | "pending" | "complete" | "failed";

export const ENRICHMENT_STATUSES: readonly EnrichmentStatus[] = [
  "not_attempted",
  "pending",
  "complete",
  "failed",
];

/** Re-exported so adapters can classify without importing normalize directly. */
export { classifyOpportunity };
export type { SourcePosting };
