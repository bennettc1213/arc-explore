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
 * The landing page, ordered by the remodel plan (INSTELA_REMODEL_PLAN.md):
 * offer and primary action, compact live proof, an interactive starting
 * point, why the results deserve attention, the free plan, then the toolkit,
 * FAQ and a final Explore CTA.
 *
 * The primary action goes straight to the feed, because it needs no account.
 * Guided setup is still one click away, but it is no longer the price of a
 * first look.
 *
 * The live row mixes one counted number with two owner-stated ones, at the
 * owner's instruction (2026-11-02). Open internships comes from
 * `getLandingStats`; the two constants below do not, and FIXES.md §4 says so.
 *
 * The old "three steps" walkthrough was removed: it duplicated the interactive
 * preview below it, which does the same job with real listings.
 */
/**
 * Owner-stated: the students were helped outside the app, before it had
 * sign-ups, so nothing in this database can produce it. A floor ("+").
 */
const STUDENTS_HELPED = 10_000;

/**
 * Owner-stated (2026-11-02), not the live `stats.foundAllTime` count. It does
 * not move when we poll; change it here when the real number changes.
 */
const OPPORTUNITIES_FOUND = 50_463;

export default async function LandingPage() {
  // An old `/?kind=…` feed link never reaches this component: `proxy.ts`
  // forwards it to the feed first (see `legacyFeedRedirect`).
  const [user, stats] = await Promise.all([getSessionUser(), getLandingStats()]);

  const STATS: { value: number; suffix?: string; label: string; detail: string }[] = [
    {
      value: STUDENTS_HELPED,
      suffix: "+",
      label: "students helped",
      detail: "students we have helped find internships and scholarships",
    },
    {
      value: stats.openInternships,
      label: "internships open now",
      detail: "still taking applications on the employer's own board",
    },
    {
      value: OPPORTUNITIES_FOUND,
      label: "opportunities found, all time",
      detail: "everything we have listed, including ones since closed",
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
          We check employers&rsquo; own job boards and sponsors&rsquo; own pages directly, not
          aggregators, so every listing traces back to where it began. Tell us about yourself and we
          rank what fits, showing what we know and what we don&rsquo;t. Your data is never sold.
        </p>

        <div className="landing-ctas landing-rise" style={{ animationDelay: "320ms" }}>
          <Link href={FEED_PATH} className="landing-cta landing-cta-primary press">
            <span className="landing-cta-label">
              Explore opportunities <span aria-hidden>→</span>
            </span>
            <span className="landing-cta-note">No signup required</span>
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
              <span className="landing-cta-label">Open your tracker</span>
              <span className="landing-cta-note">Everything you saved and sent</span>
            </Link>
          ) : (
            <Link href="/login" className="landing-cta press">
              <span className="landing-cta-label">Create a free account</span>
              <span className="landing-cta-note">Save listings · track every application</span>
            </Link>
          )}
        </div>

        <a href="#try-it" className="landing-try-link">Not sure where to start? Try a quick preview <Icon name="arrow" size={15} /></a>
        {!user && (
          <Link href="/onboarding" className="landing-try-link">Want personal matches? Set up your profile <Icon name="arrow" size={15} /></Link>
        )}

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
        &ldquo;open&rdquo; means not closed, hidden or past its term. the open count moves every time we poll.
      </p>

      <Suspense fallback={<PreviewSkeleton />}><LiveMatchPreview /></Suspense>

      <Suspense fallback={<section className="landing-block landing-section-loading" aria-busy="true" aria-label="Loading source coverage"><div className="eyebrow">Follow the evidence</div><h2>Checking our source coverage…</h2></section>}><SourceProof /></Suspense>

      <FreePlan signedIn={Boolean(user)} />

      <section className="landing-toolkit" aria-labelledby="toolkit-title">
        <div className="landing-section-heading"><div><div className="eyebrow">Your application toolkit</div><h2 id="toolkit-title">More than a place to search.</h2></div><p>Prepare your profile, refine your application, and take your next step with the tools already in Instela.</p></div>
        <div className="landing-tool-grid">{TOOLS.map(t => <Link key={t.href} href={t.href} className="landing-tool"><span className="tool-icon"><Icon name={t.href.slice(1) as IconName} size={23} /></span><h3>{t.title}{t.status === "beta" && <span className="tool-beta">beta</span>}</h3><p>{t.blurb}</p><span className="tool-access">{t.access}</span><span className="tool-open">Explore tool <Icon name="arrow" size={16} /></span></Link>)}</div>
      </section>

      <LandingFAQ />
      <section className="landing-final"><div className="eyebrow">Your next chapter starts here</div><h2>Find the opportunity.<br /><span>Make it yours.</span></h2><Link href={FEED_PATH} className="btn btn-primary">Explore opportunities<Icon name="arrow" size={18} /></Link><p>No signup required.</p></section>
    </main>
  );
}
