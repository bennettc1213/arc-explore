import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { ApplyWizard } from "@/components/apply/ApplyWizard";
import { CoverLetterEditor } from "@/components/CoverLetterEditor";
import { ReportListing } from "@/components/ReportListing";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ScoreReasons } from "@/components/ScoreReasons";
import { TrackButton } from "@/components/TrackButton";
import { recordEvent } from "@/lib/analytics/record";
import { buildApplicationPacket } from "@/lib/apply/packet";
import { getSessionUser } from "@/lib/auth";
import { getCoverLetter } from "@/lib/cover-letter/store";
import { getPosting } from "@/lib/feed";
import { getUserTier, presentFit } from "@/lib/pricing/entitlements";
import { TIER_LABELS, evaluateFeature } from "@/lib/pricing/tiers";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { hasReported } from "@/lib/reports/store";
import { toScoreProfile } from "@/lib/profile/types";
import { coerceParsedResume } from "@/lib/resume/types";
import { skillsFromParsedResume } from "@/lib/score/skills";

export const dynamic = "force-dynamic";

/** "$1,000", "$1,000–$2,500", or null when the amount is unstated. */
function formatAmount(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null && min !== max) {
    return `$${min.toLocaleString("en-US")}–$${max.toLocaleString("en-US")}`;
  }
  const value = min ?? max;
  return value === null ? null : `$${value.toLocaleString("en-US")}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}


function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="mono chrome">{label}</span>
      <span className="t-sm" style={{ color: "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  const [stored, resume] = user
    ? await Promise.all([getProfile(user.id), getLatestResume(user.id)])
    : [null, null];

  const resumeSkills = resume ? skillsFromParsedResume(resume.parsed) : [];
  const profile = user ? toScoreProfile(stored, resumeSkills) : toScoreProfile(null, []);
  const item = await getPosting(id, profile);
  if (!item) notFound();

  const tier = await getUserTier(user?.id);
  const presented = presentFit(item.fit, tier);

  // After the 404 check, so a bad or hidden id is not counted as a view. The
  // kind is the only property worth keeping — the posting id is deliberately
  // not recorded, since "which listings are popular" is not a question worth
  // building a per-listing view log to answer.
  await recordEvent("listing_viewed", { kind: item.kind });

  const [letter, alreadyReported] = user
    ? await Promise.all([getCoverLetter(user.id, id), hasReported(user.id, id)])
    : [null, false];

  // The one-button apply flow, assembled server-side from the same packet the
  // /apply page shows, so the wizard and the packet can never disagree about
  // what we hold. Only built for a signed-in student — the wizard writes back
  // to their profile, which does not exist signed out.
  const parsedResume = resume ? coerceParsedResume(resume.parsed) : null;
  const wizardBoot = user
    ? (() => {
        const packet = buildApplicationPacket({
          profile: stored,
          resume: parsedResume,
          accountEmail: user.email ?? null,
        });
        return {
          postingId: item.id,
          postingTitle: item.title,
          postingUrl: item.url,
          kind: item.kind,
          frameAllowStrikes: item.frameAllowStrikes,
          fields: packet.fields,
          attestations: packet.attestations,
          letterState: (letter
            ? letter.unfilledSlots.length > 0
              ? "slots"
              : "ready"
            : "none") as "none" | "slots" | "ready",
          current: {
            displayName: stored?.displayName ?? "",
            school: stored?.school ?? "",
            major: stored?.major ?? "",
            gradYear: stored?.gradYear != null ? String(stored.gradYear) : "",
            gpa: stored?.gpa != null ? String(stored.gpa) : "",
            workAuth: stored?.workAuth ?? "",
            targetLocations: (stored?.targetLocations ?? []).join(", "),
          },
        };
      })()
    : null;

  const closed = Boolean(item.closedAt);
  const blocked = item.fit.blocked;
  const amount = item.kind === "scholarship" ? formatAmount(item.amountMin, item.amountMax) : null;

  return (
    <main className="wrap" style={{ paddingBlock: "40px 96px" }}>
      <BackLink href="/" label="back to feed" />

      <header className="print-hide" style={{ marginBottom: 24 }}>
          <div className="eyebrow chrome">04 — opportunity</div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="section-title chrome" style={{ marginTop: 10 }}>
                {item.title}
              </h1>
              <div className="t-base" style={{ color: "var(--muted)", marginTop: 8 }}>
                {item.kind === "scholarship" && (
                  <span className="mono" style={{ color: "var(--accent-lite)" }}>
                    scholarship ·{" "}
                  </span>
                )}
                {item.company}
                {item.locations.length > 0 && <> · {item.locations.slice(0, 3).join(" / ")}</>}
                {item.isRemote && <> · remote</>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Same three phrases as the feed row, from the same
                    `describeTiming` call — one definition of how a date is
                    worded, so the two pages cannot drift. */}
                <span className="mono" style={{ color: "var(--faint-readable)" }}>
                  {item.dates.verified}
                </span>
                {item.dates.posted && (
                  <span className="mono" style={{ color: "var(--faint-readable)" }}>
                    · {item.dates.posted}
                  </span>
                )}
                {item.dates.closes && (
                  <span
                    className="mono"
                    style={{
                      color:
                        item.timing.daysUntilDeadline !== null &&
                        item.timing.daysUntilDeadline >= 0 &&
                        item.timing.daysUntilDeadline <= 14
                          ? "var(--accent)"
                          : "var(--faint-readable)",
                    }}
                  >
                    · {item.dates.closes}
                  </span>
                )}
                {blocked && !closed && (
                  <span className="mono" style={{ color: "var(--accent-lite)" }}>
                    · you are not eligible
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ScoreBadge
                label="fit"
                value={presented.score}
                known={presented.known}
                total={presented.total}
                bucketLabel={presented.bucketLabel}
                size="header"
              />
              <ScoreBadge
                label="timing"
                value={closed ? null : item.timing.score}
                known={closed ? undefined : item.timing.knownSignals}
                total={closed ? undefined : item.timing.totalSignals}
                size="header"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn press"
              style={{ textDecoration: "none" }}
            >
              apply on {item.kind === "scholarship" ? "the sponsor's site" : "the employer's site"} ↗
            </a>
            {/* The wizard's hand-off drives the extension, which is Apply-tier
                (api/extension/packet enforces it). The application PACKET
                below stays available on every tier — it is the do-it-yourself
                version of the same facts, and gating both would be charging
                twice for one thing. */}
            {wizardBoot && evaluateFeature(tier, "extension_autofill_internships").usable && (
              <ApplyWizard boot={wizardBoot} />
            )}
            {wizardBoot && !evaluateFeature(tier, "extension_autofill_internships").usable && (
              <Link
                href="/pricing?feature=extension_autofill_internships"
                className="btn press"
                style={{ textDecoration: "none" }}
              >
                🔒 autofill &amp; apply — Apply plan
              </Link>
            )}
            {user && (
              <Link
                href={`/listing/${item.id}/apply`}
                className="btn press"
                style={{ textDecoration: "none" }}
              >
                application packet
              </Link>
            )}
            {user && <TrackButton postingId={item.id} current={null} />}
          </div>
        </header>

        {item.applyLinkDead && (
          <section
            className="print-hide border"
            style={{ borderColor: "var(--accent)", padding: "14px 18px", marginBottom: 24 }}
          >
            <div className="mono-strong" style={{ color: "var(--accent)" }}>
              this apply link may be dead
            </div>
            <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "62ch" }}>
              We requested it twice and it answered &ldquo;not found&rdquo; both times. That is
              enough to warn you and not enough to hide the listing — a page can 404 for reasons
              that have nothing to do with whether the {item.kind === "scholarship" ? "award" : "role"}{" "}
              is open. Worth opening before you spend time on an application.
            </p>
          </section>
        )}

        <section
          className="print-hide border-y grid gap-x-8 gap-y-3 md:grid-cols-2"
          style={{ borderColor: "var(--line)", padding: "20px 0", marginBottom: 32 }}
        >
          {item.kind === "scholarship" ? (
            <>
              {amount ? (
                <MetaRow label="award" value={amount} />
              ) : (
                <MetaRow label="award" value={item.amountNeedsReview ? "unreadable" : "not stated"} />
              )}
              <MetaRow label="deadline" value={item.deadlineAt ? formatDate(item.deadlineAt) : "not stated"} />
              <MetaRow
                label="terms"
                value={item.term ? item.term : "not stated"}
              />
              {item.isContentMarketing && (
                <MetaRow label="type" value="content marketing — the sponsor markets themselves" />
              )}
            </>
          ) : (
            <>
              {item.term ? (
                <MetaRow label="term" value={item.term} />
              ) : (
                <MetaRow label="term" value="not stated" />
              )}
              {item.workAuth === "citizenship_required" && (
                <MetaRow label="work auth" value="U.S. citizenship required" />
              )}
              {item.workAuth === "no_sponsorship" && <MetaRow label="work auth" value="no sponsorship" />}
              {item.workAuth === "sponsorship_offered" && (
                <MetaRow label="work auth" value="sponsors visas" />
              )}
              <MetaRow label="deadline" value={item.deadlineAt ? formatDate(item.deadlineAt) : "not stated"} />
            </>
          )}
          <MetaRow
            label="confirmed"
            value={`${formatDate(item.lastSeenAt)}${item.closedAt ? ` · closed ${formatDate(item.closedAt)}` : ""}`}
          />
          {/* Attributed, and omitted rather than guessed. An absent posting
              date is not "posted a long time ago" — see POSTED_PLAUSIBLE_DAYS. */}
          <MetaRow
            label="posted"
            value={
              item.dates.posted
                ? item.dates.posted.replace(/^posted /, "")
                : "not stated by the source"
            }
          />
        </section>

        {/* A score with no reasons is a bug — the rule fit already follows.
            Timing was the one number here that had never explained itself. */}
        {!closed && item.timing.reasons.length > 0 && (
          <section className="print-hide" style={{ marginBottom: 24 }}>
            <details className="disclosure">
              <summary>why this timing</summary>
              <div className="disclosure-body">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {item.timing.reasons.map((r, i) => (
                    <span
                      key={i}
                      className="mono"
                      title={r.detail}
                      style={{
                        color: r.signal === "verification" ? "var(--faint-readable)" : "var(--accent)",
                        textDecoration: r.signal === "first_seen" ? "underline dotted" : "none",
                        textUnderlineOffset: "3px",
                      }}
                    >
                      {r.label}
                    </span>
                  ))}
                </div>
                <div className="mono" style={{ marginTop: 8, color: "var(--faint-readable)" }}>
                  built from {item.timing.knownSignals} of {item.timing.totalSignals} timing
                  signals — a stated deadline, a stated posting date, and when we last
                  re-checked the listing
                </div>
              </div>
            </details>
          </section>
        )}

        <section className="print-hide" style={{ marginBottom: 32 }}>
          <ScoreReasons
            reasons={presented.reasons}
            skills={presented.skills}
            hasResume={Boolean(resume)}
            roleSkills={presented.locked ? [] : item.skills}
          />
          {presented.locked && (
            <p className="mono" style={{ marginTop: 8, color: "var(--faint-readable)" }}>
              upgrade to {TIER_LABELS.apply} to see the full score, the factor breakdown, and what this role
              names that your resume does not
            </p>
          )}
        </section>

        {item.kind === "scholarship" && item.eligibility.length > 0 && (
          <section className="print-hide" style={{ marginBottom: 32 }}>
            <div className="eyebrow chrome" style={{ marginBottom: 8 }}>
              eligibility
            </div>
            <ul className="t-sm" style={{ paddingLeft: 18, color: "var(--text)" }}>
              {item.eligibility.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        )}

        <section id="cover-letter">
          <div className="eyebrow chrome print-hide" style={{ marginBottom: 12 }}>
            05 — cover letter
          </div>
          {user ? (
            <CoverLetterEditor
              postingId={item.id}
              kind={item.kind}
              initialDraft={letter}
              candidate={{
                name: resume ? (resume.parsed as { name?: string | null } | null)?.name ?? null : null,
                email: resume ? (resume.parsed as { email?: string | null } | null)?.email ?? null : null,
                phone: resume ? (resume.parsed as { phone?: string | null } | null)?.phone ?? null : null,
                portfolioUrl: stored?.portfolioUrl ?? null,
              }}
              hasResume={Boolean(resume)}
            />
          ) : (
            <div className="slot print-hide" style={{ padding: "14px 16px" }}>
              <span>
                <Link href={`/login?next=/listing/${item.id}`} style={{ color: "var(--accent)" }}>
                  sign in
                </Link>{" "}
                to draft a cover letter grounded in your resume
              </span>
            </div>
          )}
        </section>

        <section className="print-hide" style={{ marginTop: 40 }}>
          {user ? (
            <ReportListing postingId={item.id} alreadyReported={alreadyReported} />
          ) : (
            <span className="mono" style={{ color: "var(--faint-readable)" }}>
              <Link href={`/login?next=/listing/${item.id}`} style={{ color: "var(--accent)" }}>
                sign in
              </Link>{" "}
              to report a problem with this listing
            </span>
          )}
        </section>

        <footer className="mono print-hide" style={{ marginTop: 32, color: "var(--faint-readable)" }}>
          fit and timing are explainable heuristics, not win probabilities. we do not have
          outcome data yet, so we do not pretend to predict odds.
        </footer>
    </main>
  );
}
