import Link from "next/link";

import { EssayReviewer } from "./EssayReviewer";

export const metadata = {
  title: "Essay review — internship tracker",
  description: "Structured feedback on a scholarship essay or statement of purpose.",
};

/**
 * The essay reviewer.
 *
 * Open signed-out, because nothing here touches an account and requiring one
 * would be a login wall in front of a tool that runs entirely in the visitor's
 * own browser.
 */
export default function EssayPage() {
  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 900 }}>
      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">08 — essay</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          the third read-through <span style={{ color: "var(--accent)" }}>you do not have time for</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "66ch", marginTop: 14 }}>
          Four checks, all of them things you can verify by looking at your own text: whether the
          essay actually answers the prompt, whether it says anything checkable, whether the
          sentences work, and whether it fits. Nothing here is a judgement about whether the essay
          is good.
        </p>
      </header>

      <div
        className="border"
        style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 28 }}
      >
        <div className="mono chrome">this never leaves your browser</div>
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
          The whole review runs on this page — there is no request that carries your essay and no
          endpoint that would accept one. Nothing is stored and no account is needed. A scholarship
          essay is often about the hardest thing that has happened to someone, and sending that to
          a server to be graded is a thing we would have to justify. We cannot justify it for
          feedback we can produce without it.
        </p>
      </div>

      <EssayReviewer />

      <section style={{ border: "1px solid var(--line)", padding: 22, marginBottom: 28 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
          what this cannot tell you
        </div>
        <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "66ch" }}>
          Whether the essay is moving. Whether you picked the right story. Whether the ending
          lands. Those are the things that decide a scholarship essay and none of them is
          countable, so we do not pretend to score them — a clean sheet here means the mechanical
          problems are gone, not that the essay is finished. Give it to one person who knows you
          and one who does not. This is for the pass before that, so their time goes on the part
          only a reader can do.
        </p>
      </section>

      <footer className="mono" style={{ marginTop: 40, color: "var(--faint-readable)" }}>
        the same rule as everywhere else here: a check we could not run shows &ldquo;—&rdquo; and is
        left out of the score rather than counted against you.{" "}
        <Link href="/" style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
      </footer>
    </main>
  );
}
