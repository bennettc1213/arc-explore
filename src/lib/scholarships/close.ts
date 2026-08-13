/**
 * The close-on-removal decision, kept apart from the SQL that applies it.
 *
 * Same split as `ingest/reconcile.ts`: compute a plan, then apply it. The
 * interesting rules here are all judgement calls about `closed_at`, which is
 * the single field this product's honesty rests on — a listing wrongly marked
 * closed is one a student never sees. A rule that exists only inside a
 * `WHERE` clause can only be tested against a live database, so it would not
 * be tested at all.
 *
 * Its own module rather than an export from `persist.ts` so a test can import
 * it without pulling in `db/client`, which opens a connection at import time.
 */

/** One previously-recorded row, as the close decision needs to see it. */
export interface CloseCandidate {
  id: string;
  canonicalHash: string;
  closedAt: Date | null;
}

/**
 * Decide which previously-recorded postings this scrape closes.
 *
 * Returns the ids to close — never rows already closed, so `closed_at` is
 * written exactly once and the returned count means "closed by this run"
 * rather than "absent from the page". Without that, the same missing
 * listings are re-closed on every run: a permanently non-zero figure that
 * reads as continuous churn, while each run shoves `closed_at` further from
 * the date the listing actually went away.
 */
export function selectPostingsToClose(
  candidates: CloseCandidate[],
  seenHashes: string[],
): string[] {
  // An empty scrape (the page returned nothing parseable) must not close
  // every scholarship this source has ever recorded — that would read a
  // transient fetch/parse failure as "every fund on the page shut down."
  if (seenHashes.length === 0) return [];

  const seen = new Set(seenHashes);
  return candidates
    .filter((c) => !seen.has(c.canonicalHash) && c.closedAt === null)
    .map((c) => c.id);
}
