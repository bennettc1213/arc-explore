import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import { FREE_RANKED_RESULTS } from "@/lib/feed-trim";
import { marketReadyFlags } from "@/lib/market-ready/flags";
import { getCheckoutQuote } from "@/lib/pricing/checkout-quote";
import { allowanceWords, COMPARISON_ROWS } from "@/lib/pricing/describe";
import { devTier as devTierInForce, getUserTier } from "@/lib/pricing/entitlements";
import { AI_REQUESTS_PER_HOUR } from "@/lib/pricing/grants";
import { formatCents } from "@/lib/pricing/quote";
import {
  FEATURE_KEYS,
  FEATURES,
  TIER_IDS,
  TIER_LABELS,
  TIER_PRICE_USD,
  TIER_TAGLINES,
  type FeatureKey,
} from "@/lib/pricing/tiers";
import { FEED_PATH } from "@/lib/routes";
import { getStudentClaim } from "@/lib/student-discount";

import { BillingButton } from "./BillingButton";

export const dynamic = "force-dynamic";

/**
 * The pricing page — rendered from `src/lib/pricing/tiers.ts` and
 * `describe.ts`, the same config every gate reads, so it cannot advertise a
 * limit the enforcement disagrees with.
 *
 * CHECKOUT IS SHOWN ONLY WHEN IT WOULD CHARGE WHAT THIS PAGE SAYS. Billing
 * runs through Stripe behind `MARKET_READY_BILLING`; `getCheckoutQuote` reads
 * the configured price and the page offers checkout only when it matches the
 * displayed Pro price. A student price is shown as available only for a current
 * verified claim AND a configured coupon, at the exact amount Stripe charges.
 *
 * Current benefits and unfinished work are separate lists. Anything not built,
 * or built but never verified end to end, is never sold as part of a plan.
 */

