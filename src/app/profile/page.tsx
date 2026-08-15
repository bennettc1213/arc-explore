import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";
import { routePresence } from "@/lib/profile/routing";
import { getEmailPrefs, getLatestResume, getProfile } from "@/lib/profile/store";
import { critiqueResume } from "@/lib/resume/critique";
import { coerceParsedResume } from "@/lib/resume/types";
import { resumeCompetitiveness } from "@/lib/score/competitiveness";
import { skillsFromParsedResume } from "@/lib/score/skills";

import { DeleteAccount } from "./DeleteAccount";
import { EmailPrefs } from "./EmailPrefs";
import { PresencePrompt } from "./PresencePrompt";
import { ProfileEditor } from "./ProfileEditor";
import { ResumeCritique } from "./ResumeCritique";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const [profile, resume, emailPrefs] = await Promise.all([
    getProfile(user.id),
    getLatestResume(user.id),
    getEmailPrefs(user.id),
  ]);

  const resumeSkills = resume ? skillsFromParsedResume(resume.parsed) : [];
  const competitiveness = await resumeCompetitiveness(resumeSkills);
  // Pure function over the stored parse — no model call, no query, so it costs
  // nothing to recompute and always reflects the current checks.
  const critique = resume ? critiqueResume(coerceParsedResume(resume.parsed)) : null;
  const routing = routePresence(profile, resumeSkills);

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 880 }}>
      <div className="flex flex-wrap items-start justify-between gap-4" style={{ marginBottom: 32 }}>
        <div>
          <div className="eyebrow chrome">your profile</div>
          <h1
            className="chrome"
            style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.03em", marginTop: 12 }}
          >
            what should we <span style={{ color: "var(--accent)" }}>score against</span>
          </h1>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 10, maxWidth: "60ch" }}>
            Every answer here maps to a scoring dimension you can see on each posting.
            Anything you leave blank is dropped from the score rather than counted
            against a role — we would rather show a partial score than a confident
            wrong one.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="mono">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="btn press">
              sign out
            </button>
          </form>
        </div>
      </div>

      {competitiveness && competitiveness.scoreablePostings > 0 && (
        <section
          style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}
        >
          <div className="eyebrow chrome" style={{ marginBottom: 14 }}>
            your resume vs. the {competitiveness.scoreablePostings} roles that name skills
          </div>

          <div className="flex flex-wrap gap-x-12 gap-y-5" style={{ marginBottom: 18 }}>
            <div>
              <div className="mono-strong" style={{ fontSize: "1.6rem", color: "var(--accent)" }}>
                {competitiveness.postingsWithOverlap}
              </div>
              <div className="mono">share at least one skill</div>
            </div>
            <div>
              <div className="mono-strong" style={{ fontSize: "1.6rem", color: "var(--text)" }}>
                {competitiveness.postingsStronglyMatched}
              </div>
              <div className="mono">you match on skills</div>
            </div>
            <div>
              <div className="mono-strong" style={{ fontSize: "1.6rem", color: "var(--text)" }}>
                {resumeSkills.length}
              </div>
              <div className="mono">skills read from your resume</div>
            </div>
          </div>

          {/* The only place the app says "go learn this". Ranked by how many
              more roles each skill would put in reach — the ranking that
              answers the question rather than just listing what is popular. */}
          {competitiveness.topGaps.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="mono chrome" style={{ marginBottom: 6 }}>
                most asked for that your resume does not show
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {competitiveness.topGaps.map((g) => (
                  <span key={g.skill} className="mono" style={{ color: "var(--text)" }}>
                    {g.skill}{" "}
                    <span style={{ color: "var(--faint-readable)" }}>
                      · {g.postings} roles
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {competitiveness.strongest.length > 0 && (
            <div>
              <div className="mono chrome" style={{ marginBottom: 6 }}>
                what you have that is most in demand
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {competitiveness.strongest.map((g) => (
                  <span key={g.skill} className="mono" style={{ color: "var(--accent)" }}>
                    {g.skill}{" "}
                    <span style={{ color: "var(--faint-readable)" }}>· {g.postings} roles</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="mono" style={{ marginTop: 16 }}>
            counted from the skills each posting names in its own description. a role that
            names none is not counted either way.
          </p>
        </section>
      )}

      <PresencePrompt
        routing={routing}
        linked={{
          github: profile?.githubUsername ?? null,
          linkedin: profile?.linkedinUrl ?? null,
        }}
      />

      {critique && <ResumeCritique critique={critique} />}

      <ProfileEditor
        profile={profile}
        resume={
          resume
            ? {
                fileName: resume.fileName,
                // Formatted on the server so the markup does not shift between
                // the server render and hydration in another timezone.
                createdAt: resume.createdAt.toISOString().slice(0, 10),
              }
            : null
        }
      />

      <EmailPrefs prefs={emailPrefs} />

      <DeleteAccount />

      <p className="mono" style={{ marginTop: 28 }}>
        <Link href="/" className="press" style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
        {"  ·  "}
        <Link href="/privacy" className="press" style={{ color: "var(--accent)" }}>
          what we hold about you →
        </Link>
      </p>
    </main>
  );
}
