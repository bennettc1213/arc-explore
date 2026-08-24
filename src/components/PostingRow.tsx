import type { ApplicationStatus } from "@/db/schema";
import type { FeedItem } from "@/lib/feed";
// From the pure module, not `entitlements` — a row needs the presentation
// rule, not a database connection.
import { presentFit, type TierId } from "@/lib/pricing/tiers";

import { RowLink } from "./RowLink";
import { ScoreBadge } from "./ScoreBadge";
import { ScoreReasons } from "./ScoreReasons";
import { TrackButton } from "./TrackButton";

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

/**
 * Which timing labels earn the accent.
 *
 * A closing date and an employer-stated recent posting are both things the
 * student can act on. "found today" is not — it says our crawler arrived,
 * which is a fact about us, and accenting it would dress up ingest activity
 * as opportunity freshness. That is the same overclaim the label rewrite in
 * `score/timing.ts` exists to stop.
 */
const URGENT_LABEL = /^(closes|posted today|posted yesterday)/;

/**
 * One posting in the feed.
 *
 * Design notes tied to the system in docs/design-system.md:
 *  - Company and job titles are rendered as authored. The lowercase treatment
 *    is chrome-only; lowercasing "Goldman Sachs" would look broken.
 *  - Unknown values render as a dashed honest slot, never as a guess.
 *  - Closed postings recede via surface + opacity rather than a second hue,
 *    honouring the one-accent rule.
 *
 * ── THE WHOLE ROW IS THE TARGET ─────────────────────────────────────────────
 *
 * It used to be that only the title *text* linked to the detail page, which in
 * a ~200px-tall row meant a student had to find and hit one short string. That
 * was reported plainly as having to "click in an exact spot", and it is the
 * kind of thing that reads as the app being slow when it is really the app
 * being hard to hit.
 *
 * So the title link is stretched over the row with `.row-target::after`, and
 * the genuinely separate actions inside it — the external "apply ↗", the score
 * badges, the track button, the "why this score" disclosure — are lifted back
 * above it with `.row-raise`. A plain `onClick` on the article would have been
 * fewer lines and strictly worse: it is not focusable, has no href for the
 * status bar, and breaks middle-click, ⌘-click and "open in new tab", which is
 * exactly how someone shortlists six internships.
 *
 * The known cost is that dragging to select text inside the row now starts the
 * link's drag instead. That is the accepted trade of this pattern; the row is a
 * navigation surface, and the detail page is where text is meant to be read.
 */

