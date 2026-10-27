import Link from "next/link";

import { OpportunityPreview } from "@/components/OpportunityPreview";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TOOLS } from "@/lib/tools";
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
 * The feed lives at `FEED_PATH`, one click away with no account. A small
 * product preview now shows three real public listings without profile scores
 * or invented activity; the full feed and its controls remain on Explore.
 *
 * Listing counts come from `getLandingStats`; students helped remains the
 * owner-stated constant above. Each figure retains its definition.
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

  /*
   * Each step links to where it actually happens. Step one goes to the feed
   * signed out, because that is where a signed-out visitor's profile lives (it
   * rides in the URL — the whole product works without an account), and to the
   * profile page once there is an account to hold it. Step three goes to the
   * extension's own page, the one tool teaser that is the apply step.
   *
   * The copy claims only what exists today. Autofill is on the paid plan and
   * has not been driven end to end in Chrome with a real session (FIXES.md §3),
   * so the step says both rather than selling it as finished.
   */
  const STEPS = [
    {
      title: "Tell us about you",
      body: "Your major, graduation year, location and work authorization. Add a resume and we read your skills from it.",
      cta: user ? "open your profile" : "start with your profile",
      href: user ? "/profile" : FEED_PATH,
      note: null,
    },
    {
      title: "We score it honestly",
      body: "Every listing gets a fit score and a plain list of why. What we can't tell is left out of the score, never counted against you, and the score says how many checks it rests on.",
      cta: "see your matches",
      href: FEED_PATH,
      note: null,
    },
    {
      title: "You apply",
      body: "Autofill puts your details into the employer's own form; you read it and press submit. The tracker keeps every application and deadline in one place.",
      cta: "see how autofill works",
      href: "/extension",
      note: "autofill is on the Apply plan · still being proven end to end",
    },
  ];

  return (
    <main className="wrap landing">
      <div className="landing-hero-grid">
      <section className="landing-hero" aria-labelledby="landing-title">
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
      <OpportunityPreview openNow={stats.openNow} />
      </div>

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

      <section className="landing-how" aria-labelledby="how-title">
        <div className="eyebrow chrome landing-eyebrow">how it works</div>
        <h2 id="how-title" className="landing-how-title">
          Three steps. <span style={{ color: "var(--accent)" }}>No guessing.</span>
        </h2>

        <ol className="landing-steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="landing-step-item">
              <Link href={step.href} className="landing-step press">
                <span className="landing-step-num" aria-hidden>
                  0{i + 1}
                </span>
                <span className="landing-step-title">{step.title}</span>
                <span className="landing-step-body">{step.body}</span>
                {step.note && <span className="mono landing-step-note">{step.note}</span>}
                <span className="landing-step-go">
                  {step.cta} <span aria-hidden>→</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-toolkit" aria-labelledby="toolkit-title">
        <div className="landing-section-heading"><div><div className="eyebrow">Your application toolkit</div><h2 id="toolkit-title">More than a place to search.</h2></div><p>Prepare your profile, refine your application, and take your next step with the tools already in Instela.</p></div>
        <div className="landing-tool-grid">{TOOLS.map(t => <Link key={t.href} href={t.href} className="landing-tool"><span className="tool-icon"><Icon name={t.href.slice(1) as IconName} size={23} /></span><h3>{t.label === "github" ? "GitHub audit" : t.label === "linkedin" ? "LinkedIn tools" : t.label === "essay" ? "Essay review" : "Autofill extension"}</h3><p>{t.blurb}</p><span className="tool-open">Explore tool <Icon name="arrow" size={16} /></span></Link>)}</div>
      </section>

      <section className="landing-trust"><div className="trust-symbol"><Icon name="shield" size={30} /></div><div><h2>Know where your next opportunity comes from.</h2><p>Every listing checked at the source. Your data is never sold.</p></div><Link href="/how-we-verify" className="btn">How we verify<Icon name="arrow" size={16} /></Link></section>
      <section className="landing-final"><div className="eyebrow">Your next chapter starts here</div><h2>Find the opportunity.<br /><span>Make it yours.</span></h2><Link href={FEED_PATH} className="btn btn-primary">Explore opportunities now<Icon name="arrow" size={18} /></Link><p>No signup required.</p></section>
    </main>
  );
}
