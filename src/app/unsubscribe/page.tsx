import Link from "next/link";

import { unsubscribeDigest } from "@/lib/digest/store";
import { unsubscribeByToken } from "@/lib/reminders/store";
import { unsubscribeAllSearches, unsubscribeSearch } from "@/lib/searches/store";

export const dynamic = "force-dynamic";

/**
 * Unsubscribe — from deadline reminders, or from saved-search alerts.
 *
 * No sign-in, by design. Someone who wants our email to stop is frequently
 * someone who cannot or will not log in to make it stop, and putting an auth
 * wall in front of an unsubscribe link is how a product earns spam reports it
 * deserves. The token is a random per-profile uuid that appears only in the
 * mail we sent to that address.
 *
 * It acts on GET, which is normally the wrong verb for a state change. Mail
 * clients cannot POST from a link, so the alternative is a page with a button
 * — one more step between a person and the thing they already asked for. Every
 * effect here is idempotent and narrowly scoped, and all of them are reversible
 * from the app.
 *
 * WHICH THING IT TURNS OFF IS DELIBERATELY NARROW. `?search=<id>` stops that
 * one alert; `?searches=all` stops every alert; `?digest=1` stops the weekly
 * digest; a bare token stops deadline reminders. Clicking "stop alerts for this
 * search" and having it silence everything we send would be the kind of
 * over-reach that makes people unsubscribe from all of it next time.
 */

type Outcome =
  | { kind: "reminders" }
  | { kind: "one_search" }
  | { kind: "all_searches" }
  | { kind: "digest" }
  | { kind: "failed" };

async function apply(sp: Record<string, string | string[] | undefined>): Promise<Outcome> {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };

  const token = one("token");
  if (!token) return { kind: "failed" };

  const searchId = one("search");
  if (searchId) {
    return (await unsubscribeSearch(token, searchId)) ? { kind: "one_search" } : { kind: "failed" };
  }

  if (one("searches") === "all") {
    return (await unsubscribeAllSearches(token)) ? { kind: "all_searches" } : { kind: "failed" };
  }

  if (one("digest") === "1") {
    return (await unsubscribeDigest(token)) ? { kind: "digest" } : { kind: "failed" };
  }

  return (await unsubscribeByToken(token)) ? { kind: "reminders" } : { kind: "failed" };
}

const COPY: Record<Outcome["kind"], { heading: React.ReactNode; body: React.ReactNode }> = {
  reminders: {
    heading: (
      <>
        deadline reminders <span style={{ color: "var(--accent)" }}>are off</span>
      </>
    ),
    body: (
      <>
        We will not email you about saved deadlines again. Nothing else changed — your saved
        opportunities, your tracker and any search alerts are exactly as you left them, and you can
        turn reminders back on from your profile whenever you want.
      </>
    ),
  },
  one_search: {
    heading: (
      <>
        that search <span style={{ color: "var(--accent)" }}>will not email you</span>
      </>
    ),
    body: (
      <>
        Only that one. Your other saved searches still alert you, deadline reminders are unchanged,
        and the search itself still works in the feed — you just will not hear from us about it.
        You can switch it back on from the feed.
      </>
    ),
  },
  all_searches: {
    heading: (
      <>
        all search alerts <span style={{ color: "var(--accent)" }}>are off</span>
      </>
    ),
    body: (
      <>
        Every saved search stays saved and still works in the feed; none of them will email you.
        Deadline reminders are separate and are unchanged — if you want those off too, use the link
        in one of those messages.
      </>
    ),
  },
  digest: {
    heading: (
      <>
        the weekly digest <span style={{ color: "var(--accent)" }}>is off</span>
      </>
    ),
    body: (
      <>
        No more Sunday round-ups. Deadline reminders and saved-search alerts are separate
        subscriptions and are unchanged — this link did not touch them. You can turn the digest
        back on under email from your profile.
      </>
    ),
  },
  failed: {
    heading: <>that link did not work</>,
    body: (
      <>
        This link is missing its token, or it was already turned off. If you are still getting email
        you did not ask for, reply to any of it and we will stop it by hand.
      </>
    ),
  },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const outcome = await apply(await searchParams);
  const copy = COPY[outcome.kind];

  return (
    <main className="wrap" style={{ paddingBlock: "72px 96px", maxWidth: 640 }}>
      <div className="eyebrow chrome">email</div>
      <h1 className="section-title chrome" style={{ marginTop: 12 }}>
        {copy.heading}
      </h1>

      <p className="t-base" style={{ color: "var(--muted)", marginTop: 16 }}>
        {copy.body}
      </p>

      <Link
        href="/"
        className="btn press"
        style={{ textDecoration: "none", display: "inline-block", marginTop: 28 }}
      >
        back to the feed
      </Link>
    </main>
  );
}
