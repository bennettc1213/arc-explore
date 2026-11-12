import Link from "next/link";

import { getLivePulseDescription } from "@/lib/live-pulse-store";

/**
 * One line of proof that the crawler is working: distinct boards checked in
 * the last hour, when the last check landed, what was found and closed. When
 * ingest stalls it says "paused" instead of disappearing (see live-pulse.ts).
 */
export async function LivePulseStrip({ showLink = true }: { showLink?: boolean } = {}) {
  const pulse = await getLivePulseDescription();
  if (pulse.state === "unknown") return null;
  return (
    <p className={`live-pulse mono live-pulse-${pulse.state}`} role="status">
      <span className="live-pulse-dot" aria-hidden="true" />
      <span>{pulse.state === "live" ? "live" : "paused"}</span>
      <span>{pulse.lastCheck}</span>
      {pulse.facts.map((f) => (
        <span key={f}>{f}</span>
      ))}
      {showLink && <Link href="/live" className="live-pulse-link">
        see the ledger
      </Link>}
    </p>
  );
}
