/**
 * Who is allowed to call the extension API.
 *
 * FAILS CLOSED, exactly as `/admin` does. `EXTENSION_ORIGINS` unset, empty or
 * unparseable means **no origin is allowed** — the tempting "nothing is
 * configured, so allow anything during development" shortcut is how an API
 * that returns a student's name, school, email and phone number ships open to
 * every extension the browser has installed.
 *
 * WHAT THIS DOES AND DOES NOT PROTECT. A Chrome MV3 background service worker
 * with `host_permissions` for our domain bypasses CORS altogether, so these
 * headers are not the thing standing between a hostile extension and this API
 * — the browser's own permission prompt is, and the student granting it is the
 * decision that matters. These headers stop the *other* case: a content script
 * (or any ordinary web page) trying to read the endpoint with the student's
 * cookies attached. That one CORS does govern, and denying it costs us nothing
 * because our own extension never calls from a content script.
 *
 * The origin is echoed back rather than wildcarded because these responses are
 * credentialed, and `Access-Control-Allow-Origin: *` is invalid with
 * `credentials: include` — a wildcard here would silently break the very
 * requests it looks like it is permitting.
 */

/** Configured extension origins, e.g. `chrome-extension://abcdefg…`. */
export function allowedOrigins(): string[] {
  const raw = process.env.EXTENSION_ORIGINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * CORS headers for one request, or an empty object when the origin is not
 * allowed — which the browser turns into a blocked response.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  if (!allowedOrigins().includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // The allowed origin varies per request, so any shared cache must key on it.
    Vary: "Origin",
  };
}

/** Standard preflight answer. 204 with the headers, or 204 with none. */
export function preflight(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
