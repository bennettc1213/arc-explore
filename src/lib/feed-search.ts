/**
 * Free-text feed search — query parsing only.
 *
 * Deliberately DB-free so it can be tested without a database, same reason
 * `profile/types.ts` and `safe-redirect.ts` are split out.
 *
 * The matching strategy is AND-of-substrings: every term the student typed
 * must appear somewhere in the row's searchable text. That is the behaviour
 * a search box is expected to have — each extra word narrows — and it degrades
 * honestly, because a query that matches nothing returns nothing rather than
 * silently falling back to an OR that floods the feed with near-misses.
 *
 * Substring matching (`ilike`), not Postgres full-text search. At the corpus
 * size this runs against (~4k rows) an unindexed scan is a few milliseconds,
 * and `ilike` matches what a student expects from a search box: "eng" finds
 * "Engineering". A `tsvector` index would stem and tokenize instead, so "eng"
 * would find nothing. Revisit if the corpus reaches the low hundreds of
 * thousands, where the scan cost stops being free — that is a switch to
 * `pg_trgm`, not to full-text, or the prefix behaviour regresses.
 */

/**
 * Escapes the characters Postgres `LIKE`/`ILIKE` treats as wildcards.
 *
 * Without this, a student searching for "100%" would send `%100%%` — three
 * wildcards — and match every row in the table. The pattern is a bound
 * parameter, so this is a correctness fix, not an injection one.
 *
 * Backslash first: escaping it after `%` and `_` would double-escape the
 * backslashes this function had just added.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Longest single term we will match on. Longer is a paste, not a search. */
const MAX_TERM_LENGTH = 64;

/** Most terms we will AND together. Past this the query returns nothing
 *  anyway, and each term costs another full scan. */
const MAX_TERMS = 6;

/**
 * Splits a raw query into the terms every result must contain.
 *
 * Returns `[]` for an absent or whitespace-only query, which callers treat as
 * "no search" — an empty search box must not filter the feed down to nothing.
 */
export function parseSearchQuery(raw: string | null | undefined): string[] {
  if (!raw) return [];

  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.slice(0, MAX_TERM_LENGTH))
    .slice(0, MAX_TERMS);
}

/* ------------------------------------------------------------------ *
 * Filter vocabularies
 * ------------------------------------------------------------------ */

/**
 * The deadline windows the feed offers.
 *
 * Lives here rather than in `feed.ts` because `feed.ts` opens a database
 * connection at import, and the saved-search schema needs to validate against
 * this list without one. `feed.ts` re-exports it, so nothing else moved.
 */
export const DEADLINE_FILTERS = ["set", "30", "60", "90"] as const;
export type DeadlineFilter = (typeof DEADLINE_FILTERS)[number];
