/**
 * Where the feed lives.
 *
 * It used to be `/`, and "/" was written out by hand in ~40 places that all
 * meant "the feed": back links, `revalidatePath` after every mutation, the
 * post-login return path, the saved-search links and the alert email. Moving
 * the feed to make room for a landing page turned each of those into a
 * question — does this "/" mean home or the feed? — so the answer is written
 * once, here, and `/` now means only the landing page.
 *
 * Pure (no imports), so client components, server actions and the email
 * builders can all read it without pulling in the database.
 */
export const FEED_PATH = "/explore";

/** The feed with a query string, or the bare feed when there is none. */
export function feedHref(query?: string): string {
  return query ? `${FEED_PATH}?${query}` : FEED_PATH;
}

/** Parameters that belong on a link to the landing page itself. */
const LANDING_PARAM_RE = /^(utm_.+|fbclid|gclid|ref)$/;

/**
 * Where a request for `/` with a query string should go instead, or null.
 *
 * Every feed URL that exists outside this codebase was written as `/?…` —
 * bookmarks, shared signed-out feeds carrying a profile in the query string.
 * The landing page reads no parameters of its own, so anything else on `/` can
 * only have been meant for the feed, and dropping it would silently lose
 * someone's filters on a marketing page.
 *
 * Campaign-tracking parameters stay: a link to the landing page is exactly
 * where those belong. Deliberately NOT a list of feed keys — that list is owned
 * by `filtersFromParams` and the feed page, and a second copy here would drift
 * the way the remote-only filter once did.
 *
 * Applied in `proxy.ts`, which answers before any rendering starts. Done in the
 * page instead, the root layout's async nav has already begun streaming a 200,
 * so Next can only fall back to a meta-refresh — measured: status 200 and a
 * `content="1;url=…"` tag, a visible flash of the landing page first.
 */
export function legacyFeedRedirect(search: URLSearchParams): string | null {
  const forwarded = new URLSearchParams();
  for (const [k, v] of search) {
    if (!LANDING_PARAM_RE.test(k)) forwarded.append(k, v);
  }
  return forwarded.size > 0 ? feedHref(forwarded.toString()) : null;
}
