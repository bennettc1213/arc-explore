"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Mascot } from "@/components/chrome/Mascot";

/**
 * The catch-all for a render that threw.
 *
 * Deliberately does not print `error.message`. A server exception routinely
 * carries a connection string, a SQL fragment, or a row's contents, and Next
 * only redacts it in production — showing it here would leak in development
 * and read as gibberish to a student either way. The digest is the thread back
 * to the real stack in the logs.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("unhandled render error", error);
  }, [error]);

  return (
    <main className="wrap" style={{ paddingBlock: "80px 120px", maxWidth: 620 }}>
      <div className="eyebrow chrome">something broke</div>
      <h1
        className="chrome"
        style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.03em", marginTop: 12 }}
      >
        that did not <span style={{ color: "var(--accent)" }}>load</span>
      </h1>

      <div className="slot" style={{ marginTop: 24, padding: "18px 20px", gap: 14 }}>
        <Mascot size={30} />
        <span>
          this one is on us, not you. nothing you were working on was lost.
          {error.digest && (
            <>
              {" "}
              reference <strong style={{ color: "var(--text)" }}>{error.digest}</strong>
            </>
          )}
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {/* Re-runs the failed render rather than reloading the whole app, so a
            transient failure costs nothing. */}
        <button type="button" className="btn btn-primary press" onClick={reset}>
          try again
        </button>
        <Link href="/" className="btn press" style={{ textDecoration: "none" }}>
          back to the feed
        </Link>
      </div>
    </main>
  );
}
