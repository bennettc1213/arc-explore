import Link from "next/link";

import { Mascot } from "@/components/chrome/Mascot";
import { PostingRow } from "@/components/PostingRow";
import { statusesForPostings } from "@/lib/applications/store";
import { getSessionUser } from "@/lib/auth";
import { getAvailableTerms, getFeed, getFeedStats } from "@/lib/feed";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { skillsFromParsedResume } from "@/lib/score/skills";
import {
  INTEREST_OPTIONS,
  WORK_AUTH_OPTIONS,
  isProfileUsable,
  parseLocations,
  toScoreProfile,
  type UserProfile,
} from "@/lib/profile/types";
import type { ScoreProfile } from "@/lib/score/fit";

export const dynamic = "force-dynamic";

/**
 * The feed.
 *
 * Two ways in, deliberately:
 *  - Signed out, the profile lives in the URL. The whole product works without
 *    an account, and a scored feed is a shareable link.
 *  - Signed in, the stored profile wins and the form collapses to a summary.
 *    Filters stay in the URL either way.
 */

function profileFromParams(sp: Record<string, string | string[] | undefined>): ScoreProfile {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const all = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const gradYear = Number(one("gradYear"));

  return {
    major: one("major") ?? null,
    gradYear: Number.isFinite(gradYear) && gradYear > 0 ? gradYear : null,
    workAuth: one("workAuth") ?? null,
    targetLocations: parseLocations(one("locations") ?? ""),
    targetVerticals: all("targetVerticals"),
    openToRemote: one("remote") !== "0",
  };
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="mono-strong" style={{ fontSize: "1.6rem", color: "var(--text)" }}>
        {value}
      </div>
      <div className="mono">{label}</div>
    </div>
  );
}

