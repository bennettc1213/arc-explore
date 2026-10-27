import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/** A separate PKCE/session cookie keeps campus verification from replacing the Instela login. */
export async function createStudentSSOClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: {
      name: "instela-student-sso",
      path: "/auth/student",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        for (const v of values) store.set(v.name, v.value, v.options);
      },
    },
  });
}
