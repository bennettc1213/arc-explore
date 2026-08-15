import Link from "next/link";
import { notFound } from "next/navigation";

import { CoverLetterEditor } from "@/components/CoverLetterEditor";
import { TrackButton } from "@/components/TrackButton";
import { getSessionUser } from "@/lib/auth";
import { getCoverLetter } from "@/lib/cover-letter/store";
import { getPosting } from "@/lib/feed";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { toScoreProfile } from "@/lib/profile/types";
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

function livenessLabel(item: Awaited<ReturnType<typeof getPosting>> extends infer T
  ? NonNullable<T>
  : never) {
  if (item.closedAt) return item.timing.liveness;
  if (item.freshnessTier === "periodic_check") {
    return `checked as of ${formatDate(item.lastSeenAt)}`;
  }
  if (item.freshnessTier === "unverified_static") {
    return `imported ${formatDate(item.lastSeenAt)}, not re-checked`;
  }
  return item.timing.liveness;
}

function ScoreBox({
  label,
  value,
  known,
  total,
}: {
  label: string;
  value: number | null;
  known?: number;
  total?: number;
}) {
  if (value === null) {
    return (
      <div className="slot">
        <span className="mono">
          {label} — not enough info
        </span>
      </div>
    );
  }
  const partial = known !== undefined && total !== undefined && known < total;
  const strong = value >= 70 && !partial;
  return (
    <div
      className="flex items-baseline gap-2 border px-3 py-2"
      style={{
        borderColor: strong ? "var(--accent)" : "var(--line-strong)",
        background: strong ? "var(--accent-dim)" : "transparent",
      }}
      title={
        partial
          ? `Based on ${known} of ${total} factors — the rest are not stated in this posting.`
          : undefined
      }
    >
      <span className="mono">{label}</span>
      <span className="mono-strong" style={{ color: strong ? "var(--accent)" : "var(--text)" }}>
        {value}
      </span>
      {partial && (
        <span className="mono" style={{ color: "var(--faint-readable)" }}>
          {known}/{total}
        </span>
      )}
    </div>
  );
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

  const letter = user ? await getCoverLetter(user.id, id) : null;

  const closed = Boolean(item.closedAt);
  const blocked = item.fit.blocked;
  const amount = item.kind === "scholarship" ? formatAmount(item.amountMin, item.amountMax) : null;

  return (
    <main className="wrap" style={{ paddingBlock: "40px 96px" }}>
      <div className="print-hide" style={{ marginBottom: 32 }}>
        <Link
          href="/"
          className="mono press"
          style={{ color: "var(--accent)", textDecoration: "none" }}
        >
          ← back to feed
        </Link>
      </div>

      <header className="print-hide" style={{ marginBottom: 24 }}>
          <div className="eyebrow chrome">04 — opportunity</div>
          <div className="flex flex-wrap items-start justify-between gap-6">
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
                <span className="mono" style={{ color: "var(--faint-readable)" }}>
                  {livenessLabel(item)}
                </span>
                {blocked && !closed && (
                  <span className="mono" style={{ color: "var(--accent-lite)" }}>
                    · you are not eligible
                  </span>
                )}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn press"
                  style={{ textDecoration: "none" }}
                >
                  apply on {item.kind === "scholarship" ? "the sponsor's site" : "the employer's site"} ↗
                </a>
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
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ScoreBox
                label="fit"
                value={item.fit.score}
                known={item.fit.knownDimensions}
                total={item.fit.totalDimensions}
              />
              <ScoreBox label="timing" value={closed ? null : item.timing.score} />
            </div>
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
        </section>

        {item.fit.reasons.length > 0 && (
          <section className="print-hide" style={{ marginBottom: 32 }}>
            <div className="eyebrow chrome" style={{ marginBottom: 8 }}>
              why this score
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {item.fit.reasons.map((r, i) => (
                <span
                  key={i}
                  className="mono"
                  title={r.detail}
                  style={{
                    color: r.kind === "good" ? "var(--accent)" : "var(--faint-readable)",
                    textDecoration: r.kind === "unknown" ? "underline dotted" : "none",
                    textUnderlineOffset: "3px",
                  }}
                >
                  {r.kind === "good" ? "+" : r.kind === "bad" ? "−" : "?"} {r.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {item.skills.length > 0 && (
          <section className="print-hide" style={{ marginBottom: 32 }}>
            <div className="eyebrow chrome" style={{ marginBottom: 8 }}>
              skills this role names
            </div>
            <div className="flex flex-wrap gap-2">
              {item.skills.map((s) => (
                <span key={s} className="mono" style={{ color: "var(--text)" }}>
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

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

        <section>
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

        <footer className="mono print-hide" style={{ marginTop: 48, color: "var(--faint-readable)" }}>
          fit and timing are explainable heuristics, not win probabilities. we do not have
          outcome data yet, so we do not pretend to predict odds.
        </footer>
    </main>
  );
}
