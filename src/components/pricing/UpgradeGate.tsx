import Link from "next/link";

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
 * `evaluateFeature` (or `consumeUsage`/`checkUsage`, which wrap it) as a
 * prop and render whatever it says — the entitlement decision itself always
 * happens server-side, in `src/lib/pricing/`. That split is what "no
 * hardcoded tier checks in components" means in practice: grep this file for
 * `tier ===` and find nothing.
 */

/** Small inline pill — "Edge" or "Apply", or "coming soon" — for a badge next
 *  to a locked control. */
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
      title={`Requires ${TIER_LABELS[access.minimumTier]}`}
    >
      🔒 {TIER_LABELS[access.minimumTier]}
    </span>
  );
}

/**
 * A full block replacing gated content — used where the tool cannot be shown
 * at all (essay reviewer on free tier, a coming-soon feature) rather than
 * merely capped.
 */
export function UpgradeWall({
  feature,
  access,
  reasonNote,
}: {
  feature: FeatureKey;
  access: FeatureAccess;
  /** Optional extra line — e.g. "you've used your 1 free run". */
  reasonNote?: string;
}) {
  const entry = FEATURES[feature];

  if (access.reason === "coming_soon") {
    return (
      <section className="slot" style={{ padding: "16px 18px" }}>
        <span>
          <strong>{entry.label}</strong> is not built yet — reserved for {TIER_LABELS[access.minimumTier]}{" "}
          once it ships. {entry.description}
        </span>
      </section>
    );
  }

  const note = statusNote(entry.status);

  return (
    <section
      className="border"
      style={{ borderColor: "var(--accent)", padding: "16px 18px" }}
    >
      <div className="mono-strong" style={{ color: "var(--accent)" }}>
        {reasonNote ?? `${entry.label} needs ${TIER_LABELS[access.minimumTier]}`}
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "62ch" }}>
        {entry.description}
      </p>
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
        upgrade to {TIER_LABELS[access.minimumTier]} — ${TIER_PRICE_USD[access.minimumTier]}/mo
      </Link>
    </section>
  );
}

/** One-line remaining-quota note for a capped-but-currently-usable feature —
 *  "1 of 1 free runs used" rather than a silent cutoff. */
export function QuotaNote({ access }: { access: FeatureAccess }) {
  if (access.unlimited || !access.included || access.limit === null) return null;
  return (
    <span className="mono" style={{ color: "var(--faint-readable)" }}>
      {Math.max(access.limit - (access.remaining ?? 0), 0)} of {access.limit} free {access.limit === 1 ? "run" : "runs"} used
    </span>
  );
}
