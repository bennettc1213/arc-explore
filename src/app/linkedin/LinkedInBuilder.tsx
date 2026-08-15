import Link from "next/link";

import { CopyBlock } from "@/components/CopyBlock";
import type { LinkedInDraft } from "@/lib/linkedin/build";

const SOURCE_LABEL: Record<LinkedInDraft["sources"][number]["from"], string> = {
  profile: "your profile",
  resume: "your resume",
  account: "your sign-in address",
};

/**
 * The LinkedIn builder.
 *
 * Everything here is generated from the student's own profile and parsed
 * resume, with a visible placeholder anywhere we do not hold the fact. Nothing
 * is posted to LinkedIn and nothing could be — this produces text they paste
 * into their own profile themselves.
 */
export function LinkedInBuilder({
  draft,
  signedIn,
  hasResume,
}: {
  draft: LinkedInDraft;
  signedIn: boolean;
  hasResume: boolean;
}) {
  const used = [...new Set(draft.sources.map((s) => s.from))];

  return (
    <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
      <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
        a draft to start from
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: 18 }}>
        Built from what you have already given us, never from a model — because the checker below
        penalises the exact phrases a model would reach for. A test asserts this draft passes that
        checker, which is a promise we could not make about generated prose.
      </p>

      {!signedIn && (
        <div className="slot" style={{ padding: "14px 16px", marginBottom: 18 }}>
          <span>
            You are signed out, so this is the bare template.{" "}
            <Link href="/login?next=/linkedin" style={{ color: "var(--accent)" }}>
              Sign in
            </Link>{" "}
            and it fills in from your profile and resume.
          </span>
        </div>
      )}

      {signedIn && !hasResume && (
        <div className="slot" style={{ padding: "14px 16px", marginBottom: 18 }}>
          <span>
            <Link href="/resume" style={{ color: "var(--accent)" }}>
              Upload a resume
            </Link>{" "}
            and the stack line, the evidence paragraph and the bullet rewrites below fill in from
            what it says.
          </span>
        </div>
      )}

      {draft.slots.length > 0 && (
        <div className="slot" style={{ padding: "14px 16px", marginBottom: 18 }}>
          <span>
            <strong>{draft.slots.length}</strong> {draft.slots.length === 1 ? "thing" : "things"} we
            do not know about you, left visible rather than guessed. Fill them in here before you
            paste — a bracket on a live profile is worse than a blank one.
          </span>
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <CopyBlock initial={draft.headline} label="headline" rows={3} />
        <p className="mono" style={{ marginTop: 8, color: "var(--faint-readable)" }}>
          subject and school first because it is the claim a reader can verify at a glance, stack
          second because it is what recruiter search matches on, target last because it is the part
          most students omit — and the part that gets them filtered into a list rather than out of
          one.
        </p>
      </div>

      <div style={{ marginBottom: 22 }}>
        <CopyBlock initial={draft.about} label="about" rows={12} />
        <p className="mono" style={{ marginTop: 8, color: "var(--faint-readable)" }}>
          the concrete facts sit in the first paragraph on purpose. linkedin hides everything past
          roughly three lines behind &ldquo;see more&rdquo;, so an opening spent on framing is the
          whole section spent on framing.
        </p>
      </div>

      {draft.bullets.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="mono chrome" style={{ marginBottom: 10 }}>
            your experience lines, restated
          </div>
          <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: 14 }}>
            These are lines already on your resume, against the pattern. Telling you to &ldquo;use
            strong verbs&rdquo; teaches nothing; the same advice printed above your own sentence is
            an edit you can make in a minute. We never fill in the number — that one is yours.
          </p>
          <ol style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {draft.bullets.map((b, i) => (
              <li key={i}>
                <div className="mono" style={{ color: "var(--faint-readable)", marginBottom: 4 }}>
                  {b.reason}
                </div>
                <div
                  className="t-sm"
                  style={{
                    paddingLeft: 10,
                    borderLeft: "1px solid var(--line-strong)",
                    color: "var(--faint-readable)",
                    textDecoration: "line-through",
                  }}
                >
                  {b.before}
                </div>
                <div
                  className="t-sm"
                  style={{
                    paddingLeft: 10,
                    borderLeft: "1px solid var(--accent)",
                    color: "var(--text)",
                    marginTop: 4,
                  }}
                >
                  {b.after}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {used.length > 0 && (
        <div className="mono" style={{ marginTop: 18, color: "var(--faint-readable)" }}>
          facts pulled from: {used.map((u) => SOURCE_LABEL[u]).join(" · ")}
        </div>
      )}
    </section>
  );
}
