import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { UpgradeWall } from "@/components/pricing/UpgradeGate";
import { recordEvent } from "@/lib/analytics/record";
import { getSessionUser } from "@/lib/auth";
import { auditGitHub, type GitHubAudit } from "@/lib/github/audit";
import { fetchGitHubSnapshot } from "@/lib/github/client";
import { generateProfileReadme, type GeneratedReadme } from "@/lib/github/readme";
import { GitHubFetchError, parseGitHubUsername, type GhFetchFailure } from "@/lib/github/types";
import { getUserTier } from "@/lib/pricing/entitlements";
import { consumeUsage, type ConsumeResult } from "@/lib/pricing/usage";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { coerceParsedResume } from "@/lib/resume/types";

import { AuditPanel } from "./AuditPanel";
import { ReadmeBuilder } from "./ReadmeBuilder";

export const dynamic = "force-dynamic";

/**
 * The GitHub audit.
 *
 * Open to signed-out visitors on purpose. Everything it reads is already public
 * — it is the same data anyone gets by opening github.com/you — so there is
 * nothing here to protect behind a login, and requiring one would only stop
 * people from using the single tool on this site that runs on real fetched
 * evidence.
 *
 * The username lives in the query string rather than in component state so the
 * result is a link a student can send to someone.
 */

function failureMessage(failure: GhFetchFailure, typed: string): { title: string; body: string } {
  switch (failure.kind) {
    case "not_found":
      return {
        title: `github.com/${failure.username} does not exist`,
        body: "Check the spelling. GitHub usernames are the handle in your profile URL, not your display name or your email.",
      };
    case "rate_limited": {
      const when = failure.resetAt
        ? failure.resetAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : null;
      return {
        title: "GitHub is rate limiting us",
        body: `GitHub allows 60 requests an hour from an unauthenticated address, and this site shares one. ${
          when ? `The window resets at ${when}.` : "Try again shortly."
        } Setting a GITHUB_TOKEN raises this to 5,000 an hour — the token needs no permissions, because everything we read is public.`,
      };
    }
    case "invalid_username":
      return {
        title: `“${typed}” is not a GitHub username`,
        body: "Usernames are letters, digits and single hyphens, up to 39 characters. You can paste the full profile URL instead and we will read it out of that.",
      };
    default:
      return {
        title: "We could not reach GitHub",
        body: failure.detail,
      };
  }
}

