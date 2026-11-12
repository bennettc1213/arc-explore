import type { Metadata } from "next";
import Link from "next/link";

import { LivePulseStrip } from "@/components/live/LivePulseStrip";
import { getPublicSourceLedger } from "@/lib/live-pulse-store";
import { FEED_PATH } from "@/lib/routes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live ledger — Instela",
  description:
    "Every source Instela reads, how often it is read, whether it is keeping to that schedule, and what it holds right now.",
};

const STAMP = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export default async function LivePage() {
  const rows = await getPublicSourceLedger();
  const open = rows.reduce((sum, r) => sum + r.open, 0);

  return (
    <main className="wrap reference-page" style={{ paddingBlock: "48px 96px", maxWidth: "96ch" }}>
      <Link href={FEED_PATH} className="mono press" style={{ color: "var(--faint-readable)", textDecoration: "none" }}>
        ← back to feed
      </Link>

      <header style={{ marginTop: 24, marginBottom: 24 }}>
        <div className="eyebrow chrome">live ledger</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          Watch the crawler <span style={{ color: "var(--accent)" }}>work</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", marginTop: 14, maxWidth: "64ch" }}>
          Every source we read, how often we read it, and whether it is keeping to that schedule
          right now. These numbers come straight from our own run records. When a source falls
          behind or fails, it says so here instead of disappearing.{" "}
          <Link href="/how-we-verify" style={{ color: "var(--accent-lite)" }}>
            How we verify a listing
          </Link>
          .
        </p>
      </header>

      <LivePulseStrip showLink={false} />

      <div className="live-ledger-wrap">
        <table className="live-ledger">
          <caption className="mono" style={{ textAlign: "left", color: "var(--faint-readable)", paddingBottom: 8 }}>
            {rows.length} sources · {open.toLocaleString("en-US")} open listings · times in UTC
          </caption>
          <thead>
            <tr>
              <th scope="col">source</th>
              <th scope="col">schedule</th>
              <th scope="col">status</th>
              <th scope="col" className="num">open</th>
              <th scope="col" className="num">new 24h</th>
              <th scope="col">last run finished</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">
                  <span className="live-ledger-label">{r.label}</span>
                  <span className="live-ledger-method">{r.method}</span>
                </th>
                <td>{r.cadence}</td>
                <td className={`live-ledger-health live-health-${r.health.replace(/\s+/g, "-")}`}>{r.health}</td>
                <td className="num">{r.open.toLocaleString("en-US")}</td>
                <td className="num">{r.new24h.toLocaleString("en-US")}</td>
                <td>{r.lastRunAt ? STAMP.format(new Date(r.lastRunAt)) : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