export function PostingRow({
  item,
  tracked,
  signedIn,
  hasResume,
  tier = "free",
}: {
  item: FeedItem;
  /** This user's application status for the posting, if they have one. */
  tracked?: ApplicationStatus | null;
  signedIn?: boolean;
  /** Changes how the skills gap is worded — see below. */
  hasResume?: boolean;
  /** Viewer's pricing tier — defaults to the most restrictive, never the
   *  most permissive, for a caller that forgets to pass it. */
  tier?: TierId;
}) {
  const closed = Boolean(item.closedAt);
  const blocked = item.fit.blocked;
  const presented = presentFit(item.fit, tier);

  /*
   * The three date facts, each attributed to whoever actually stated it.
   *
   * `verified` is ours and is the only one phrased as our own claim; `posted`
   * is the employer's and is omitted entirely rather than guessed when we
   * have no believable date (see POSTED_PLAUSIBLE_DAYS); `closes` is the
   * source's stated deadline.
   *
   * Computed in `buildFeedItem`, not here: `describeTiming` needs `now`, and
   * React's purity rule rejects `Date.now()` during render — the same reason
   * `newSinceFromDays` lives in `lib/feed.ts` rather than in the page. One
   * `now` per request also means every row on a page dates itself against the
   * same instant.
   */
  const dates = item.dates;

  return (
    <article
      className={`posting-row border-b ${closed || blocked ? "is-closed" : ""}`}
      style={{ borderColor: "var(--line)", padding: "18px 0" }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={closed || blocked ? "pip pip-closed" : "pip pip-live"} aria-hidden />
            {/* Ours. "verified today / yesterday / Aug 14", phrased per
                freshness tier so only sub-hour ATS polling says "confirmed
                live". */}
            <span className="mono">{dates.verified}</span>
            {/* The employer's. Omitted entirely when we have no believable
                date rather than falling back to one we would not defend. */}
            {dates.posted && (
              <span className="mono" style={{ color: "var(--faint-readable)" }}>
                · {dates.posted}
              </span>
            )}
            {blocked && !closed && (
              <span className="mono" style={{ color: "var(--accent-lite)" }}>
                · you are not eligible
              </span>
            )}
            {/* Flagged, not hidden. Two 404s is enough to warn and not enough
                to bury an opportunity — see lib/ingest/linkcheck.ts. */}
            {item.applyLinkDead && !closed && (
              <span
                className="mono"
                style={{ color: "var(--accent)" }}
                title="We requested this apply URL twice and it answered “not found” both times."
              >
                · link may be dead
              </span>
            )}
            {/* Accented only when the label is a genuine call to action —
                an imminent close, or an employer-stated recent posting. The
                "found today" case is deliberately not accented: that is a
                fact about our crawler, not about the opportunity. */}
            {!closed && URGENT_LABEL.test(item.timing.label) && (
              <span className="mono" style={{ color: "var(--accent)" }}>
                · {item.timing.label}
              </span>
            )}
          </div>

          {/* Employer-authored text — never transformed. The title links to the
              detail page (score, eligibility, cover letter); the company line
              carries the external apply link so the feed still reaches the
              source in one hop. */}
          <h3 className="t-base" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
            {/* `.press` is deliberately absent: the whole row now lifts on
                hover, and a 1px nudge on the title inside a row that is already
                moving reads as a wobble rather than as a press. */}
            <RowLink
              href={`/listing/${item.id}`}
              className="row-target"
              style={{ color: "var(--text)", textDecoration: "none" }}
            >
              {item.title}
            </RowLink>
          </h3>

          <div className="t-sm mt-1" style={{ color: "var(--muted)" }}>
            {item.kind === "scholarship" && (
              <span className="mono" style={{ color: "var(--accent-lite)" }}>
                scholarship ·{" "}
              </span>
            )}
            {item.company}
            {item.locations.length > 0 && (
              <> · {item.locations.slice(0, 3).join(" / ")}</>
            )}
            {item.isRemote && <> · remote</>}
            {" "}
            {/* Lifted above the stretched title link — this one leaves the
                site, so it must never be swallowed by the row's own target. */}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mono press row-raise"
              style={{ color: "var(--faint-readable)", fontSize: "0.85em" }}
              title="Open the original posting"
            >
              apply ↗
            </a>
          </div>

          {item.kind === "scholarship" && item.eligibility.length > 0 && (
            <div className="mono t-sm mt-1" style={{ color: "var(--muted)" }}>
              eligibility: {item.eligibility.slice(0, 2).join(" · ")}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.term ? (
              <span className="mono" style={{ color: "var(--faint-readable)" }}>
                {item.term}
              </span>
            ) : item.kind === "internship" ? (
              <span className="slot" style={{ padding: "3px 8px" }}>
                term not stated
              </span>
            ) : null}

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

            {/* The countdown beside the date, because "due 9/7/2026" makes a
                reader do the arithmetic that decides whether to act tonight.
                Accented inside a fortnight — that is when it changes what
                someone does today. */}
            {item.deadlineAt && (
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
                due {formatDate(item.deadlineAt)}
                {dates.closes ? ` · ${dates.closes}` : ""}
              </span>
            )}

            {item.kind === "scholarship" &&
              !item.deadlineAt &&
              !item.isContentMarketing && (
                <span className="slot" style={{ padding: "3px 8px" }}>
                  no deadline stated
                </span>
              )}

            {item.kind === "scholarship" &&
              (item.amountMin != null || item.amountMax != null ? (
                <span className="mono" style={{ color: "var(--text)" }}>
                  {formatAmount(item.amountMin, item.amountMax)}
                </span>
              ) : (
                <span className="slot" style={{ padding: "3px 8px" }}>
                  {item.amountNeedsReview ? "amount unreadable" : "amount not stated"}
                </span>
              ))}

            {item.kind === "scholarship" && item.isContentMarketing && (
              <span className="mono" style={{ color: "var(--faint-readable)" }}>
                content marketing
              </span>
            )}
          </div>
        </div>

        <div className="row-raise flex shrink-0 items-center gap-2">
          <ScoreBadge
            label="fit"
            value={presented.score}
            known={presented.known}
            total={presented.total}
            bucketLabel={presented.bucketLabel}
          />
          {/* Timing now carries its own confidence marker, for the reason fit
              does: a score resting only on when we happened to crawl is a
              weaker claim than one resting on a stated deadline and a stated
              posting date, and it may not look equally sure of itself. */}
          <ScoreBadge
            label="timing"
            value={closed ? null : item.timing.score}
            known={closed ? undefined : item.timing.knownSignals}
            total={closed ? undefined : item.timing.totalSignals}
          />
          {signedIn && <TrackButton postingId={item.id} current={tracked ?? null} />}
        </div>
      </div>

      {/* Every score is explained and the keyword gap is always reachable —
          just not both dumped below the fold unconditionally. See
          ScoreReasons for why the skills reason and gap line are merged.
          `presented` already strips this to nothing on a locked score, so
          ScoreReasons naturally renders null rather than needing its own
          tier check — the gate lives once, in presentFit. */}
      <div className="row-raise mt-3">
        <ScoreReasons reasons={presented.reasons} skills={presented.skills} hasResume={hasResume} />
      </div>
    </article>
  );
}
