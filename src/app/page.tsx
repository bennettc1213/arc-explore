import Link from "next/link";
import { Suspense } from "react";

import { OpportunityPreview } from "@/components/OpportunityPreview";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TOOLS } from "@/lib/tools";
import { CountUp } from "@/components/ui/count-up";
import { TactileHighlight } from "@/components/ui/tactile-highlight";
import { getSessionUser } from "@/lib/auth";
import { getLandingStats } from "@/lib/feed";
import { FEED_PATH } from "@/lib/routes";
import { FreePlan, LandingFAQ, LiveMatchPreview, PreviewSkeleton, SourceProof } from "@/components/landing/LandingSections";

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
   * The first-minute walkthrough leads to real actions. The preview lets a
   * visitor choose a direction, Explore holds guest preferences, and an
   * account holds saved applications. Advanced autofill stays in the toolkit.
   */
  const STEPS = [
    {
      title: "Pick a direction",
      body: "An internship to build experience, or a scholarship to help pay for your next chapter. Start with what matters to you.",
      cta: "try the preview below",
      href: "#try-it",
      note: null,
    },
    {
      title: "Make it personal",
      body: "Add your major, graduation year, location, and work authorization. We compare what you share with the listing and show where eligibility still needs a closer look.",
      cta: user ? "complete your profile" : "add your background",
      href: user ? "/profile" : FEED_PATH,
      note: null,
    },
    {
      title: "Take your next step",
      body: "Read the original listing, check the requirements, and apply on the source site. Create an account to keep your saved opportunities and applications together.",
      cta: user ? "open your tracker" : "start your free tracker",
      href: user ? "/tracker" : "/login",
      note: null,
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
          A clearer path to internships and scholarships,{" "}
          <TactileHighlight direction="left" delay={0.7}>
            and what comes next.
          </TactileHighlight>
        </h1>

        <p className="landing-sub landing-rise" style={{ animationDelay: "220ms" }}>
          We read employers&rsquo; own job boards and sponsors&rsquo; own pages instead of
          aggregators, so you can trace an opportunity back to where it began. Find your direction,
          check your fit, and take the next step. Your data is never sold.
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

        <a href="#try-it" className="landing-try-link">Not sure where to start? Try a quick preview <Icon name="arrow" size={15} /></a>

        <Link
          href="/how-we-verify"
          className="mono press landing-rise landing-verify"
          style={{ animationDelay: "400ms" }}
        >
          how we verify a listing →
        </Link>
      </section>
      <Suspense fallback={<div className="product-preview landing-hero-loading" aria-busy="true" aria-label="Loading current listings"><Icon name="explore" size={32} /><h2>A little direction.<br />A lot of possibility.</h2><p>Finding a few opportunities to explore…</p><div className="landing-loading-bars"><span /><span /><span /></div></div>}><OpportunityPreview openNow={stats.openNow} /></Suspense>
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
        <div className="eyebrow chrome landing-eyebrow">your first 60 seconds</div>
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

      <Suspense fallback={<PreviewSkeleton />}><LiveMatchPreview /></Suspense>

      <FreePlan signedIn={Boolean(user)} />

      <section className="landing-toolkit" aria-labelledby="toolkit-title">
        <div className="landing-section-heading"><div><div className="eyebrow">Your application toolkit</div><h2 id="toolkit-title">More than a place to search.</h2></div><p>Prepare your profile, refine your application, and take your next step with the tools already in Instela.</p></div>
        <div className="landing-tool-grid">{TOOLS.map(t => <Link key={t.href} href={t.href} className="landing-tool"><span className="tool-icon"><Icon name={t.href.slice(1) as IconName} size={23} /></span><h3>{t.label === "github" ? "GitHub audit" : t.label === "linkedin" ? "LinkedIn tools" : t.label === "essay" ? "Essay review" : "Autofill extension"}</h3><p>{t.blurb}</p><span className="tool-open">Explore tool <Icon name="arrow" size={16} /></span></Link>)}</div>
      </section>

      <Suspense fallback={<section className="landing-block landing-section-loading" aria-busy="true" aria-label="Loading source coverage"><div className="eyebrow">Follow the evidence</div><h2>Checking our source coverage…</h2></section>}><SourceProof /></Suspense>
      <LandingFAQ />
      <section className="landing-final"><div className="eyebrow">Your next chapter starts here</div><h2>Find the opportunity.<br /><span>Make it yours.</span></h2><Link href={FEED_PATH} className="btn btn-primary">Explore opportunities now<Icon name="arrow" size={18} /></Link><p>No signup required.</p></section>
    </main>
  );
}
