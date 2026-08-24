/**
 * DEV MODE — a password-gated override that hands the current viewer a paid
 * tier, plus the older env-var form of the same thing.
 *
 * WHY IT EXISTS. Auth here is magic-link only, so signing in to look at a paid
 * surface is a round trip through an inbox, and even then every profile in the
 * database is on `free` (nothing sets `profiles.plan` to anything else — there
 * is no checkout). Without this, the Edge and Apply surfaces are unreachable on
 * a development machine, which makes them exactly the kind of untested surface
 * FIXES.md §3 already lists too much of.
 *
 * TWO WAYS IN, AND THEY ARE NOT THE SAME RISK:
 *
 *   1. `DEV_PASSWORD` + the `/dev` page. Whoever knows the password unlocks the
 *      tier for their own browser, via a signed cookie. Works anywhere the
 *      variable is set, production included — because it grants nothing to
 *      someone who does not know the secret.
 *
 *   2. `DEV_TIER=free|edge|apply`. Forces the tier for EVERY request with no
 *      secret at all, and is therefore refused outright when
 *      `NODE_ENV=production`. That guard is not belt-and-braces: the realistic
 *      way a dev flag opens a live paywall is not a code bug, it is a whole
 *      local `.env` pasted into Vercel's environment editor. Refusing the
 *      variable in a production build makes that paste inert.
 *
 * The cookie is SIGNED WITH THE PASSWORD ITSELF as the HMAC key, so it cannot
 * be forged, and rotating the password invalidates every cookie already issued
 * for free. It carries the tier and nothing else — no user id, no email, no
 * session material — because it is not a session: it says which tier to
 * pretend, and the real identity still comes from Supabase.
 *
 * WHAT DEV MODE DOES NOT DO, either way in:
 *   - It does not unlock `coming_soon` features. `evaluateFeature` refuses
 *     those on every tier including Apply, and a dev flag that quietly made
 *     unbuilt things look built would defeat the entire point of that state.
 *   - It does not grant `/admin`. That is a separate boundary with its own
 *     written rule against exactly this shortcut (see `admin/allowlist.ts`) —
 *     `ADMIN_EMAILS` plus a real session is how you get there.
 *
 * Free of database and framework imports so it is unit-testable without a
 * connection, the same split `allowlist.ts` makes from `admin/auth.ts`. The
 * cookie jar itself lives in `dev-session.ts`, which is the part that needs
 * `next/headers`.
 */

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

import { TIER_IDS, type TierId } from "./tiers";

/** The environment variables that turn dev mode on. Named once. */
export const DEV_TIER_VAR = "DEV_TIER";
export const DEV_PASSWORD_VAR = "DEV_PASSWORD";

/** Cookie holding the unlocked tier. Prefixed like nothing else here, so it is
 *  obvious in devtools what it is and that it is not a session. */
export const DEV_COOKIE = "instela_dev_tier";

export function parseTier(raw: string | undefined | null): TierId | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return (TIER_IDS as readonly string[]).includes(value) ? (value as TierId) : null;
}

/* ------------------------------------------------------------------ *
 * 1. The password path
 * ------------------------------------------------------------------ */

/** The configured dev password, or null when dev mode is switched off
 *  entirely. Blank counts as unset — an empty secret is not a secret. */
export function devPassword(raw = process.env[DEV_PASSWORD_VAR]): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

/**
 * Constant-time password comparison.
 *
 * Both sides are hashed first so the comparison is over two fixed-width
 * buffers — `timingSafeEqual` throws on a length mismatch, and catching that
 * would leak the length of the real password through the timing of the throw.
 */
export function devPasswordMatches(
  attempt: string,
  configured: string | null = devPassword(),
): boolean {
  if (!configured) return false; // Fails closed: no password, no unlock.
  const a = createHash("sha256").update(attempt).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

/**
 * The cookie value for an unlocked tier: the tier, plus an HMAC of it keyed on
 * the password.
 *
 * Signed rather than stored plain because the cookie is client-side data and a
 * plain `instela_dev_tier=apply` would be a paywall anyone could edit past in
 * devtools — which would make the password decorative.
 */
export function signDevTier(tier: TierId, password: string): string {
  const sig = createHmac("sha256", password).update(tier).digest("base64url");
  return `${tier}.${sig}`;
}

/** The tier a cookie legitimately carries, or null if it is absent, malformed,
 *  signed with a different password, or names something that is not a tier. */
export function verifyDevCookie(
  value: string | undefined | null,
  password: string | null = devPassword(),
): TierId | null {
  if (!value || !password) return null;

  const cut = value.lastIndexOf(".");
  if (cut <= 0) return null;

  const tier = parseTier(value.slice(0, cut));
  if (!tier) return null;

  const presented = Buffer.from(value.slice(cut + 1), "base64url");
  const expected = Buffer.from(signDevTier(tier, password).slice(tier.length + 1), "base64url");
  if (presented.length !== expected.length) return null;

  return timingSafeEqual(presented, expected) ? tier : null;
}

/* ------------------------------------------------------------------ *
 * 2. The environment-variable path
 * ------------------------------------------------------------------ */

/**
 * The tier `DEV_TIER` is forcing, or `null` when it is off.
 *
 * `null` on every failure — unset, blank, a typo, or a production build — so a
 * caller can treat it as "no override" without inspecting why. Use
 * `devTierWarning` to find out why when the answer matters.
 */
export function devTierOverride(
  raw = process.env[DEV_TIER_VAR],
  nodeEnv = process.env.NODE_ENV,
): TierId | null {
  if (nodeEnv === "production") return null;
  return parseTier(raw);
}

/**
 * A sentence explaining why a `DEV_TIER` that was clearly set did nothing, or
 * `null` when there is nothing to explain.
 *
 * A silent no-op on a typo is the shape of the phantom bug reports HANDOFF.md
 * already warns about — someone sets `DEV_TIER=paid`, sees a locked feed, and
 * goes looking for the bug in the gating code. This is printed once at server
 * start instead.
 */
export function devTierWarning(
  raw = process.env[DEV_TIER_VAR],
  nodeEnv = process.env.NODE_ENV,
): string | null {
  if (!raw || !raw.trim()) return null;

  if (nodeEnv === "production") {
    return `${DEV_TIER_VAR} is set to "${raw.trim()}" but is ignored in a production build — this is deliberate, see lib/pricing/dev-tier.ts`;
  }
  if (parseTier(raw) === null) {
    return `${DEV_TIER_VAR} is set to "${raw.trim()}", which is not a tier — expected one of ${TIER_IDS.join(", ")}. No override applied.`;
  }
  return null;
}
