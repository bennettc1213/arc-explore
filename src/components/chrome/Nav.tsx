import Link from "next/link";

import { getSessionUser } from "@/lib/auth";

import { Mascot } from "./Mascot";

export async function Nav() {
  const user = await getSessionUser();

  return (
    <header
      className="flex items-center border-b"
      style={{ height: "var(--nav-h)", borderColor: "var(--line)" }}
    >
      <div className="wrap flex w-full items-center justify-between gap-4">
        <Link href="/" className="press flex items-center gap-3" style={{ textDecoration: "none" }}>
          <Mascot size={26} />
          <span className="mono-strong chrome" style={{ fontSize: "0.9rem" }}>
            internship tracker
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <span className="eyebrow chrome hidden lg:flex">
            verified live, not scraped from memory
          </span>

          {user ? (
            <>
              <Link href="/tracker" className="mono chrome press" style={{ color: "var(--accent)" }}>
                tracker
              </Link>
              <Link href="/profile" className="mono chrome press" style={{ color: "var(--accent)" }}>
                profile
              </Link>
            </>
          ) : (
            <Link href="/login" className="mono chrome press" style={{ color: "var(--accent)" }}>
              sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
