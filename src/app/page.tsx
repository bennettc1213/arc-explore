import Link from "next/link";

import { Mascot } from "@/components/chrome/Mascot";
import { CountUp } from "@/components/ui/count-up";
import { TactileHighlight } from "@/components/ui/tactile-highlight";
import { getSessionUser } from "@/lib/auth";
import { getLandingStats } from "@/lib/feed";
import { FEED_PATH } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * Students helped. **Stated by the owner, not measured here.**
 *
 * Nothing in this database can produce it: `profiles` holds a handful of test
 * accounts, because the people behind this number were helped outside the
 * app, before it had sign-ups. So it is a constant rather than a query, on
 * purpose — a count the page appears to compute but does not would be a
 * stronger claim than the one being made. It is deliberately a floor ("+"),
 * and it is the one figure on this page that does not move when we poll.
 * Change it here, and only here, when the real number changes.
 */
const STUDENTS_HELPED = 10_000;

/**
 * The landing page.
 *
 * **No listings on it, on purpose.** The feed used to be `/`, so a first
 * visitor met a filter form and fifty rows before they had been told what this
 * is. This page says what it is and hands them two doors; the feed lives at
 * `FEED_PATH` and is one click away with no account.
 *
 * The three numbers are the only data here, and each is something we observed
 * rather than something we were told — see `getLandingStats` for what each
 * counts, and the definition printed under each figure says the same thing in
 * plain words. A landing page is where a product is most tempted to round up;
 * this one prints the count and what it means.
 */
export default async function LandingPage() {
  // An old `/?kind=…` feed link never reaches this component: `proxy.ts`
  // forwards it to the feed first (see `legacyFeedRedirect`).
  const [user, stats] = await Promise.all([getSessionUser(), getLandingStats()]);

  const STATS = [
    {
      value: stats.foundAllTime,
      label: "opportunities found, all time",
      detail: "internships and scholarships we have listed, including ones since closed",
    },
    {
      value: STUDENTS_HELPED,
      suffix: "+",
      label: "students helped",
      detail: "students we have helped find internships and scholarships",
    },
    {
      value: stats.openNow,
      label: "open right now",
      detail: "internships and scholarships still taking applications",
    },
  ];

  return (
    <main className="wrap landing">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-rise" style={{ animationDelay: "0ms" }}>
          <Mascot size={44} />
        </div>

        <div className="eyebrow chrome landing-eyebrow landing-rise" style={{ animationDelay: "60ms" }}>
          internships + scholarships · checked at the source
        </div>

        <h1 id="landing-title" className="landing-title landing-rise" style={{ animationDelay: "120ms" }}>
          Internships and scholarships the day they open,{" "}
          <TactileHighlight direction="left" delay={0.7}>
            so you can actually win.
          </TactileHighlight>
        </h1>

        <p className="landing-sub landing-rise" style={{ animationDelay: "220ms" }}>
          We read employers&rsquo; own job boards and sponsors&rsquo; own pages instead of
          aggregators, so a listing reaches you while it is still worth applying to. Every listing
          checked at the source. Your data is never sold.
        </p>

        <div className="landing-ctas landing-rise" style={{ animationDelay: "320ms" }}>
          <Link href={FEED_PATH} className="landing-cta landing-cta-primary press">
            <span className="landing-cta-label">
              explore opportunities now <span aria-hidden>→</span>
            </span>
            <span className="landing-cta-note">no signup required</span>
          </Link>

          {/* The second door depends on who is knocking. Signed out, the
              useful next step after "look around" is an account, and the note
              names only what an account does TODAY — saving and tracking.
              Deadline reminders are built but not switched on (no verified
              sender, FIXES.md §1), so promising them here would be a claim the
              product cannot keep yet. Signed in, the account already exists and
              the useful door is the work they have in progress. */}
          {user ? (
            <Link href="/tracker" className="landing-cta press">
              <span className="landing-cta-label">open your tracker</span>
              <span className="landing-cta-note">everything you saved and sent</span>
            </Link>
          ) : (
            <Link href="/login" className="landing-cta press">
              <span className="landing-cta-label">create a free account</span>
              <span className="landing-cta-note">save listings · track every application</span>
            </Link>
          )}
        </div>

        <Link
          href="/how-we-verify"
          className="mono press landing-rise landing-verify"
          style={{ animationDelay: "400ms" }}
        >
          how we verify a listing →
        </Link>
      </section>

      <section
        className="landing-stats landing-rise"
        style={{ animationDelay: "480ms" }}
        aria-label="Instela in numbers"
      >
        {STATS.map((s, i) => (
          <div key={s.label} className="landing-stat">
            <div className="landing-stat-value">
              <CountUp value={s.value} suffix={s.suffix} delay={0.55 + i * 0.12} />
            </div>
            <div className="mono-strong chrome landing-stat-label">{s.label}</div>
            <div className="mono landing-stat-detail">{s.detail}</div>
          </div>
        ))}
      </section>

      <p className="mono landing-footnote">
        &ldquo;found&rdquo; means first seen by us, not the date an employer says they posted it.
        the listing counts move every time we poll.
      </p>
    </main>
  );
}
