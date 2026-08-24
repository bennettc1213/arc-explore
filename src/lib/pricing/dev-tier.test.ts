import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateFeature, FEATURE_KEYS, FEATURES, TIER_IDS } from "./tiers";

import {
  DEV_TIER_VAR,
  devPassword,
  devPasswordMatches,
  devTierOverride,
  devTierWarning,
  signDevTier,
  verifyDevCookie,
} from "./dev-tier";

const PW = "correct horse battery staple";

test("a production build ignores DEV_TIER entirely, whatever it says", () => {
  /*
   * THE MOST IMPORTANT TEST IN THIS FILE, and the reason the NODE_ENV check
   * exists at all. The realistic way a dev flag opens a live paywall is not a
   * code bug — it is a whole local `.env` pasted into Vercel's environment
   * editor. Refusing the variable in a production build makes that paste
   * inert rather than catastrophic.
   */
  for (const tier of TIER_IDS) {
    assert.equal(devTierOverride(tier, "production"), null);
  }
  assert.equal(devTierOverride("apply", "production"), null);
});

test("a named tier applies outside production", () => {
  assert.equal(devTierOverride("apply", "development"), "apply");
  // "edge" was the middle of three tiers before pricing collapsed to
  // free + Apply. It is no longer a tier, so DEV_TIER=edge is now a typo like
  // any other and must be refused rather than guessed at — the same direction
  // every unrecognised value fails in. (Note this is the opposite of
  // getUserTier, which maps a legacy 'edge' row in the DATABASE up to Apply:
  // there we are honouring something a subscriber already had, here we are
  // reading a hand-edited env var that names a plan which does not exist.)
  assert.equal(devTierOverride("edge", "development"), null);
  assert.equal(devTierOverride("free", "test"), "free");
  // Whitespace and case are the two ways a hand-edited env file differs from
  // what was meant; neither is a typo worth refusing.
  assert.equal(devTierOverride("  Apply \n", "development"), "apply");
});

test("anything unrecognised is no override, not a guess", () => {
  // Fails to the real plan, never to a more capable one — the same direction
  // `getUserTier` and `isAdminEmail` fail in.
  for (const raw of ["paid", "pro", "1", "true", "yes", "", "   ", undefined]) {
    assert.equal(devTierOverride(raw, "development"), null, `"${raw}" must not resolve`);
  }
});

test("a set-but-ineffective DEV_TIER explains itself", () => {
  /*
   * A silent no-op on a typo is the shape of the phantom bug reports
   * HANDOFF.md warns about: someone sets DEV_TIER=paid, still sees a locked
   * feed, and goes looking for the bug in the gating code.
   */
  const typo = devTierWarning("paid", "development");
  assert.ok(typo && typo.includes("not a tier"));
  assert.ok(typo.includes(DEV_TIER_VAR));

  const inProd = devTierWarning("apply", "production");
  assert.ok(inProd && inProd.includes("production"));

  // Nothing to say when it is off, or when it is working.
  assert.equal(devTierWarning(undefined, "development"), null);
  assert.equal(devTierWarning("", "development"), null);
  assert.equal(devTierWarning("apply", "development"), null);
});

/* ------------------------------------------------------------------ *
 * The password path
 * ------------------------------------------------------------------ */

test("no configured password means no unlock, whatever is typed", () => {
  /*
   * FAILS CLOSED, the same call `isAdminEmail` makes for an empty allowlist.
   * A deployment that never set DEV_PASSWORD must not be unlockable by
   * guessing the empty string, and a blank value is not a secret.
   */
  assert.equal(devPassword(undefined), null);
  assert.equal(devPassword("   "), null);
  assert.equal(devPasswordMatches("", null), false);
  assert.equal(devPasswordMatches("anything", null), false);
  assert.equal(devPasswordMatches("", devPassword("  ")), false);
});

test("the password matches only itself", () => {
  assert.equal(devPasswordMatches(PW, PW), true);
  assert.equal(devPasswordMatches(PW + " ", PW), false);
  assert.equal(devPasswordMatches(PW.toUpperCase(), PW), false);
  // A prefix must not pass — the comparison is over fixed-width digests, so
  // neither length nor an early mismatch is observable through timing.
  assert.equal(devPasswordMatches(PW.slice(0, -1), PW), false);
});

test("a signed cookie round-trips, and only under the password that signed it", () => {
  for (const tier of TIER_IDS) {
    assert.equal(verifyDevCookie(signDevTier(tier, PW), PW), tier);
  }
  // Rotating the password invalidates every cookie already issued — which is
  // the cheapest possible revocation, and the reason the password is the key
  // rather than a separate signing secret.
  assert.equal(verifyDevCookie(signDevTier("apply", PW), "a different password"), null);
});

test("an edited cookie is refused rather than believed", () => {
  /*
   * THE LOAD-BEARING TEST FOR THE COOKIE. Stored plain, `arc_dev_tier=apply`
   * would be a paywall anyone could edit past in devtools, which would make
   * the password decorative. Every one of these is a real thing someone would
   * try first.
   */
  const good = signDevTier("free", PW);
  const sig = good.slice(good.indexOf(".") + 1);

  for (const forged of [
    "apply", // no signature at all
    "apply.", // empty signature
    ".apply", // no tier
    `apply.${sig}`, // free's signature reused for apply — the obvious attack
    `${good}x`, // signature tampered with
    "not_a_tier." + sig, // a tier that does not exist
    "",
  ]) {
    assert.equal(verifyDevCookie(forged, PW), null, `"${forged}" must be refused`);
  }

  // And with no password configured, even a genuinely signed cookie is inert.
  assert.equal(verifyDevCookie(good, null), null);
});

test("dev mode does not unlock a coming_soon feature on any tier", () => {
  /*
   * Dev mode grants a TIER; it does not grant doneness. Seven features are
   * `coming_soon` — gated and disabled even on the tier that pays for them —
   * and a dev flag that quietly made unbuilt things look built would destroy
   * the one state that exists to stop this product advertising what it has
   * not written. `evaluateFeature` refuses them before it ever looks at the
   * tier, which is what makes this hold for free.
   */
  const forced = devTierOverride("apply", "development");
  assert.equal(forced, "apply");

  const unbuilt = FEATURE_KEYS.filter((k) => FEATURES[k].status === "coming_soon");
  assert.ok(unbuilt.length > 0);
  for (const key of unbuilt) {
    assert.equal(evaluateFeature(forced!, key, 0).usable, false, `${key} must stay unusable`);
  }
});
