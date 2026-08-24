import type { ScoreReason } from "@/lib/score/fit";

/**
 * The "why this score" detail — the keyword gap plus the full reasons
 * breakdown, collapsed behind a native <details> so a scored row leads with
 * its score and confidence fraction (never hidden, see ScoreBadge) rather
 * than the ~10 text fragments that used to sit below it unconditionally.
 *
 * Also the single definition for the skills reason: it is dropped from the
 * chip row whenever the matched/missing line above already says it, so the
 * same fact is never shown twice in one disclosure — the listing detail page
 * used to show it a third time in its own "skills this role names" section;
 * `roleSkills` folds that in here instead of repeating it as a separate,
 * always-visible page section.
 */
export function ScoreReasons({
  reasons,
  skills,
  hasResume,
  roleSkills,
}: {
  reasons: ScoreReason[];
  skills: { matched: string[]; missing: string[] };
  hasResume?: boolean;
  /** Full extracted skill list for the role — listing page only. */
  roleSkills?: string[];
}) {
  const hasSkillData = skills.matched.length > 0 || skills.missing.length > 0;
  const visibleReasons = reasons.filter((r) => !(hasSkillData && r.dimension === "skills"));

  if (visibleReasons.length === 0 && !hasSkillData && !roleSkills?.length) {
    return null;
  }

  return (
    <details className="disclosure">
      <summary>why this score</summary>
      <div className="disclosure-body">
        {hasSkillData && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {skills.matched.length > 0 && (
              <span className="mono" style={{ color: "var(--accent)" }}>
                you have: {skills.matched.join(" · ")}
              </span>
            )}
            {skills.missing.length > 0 && (
              <span className="mono" style={{ color: "var(--faint-readable)" }}>
                {/* Without a resume there is nothing to be missing *from* —
                    saying so would imply a judgement we have not made. */}
                {hasResume ? "not on your resume: " : "this role names: "}
                {skills.missing.join(" · ")}
              </span>
            )}
          </div>
        )}

        {visibleReasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {visibleReasons.map((r, i) => (
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
        )}

        {roleSkills && roleSkills.length > 0 && (
          <div className="mt-2 mono" style={{ color: "var(--faint-readable)" }}>
            role also names: {roleSkills.join(" · ")}
          </div>
        )}
      </div>
    </details>
  );
}
