import type { Finding, GitHubAudit } from "@/lib/github/audit";

/**
 * The audit panel.
 *
 * Same ordering rule as the resume critique: findings first, score second. What
 * to fix is the actionable part; the number is only context for it, and a panel
 * that leads with a grade invites the reader to feel judged and stop reading.
 *
 * Severity is carried by fill rather than hue — solid, ringed, faint — because
 * the design system allows one accent and colour alone is invisible to a
 * colourblind reader anyway.
 */

function SeverityPip({ severity }: { severity: Finding["severity"] }) {
  const style: React.CSSProperties =
    severity === "high"
      ? { background: "var(--accent)" }
      : severity === "medium"
        ? { boxShadow: "inset 0 0 0 1px var(--accent)" }
        : { boxShadow: "inset 0 0 0 1px var(--faint-readable)" };

  return (
    <span
      className="pip"
      style={{ ...style, marginTop: 6 }}
      aria-label={`${severity} priority`}
      role="img"
    />
  );
}

function relative(from: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - from.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AuditPanel({ audit }: { audit: GitHubAudit }) {
  return (
    <>
      <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
        <div
          className="flex flex-wrap items-baseline justify-between gap-3"
          style={{ marginBottom: 6 }}
        >
          <div className="eyebrow chrome">what a recruiter sees at github.com/{audit.username}</div>
          {audit.score !== null && (
            <div className="mono-strong" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>
              {audit.score}
              <span style={{ color: "var(--faint-readable)" }}>
                /100 · {audit.knownDimensions} of {audit.totalDimensions} checks
              </span>
            </div>
          )}
        </div>

        <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: 20 }}>
          Every number here was counted off a live response from GitHub&rsquo;s public API,
          fetched {relative(audit.fetchedAt)}. Nothing on this page is a guess about what some
          other tool would think of your profile.
        </p>

        {audit.findings.length > 0 ? (
          <div style={{ marginBottom: 22 }}>
            <div className="mono chrome" style={{ marginBottom: 10 }}>
              what to fix first
            </div>
            <ol style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {audit.findings.map((f, i) => (
                <li key={`${f.dimension}-${i}`} className="flex gap-3">
                  <SeverityPip severity={f.severity} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t-sm" style={{ color: "var(--text)", fontWeight: 500 }}>
                      <span className="mono chrome" style={{ color: "var(--faint-readable)" }}>
                        {f.section.replace(/_/g, " ")}
                      </span>{" "}
                      {f.title}
                    </div>
                    <div className="t-sm" style={{ color: "var(--muted)", marginTop: 3 }}>
                      {f.fix}
                    </div>
                    {f.evidence && (
                      <div
                        className="mono"
                        style={{
                          marginTop: 5,
                          paddingLeft: 10,
                          borderLeft: "1px solid var(--line-strong)",
                          color: "var(--faint-readable)",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {f.evidence}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="t-sm" style={{ color: "var(--system-ok)", marginBottom: 22 }}>
            Nothing to flag — every check we run came back clean.
          </p>
        )}

        <div className="mono chrome" style={{ marginBottom: 8 }}>
          what we counted
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {audit.dimensions.map((d) => (
            <div key={d.key} className="flex flex-wrap items-baseline gap-x-3">
              <span
                className="mono-strong"
                style={{
                  minWidth: "3.2em",
                  color: d.score === null ? "var(--faint-readable)" : "var(--text)",
                }}
              >
                {d.score === null ? "—" : d.score}
              </span>
              <span className="mono chrome" style={{ minWidth: "11em" }}>
                {d.label}
              </span>
              <span className="mono" style={{ color: "var(--faint-readable)" }}>
                {d.detail}
              </span>
            </div>
          ))}
        </div>

        {audit.skipped.length > 0 && (
          <div className="slot" style={{ marginTop: 16, padding: "12px 14px" }}>
            <span>
              {audit.skipped.join(" · ")} — those checks are left out of the score rather than
              counted against you.
            </span>
          </div>
        )}

        <p className="mono" style={{ marginTop: 16, color: "var(--faint-readable)" }}>
          your contribution graph is deliberately not scored. it is the one github metric
          recruiters have learned to discount, and grading it would be advice to farm green
          squares.
        </p>
      </section>

      {audit.recommendedPins.length > 0 && (
        <section style={{ border: "1px solid var(--line)", padding: 22, marginBottom: 28 }}>
          <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
            what to pin
          </div>
          <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: 16 }}>
            GitHub gives you six slots at the top of your profile. These are your best
            candidates, ranked by stars first — the only signal on the page that is not your own
            assertion — then by what you have touched most recently.{" "}
            <span style={{ color: "var(--faint-readable)" }}>
              We cannot see what you have pinned today: that is GraphQL-only and GraphQL requires
              a login, so this is a recommendation and never a grade.
            </span>
          </p>

          <ol style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {audit.recommendedPins.map((p, i) => (
              <li key={p.name} className="flex flex-wrap items-baseline gap-x-3">
                <span className="mono-strong" style={{ color: "var(--faint-readable)", minWidth: "1.5em" }}>
                  {i + 1}
                </span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono-strong press"
                  style={{ color: "var(--accent)" }}
                >
                  {p.name}
                </a>
                <span className="mono" style={{ color: "var(--faint-readable)" }}>
                  {p.reason}
                </span>
                {p.gaps.length > 0 && (
                  <span className="mono" style={{ color: "var(--accent-lite)" }}>
                    · fix first: {p.gaps.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
