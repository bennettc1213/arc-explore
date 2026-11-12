import Link from "next/link";

import type { HiddenSummary } from "@/lib/feed-hidden";
import { FIT_BUCKET_LABELS, TIER_LABELS, TIER_PRICE_USD } from "@/lib/pricing/tiers";

/**
 * The Free plan's "beyond your top N" block.
 *
 * Every number here is counted over the real rows this request ranked and then
 * trimmed (`summarizeHidden`). The stubs are those same rows, redacted to
 * kind, fit bucket and timing label: the server never sends their title,
 * sponsor or link, so the blurred bars are drawn boxes, not hidden text.
 */
export function HiddenMatches({
  hidden,
  shownCount,
  total,
  freeDepth,
  profileReady,
}: {
  hidden: HiddenSummary;
  shownCount: number;
  total: number;
  freeDepth: number;
  /** Fit buckets mean nothing against an empty profile, so they are left out. */
  profileReady: boolean;
}) {
  const facts: Array<{ value: string; label: string }> = [];
  if (profileReady && hidden.strongFit > 0) {
    facts.push({ value: hidden.strongFit.toLocaleString("en-US"), label: `more ${FIT_BUCKET_LABELS.strong} matches` });
  }
  if (hidden.closingSoon > 0) {
    facts.push({ value: hidden.closingSoon.toLocaleString("en-US"), label: "close within 14 days" });
  }
  if (hidden.foundToday > 0) {
    facts.push({ value: hidden.foundToday.toLocaleString("en-US"), label: "found in the last 24 hours" });
  }
  if (hidden.awardsConfirmed > 0) {
    facts.push({
      value: `$${hidden.awardTotal.toLocaleString("en-US")}`,
      label: `in ${hidden.awardsConfirmed.toLocaleString("en-US")} confirmed scholarship award${hidden.awardsConfirmed === 1 ? "" : "s"}`,
    });
  }

  return (
    <section
      className="border hidden-matches"
      aria-labelledby="hidden-matches-title"
      style={{ borderColor: "var(--accent)", padding: "16px 18px", marginTop: 18 }}
    >
      <div id="hidden-matches-title" className="mono-strong" style={{ color: "var(--accent)" }}>
        {hidden.count.toLocaleString("en-US")} more ranked matches past your top {shownCount}
      </div>

      {facts.length > 0 && (
        <ul className="hidden-matches-facts" aria-label="What the hidden matches hold">
          {facts.map((f) => (
            <li key={f.label}>
              <span className="hidden-matches-value">{f.value}</span> <span>{f.label}</span>
            </li>
          ))}
        </ul>
      )}

      {hidden.preview.length > 0 && (
        <ol className="hidden-matches-stubs" aria-label="The next ranked matches, locked">
          {hidden.preview.map((p, i) => (
            <li key={i} className="hidden-stub">
              <span className="hidden-stub-bars" aria-hidden="true">
                <span />
                <span />
              </span>
              <span className="hidden-stub-meta mono">
                #{shownCount + i + 1} · {p.kind}
                {profileReady && p.bucket && p.bucket !== "unscored" ? ` · ${FIT_BUCKET_LABELS[p.bucket]}` : ""}
                {` · ${p.timingLabel}`}
              </span>
              <span className="mono hidden-stub-lock" aria-label="locked">🔒</span>
            </li>
          ))}
        </ol>
      )}

      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 10, maxWidth: "64ch" }}>
        {TIER_LABELS.free} shows the top {freeDepth} for each search. These counts are the real
        rows ranked just below them, not an estimate. Searching, filtering and opening any listing
        are never limited, and every warning and source fact shows on every plan.
      </p>
      <Link
        href="/pricing?feature=feed_full_depth"
        className="btn btn-primary press"
        style={{ textDecoration: "none", display: "inline-block", marginTop: 12 }}
      >
        see all {total.toLocaleString("en-US")} with {TIER_LABELS.apply} — ${TIER_PRICE_USD.apply}/mo
      </Link>
    </section>
  );
}
