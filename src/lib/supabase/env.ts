/**
 * Supabase connection settings, validated once at import.
 *
 * These two values are public by design — the anon key ships to the browser.
 * What keeps data safe is RLS (migration 0002), not secrecy of this key. The
 * service-role key is deliberately NOT read here; nothing in the request path
 * should ever hold it.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — see .env");
if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — see .env");

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;
