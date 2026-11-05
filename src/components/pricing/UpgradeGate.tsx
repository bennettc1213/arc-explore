import Link from "next/link";

import { formatRenewal } from "@/lib/pricing/allowance";
import {
  FEATURES,
  statusNote,
  TIER_LABELS,
  TIER_PRICE_USD,
  type FeatureAccess,
  type FeatureKey,
} from "@/lib/pricing/tiers";

/**
 * The gating UI states, rendered from an already-computed `FeatureAccess`.
 *
 * NONE OF THESE COMPONENTS DECIDE ANYTHING. They take the result of
 * `evaluateFeature` (or the allowance helpers in `grants.ts`, which wrap it)
 * as a prop and render whatever it says — the entitlement decision itself
 * always happens server-side, in `src/lib/pricing/`. Grep this file for
 * `tier ===` and find nothing.
 *
 * Inline, never a modal: these render where the limit was met, once, and the
 * student's input and existing results stay on the page around them.
 */

/** There is one paid plan, so "upgrade" always means Pro — including for a
 *  Free allowance that is merely used up (whose minimum tier is Free). */
const UPGRADE_TARGET = "apply" as const;

/** Small inline pill — "Pro", or "coming soon" — next to a locked control. */
export function LockedBadge({ access }: { access: FeatureAccess }) {
  if (access.reason === "coming_soon") {
    return (
      <span
        className="mono"
        style={{ color: "var(--faint-readable)", border: "1px solid var(--line-strong)", padding: "2px 7px" }}
      >
        coming soon
      </span>
    );
  }
  return (
    <span
      className="mono"
      style={{ color: "var(--accent)", border: "1px solid var(--accent)", padding: "2px 7px" }}
      title={`Requires ${TIER_LABELS[UPGRADE_TARGET]}`}
    >
      🔒 {TIER_LABELS[UPGRADE_TARGET]}
    </span>
  );
}

/**
 * A block replacing gated content. For a used-up allowance it says when the
 * allowance renews and what counts as a use, so waiting is a real option
 * beside upgrading.
 */
export function UpgradeWall({
  feature,
  access,
  reasonNote,
  renewsAt = null,
}: {
  feature: FeatureKey;
  access: FeatureAccess;
  /** Optional extra line — e.g. "this period's free critique is used". */
  reasonNote?: string;
  /** When a used-up Free allowance renews. */
  renewsAt?: Date | null;
}) {
  const entry = FEATURES[feature];

  if (access.reason === "coming_soon") {
    return (
      <section className="slot" style={{ padding: "16px 18px" }}>
        <span>
          <strong>{entry.label}</strong> is not built yet, on any plan. {entry.description}
        </span>
      </section>
    );
  }

  const note = statusNote(entry.status);

  return (
    <section
      className="border"
      style={{ borderColor: "var(--accent)", padding: "16px 18px", marginBottom: 28 }}
    >
      <div className="mono-strong" style={{ color: "var(--accent)" }}>
        {reasonNote ?? `${entry.label} is part of ${TIER_LABELS[UPGRADE_TARGET]}`}
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "62ch" }}>
        {entry.description}
      </p>
      {entry.meter === "period" && access.limit !== null && access.limit > 0 && (
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "62ch" }}>
          {TIER_LABELS.free} includes {access.limit} every 30 days
          {entry.useMeans ? <> — a use means {entry.useMeans}</> : null}. Reopening, editing,
          copying and exporting what you already made never counts.
          {renewsAt && (
            <strong style={{ color: "var(--text)" }}> Your next free use is available {formatRenewal(renewsAt)}.</strong>
          )}
        </p>
      )}
      {/* An unverified feature says so on the way in, not after paying. */}
      {note && (
        <div className="mono" style={{ marginTop: 8, color: "var(--accent-lite)" }}>
          {note}
        </div>
      )}
      <Link
        href={`/pricing?feature=${feature}`}
        className="btn btn-primary press"
        style={{ textDecoration: "none", display: "inline-block", marginTop: 12 }}
      >
        see {TIER_LABELS[UPGRADE_TARGET]} — ${TIER_PRICE_USD[UPGRADE_TARGET]}/mo
      </Link>
    </section>
  );
}

/** One-line allowance note for a capped-but-usable feature — "1 of 1 free
 *  uses left this period" rather than a silent cutoff. */
export function QuotaNote({ access }: { access: FeatureAccess }) {
  if (access.unlimited || !access.included || access.limit === null) return null;
  const left = access.remaining ?? 0;
  return (
    <span className="mono" style={{ color: "var(--faint-readable)" }}>
      {left} of {access.limit} free {access.limit === 1 ? "use" : "uses"} left in this 30-day period
    </span>
  );
}
