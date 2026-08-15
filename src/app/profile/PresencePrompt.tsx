import Link from "next/link";

import type { PresenceRouting, PresenceTarget } from "@/lib/profile/routing";

/**
 * Where to build your standing profile.
 *
 * The requirement was "without forcing both", and the design follows from it:
 * one primary call to action, the second offered in a sentence rather than
 * given equal weight. Two equal buttons would not be routing — it would be
 * handing the decision back to someone who came here to be told.
 *
 * It also states what it already has. A student who has linked both should see
 * that, not a prompt telling them to do something they did for us last week.
 */

const COPY: Record<
  PresenceTarget,
  { label: string; href: string; action: string; blurb: string }
> = {
  github: {
    label: "github",
    href: "/github",
    action: "audit your github",
    blurb:
      "We fetch your real profile from GitHub's public API and report what a recruiter would find — then generate the profile README most students do not have.",
  },
  linkedin: {
    label: "linkedin",
    href: "/linkedin",
    action: "build your linkedin",
    blurb:
      "A headline, About section and bullet rewrites built from what you have already told us, plus a checker for what is on your profile now. Nothing is ever fetched from LinkedIn.",
  },
};

export function PresencePrompt({
  routing,
  linked,
}: {
  routing: PresenceRouting;
  /** What the profile already records, so we do not prompt for finished work. */
  linked: { github: string | null; linkedin: string | null };
}) {
  const primary = COPY[routing.primary];
  const secondary = routing.secondary ? COPY[routing.secondary] : null;
  const primaryDone = linked[routing.primary] !== null;

  return (
    <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
      <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
        where recruiters will look you up
      </div>

      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "62ch", marginBottom: 16 }}>
        Start with <span style={{ color: "var(--text)" }}>{primary.label}</span> — {routing.because}.{" "}
        {primary.blurb}
      </p>

      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 14 }}>
        <Link href={primary.href} className="btn btn-primary press" style={{ textDecoration: "none" }}>
          {primaryDone ? `open your ${primary.label}` : primary.action}
        </Link>
        {primaryDone && (
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            linked · {linked[routing.primary]}
          </span>
        )}
      </div>

      {secondary ? (
        <p className="mono" style={{ color: "var(--faint-readable)" }}>
          {linked[routing.secondary!] ? (
            <>
              your{" "}
              <Link href={COPY[routing.secondary!].href} style={{ color: "var(--accent)" }}>
                {COPY[routing.secondary!].label}
              </Link>{" "}
              is linked too — worth a second pass once the first is done, not before.
            </>
          ) : (
            <>
              worth doing after, not at the same time:{" "}
              <Link href={COPY[routing.secondary!].href} style={{ color: "var(--accent)" }}>
                {COPY[routing.secondary!].action}
              </Link>
              . one finished profile beats two half-built ones.
            </>
          )}
        </p>
      ) : (
        <p className="mono" style={{ color: "var(--faint-readable)" }}>
          we are not going to tell you to build a github profile. nothing you have told us points
          at a track where recruiters open source code, and it would be a weekend spent on a page
          your field does not read.{" "}
          <Link href="/github" style={{ color: "var(--accent)" }}>
            it is here
          </Link>{" "}
          if that changes.
        </p>
      )}

      {routing.fromResume && (
        <p className="mono" style={{ marginTop: 10, color: "var(--faint-readable)" }}>
          that came from your resume rather than the interests you ticked — the two disagree, and
          the resume is the one with evidence behind it.
        </p>
      )}
    </section>
  );
}
