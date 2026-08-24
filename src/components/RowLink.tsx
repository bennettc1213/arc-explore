"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * A `<Link>` that warms its route on first hover or focus, instead of as soon
 * as it scrolls into view.
 *
 * ── WHY NOT JUST USE `<Link>` ───────────────────────────────────────────────
 *
 * Default prefetching fires for every link in the viewport. The feed renders
 * `FEED_PAGE_SIZE` rows — 50 — so the default would mean 50 speculative route
 * fetches for a page where the student will open one of them, or none. Next's
 * own docs name this exact case ("large lists of links") and give this exact
 * pattern as the answer: `prefetch={false}` until the pointer arrives, then
 * `null` to hand control back to the default heuristic.
 *
 * ── WHY THIS ACTUALLY FEELS FAST ────────────────────────────────────────────
 *
 * `/listing/[id]` is dynamic — session plus a database read — so even a warm
 * prefetch cannot deliver the finished page. What it delivers is the route's
 * `loading.tsx` shell, already on the client at the moment of the click. Paired
 * with the hover expansion on the row, the sequence a student experiences is:
 * point at the row (it lifts, and the route quietly warms) → click → the shell
 * paints instantly → the real content streams in behind it.
 *
 * `onFocus` matters as much as `onMouseEnter`: a keyboard user tabbing the feed
 * should get the same warm route as someone with a mouse, not the cold one.
 *
 * ── THE WARMING HALF IS UNVERIFIED, AND CANNOT BE VERIFIED HERE ─────────────
 *
 * Measured 2026-08-21 against the live feed: a real pointer hover fired **zero**
 * prefetch requests. That is not this component failing — **`next dev` disables
 * prefetching entirely**, and the mechanism is worth writing down because it is
 * not what the docs say:
 *
 *   `links.js` initialises every link instance with `isVisible: false`, and the
 *   only thing that ever sets it true is `onLinkVisibilityChanged` — which
 *   returns early when `NODE_ENV !== "production"` ("disabled in development
 *   ... because it requires compiling the target page"). So `isVisible` is
 *   permanently false in dev, and `rescheduleLinkPrefetch` takes its
 *   `if (!instance.isVisible)` branch and *cancels* the task. The hover path
 *   (`onNavigationIntent`) carries no dev guard of its own — it does not need
 *   one, because the visibility flag it depends on can never be set.
 *
 * So in development the click is genuinely cold, and the numbers measured here
 * (skeleton painting ~190ms warm-route, ~390ms cold) are the **unprefetched**
 * case. Production should be faster, not slower. The consequence to remember is
 * that anyone re-measuring this in `npm run dev` will see no prefetch traffic
 * and should not conclude the prop is wrong — recorded in FIXES §3, because
 * "correct but never observed working" is exactly the category that file exists
 * to hold.
 */
export function RowLink({
  href,
  children,
  className,
  style,
  title,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const [warm, setWarm] = useState(false);
  const warmUp = () => setWarm(true);

  return (
    <Link
      href={href}
      // `null` is not the same as `true` here — it restores Next's default
      // heuristic (partial prefetch for a dynamic route) rather than forcing a
      // full one the route cannot satisfy anyway.
      prefetch={warm ? null : false}
      onMouseEnter={warmUp}
      onFocus={warmUp}
      className={className}
      style={style}
      title={title}
    >
      {children}
    </Link>
  );
}