export default async function GitHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.u) ? sp.u[0] : sp.u;

  const user = await getSessionUser();
  const storedProfile = user ? await getProfile(user.id) : null;

  /*
   * The saved handle stands in when the URL does not carry one, so a signed-in
   * student who has linked their profile lands on their own audit instead of an
   * empty form. An explicit `?u=` still wins — the page has to stay usable for
   * looking at somebody else's profile, which is how most people will first try
   * it.
   */
  const typed = (raw ?? storedProfile?.githubUsername ?? "").trim();
  const username = typed ? parseGitHubUsername(typed) : null;

  let audit: GitHubAudit | null = null;
  let readme: GeneratedReadme | null = null;
  let failure: GhFetchFailure | null = null;
  let usage: ConsumeResult | null = null;

  if (typed) {
    if (!username) {
      failure = { kind: "invalid_username" };
    } else {
      // Run-capped for a signed-in free viewer, keyed on the username: two
      // audits of the SAME account are one use, not two — see
      // src/lib/pricing/usage.ts. Signed-out visitors are deliberately left
      // unmetered here, which is a real, documented gap (FIXES.md): there is
      // no account to attach a quota to, and this page is open signed-out on
      // purpose (everything it reads is already public — see the module
      // comment above). Metering by IP or fingerprint was ruled out as its
      // own privacy problem, not attempted quietly.
      // Through `getUserTier` on both branches, never a literal "free" — see
      // the note in `app/page.tsx`: the shortcut reads as equivalent and
      // silently sheds the DEV_TIER override the function carries.
      const tier = await getUserTier(user?.id);
      usage = user ? await consumeUsage(user.id, tier, "github_tools", username) : null;

      if (user && usage && !usage.access.usable) {
        failure = null;
      } else {
        try {
          const snapshot = await fetchGitHubSnapshot(username);
          audit = auditGitHub(snapshot);

          // Only a completed fetch counts. A typo costs zero GitHub requests and
          // should cost zero events too, or the number stops meaning "audits run"
          // and starts meaning "times the form was submitted". The username is
          // not recorded — the count is the metric, not who was looked up.
          await recordEvent("github_audited", { score: audit.score });

          // Signed in, the README is filled from the profile and resume as well.
          // Signed out it is thinner, not broken — every gap is a visible slot.
          const storedResume = user ? await getLatestResume(user.id) : null;

          readme = generateProfileReadme({
            snapshot,
            profile: storedProfile,
            resume: storedResume ? coerceParsedResume(storedResume.parsed) : null,
            accountEmail: user?.email ?? null,
          });
        } catch (err) {
          failure =
            err instanceof GitHubFetchError
              ? err.failure
              : { kind: "network", detail: err instanceof Error ? err.message : "request failed" };
        }
      }
    }
  }

  const locked = Boolean(user && usage && !usage.access.usable);

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <BackLink href="/" label="back to the feed" />
      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">06 — github</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          what a recruiter <span style={{ color: "var(--accent)" }}>actually sees</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "64ch", marginTop: 14 }}>
          A recruiter who clicks the GitHub link on your resume lands on your profile page and
          spends under a minute there. This fetches that page&rsquo;s underlying data from
          GitHub&rsquo;s public API and reports what they would find — the README or the absence of
          one, what your repository list says about itself, and whether opening your best project
          teaches them anything.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3" style={{ marginBottom: 32 }}>
        <label style={{ flex: "1 1 260px" }}>
          <span className="mono chrome" style={{ display: "block", marginBottom: 6 }}>
            your github username
          </span>
          <input
            type="text"
            name="u"
            defaultValue={typed}
            placeholder="octocat — or paste your profile URL"
            autoComplete="off"
            spellCheck={false}
            className="w-full"
            style={{
              background: "transparent",
              border: "1px solid var(--line-strong)",
              color: "var(--text)",
              padding: "10px 12px",
              font: "inherit",
            }}
          />
        </label>
        <button type="submit" className="btn btn-primary press">
          audit it
        </button>
      </form>

      {failure && (
        <section
          className="border"
          style={{ borderColor: "var(--accent)", padding: "16px 18px", marginBottom: 28 }}
        >
          <div className="mono-strong" style={{ color: "var(--accent)" }}>
            {failureMessage(failure, typed).title}
          </div>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "62ch" }}>
            {failureMessage(failure, typed).body}
          </p>
        </section>
      )}

      {locked && usage && (
        <UpgradeWall
          feature="github_tools"
          access={usage.access}
          reasonNote="you've used your free GitHub audit"
        />
      )}

      {audit && !locked && (
        <>
          <div
            className="flex flex-wrap items-center justify-between gap-4 border"
            style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 28 }}
          >
            <div>
              <div className="mono chrome">audited</div>
              <div className="t-sm" style={{ marginTop: 4, color: "var(--text)" }}>
                {audit.username}
              </div>
            </div>
            <a
              href={audit.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn press"
              style={{ textDecoration: "none" }}
            >
              open your profile ↗
            </a>
          </div>

          <AuditPanel audit={audit} />

          {readme && (
            <ReadmeBuilder readme={readme} username={audit.username} signedIn={Boolean(user)} />
          )}
        </>
      )}

      {!audit && !failure && !locked && (
        <section className="slot" style={{ padding: "16px 18px", marginBottom: 28 }}>
          <span>
            Nothing is stored and no account is needed — this reads the same public data anyone
            gets by opening your profile.
          </span>
        </section>
      )}

      <footer className="mono" style={{ marginTop: 40, color: "var(--faint-readable)" }}>
        github is the one profile we can check for real — it publishes this through a documented
        public api with no login. every other profile tool here works on text you paste in,
        because fetching those is not something we will do.{" "}
        <Link href="/profile" style={{ color: "var(--accent)" }}>
          your profile
        </Link>
      </footer>
    </main>
  );
}
