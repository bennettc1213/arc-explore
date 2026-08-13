import { headers } from "next/headers";

/**
 * The origin to build absolute callback URLs from.
 *
 * Order matters. `Host` is attacker-controlled, so a poisoned header could
 * otherwise redirect a sign-in link at someone else's domain — an explicit
 * NEXT_PUBLIC_SITE_URL wins wherever it is set, and should be set in
 * production. Supabase also refuses any `emailRedirectTo` outside its
 * dashboard allow-list, which is the backstop; this is the front one.
 */
export async function getSiteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
