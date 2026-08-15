"use client";

import { useMemo, useState } from "react";

import { reviewEssay, type Finding } from "@/lib/essay/review";
import {
  EMPTY_ESSAY_INPUT,
  MAX_ESSAY_CHARS,
  MAX_PROMPT_CHARS,
  type EssayInput,
} from "@/lib/essay/types";

/**
 * The essay reviewer.
 *
 * A client component, and the scoring functions it calls are pure — no
 * database, no network, no import that reaches either. **The essay never leaves
 * this browser tab.** There is no endpoint that takes one.
 *
 * That is not a nice-to-have here. A scholarship essay is frequently about the
 * hardest thing that has happened to someone, and shipping it to an API to be
 * graded is a thing we would have to justify. We cannot justify it for feedback
 * we can produce without it.
 */

function SeverityPip({ severity }: { severity: Finding["severity"] }) {
  const style: React.CSSProperties =
    severity === "high"
      ? { background: "var(--accent)" }
      : severity === "medium"
        ? { boxShadow: "inset 0 0 0 1px var(--accent)" }
        : { boxShadow: "inset 0 0 0 1px var(--faint-readable)" };

  return <span className="pip" style={{ ...style, marginTop: 6 }} aria-label={`${severity} priority`} role="img" />;
}

const fieldStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--line-strong)",
  color: "var(--text)",
  padding: "10px 12px",
  font: "inherit",
  width: "100%",
};

export function EssayReviewer() {
  const [input, setInput] = useState<EssayInput>(EMPTY_ESSAY_INPUT);
  const set = <K extends keyof EssayInput>(key: K, value: EssayInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const review = useMemo(() => reviewEssay(input), [input]);
  const started = input.essay.trim().length > 0;

  return (
    <>
      <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span className="mono chrome" style={{ display: "block", marginBottom: 6 }}>
            the prompt — paste it exactly as the application words it
          </span>
          <textarea
            value={input.prompt}
            onChange={(e) => set("prompt", e.target.value.slice(0, MAX_PROMPT_CHARS))}
            rows={3}
            placeholder="Describe a challenge you have overcome and what you learned from it."
            style={{ ...fieldStyle, resize: "vertical" }}
          />
          <span className="mono" style={{ display: "block", marginTop: 4, color: "var(--faint-readable)" }}>
            without this we cannot tell whether the essay answers the question — the check most
            worth running
          </span>
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span className="mono chrome" style={{ display: "block", marginBottom: 6 }}>
            your essay
          </span>
          <textarea
            value={input.essay}
            onChange={(e) => set("essay", e.target.value.slice(0, MAX_ESSAY_CHARS))}
            rows={16}
            placeholder="paste the draft you are working on"
            style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
          />
          <span className="mono" style={{ display: "block", marginTop: 4, color: "var(--faint-readable)" }}>
            {review.words} words
          </span>
        </label>

        <label style={{ display: "block" }}>
          <span className="mono chrome" style={{ display: "block", marginBottom: 6 }}>
            word limit — leave blank if the application does not state one
          </span>
          <input
            type="number"
            min={1}
            max={20000}
            value={input.wordLimit ?? ""}
            onChange={(e) => set("wordLimit", e.target.value === "" ? null : Number(e.target.value))}
            style={{ ...fieldStyle, maxWidth: 160 }}
          />
        </label>
      </section>

      {started && (
        <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
          <div
            className="flex flex-wrap items-baseline justify-between gap-3"
            style={{ marginBottom: 16 }}
          >
            <div className="eyebrow chrome">what to fix first</div>
            {review.score !== null && (
              <div className="mono-strong" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>
                {review.score}
                <span style={{ color: "var(--faint-readable)" }}>
                  /100 · {review.knownDimensions} of {review.totalDimensions} checks
                </span>
              </div>
            )}
          </div>

          {review.findings.length > 0 ? (
            <ol style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
              {review.findings.map((f, i) => (
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
          ) : (
            <p className="t-sm" style={{ color: "var(--system-ok)", marginBottom: 22 }}>
              Nothing to flag — every check we run came back clean. That is not the same as it
              being finished; see the note at the bottom of the page.
            </p>
          )}

          <div className="mono chrome" style={{ marginBottom: 8 }}>
            what we counted
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {review.dimensions.map((d) => (
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
                <span className="mono chrome" style={{ minWidth: "12em" }}>
                  {d.label}
                </span>
                <span className="mono" style={{ color: "var(--faint-readable)" }}>
                  {d.detail}
                </span>
              </div>
            ))}
          </div>

          {review.missingTerms.length > 0 && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 18, paddingTop: 16 }}>
              <div className="mono chrome" style={{ marginBottom: 8 }}>
                from the prompt, not found in your essay
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ marginBottom: 8 }}>
                {review.missingTerms.map((t) => (
                  <span key={t} className="mono" style={{ color: "var(--accent-lite)" }}>
                    {t}
                  </span>
                ))}
              </div>
              <p className="mono" style={{ color: "var(--faint-readable)" }}>
                we match words, not meaning — you may have covered &ldquo;leadership&rdquo; by
                describing what you did as captain. worth two seconds each.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
