import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import { FREE_DAILY_RESULTS } from "@/lib/feed-trim";
import { devTier as devTierInForce, getUserTier } from "@/lib/pricing/entitlements";
import {
  FEATURE_KEYS,
  FEATURES,
  statusNote,
  TIER_IDS,
  TIER_LABELS,
  TIER_PRICE_USD,
  TIER_TAGLINES,
  type FeatureKey,
  type TierId,
} from "@/lib/pricing/tiers";

export const dynamic = "force-dynamic";

/**
 * The pricing page — rendered entirely from `src/lib/pricing/tiers.ts`, the
 * same config every gate reads, so it cannot advertise a limit the
 * enforcement disagrees with.
 *
 * THERE IS NO CHECKOUT HERE, AND THE PAGE SAYS SO. No Stripe product, no
 * session, no webhook. The upgrade buttons are visibly inert rather than
 * leading somewhere that fails — a button that cannot do what it says is
 * worse than an honest disabled one.
 *
 * WHAT IS AND IS NOT BUILT IS ON THE PAGE, NOT IN A FOOTNOTE. Every feature
 * carries its `status`, and the two caveated states read differently on
 * purpose: "not built yet" means there is no code, while "built, not yet
 * verified end-to-end" means the code exists and passes its tests but no
 * human has watched it work. Collapsing those into one word would be the
 * same failure as collapsing "confirmed live" into "checked as of".
 */

function priceLabel(t: TierId): string {
  return TIER_PRICE_USD[t] === 0 ? "free" : `$${TIER_PRICE_USD[t].toFixed(2)}/mo`;
}

/** What this tier gives you for this feature, in words. */
function allowance(feature: FeatureKey, tier: TierId): string | null {
  const limit = FEATURES[feature].limits[tier];
  if (limit === 0) return null;
  if (limit === null) return null;
  return `${limit} free`;
}

function FeatureLine({ feature, tier }: { feature: FeatureKey; tier: TierId }) {
  const entry = FEATURES[feature];
  const note = statusNote(entry.status);
  const allow = allowance(feature, tier);
  const dim = entry.status === "coming_soon";

  return (
    <li style={{ marginBottom: 9 }}>
      <span
        className="t-sm"
        style={{ color: dim ? "var(--faint-readable)" : "var(--text)" }}
      >
        {entry.label}
      </span>
      {allow && (
        <span className="mono" style={{ marginLeft: 6, color: "var(--faint-readable)" }}>
          · {allow}
        </span>
      )}
      {note && (
        <span
          className="mono"
          style={{
            display: "block",
            marginTop: 2,
            color: entry.status === "coming_soon" ? "var(--faint-readable)" : "var(--accent-lite)",
          }}
        >
          {note}
        </span>
      )}
    </li>
  );
}

