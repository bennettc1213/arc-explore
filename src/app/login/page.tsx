import { redirect } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";

import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

/** The only messages /auth/confirm may put on this page. */
const AUTH_ERRORS: Record<string, string> = {
  expired: "that sign-in link has expired or was already used — request a new one",
  invalid: "that sign-in link could not be verified — request a new one",
  missing: "that link was missing its sign-in token — request a new one",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const next = safeNextPath(one("next"), "/profile");

  // Mapped from a fixed set rather than echoed. A URL parameter rendered
  // verbatim as an official-looking error is a phishing primitive, even though
  // React escapes the markup.
  const authError = AUTH_ERRORS[one("error") ?? ""];

  // Already signed in — no reason to show a sign-in form.
  const user = await getSessionUser();
  if (user) redirect(next);

  return (
    <main className="wrap" style={{ paddingBlock: "64px 96px", maxWidth: 560 }}>
      <BackLink href="/" label="back to the feed" />
      <div className="eyebrow chrome">sign in</div>
      <h1 className="chrome" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.03em", marginTop: 12 }}>
        save your profile, keep your <span style={{ color: "var(--accent)" }}>scores</span>
      </h1>
      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 12, marginBottom: 28 }}>
        The feed works signed out — your answers just live in the URL. Sign in and they
        persist, along with your resume and the roles you have applied to.
      </p>

      {authError && (
        <p
          className="mono"
          role="alert"
          style={{ color: "var(--system-danger)", marginBottom: 16 }}
        >
          {authError}
        </p>
      )}

      <LoginForm next={next} />
    </main>
  );
}
