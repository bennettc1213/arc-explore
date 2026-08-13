import type { Critique, Finding } from "@/lib/resume/critique";

/**
 * The critique panel.
 *
 * Ordered deliberately: the findings come before the dimension scores, because
 * "what to fix first" is the thing a student can act on and the number is only
 * context for it. A panel that leads with a grade invites the reader to feel
 * judged and stop there.
 *
 * Severity is carried by fill, not hue — a solid square, a ringed square, a
 * faint one. The design system allows exactly one accent, and colour alone
 * would be invisible to a colourblind reader anyway.
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

export function ResumeCritique({ critique }: { critique: Critique }) {
  const { score, dimensions, findings } = critique;

  return (
    <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3" style={{ marginBottom: 6 }}>
        <div className="eyebrow chrome">how your resume reads to a machine</div>
        {score !== null && (
          <div className="mono-strong" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>
            {score}
            <span style={{ color: "var(--faint-readable)" }}>
              /100 · {critique.knownDimensions} of {critique.totalDimensions} checks
            </span>
          </div>
        )}
      </div>

      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "62ch", marginBottom: 20 }}>
        We just parsed this document ourselves, so this is not a guess about some other
        company&rsquo;s software — it is what a machine actually got out of your file. We
        cannot see your layout by this point, only what survived it.
      </p>

      {findings.length > 0 ? (
        <div style={{ marginBottom: 22 }}>
          <div className="mono chrome" style={{ marginBottom: 10 }}>
            what to fix first
          </div>
          <ol style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {findings.map((f, i) => (
              <li key={`${f.dimension}-${i}`} className="flex gap-3">
                <SeverityPip severity={f.severity} />
                <div style={{ minWidth: 0 }}>
                  <div className="t-sm" style={{ color: "var(--text)", fontWeight: 500 }}>
                    <span className="mono chrome" style={{ color: "var(--faint-readable)" }}>
                      {f.section}
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
        {dimensions.map((d) => (
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

      <p className="mono" style={{ marginTop: 16, color: "var(--faint-readable)" }}>
        a check with nothing to look at shows &ldquo;—&rdquo; and is left out of the score
        rather than counted against you.
      </p>
    </section>
  );
}