export default async function PricingPage() {
  const user = await getSessionUser();
  const tier = await getUserTier(user?.id);
  const devTier = await devTierInForce();

  const unbuilt = FEATURE_KEYS.filter((k) => FEATURES[k].status === "coming_soon");
  const unverified = FEATURE_KEYS.filter((k) => FEATURES[k].status === "unverified");

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <BackLink href="/" label="back to the feed" />
      <header style={{ marginBottom: 32 }}>
        <div className="eyebrow chrome">pricing</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          see it, generate with it, <span style={{ color: "var(--accent)" }}>apply with it</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "64ch", marginTop: 14 }}>
          Searching every listing, opening any of them, and deadline reminders on what you save
          are free and always will be. The free plan shows your{" "}
          <strong style={{ color: "var(--text)" }}>{FREE_DAILY_RESULTS} highest-ranked matches</strong>,
          re-ranked as we poll each employer&rsquo;s board and as deadlines approach. Paid plans
          open the full ranked list and the tools that generate something — a critique, a letter, a
          README, a filled-in application — rather than just showing you a number.
        </p>
        {/* The dev override outranks the real plan, so it has to outrank the
            sentence naming it — "you are on Apply" would otherwise be a
            statement about an env var dressed up as a fact about the account. */}
        {devTier ? (
          <p className="mono" style={{ marginTop: 10, color: "var(--accent)" }}>
            dev mode is forcing the {TIER_LABELS[devTier]} plan — nothing has been paid for.{" "}
            <Link href="/dev" className="navlink">
              switch plan or turn it off →
            </Link>
          </p>
        ) : (
          user && (
            <p className="mono" style={{ marginTop: 10, color: "var(--accent)" }}>
              you are on {TIER_LABELS[tier]}
            </p>
          )
        )}
      </header>

      {/* Said before the plans, not after them. Someone deciding whether to pay
          should meet the caveats while they are still deciding. */}
      {(unbuilt.length > 0 || unverified.length > 0) && (
        <section
          className="border"
          style={{ borderColor: "var(--line-strong)", padding: "16px 18px", marginBottom: 32 }}
        >
          <div className="mono chrome">what is not finished yet</div>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
            This is an honest list rather than a roadmap tease. Anything marked{" "}
            <span style={{ color: "var(--faint-readable)" }}>not built yet</span> does not exist in
            the product today and is <strong>disabled on every plan, including the one that pays
            for it</strong> — you cannot buy your way to it. Anything marked{" "}
            <span style={{ color: "var(--accent-lite)" }}>built, not yet verified end-to-end</span>{" "}
            exists and passes its tests, but no human has driven it start to finish, so expect
            rough edges.
          </p>
          {unverified.length > 0 && (
            <p className="t-sm" style={{ color: "var(--muted)", marginTop: 10 }}>
              <span className="mono" style={{ color: "var(--accent-lite)" }}>unverified:</span>{" "}
              {unverified.map((k) => FEATURES[k].label).join(" · ")}
            </p>
          )}
          {unbuilt.length > 0 && (
            <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6 }}>
              <span className="mono" style={{ color: "var(--faint-readable)" }}>not built yet:</span>{" "}
              {unbuilt.map((k) => FEATURES[k].label).join(" · ")}
            </p>
          )}
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-3" style={{ marginBottom: 40 }}>
        {TIER_IDS.map((t) => {
          const included = FEATURE_KEYS.filter((k) => FEATURES[k].limits[t] !== 0);
          return (
            <section
              key={t}
              className="border"
              style={{
                borderColor: t === tier ? "var(--accent)" : "var(--line-strong)",
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div>
                <div className="eyebrow chrome">{TIER_TAGLINES[t]}</div>
                <div className="mono-strong" style={{ fontSize: "1.4rem", marginTop: 6 }}>
                  {TIER_LABELS[t]}
                </div>
                <div className="mono" style={{ color: "var(--faint-readable)", marginTop: 2 }}>
                  {priceLabel(t)}
                </div>
              </div>

              <ul style={{ display: "flex", flexDirection: "column" }}>
                {included.map((k) => (
                  <FeatureLine key={k} feature={k} tier={t} />
                ))}
              </ul>

              {t === tier ? (
                <span className="mono" style={{ color: "var(--accent)", marginTop: "auto" }}>
                  current plan
                </span>
              ) : (
                <span
                  className="btn"
                  style={{
                    marginTop: "auto",
                    textAlign: "center",
                    opacity: 0.55,
                    cursor: "not-allowed",
                  }}
                  title="No payment provider is connected yet — nothing can be purchased."
                >
                  not yet available
                </span>
              )}
            </section>
          );
        })}
      </div>

      <section
        className="border"
        style={{ borderColor: "var(--line)", padding: "16px 18px", marginBottom: 28 }}
      >
        <div className="mono chrome">no payment is collected anywhere on this site</div>
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
          There is no billing provider connected, no checkout, and no card form — the buttons
          above are deliberately inert rather than leading somewhere that fails. Every account is
          currently on {TIER_LABELS.free}. When billing does land, the only thing that changes is
          which plan your account is set to; the limits on this page are the same ones the code
          already enforces.
        </p>
      </section>

      <footer className="mono" style={{ color: "var(--faint-readable)" }}>
        <Link href="/privacy" style={{ color: "var(--accent)" }}>
          what we hold about you
        </Link>
        {"  ·  "}
        <Link href="/" style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
      </footer>
    </main>
  );
}