/** What we are scoring against, for someone who is signed in. */
function ProfileSummary({
  profile,
  resumeSkills,
}: {
  profile: UserProfile | null;
  resumeSkills: string[];
}) {
  const bits: string[] = [];
  if (profile?.major) bits.push(profile.major);
  if (profile?.gradYear) bits.push(`class of ${profile.gradYear}`);
  if (profile?.workAuth) {
    bits.push(WORK_AUTH_OPTIONS.find((o) => o.value === profile.workAuth)?.label ?? profile.workAuth);
  }
  if (profile?.targetVerticals.length) {
    bits.push(
      profile.targetVerticals
        .map((v) => INTEREST_OPTIONS.find((o) => o.value === v)?.label ?? v)
        .join(" · "),
    );
  }
  if (profile?.targetLocations.length) bits.push(profile.targetLocations.join(" / "));

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 border"
      style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 32 }}
    >
      <div>
        <div className="mono chrome">scoring against</div>
        <div className="t-sm" style={{ marginTop: 4, color: "var(--text)" }}>
          {bits.length > 0 ? bits.join(" · ") : "nothing yet — your profile is empty"}
        </div>
        {resumeSkills.length > 0 ? (
          <div className="mono" style={{ marginTop: 6 }}>
            resume: {resumeSkills.length} skills read —{" "}
            {resumeSkills.slice(0, 6).join(" · ")}
            {resumeSkills.length > 6 && ` +${resumeSkills.length - 6}`}
          </div>
        ) : (
          <div className="mono" style={{ marginTop: 6 }}>
            no resume yet — upload one and these get matched skill by skill
          </div>
        )}
      </div>
      <Link href="/profile" className="btn press" style={{ textDecoration: "none" }}>
        edit profile
      </Link>
    </div>
  );
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const user = await getSessionUser();
  const [stored, resume] = user
    ? await Promise.all([getProfile(user.id), getLatestResume(user.id)])
    : [null, null];

  // Derived on read, not stored: improving the extractor improves everyone's
  // scores without a migration or a re-upload.
  const resumeSkills = resume ? skillsFromParsedResume(resume.parsed) : [];

  // Signed in, the saved profile is the source of truth — otherwise a stale
  // link would silently score someone against answers they had since changed.
  const profile = user ? toScoreProfile(stored, resumeSkills) : profileFromParams(sp);
  const hasProfile = user
    ? isProfileUsable(stored)
    : Boolean(
        profile.major ||
          profile.gradYear ||
          profile.workAuth ||
          (profile.targetVerticals?.length ?? 0) > 0 ||
          (profile.targetLocations?.length ?? 0) > 0,
      );

  const term = typeof sp.term === "string" && sp.term ? sp.term : null;
  const remoteOnly = sp.remoteOnly === "1";
  const includeClosed = sp.includeClosed === "1";

  const [items, stats, terms] = await Promise.all([
    getFeed(profile, { term, remoteOnly, includeClosed, hideBlocked: false }),
    getFeedStats(),
    getAvailableTerms(),
  ]);

  const guestVerticals = new Set(profile.targetVerticals ?? []);

  // One query for the whole page rather than one per row.
  const tracked = user
    ? await statusesForPostings(user.id, items.map((i) => i.id))
    : new Map();

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <header style={{ marginBottom: 40 }}>
        <div className="eyebrow chrome">01 — internships</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          every internship we can <span style={{ color: "var(--accent)" }}>verify is live</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "58ch", marginTop: 14 }}>
          Sourced by polling each employer&apos;s own applicant-tracking system, not an
          aggregator. Every row shows when we last confirmed it on their board.
        </p>
      </header>

      <section
        className="flex flex-wrap gap-x-12 gap-y-6 border-y"
        style={{ borderColor: "var(--line)", padding: "22px 0", marginBottom: 32 }}
      >
        <Stat value={stats.open} label="open now" />
        <Stat value={stats.newToday} label="found today" />
        <Stat value={stats.total} label="tracked total" />
        <Stat value={stats.withUnknownTerm} label="term not stated" />
      </section>

      {user && <ProfileSummary profile={stored} resumeSkills={resumeSkills} />}

      {/* GET so filter state lives in the URL and is shareable. Signed out,
          the profile answers ride along in it too. */}
      <form
        method="GET"
        className="border"
        style={{ borderColor: "var(--line)", padding: 20, marginBottom: 32 }}
      >
        {!user && (
          <>
            <div className="eyebrow chrome" style={{ marginBottom: 16 }}>
              02 — your profile
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <label className="field-row">
                <span className="mono chrome">major</span>
                <input
                  className="field"
                  name="major"
                  defaultValue={profile.major ?? ""}
                  placeholder="computer science"
                />
              </label>

              <label className="field-row">
                <span className="mono chrome">graduation year</span>
                <input
                  className="field"
                  name="gradYear"
                  type="number"
                  defaultValue={profile.gradYear ?? ""}
                  placeholder="2027"
                />
              </label>

              <label className="field-row">
                <span className="mono chrome">work authorization</span>
                <select className="field" name="workAuth" defaultValue={profile.workAuth ?? ""}>
                  <option value="">prefer not to say</option>
                  {WORK_AUTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-row">
                <span className="mono chrome">preferred locations</span>
                <input
                  className="field"
                  name="locations"
                  defaultValue={(profile.targetLocations ?? []).join(", ")}
                  placeholder="San Francisco, New York"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {INTEREST_OPTIONS.map((o) => (
                <label key={o.value} className="mono chrome flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="targetVerticals"
                    value={o.value}
                    defaultChecked={guestVerticals.has(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </>
        )}

        <div className={`flex flex-wrap items-center gap-5 ${user ? "" : "mt-5"}`}>
          <label className="mono chrome flex items-center gap-2">
            <input type="checkbox" name="remoteOnly" value="1" defaultChecked={remoteOnly} />
            remote only
          </label>
          <label className="mono chrome flex items-center gap-2">
            <input type="checkbox" name="includeClosed" value="1" defaultChecked={includeClosed} />
            show closed
          </label>

          <label className="mono chrome flex items-center gap-2">
            term
            <select
              name="term"
              defaultValue={term ?? ""}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line-strong)",
                color: "var(--text)",
                padding: "5px 8px",
                colorScheme: "dark",
              }}
            >
              <option value="">any</option>
              {terms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="btn btn-primary press">
            {user ? "apply filters" : "score my feed"}
          </button>
        </div>
      </form>

      {!hasProfile && (
        <div className="slot" style={{ marginBottom: 24, padding: "14px 16px" }}>
          {user ? (
            <>
              <Mascot size={26} />
              <span>
                your profile is empty — <Link href="/profile" style={{ color: "var(--accent)" }}>fill it in</Link>{" "}
                and these get scored. until then we only rank by freshness
              </span>
            </>
          ) : (
            <span>
              add your details above to score these — or{" "}
              <Link href="/login" style={{ color: "var(--accent)" }}>sign in</Link> to save them
            </span>
          )}
        </div>
      )}

      <div className="eyebrow chrome" style={{ marginBottom: 8 }}>
        03 — {items.length} results
      </div>

      {items.length === 0 ? (
        <div className="slot" style={{ padding: "20px", gap: 16 }}>
          <Mascot size={32} />
          no postings match these filters yet
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <PostingRow
              key={item.id}
              item={item}
              tracked={tracked.get(item.id) ?? null}
              signedIn={Boolean(user)}
              hasResume={resumeSkills.length > 0}
            />
          ))}
        </div>
      )}

      <footer className="mono" style={{ marginTop: 48, color: "var(--faint-readable)" }}>
        fit and timing are explainable heuristics, not win probabilities. we do not have
        outcome data yet, so we do not pretend to predict odds.
      </footer>
    </main>
  );
}
