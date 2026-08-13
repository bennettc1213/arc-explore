import type { ApplicationStatus } from "@/db/schema";
import type { FeedItem } from "@/lib/feed";

import { TrackButton } from "./TrackButton";

/**
 * One posting in the feed.
 *
 * Design notes tied to the system in docs/design-system.md:
 *  - Company and job titles are rendered as authored. The lowercase treatment
 *    is chrome-only; lowercasing "Goldman Sachs" would look broken.
 *  - Unknown values render as a dashed honest slot, never as a guess.
 *  - Closed postings recede via surface + opacity rather than a second hue,
 *    honouring the one-accent rule.
 */

function ScorePill({
  label,
  value,
  known,
  total,
}: {
  label: string;
  value: number | null;
  /** Dimensions that contributed. Omitted for scores with no such notion. */
  known?: number;
  total?: number;
}) {
  // "not enough info" is a real, honest answer — better than a fake number.
  if (value === null) {
    return (
      <div className="slot" title="Not enough information to score this yet">
        <span>{label} —</span>
      </div>
    );
  }

  // A score built on fewer known dimensions is a weaker claim, so it is not
  // allowed to look as loud as a fully-informed one.
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
      <span
        className="mono-strong"
        style={{ color: strong ? "var(--accent)" : "var(--text)", fontSize: "0.9rem" }}
      >
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

export function PostingRow({
  item,
  tracked,
  signedIn,
  hasResume,
}: {
  item: FeedItem;
  /** This user's application status for the posting, if they have one. */
  tracked?: ApplicationStatus | null;
  signedIn?: boolean;
  /** Changes how the skills gap is worded — see below. */
  hasResume?: boolean;
}) {
  const closed = Boolean(item.closedAt);
  const blocked = item.fit.blocked;
  const hasSkillData =
    item.fit.skills.matched.length > 0 || item.fit.skills.missing.length > 0;

  return (
    <article
      className={`border-b ${closed || blocked ? "is-closed" : ""}`}
      style={{ borderColor: "var(--line)", padding: "18px 0" }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={closed || blocked ? "pip pip-closed" : "pip pip-live"} aria-hidden />
            <span className="mono">{item.timing.liveness}</span>
            {blocked && !closed && (
              <span className="mono" style={{ color: "var(--accent-lite)" }}>
                · you are not eligible
              </span>
            )}
            {item.timing.label === "new today" && !closed && (
              <span className="mono" style={{ color: "var(--accent)" }}>
                · {item.timing.label}
              </span>
            )}
          </div>

          {/* Employer-authored text — never transformed. */}
          <h3 className="t-base" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="press"
              style={{ color: "var(--text)", textDecoration: "none" }}
            >
              {item.title}
            </a>
          </h3>

          <div className="t-sm mt-1" style={{ color: "var(--muted)" }}>
            {item.company}
            {item.locations.length > 0 && (
              <> · {item.locations.slice(0, 3).join(" / ")}</>
            )}
            {item.isRemote && <> · remote</>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.term ? (
              <span className="mono" style={{ color: "var(--faint-readable)" }}>
                {item.term}
              </span>
            ) : (
              <span className="slot" style={{ padding: "3px 8px" }}>
                term not stated
              </span>
            )}

            {item.workAuth === "citizenship_required" && (
              <span className="mono" style={{ color: "var(--accent-lite)" }}>
                U.S. citizenship required
              </span>
            )}
            {item.workAuth === "no_sponsorship" && (
              <span className="mono" style={{ color: "var(--accent-lite)" }}>
                no sponsorship
              </span>
            )}
            {item.workAuth === "sponsorship_offered" && (
              <span className="mono" style={{ color: "var(--accent-lite)" }}>
                sponsors visas
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ScorePill
            label="fit"
            value={item.fit.score}
            known={item.fit.knownDimensions}
            total={item.fit.totalDimensions}
          />
          <ScorePill label="timing" value={closed ? null : item.timing.score} />
          {signedIn && <TrackButton postingId={item.id} current={tracked ?? null} />}
        </div>
      </div>

      {/*
        The keyword gap. Everything else on this row explains a number; this is
        the one part that tells a student what to actually do next.
      */}
      {hasSkillData && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {item.fit.skills.matched.length > 0 && (
            <span className="mono" style={{ color: "var(--accent)" }}>
              you have: {item.fit.skills.matched.join(" · ")}
            </span>
          )}
          {item.fit.skills.missing.length > 0 && (
            <span className="mono" style={{ color: "var(--faint-readable)" }}>
              {/* Without a resume there is nothing to be missing *from* —
                  saying so would imply a judgement we have not made. */}
              {hasResume ? "not on your resume: " : "this role names: "}
              {item.fit.skills.missing.join(" · ")}
            </span>
          )}
        </div>
      )}

      {/* Every score is explained. A number with no reasons would be a bug.
          The skills reason is omitted when the gap line above already says it
          in more detail — the same fact twice reads as noise. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {item.fit.reasons
          .filter((r) => !(hasSkillData && r.dimension === "skills"))
          .map((r, i) => (
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
    </article>
  );
}
