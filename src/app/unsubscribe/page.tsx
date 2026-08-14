import Link from "next/link";

import { unsubscribeByToken } from "@/lib/reminders/store";

export const dynamic = "force-dynamic";

/**
 * Unsubscribe from deadline reminders.
 *
 * No sign-in, by design. Someone who wants our email to stop is frequently
 * someone who cannot or will not log in to make it stop, and putting an auth
 * wall in front of an unsubscribe link is how a product earns spam reports it
 * deserves. The token is a random per-profile uuid that appears only in the
 * mail we sent to that address.
 *
 * It acts on GET, which is normally the wrong verb for a state change. Mail
 * clients cannot POST from a link, so the alternative is a page with a button
 * — one more step between a person and the thing they already asked for. The
 * effect is idempotent and narrowly scoped: it can only ever turn one
 * profile's reminders off, and the flag is reversible from the app.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const done = token ? await unsubscribeByToken(token) : false;

  return (
    <main className="wrap" style={{ paddingBlock: "72px 96px", maxWidth: 640 }}>
      <div className="eyebrow chrome">reminders</div>
      <h1 className="section-title chrome" style={{ marginTop: 12 }}>
        {done ? (
          <>
            deadline reminders <span style={{ color: "var(--accent)" }}>are off</span>
          </>
        ) : (
          <>that link did not work</>
        )}
      </h1>

      <p className="t-base" style={{ color: "var(--muted)", marginTop: 16 }}>
        {done ? (
          <>
            We will not email you about saved deadlines again. Nothing else changed — your saved
            opportunities and tracker are exactly as you left them, and you can turn reminders
            back on from your profile whenever you want.
          </>
        ) : (
          <>
            This link is missing its token, or reminders were already turned off from it. If you
            are still getting email you did not ask for, reply to any of it and we will stop it by
            hand.
          </>
        )}
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
