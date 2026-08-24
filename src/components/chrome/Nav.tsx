import Link from "next/link";

import { viewerIsAdmin } from "@/lib/admin/auth";
import { getSessionUser } from "@/lib/auth";
import { devModeConfigured, devTier, getUserTier } from "@/lib/pricing/entitlements";
import { TIER_LABELS } from "@/lib/pricing/tiers";

import { Mascot } from "./Mascot";
import { ToolsMenu } from "./ToolsMenu";

export async function Nav() {
  const user = await getSessionUser();
  // getSessionUser is React-cached, so this costs no extra round trip.
  const isAdmin = await viewerIsAdmin();
  const tier = await getUserTier(user?.id);
  // Not the tier — whether the tier was *forced*. Rendering the paid surfaces
  // without saying so would make every local check of "what does a free
  // visitor actually see" quietly wrong, which is the one question the whole
  // gating layer was built to answer.
  const forced = await devTier();
  const devAvailable = devModeConfigured();

  return (
    <header
      className="flex items-center border-b"
      style={{ height: "var(--nav-h)", borderColor: "var(--line)" }}
    >
      <div className="wrap flex w-full items-center justify-between gap-4">
        {/* The lockup is the home link, and until now nothing said so — a mark
            and a wordmark in the top-left are what every site puts there
            whether or not they are clickable. On hover the mark grows, the
            word takes the accent, and "home" slides out to name the
            destination outright. `aria-label` carries the same fact for a
            screen reader, which never sees the hover. */}
        <Link href="/" className="brand" aria-label="Instela — home">
          <Mascot size={26} className="brand-mark" />
          <span className="mono-strong chrome brand-word">Instela</span>
          <span className="mono brand-hint" aria-hidden>
            home
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <span className="eyebrow chrome hidden lg:flex">
            verified live, not scraped from memory
          </span>

          {/* The three paste-in tools share one shape (a form that reads text
              you bring, a result that stays in your browser) and one home in
              the nav. They collapse under one "tools" trigger so adding a
              fourth tool does not add a fourth link. */}
          <ToolsMenu />

          {/* `.navlink` rather than `mono chrome` + an inline colour: these
              navigate, so they need a hover state, and an inline `color` would
              out-rank the stylesheet's hover rule and silently defeat it. The
              class owns the resting colour for exactly that reason. */}
          {/* ONE item, not a plain "pricing" link — the nav was recorded as
              over-full in FIXES.md §5 and the fix for that was collapsing
              three links into one menu, so a bare marketing link would undo
              it. This earns its slot by carrying a fact: signed in it names
              the plan you are actually on (and is the only place that says
              so), signed out it is the pricing link. Either way it is one
              item, and it is the answer to "where do I see the plans". */}
          {/* DEV MODE MARKER, and the way in and out of it.

              Loud on purpose and impossible to mistake for a plan chip: dev
              mode grants a tier nobody paid for, so a screenshot taken with it
              on is not a picture of the product.

              It reads "dev mode · Apply plan", not "dev · apply" — the tiers
              are named See it / Edge / Apply, and a bare lowercase "apply"
              beside a row of nav links reads as a verb, i.e. as a button that
              submits an application. The word "plan" is what stops it.

              Only rendered when DEV_PASSWORD is configured, which on a normal
              deployment is never — a visible "dev login" link on a public site
              is an invitation. */}
          {devAvailable &&
            (forced ? (
              <Link
                href="/dev"
                className="mono-strong press"
                style={{
                  color: "var(--on-accent)",
                  background: "var(--accent)",
                  padding: "2px 7px",
                  textDecoration: "none",
                }}
                title={`Dev mode is forcing the ${TIER_LABELS[forced]} plan for this browser. Click to switch plan or turn it off.`}
              >
                dev mode · {TIER_LABELS[forced]} plan
              </Link>
            ) : (
              <Link
                href="/dev"
                className="mono press"
                style={{
                  color: "var(--faint-readable)",
                  border: "1px solid var(--line-strong)",
                  padding: "2px 7px",
                  textDecoration: "none",
                }}
                title="Unlock a paid plan for this browser"
              >
                dev
              </Link>
            ))}

          <Link
            href="/pricing"
            className="navlink press"
            title={user ? `You are on ${TIER_LABELS[tier]} — see all plans` : "Plans and pricing"}
          >
            {user ? TIER_LABELS[tier].toLowerCase() : "pricing"}
          </Link>

          {user ? (
            <>
              <Link href="/tracker" className="navlink press">
                tracker
              </Link>
              <Link href="/resume" className="navlink press">
                resume
              </Link>
              <Link href="/profile" className="navlink press">
                profile
              </Link>
              {isAdmin && (
                <Link href="/admin" className="navlink navlink-quiet press">
                  admin
                </Link>
              )}
            </>
          ) : (
            <Link href="/login" className="navlink press">
              sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