function featureFromParam(value: string | string[] | undefined): FeatureKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (FEATURE_KEYS as readonly string[]).includes(raw) ? (raw as FeatureKey) : null;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const asked = featureFromParam(sp.feature);
  const checkoutState = one(sp.checkout);
  const user = await getSessionUser();
  const tier = await getUserTier(user?.id);
  const devTier = await devTierInForce();
  const claim = user ? await getStudentClaim(user.id).catch(() => null) : null;
  const billingEnabled = marketReadyFlags.billing();
  const quote = billingEnabled ? await getCheckoutQuote() : null;
  const checkoutReady = Boolean(quote?.ok);
  const studentCents = quote?.ok ? quote.studentCents : null;
  const studentActive = Boolean(claim?.current && studentCents !== null);
  const studentPending = Boolean(claim && !claim.current);

  const notBuilt = FEATURE_KEYS.filter((k) => FEATURES[k].status === "coming_soon");
  const unverified = FEATURE_KEYS.filter((k) => FEATURES[k].status === "unverified");

  return (
    <main className="wrap pricing-page" style={{ paddingBlock: "48px 96px" }}>
      <BackLink href={FEED_PATH} label="back to the feed" />
      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">pricing</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          find it free, <span style={{ color: "var(--accent)" }}>prepare without limits</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "64ch", marginTop: 14 }}>
          {TIER_LABELS.free} is a complete search: every listing, every warning and source fact,
          your top {FREE_RANKED_RESULTS} ranked matches for each search, a tracker, reminders, a
          weekly digest, and one use of each preparation tool every 30 days.{" "}
          {TIER_LABELS.apply} is for when you are preparing several applications at once: the full
          ranked list, detailed fit guidance, unlimited tracking and tools, and daily alerts.
        </p>
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

      {checkoutState === "success" && (
        <section className="slot" style={{ padding: "14px 16px", marginBottom: 24 }}>
          <span>
            Payment submitted. {TIER_LABELS.apply} turns on when Stripe confirms it, usually within a
            minute — reload this page to check.
          </span>
        </section>
      )}
      {checkoutState === "cancelled" && (
        <section className="slot" style={{ padding: "14px 16px", marginBottom: 24 }}>
          <span>Checkout cancelled. Nothing was charged, and your work is where you left it.</span>
        </section>
      )}

      {asked && (
        <section
          aria-label="The feature you came from"
          style={{ border: "1px solid var(--accent)", padding: "16px 18px", marginBottom: 28 }}
        >
          <div className="mono chrome" style={{ color: "var(--accent-lite)" }}>
            you came here from: {FEATURES[asked].label}
          </div>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
            {FEATURES[asked].description}
          </p>
          <p className="mono" style={{ marginTop: 8, color: "var(--text)" }}>
            {TIER_IDS.map((t) => `${TIER_LABELS[t]}: ${allowanceWords(asked, t) ?? "not included"}`).join("  ·  ")}
          </p>
          <Link href={FEED_PATH} className="navlink" style={{ display: "inline-block", marginTop: 8 }}>
            ← back to what you were doing
          </Link>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2 pricing-plans" style={{ marginBottom: 28 }}>
        {TIER_IDS.map((t) => (
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
              <div className="mono-strong plan-name" style={{ fontSize: "1.4rem", marginTop: 6 }}>
                {TIER_LABELS[t]}
              </div>
              <div className="mono plan-price" style={{ color: "var(--faint-readable)", marginTop: 2 }}>
                {t === "free" ? (
                  "free"
                ) : studentActive && studentCents !== null ? (
                  <>
                    <s>${TIER_PRICE_USD.apply.toFixed(2)}</s> → {formatCents(studentCents)}/mo
                    <span style={{ display: "block", color: "var(--accent-lite)", marginTop: 6 }}>
                      verified student price{quote?.ok && !quote.studentRecurring ? " · introductory, see checkout for terms" : ""}
                    </span>
                  </>
                ) : (
                  <>${TIER_PRICE_USD.apply.toFixed(2)}/mo</>
                )}
              </div>
            </div>

            <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {t === "apply" && (
                <li className="t-sm" style={{ color: "var(--muted)" }}>
                  Everything in {TIER_LABELS.free}, plus:
                </li>
              )}
              {COMPARISON_ROWS.filter((k) => {
                const words = allowanceWords(k, t);
                if (!words) return false;
                // Pro lists only what it adds or raises.
                return t === "free" || words !== allowanceWords(k, "free");
              }).map((k) => (
                <li key={k} style={k === asked ? { borderLeft: "2px solid var(--accent)", paddingLeft: 8, marginLeft: -10 } : undefined}>
                  <span className="t-sm" style={{ color: "var(--text)" }}>
                    {FEATURES[k].label}
                  </span>
                  <span className="mono" style={{ marginLeft: 6, color: "var(--faint-readable)" }}>
                    · {allowanceWords(k, t)}
                  </span>
                </li>
              ))}
            </ul>

            {t === "apply" && (
              <p className="mono" style={{ color: "var(--faint-readable)" }}>
                AI cover-letter generations are limited to {AI_REQUESTS_PER_HOUR} an hour on every
                plan, to protect the service. A fit score is an explanation of evidence, not a
                probability of being selected, and no plan changes anyone&rsquo;s odds.
              </p>
            )}

            {t === tier ? (
              t === "apply" && billingEnabled && user ? (
                <BillingButton portal />
              ) : (
                <span className="mono" style={{ color: "var(--accent)", marginTop: "auto" }}>current plan</span>
              )
            ) : t === "apply" && checkoutReady ? (
              user ? (
                <BillingButton />
              ) : (
                <Link href="/login?next=%2Fpricing" className="btn" style={{ marginTop: "auto", textAlign: "center" }}>
                  sign in to upgrade
                </Link>
              )
            ) : t === "apply" ? (
              <span
                className="btn"
                style={{ marginTop: "auto", textAlign: "center", opacity: 0.55, cursor: "not-allowed" }}
                title="Checkout is not available yet — nothing can be purchased."
              >
                checkout not available yet
              </span>
            ) : null}
          </section>
        ))}
      </div>

      {(studentActive || studentPending) && (
        <section style={{ border: "1px solid var(--line-strong)", padding: "16px 18px", marginBottom: 28 }}>
          <div className="mono chrome">student pricing</div>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
            {studentActive && studentCents !== null
              ? <>Your current enrollment is verified. Checkout applies the student discount: {formatCents(studentCents)}/month.</>
              : <>Your school inbox is verified, but current enrollment is not yet. A 50% student discount may be available once it is; it is not applied today, and checkout charges the regular price until then.</>}
          </p>
        </section>
      )}

      <section className="border" style={{ borderColor: "var(--line-strong)", padding: "16px 18px", marginBottom: 28 }}>
        <div className="mono chrome">not part of any plan today</div>
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
          These are not included in what {TIER_LABELS.apply} costs, and you cannot buy your way to
          them.
        </p>
        {notBuilt.length > 0 && (
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 8 }}>
            <span className="mono" style={{ color: "var(--faint-readable)" }}>not built yet:</span>{" "}
            {notBuilt.map((k) => FEATURES[k].label).join(" · ")}
          </p>
        )}
        {unverified.length > 0 && (
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6 }}>
            <span className="mono" style={{ color: "var(--accent-lite)" }}>built, not yet verified end to end:</span>{" "}
            {unverified.map((k) => FEATURES[k].label).join(" · ")}. {TIER_LABELS.apply} accounts can try it, with
            that caveat shown, but it is not counted as a benefit until someone has watched it work.
          </p>
        )}
      </section>

      <section className="border" style={{ borderColor: "var(--line)", padding: "16px 18px", marginBottom: 28 }}>
        <div className="mono chrome">how the limits work</div>
        <ul className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>
            Each Free tool renews 30 days after you first use it, on its own clock. Reopening,
            editing, copying or exporting what you already made never counts, and a run that fails
            gives the use back.
          </li>
          <li>
            The tracker limit counts active opportunities only. Finished ones (offer, rejected,
            ghosted, withdrawn) and your whole history are always kept and never count. Applications
            you actually submit are always recorded.
          </li>
          <li>
            If you leave {TIER_LABELS.apply}, nothing is deleted: your drafts, tracker and saved
            searches stay, and you choose which saved search keeps alerting.
          </li>
          <li>
            Alerts can only report what we have already found and checked at the source; daily is
            the fastest we run them.
          </li>
        </ul>
      </section>

      <section className="border" style={{ borderColor: "var(--line)", padding: "16px 18px", marginBottom: 28 }}>
        <div className="mono chrome">{checkoutReady ? "secure payments via Stripe" : "no payment is collected yet"}</div>
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
          {checkoutReady ? (
            <>Payments are handled by Stripe; card details never reach Instela. {TIER_LABELS.apply} is monthly and you can manage or cancel it from this page at any time.</>
          ) : (
            <>Checkout is switched off until it is configured to charge exactly the price shown here. Every account is on {TIER_LABELS.free} until then, and the limits on this page are the ones the product already enforces.</>
          )}
        </p>
      </section>

      <footer className="mono" style={{ color: "var(--faint-readable)" }}>
        <Link href="/privacy" style={{ color: "var(--accent)" }}>
          what we hold about you
        </Link>
        {"  ·  "}
        <Link href={FEED_PATH} style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
      </footer>
    </main>
  );
}
