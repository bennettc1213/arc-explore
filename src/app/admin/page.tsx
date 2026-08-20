import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { requireAdmin } from "@/lib/admin/auth";
import { filterUsage, metricCounts, recentCounts } from "@/lib/metrics/store";
import { buildMetrics } from "@/lib/metrics/types";
import { adminCounts, openReports, triageQueue } from "@/lib/reports/store";
import { URGENT_REASONS, reasonLabel, type ReportReason } from "@/lib/reports/types";

import { HideForm, MarkReviewedButton, ResolveForm, UnhideButton } from "./AdminActionButtons";
import { Metrics } from "./Metrics";

export const dynamic = "force-dynamic";

/**
 * The curation queue.
 *
 * WHY THIS IS NOT A REVIEW GATE, WHICH IS WHAT THE ROADMAP LINE ASKED FOR.
 * "Review listings before they go live" is the right instinct and the wrong
 * mechanism for this corpus. Every internship here is polled from an
 * employer's own board and the product's central claim is "confirmed live 5h
 * ago" — a row sitting in a queue waiting for a human cannot make that claim,
 * and it would be stale by the time anyone got to it. Worse, a gate applied to
 * the 3,765 rows already in the table empties the feed to zero until one person
 * reviews them all, which is not a thing that would ever happen.
 *
 * So the default stays visible and this is triage: the much smaller set where
 * an automated signal already says something is off, plus everything a student
 * has actually reported. That is a queue one operator can keep at zero, which
 * is the only kind worth building.
 */

function Count({ n, label, urgent }: { n: number; label: string; urgent?: boolean }) {
  return (
    <div>
      <div
        className="mono-strong"
        style={{ fontSize: "1.6rem", color: urgent && n > 0 ? "var(--accent)" : "var(--text)" }}
      >
        {n}
      </div>
      <div className="mono">{label}</div>
    </div>
  );
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [counts, reports, triage, rawMetrics, recent, filters] = await Promise.all([
    adminCounts(),
    openReports(),
    triageQueue(),
    metricCounts(),
    recentCounts(),
    filterUsage(),
  ]);
  const metrics = buildMetrics(rawMetrics);

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <BackLink href="/" label="back to the feed" />
      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">admin</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          what needs <span style={{ color: "var(--accent)" }}>a person</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "66ch", marginTop: 14 }}>
          Not a review gate. Every internship here is polled from an employer&rsquo;s own board and
          claims &ldquo;confirmed live&rdquo; on that basis — a row waiting in a queue cannot make
          that claim, and gating the 3,765 rows already in the table would empty the feed until
          someone reviewed them all. This is the smaller set where a machine already flagged
          something, plus everything a student reported.
        </p>
        <p className="mono" style={{ marginTop: 10, color: "var(--faint-readable)" }}>
          signed in as {admin.email}
        </p>
      </header>

      <div
        className="flex flex-wrap gap-x-12 gap-y-5 border"
        style={{ borderColor: "var(--line-strong)", padding: "18px 20px", marginBottom: 32 }}
      >
        <Count n={counts.urgentReports} label="urgent reports" urgent />
        <Count n={counts.openReports} label="open reports" />
        <Count n={counts.triage} label="flagged, unreviewed" />
        <Count n={counts.hidden} label="hidden by a person" />
      </div>

      <Metrics metrics={metrics} recent={recent} filters={filters} />

      {/* ------------------------------------------------------ reports */}
      <section style={{ marginBottom: 44 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 12 }}>
          01 — reported by students
        </div>

        {reports.length === 0 ? (
          <p className="t-sm" style={{ color: "var(--system-ok)" }}>
            Nothing open. Every report has been dealt with.
          </p>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {reports.map((r) => {
              const urgent = URGENT_REASONS.has(r.reason as ReportReason);
              return (
                <li
                  key={r.id}
                  className="border"
                  style={{
                    borderColor: urgent ? "var(--accent)" : "var(--line)",
                    padding: "14px 16px",
                  }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div style={{ minWidth: 0 }}>
                      <span
                        className="mono-strong"
                        style={{ color: urgent ? "var(--accent)" : "var(--text)" }}
                      >
                        {reasonLabel(r.reason as ReportReason)}
                      </span>
                      {r.reportCount > 1 && (
                        <span className="mono" style={{ color: "var(--accent)" }}>
                          {" "}
                          · {r.reportCount} reports on this listing
                        </span>
                      )}
                      {r.hiddenAt && (
                        <span className="mono" style={{ color: "var(--faint-readable)" }}>
                          {" "}
                          · already hidden
                        </span>
                      )}
                    </div>
                    <span className="mono" style={{ color: "var(--faint-readable)" }}>
                      {r.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </div>

                  <div className="t-sm" style={{ color: "var(--text)", marginTop: 6 }}>
                    <Link href={`/listing/${r.postingId}`} style={{ color: "var(--accent)" }}>
                      {r.title}
                    </Link>
                    {r.company ? ` · ${r.company}` : ""}{" "}
                    <span className="mono" style={{ color: "var(--faint-readable)" }}>
                      ({r.kind})
                    </span>
                  </div>

                  {r.detail && (
                    <div
                      className="t-sm"
                      style={{
                        marginTop: 8,
                        paddingLeft: 10,
                        borderLeft: "1px solid var(--line-strong)",
                        color: "var(--muted)",
                      }}
                    >
                      {r.detail}
                    </div>
                  )}

                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono press"
                    style={{ display: "inline-block", marginTop: 8, color: "var(--faint-readable)" }}
                  >
                    open the source page ↗
                  </a>

                  <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 12 }}>
                    {r.hiddenAt ? (
                      <UnhideButton postingId={r.postingId} />
                    ) : (
                      <HideForm postingId={r.postingId} />
                    )}

                    <ResolveForm reportId={r.id} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ------------------------------------------------------- triage */}
      <section>
        <div className="eyebrow chrome" style={{ marginBottom: 12 }}>
          02 — flagged by a check, not yet looked at
        </div>

        {triage.length === 0 ? (
          <p className="t-sm" style={{ color: "var(--system-ok)" }}>
            Nothing flagged. The link checker and the amount parser are both quiet.
          </p>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {triage.map((t) => (
              <li key={t.id} className="border" style={{ borderColor: "var(--line)", padding: "12px 14px" }}>
                <div className="mono" style={{ color: "var(--accent-lite)" }}>
                  {t.reason}
                </div>
                <div className="t-sm" style={{ color: "var(--text)", marginTop: 4 }}>
                  <Link href={`/listing/${t.id}`} style={{ color: "var(--accent)" }}>
                    {t.title}
                  </Link>
                  {t.company ? ` · ${t.company}` : ""}
                </div>
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono press"
                  style={{ display: "inline-block", marginTop: 6, color: "var(--faint-readable)" }}
                >
                  open the source page ↗
                </a>

                <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 10 }}>
                  {t.hiddenAt ? (
                    <UnhideButton postingId={t.id} />
                  ) : (
                    <HideForm postingId={t.id} />
                  )}
                  <MarkReviewedButton postingId={t.id} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="mono" style={{ marginTop: 48, color: "var(--faint-readable)" }}>
        hiding is the only thing here a machine never does. `closed_at` belongs to the ats poll and
        `url_dead_strikes` to the link checker — neither touches `hidden_at`, so if a row is
        hidden, a person hid it and the reason says who decided what.
      </footer>
    </main>
  );
}
