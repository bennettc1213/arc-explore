import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { PendingButton } from "@/components/PendingButton";
import { devModeConfigured, devTier, devUnlocked } from "@/lib/pricing/dev-session";
import { DEV_PASSWORD_VAR, DEV_TIER_VAR } from "@/lib/pricing/dev-tier";
import { TIER_IDS, TIER_LABELS, TIER_TAGLINES } from "@/lib/pricing/tiers";

import { lockAction, switchTierAction } from "./actions";
import { DevUnlockForm } from "./DevUnlockForm";

export const dynamic = "force-dynamic";

/**
 * `/dev` — the password gate for dev mode.
 *
 * WHAT THIS IS NOT: a login. It creates no session, knows no user, and reads
 * no profile. It sets one signed cookie saying which pricing tier to pretend
 * for this browser, so the Edge and Apply surfaces can be looked at on a
 * machine where every profile in the database is on `free` and signing in at
 * all means waiting for a magic link.
 *
 * It is deliberately not linked from anywhere except its own chip in the nav,
 * which only appears when `DEV_PASSWORD` is configured — a visible "dev login"
 * link on a public site is an invitation.
 */
export default async function DevPage() {
  const configured = devModeConfigured();
  const tier = await devTier();
  const unlocked = await devUnlocked();
  // Set, but coming from the env var rather than the cookie — worth saying,
  // because "turn it off" will not turn that half off.
  const fromEnv = tier !== null && !unlocked;

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 760 }}>
      <BackLink href="/" label="back to the feed" />

      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">dev mode</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          look at the <span style={{ color: "var(--accent)" }}>paid</span> surfaces
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "62ch", marginTop: 14 }}>
          Every profile in the database is on the free plan — there is no checkout, so nothing
          ever sets it to anything else. This forces a tier for <strong>this browser only</strong>,
          so the Edge and Apply surfaces can actually be seen. It is not a sign-in: no session is
          created and no account is touched.
        </p>
      </header>

      {!configured ? (
        <section className="border" style={{ borderColor: "var(--line-strong)", padding: "18px 20px" }}>
          <div className="mono-strong chrome">dev mode is switched off</div>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 8, maxWidth: "62ch" }}>
            No <code className="mono">{DEV_PASSWORD_VAR}</code> is configured, so there is nothing
            to unlock and no attempt will be accepted. Set it in <code className="mono">.env</code>{" "}
            and restart the dev server. Fails closed by design, the same call{" "}
            <code className="mono">ADMIN_EMAILS</code> makes.
          </p>
        </section>
      ) : unlocked ? (
        <section className="border" style={{ borderColor: "var(--accent)", padding: "18px 20px" }}>
          <div className="mono-strong" style={{ color: "var(--accent)" }}>
            dev mode is on — forcing {TIER_LABELS[tier!]}
          </div>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 8, maxWidth: "62ch" }}>
            Every gate on the site now answers as though you are on{" "}
            {TIER_LABELS[tier!]} — {TIER_TAGLINES[tier!]}. Two things this does{" "}
            <strong>not</strong> do: it does not enable anything marked{" "}
            <em>not built yet</em> (those stay disabled on every plan, including the one that pays
            for them), and it does not grant <code className="mono">/admin</code>, which is a
            separate boundary needing a real session.
          </p>

          <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 18 }}>
            {TIER_IDS.map((t) => (
              <form key={t} action={switchTierAction}>
                <input type="hidden" name="tier" value={t} />
                <PendingButton
                  type="submit"
                  className="btn press"
                  pendingLabel="switching…"
                  disabled={t === tier}
                  style={t === tier ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                >
                  {t === tier ? `on ${TIER_LABELS[t]}` : `switch to ${TIER_LABELS[t]}`}
                </PendingButton>
              </form>
            ))}
          </div>

          <form action={lockAction} style={{ marginTop: 18 }}>
            <PendingButton type="submit" className="btn press" pendingLabel="turning off…">
              turn dev mode off
            </PendingButton>
          </form>

          <p className="mono" style={{ marginTop: 18, color: "var(--faint-readable)" }}>
            <Link href="/pricing" className="navlink">
              see what each plan includes →
            </Link>
          </p>
        </section>
      ) : (
        <>
          {fromEnv && (
            <section
              className="border"
              style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 20 }}
            >
              <div className="mono chrome">
                {DEV_TIER_VAR} is already forcing {TIER_LABELS[tier!]} for every request
              </div>
              <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "62ch" }}>
                That is the machine-wide environment-variable form of this, and it grants the tier
                with no password at all — which is why it is ignored outright in a production
                build. Unlocking below overrides it for this browser; comment the variable out of{" "}
                <code className="mono">.env</code> to rely on the password alone.
              </p>
            </section>
          )}
          <DevUnlockForm />
        </>
      )}
    </main>
  );
}
