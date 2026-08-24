"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { checkLinkedIn, type Finding } from "@/lib/linkedin/check";
import {
  ABOUT_MAX,
  EMPTY_LINKEDIN_INPUT,
  HEADLINE_MAX,
  parseSkillList,
  type LinkedInInput,
} from "@/lib/linkedin/types";
import { canonicalSkill } from "@/lib/score/skills";

import { consumeLinkedInCheckAction } from "./actions";

/**
 * The LinkedIn checker.
 *
 * TWO THINGS ARE DELIBERATE ABOUT WHERE THIS RUNS.
 *
 * It is a client component, and the scoring functions it calls are pure — no
 * database, no network, no imports that reach either. So **the profile text a
 * student pastes here never leaves their browser.** There is no endpoint to
 * post it to and no request that carries it. For a tool whose entire premise is
 * "we do not fetch your LinkedIn", quietly uploading the same text to be scored
 * would be the same violation wearing a different hat.
 *
 * The corpus side of the skills comparison is therefore passed *down* as a
 * prop, already computed on the server from open postings. That gives the same
 * answer as sending their skills up to be compared, without sending anything.
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span className="mono chrome" style={{ display: "block", marginBottom: 6 }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="mono" style={{ display: "block", marginTop: 4, color: "var(--faint-readable)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function LinkedInChecker({
  demand,
}: {
  /** Skills open internships ask for most, computed server-side. */
  demand: Array<{ skill: string; postings: number }>;
}) {
  const [input, setInput] = useState<LinkedInInput>(EMPTY_LINKEDIN_INPUT);
  const set = <K extends keyof LinkedInInput>(key: K, value: LinkedInInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const touched =
    input.headline.trim().length > 0 ||
    input.about.trim().length > 0 ||
    input.experience.trim().length > 0 ||
    input.skills.trim().length > 0 ||
    input.recommendations !== null;

  // Marks one use of the free tier's quota the first time this goes from
  // empty to non-empty — not on page load (viewing an empty form is not a
  // "run") and not on every keystroke (typing is not repeated runs). The
  // action carries no content; see its own comment for why. `firedRef`
  // rather than the returned `{usable}` gating anything further: the page
  // already decided this account could start before rendering the form at
  // all (see linkedin/page.tsx), so there is nothing left to block here —
  // this only records that the one allowed run happened.
  const firedRef = useRef(false);
  useEffect(() => {
    if (touched && !firedRef.current) {
      firedRef.current = true;
      void consumeLinkedInCheckAction();
    }
  }, [touched]);

  const check = useMemo(() => checkLinkedIn(input), [input]);

  /*
   * Which in-demand skills the pasted list is missing.
   *
   * Canonicalised on both sides so "js" on their profile matches "JavaScript"
   * in the corpus — reporting a gap they do not actually have would make every
   * other number here suspect.
   */
  const missingDemand = useMemo(() => {
    const listed = new Set(
      parseSkillList(input.skills)
        .map((s) => canonicalSkill(s))
        .filter((s): s is string => s !== null),
    );
    return demand.filter((d) => !listed.has(d.skill));
  }, [input.skills, demand]);

  return (
    <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
      <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
        check what you have
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: 20 }}>
        Paste each section from your profile. Scoring happens in this browser tab —{" "}
        <span style={{ color: "var(--text)" }}>none of this text is sent anywhere</span>, there is
        no request that carries it, and nothing is stored. We never fetch a LinkedIn profile, and
        uploading the same text to score it would be that rule wearing a different hat.
      </p>

      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <Field label="headline" hint={`${input.headline.trim().length} / ${HEADLINE_MAX} characters`}>
            <input
              type="text"
              value={input.headline}
              onChange={(e) => set("headline", e.target.value)}
              placeholder="the line under your name"
              style={fieldStyle}
              spellCheck={false}
            />
          </Field>

          <Field label="about" hint={`${input.about.trim().length} / ${ABOUT_MAX} characters`}>
            <textarea
              value={input.about}
              onChange={(e) => set("about", e.target.value)}
              rows={8}
              placeholder="your About section, as it appears now"
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </Field>
        </div>

        <div>
          <Field label="experience bullets" hint="one per line, from any role">
            <textarea
              value={input.experience}
              onChange={(e) => set("experience", e.target.value)}
              rows={6}
              placeholder={"Built …\nAutomated …"}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </Field>

          <Field label="skills" hint="comma separated, as listed on your profile">
            <textarea
              value={input.skills}
              onChange={(e) => set("skills", e.target.value)}
              rows={3}
              placeholder="Python, SQL, React…"
              style={{ ...fieldStyle, resize: "vertical" }}
              spellCheck={false}
            />
          </Field>

          <Field label="recommendations" hint="how many are on your profile — leave blank if you would rather not say">
            <input
              type="number"
              min={0}
              max={999}
              value={input.recommendations ?? ""}
              onChange={(e) =>
                set("recommendations", e.target.value === "" ? null : Number(e.target.value))
              }
              style={{ ...fieldStyle, maxWidth: 140 }}
            />
          </Field>
        </div>
      </div>

      {!touched ? (
        <div className="slot" style={{ padding: "14px 16px", marginTop: 8 }}>
          <span>The score appears as you type. Start with the headline — it is the field that
          moves it most.</span>
        </div>
      ) : (
        <>
          <div
            className="flex flex-wrap items-baseline justify-between gap-3 border-t"
            style={{ borderColor: "var(--line)", paddingTop: 18, marginTop: 8, marginBottom: 16 }}
          >
            <div className="mono chrome">what to fix first</div>
            {check.score !== null && (
              <div className="mono-strong" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>
                {check.score}
                <span style={{ color: "var(--faint-readable)" }}>
                  /100 · {check.knownDimensions} of {check.totalDimensions} sections
                </span>
              </div>
            )}
          </div>

          {check.findings.length > 0 ? (
            <ol style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
              {check.findings.map((f, i) => (
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
              Nothing to flag in what you have pasted so far.
            </p>
          )}

          <div className="mono chrome" style={{ marginBottom: 8 }}>
            what we counted
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 20 }}>
            {check.dimensions.map((d) => (
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

          {input.skills.trim().length > 0 && demand.length > 0 && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              <div className="mono chrome" style={{ marginBottom: 8 }}>
                skills alignment
              </div>
              {missingDemand.length === 0 ? (
                <p className="t-sm" style={{ color: "var(--system-ok)" }}>
                  Your list covers every skill the open internships in our corpus ask for most.
                </p>
              ) : (
                <>
                  <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "62ch", marginBottom: 10 }}>
                    Counted across open internships in our own corpus, not a generic list of hot
                    skills. Add the ones you would actually defend in an interview — recruiter
                    search matches this list directly.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {missingDemand.map((d) => (
                      <span key={d.skill} className="mono" style={{ color: "var(--faint-readable)" }}>
                        <span style={{ color: "var(--accent-lite)" }}>{d.skill}</span> · {d.postings}{" "}
                        {d.postings === 1 ? "role" : "roles"}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      <p className="mono" style={{ marginTop: 20, color: "var(--faint-readable)" }}>
        the honest limit: this scores the text you pasted. the github audit can say &ldquo;we
        fetched your profile and there is no readme&rdquo; — this can only say &ldquo;the text you
        gave us has no numbers in it&rdquo;. that is the cost of never touching linkedin, and it is
        still the right trade.
      </p>
    </section>
  );
}
