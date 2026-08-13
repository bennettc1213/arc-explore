import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Session refresh.
 *
 * Named `proxy` because Next.js 16 renamed the `middleware.js` convention to
 * `proxy.js` — same execution model, different file and export name.
 *
 * Supabase access tokens are short-lived. Server Components cannot write
 * cookies, so this is the one place in the request path that can persist a
 * refreshed token. `getUser()` is what triggers that refresh; without this
 * file, sessions silently expire mid-session and users get logged out at
 * random. It is deliberately the only work done here — the auth guide is
 * explicit that proxy is for optimistic checks, not authorization. Every page
 * that needs a user re-verifies it server-side via lib/auth.ts.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // no-store etc. — a cached response carrying Set-Cookie would hand one
        // user's session to the next visitor through the CDN.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth routes are
     * deliberately included: /auth/confirm needs the code-verifier cookie.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
