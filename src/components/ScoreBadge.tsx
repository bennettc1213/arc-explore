/**
 * One score, shown honestly. Used for both the feed row and the listing
 * detail header — was two near-identical components (`ScorePill`,
 * `ScoreBox`) before this merge.
 *
 * The `known/total` fraction renders unconditionally whenever the score is
 * partial. This is the one place the product's core rule lives visually: a
 * score built on fewer known dimensions is a weaker claim, so it may never
 * look as loud as a fully-informed one, and the fraction may never move
 * behind a click.
 *
 * `bucketLabel` is the free-tier presentation from
 * `src/lib/pricing/entitlements.ts`'s `presentFit` — "Strong Fit" instead of
 * "87". It is a distinct case from `value === null` on purpose: a null score
 * means we genuinely do not know, which is true on every tier and rendered
 * the same everywhere; a bucket means we know exactly, and are choosing to
 * show less of it. The two must never look identical, or a free user cannot
 * tell "we don't know" from "you're not seeing the number".
 */

import { TIER_LABELS } from "@/lib/pricing/tiers";
export function ScoreBadge({
  label,
  value,
  known,
  total,
  size = "row",
  bucketLabel,
}: {
  label: string;
  value: number | null;
  /** Dimensions that contributed. Omitted for scores with no such notion. */
  known?: number;
  total?: number;
  /** "row" for the feed/list context, "header" for the listing detail page. */
  size?: "row" | "header";
  /** Free-tier bucketed word ("Strong Fit"), shown instead of the number. */
  bucketLabel?: string | null;
}) {
  if (bucketLabel) {
    // The known/total fraction renders here exactly as it does for a full
    // score. Bucketing withholds precision, never the marker that says what
    // the judgement rests on — see presentFit for why that distinction is
    // load-bearing rather than cosmetic.
    const bucketPartial = known !== undefined && total !== undefined && known < total;
    return (
      <div
        className="flex items-baseline gap-2 border px-3 py-2"
        style={{ borderColor: "var(--line-strong)", background: "transparent" }}
        title={
          bucketPartial
            ? `Based on ${known} of ${total} factors — the rest are not stated in this posting. Upgrade to ${TIER_LABELS.apply} for the full score and breakdown.`
            : "Upgrade to Edge to see the full score and factor breakdown"
        }
      >
        <span className="mono">{label}</span>
        <span className="mono-strong" style={{ fontSize: size === "row" ? "0.85rem" : undefined }}>
          {bucketLabel}
        </span>
        {bucketPartial && (
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            {known}/{total}
          </span>
        )}
        <span aria-hidden style={{ color: "var(--faint-readable)" }}>
          🔒
        </span>
      </div>
    );
  }

  // "not enough info" is a real, honest answer — better than a fake number.
  if (value === null) {
    return (
      <div className="slot" title="Not enough information to score this yet">
        <span>{label} —</span>
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
      <span
        className="mono-strong"
        style={{
          color: strong ? "var(--accent)" : "var(--text)",
          fontSize: size === "row" ? "0.9rem" : undefined,
        }}
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
