import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { UpgradeWall } from "@/components/pricing/UpgradeGate";
import { getSessionUser } from "@/lib/auth";
import { buildLinkedInDraft } from "@/lib/linkedin/build";
import { getUserTier } from "@/lib/pricing/entitlements";
import { checkUsage } from "@/lib/pricing/usage";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { coerceParsedResume } from "@/lib/resume/types";
import { topDemandedSkills } from "@/lib/score/competitiveness";

import { LinkedInBuilder } from "./LinkedInBuilder";
import { LinkedInChecker } from "./LinkedInChecker";

export const dynamic = "force-dynamic";

/**
 * LinkedIn tools.
 *
 * THE RULE, FROM CLAUDE.MD, VERBATIM: *the LinkedIn checker only scores text a
 * student pastes in. Never add a live fetch against linkedin.com in any form —
 * no scraping, no unofficial API, no logged-in automation.*
 *
 * There is no network code in `lib/linkedin/` and no route here that takes a
 * profile URL. LinkedIn sued Proxycurl in N.D. Cal. and it shut down in July
 * 2026; a fetch here is the one thing that could end this project. The checker
 * goes further than the rule requires and runs entirely in the browser, so the
 * pasted text is not sent to us either.
 */

export default async function LinkedInPage() {
  const user = await getSessionUser();

  const [profile, storedResume, demand] = await Promise.all([
    user ? getProfile(user.id) : null,
    user ? getLatestResume(user.id) : null,
    topDemandedSkills(),
  ]);

  const resume = storedResume ? coerceParsedResume(storedResume.parsed) : null;
  const draft = buildLinkedInDraft({ profile, resume, accountEmail: user?.email ?? null });

  // Read-only check — does not spend a unit. The actual consumption happens
  // client-side, from the checker's first keystroke (see LinkedInChecker and
  // linkedin/actions.ts) — a page view is not a "run" of a tool that scores
  // as you type, so gating access here and metering usage there are
  // deliberately two different moments.
  // Through `getUserTier` on both branches, never a literal "free" — see the
  // note in `app/page.tsx`.
  const tier = await getUserTier(user?.id);
  const linkedInAccess = user ? await checkUsage(user.id, tier, "linkedin_tools") : null;

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <BackLink href="/" label="back to the feed" />
      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">07 — linkedin</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          the profile <span style={{ color: "var(--accent)" }}>recruiters search</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "64ch", marginTop: 14 }}>
          Most students leave the headline LinkedIn generated for them — &ldquo;Student at
          [University]&rdquo; — which is the highest-weighted text on the profile for LinkedIn&rsquo;s
          own search. Below: a draft built from what you have already told us, and a checker for
          what you have now.
        </p>
      </header>

      <div
        className="border"
        style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 28 }}
      >
        <div className="mono chrome">we never fetch your profile</div>
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "64ch" }}>
          Not with a scraper, not through an unofficial API, not by logging in as you. LinkedIn
          sued Proxycurl over exactly that and it shut down in July 2026. Everything here works on
          text you paste and text you copy back out — which is a real limitation, and we would
          rather have it than the alternative.
        </p>
      </div>

      {user && linkedInAccess?.usable && (
        <>
          <LinkedInBuilder draft={draft} signedIn={Boolean(user)} hasResume={Boolean(resume)} />
          <LinkedInChecker demand={demand} />
        </>
      )}

      {user && linkedInAccess && !linkedInAccess.usable && (
        <UpgradeWall
          feature="linkedin_tools"
          access={linkedInAccess}
          reasonNote="you've used your free LinkedIn run"
        />
      )}

      {!user && (
        <div className="slot" style={{ padding: "14px 16px", marginBottom: 28 }}>
          <span>
            <Link href={`/login?next=/linkedin`} style={{ color: "var(--accent)" }}>
              sign in
            </Link>{" "}
            to use the builder and checker — free accounts get one run
          </span>
        </div>
      )}

      <section style={{ border: "1px solid var(--line)", padding: 22, marginBottom: 28 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
          open to work — advice, not a check
        </div>
        <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: 14 }}>
          We cannot see whether this is switched on. The setting is not visible to a logged-out
          request, and the only way to observe it would be to log in as you — which is the thing we
          just said we will never do. So this is a reminder rather than a score. Anything else
          would be a number we invented, and inventing numbers is what every other tool on this
          site exists to avoid.
        </p>
        <ul className="t-sm" style={{ color: "var(--text)", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>
            Turn on <strong>Open to work</strong> from your profile photo, and choose{" "}
            <strong>recruiters only</strong> unless you are comfortable with your current employer
            seeing it. Students on a first search usually want the green banner; someone with a job
            usually does not.
          </li>
          <li>
            Set the job titles you actually want, not every title you could accept. It is a filter
            recruiters search on, and a list of eight makes you match badly against all of them.
          </li>
          <li>
            Set start date and location, including remote if you would take it. An unset start date
            reads as &ldquo;now&rdquo;, which quietly excludes you from the summer internship lists
            that are being built months ahead.
          </li>
          <li>
            Re-check it after graduation. The setting persists, and a profile still advertising
            &ldquo;open to internships&rdquo; two years in is the kind of stale detail that makes
            everything next to it look stale too.
          </li>
        </ul>
      </section>

      <footer className="mono" style={{ marginTop: 40, color: "var(--faint-readable)" }}>
        your{" "}
        <Link href="/github" style={{ color: "var(--accent)" }}>
          github audit
        </Link>{" "}
        is the one profile tool here that runs on fetched data — github publishes it through a
        public api. this one cannot, and says so rather than pretending.
      </footer>
    </main>
  );
}
