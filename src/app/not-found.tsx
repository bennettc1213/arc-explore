import Link from "next/link";

import { Mascot } from "@/components/chrome/Mascot";

export default function NotFound() {
  return (
    <main className="wrap" style={{ paddingBlock: "80px 120px", maxWidth: 620 }}>
      <div className="eyebrow chrome">404</div>
      <h1
        className="chrome"
        style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.03em", marginTop: 12 }}
      >
        nothing lives at that <span style={{ color: "var(--accent)" }}>address</span>
      </h1>

      <div className="slot" style={{ marginTop: 24, padding: "18px 20px", gap: 14 }}>
        <Mascot size={30} />
        <span>
          if you followed a link to a posting, it may have closed — we remove roles from
          the feed once the employer takes them down
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary press" style={{ textDecoration: "none" }}>
          back to the feed
        </Link>
        <Link href="/tracker" className="btn press" style={{ textDecoration: "none" }}>
          your tracker
        </Link>
      </div>
    </main>
  );
}
