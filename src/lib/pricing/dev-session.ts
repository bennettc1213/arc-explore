/**
 * The cookie half of dev mode — everything in here needs `next/headers`, which
 * is why it is not in `dev-tier.ts` (that file stays free of framework imports
 * so the signing and parsing can be unit-tested without a request).
 *
 * `devTier()` is the one function the rest of the app calls. It is the single
 * answer to "is a tier being forced right now, and to what", and `getUserTier`
 * is its only important caller.
 */

import { cookies } from "next/headers";

import {
  DEV_COOKIE,
  devPassword,
  devTierOverride,
  signDevTier,
  verifyDevCookie,
} from "./dev-tier";
import type { TierId } from "./tiers";

/** Whether the `/dev` unlock exists at all on this deployment. With no
 *  `DEV_PASSWORD` there is nothing to log into and the page says so rather
 *  than accepting attempts against a secret that does not exist. */
export function devModeConfigured(): boolean {
  return devPassword() !== null;
}

/**
 * The tier being forced for this request, or null when nothing is.
 *
 * COOKIE FIRST, THEN THE ENVIRONMENT VARIABLE. The cookie is the deliberate,
 * per-browser choice someone just made on `/dev`; `DEV_TIER` is a machine-wide
 * default. If both are set, the thing a person clicked wins over the thing a
 * file says — otherwise switching tiers on `/dev` would appear to do nothing
 * and send someone debugging the gate instead of their env file.
 */
export async function devTier(): Promise<TierId | null> {
  const jar = await cookies();
  const fromCookie = verifyDevCookie(jar.get(DEV_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return devTierOverride();
}

/** True when the tier in force came from the cookie rather than `DEV_TIER` —
 *  i.e. there is a session on `/dev` to sign out of. */
export async function devUnlocked(): Promise<boolean> {
  const jar = await cookies();
  return verifyDevCookie(jar.get(DEV_COOKIE)?.value) !== null;
}

/**
 * Issue the cookie. Callable only from a Server Action or route handler —
 * Next forbids writing cookies while rendering, which is the correct
 * restriction here since unlocking is a thing you do, not a thing a page does.
 */
export async function setDevTier(tier: TierId): Promise<void> {
  const password = devPassword();
  if (!password) return; // Fails closed, same as every other path.

  const jar = await cookies();
  jar.set(DEV_COOKIE, signDevTier(tier, password), {
    // Not readable from JavaScript: it is a privilege marker, and no client
    // code has any reason to see it.
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearDevTier(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEV_COOKIE);
}
