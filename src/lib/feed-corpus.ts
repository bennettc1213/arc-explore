/**
 * The pure half of the feed's open-corpus memo (see `getOpenCorpusRows` in
 * feed.ts): which requests may be served from it, and the in-memory twin of
 * the SQL conditions it replaces. Split out with no `db` import so it can be
 * unit-tested without a connection, the same split `pricing/tiers.ts` makes.
 */
import type { PostingKind } from "@/db/schema";
import type { FeedFilters } from "./feed";
import type { parseQuery } from "./search/query";

/**
 * Whether every filter on this request can be applied in memory to the open
 * corpus. Anything that narrows by text or date stays in SQL, where the
 * database does the narrowing and returns few rows.
 */
export function canUseCorpusMemo(filters: FeedFilters, query: Pick<ReturnType<typeof parseQuery>, "terms" | "minAmount">): boolean {
  return (
    !filters.includeClosed &&
    !filters.newSince &&
    !filters.term &&
    filters.includeInferred !== false &&
    !filters.meritOnly &&
    !filters.college &&
    !filters.deadline &&
    !(Math.max(filters.minAmount ?? 0, query.minAmount ?? 0) > 0) &&
    !filters.location &&
    query.terms.length === 0
  );
}

/**
 * Kind, remote and marketing, exactly as `getFeed`'s SQL conditions read them:
 * `eq(kind)`, `eq(isRemote, true)`, `eq(isContentMarketing, false)`.
 */
export function filterCorpusRows<T extends { kind: PostingKind; isRemote: boolean | null; isContentMarketing: boolean | null }>(
  rows: readonly T[],
  f: { kind: PostingKind | null; remoteOnly: boolean; excludeMarketing: boolean },
): T[] {
  return rows.filter(
    (r) =>
      (!f.kind || r.kind === f.kind) &&
      (!f.remoteOnly || r.isRemote === true) &&
      (!f.excludeMarketing || r.isContentMarketing === false),
  );
}
