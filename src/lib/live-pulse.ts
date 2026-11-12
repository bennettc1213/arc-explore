/**
 * The live pulse: how hard the crawler worked in the last hour, said as what
 * it observed.
 *
 * Every number is a count of something we did, read from our own tables:
 *  - boards checked = DISTINCT employer boards whose last poll succeeded in
 *    the last hour (organizations.last_polled_at), not a sum of run counters
 *    that would count one board twice when two runs overlap;
 *  - new = visible postings our crawler first saw in the last 24 hours, the
 *    same "new to us" the alerts use;
 *  - closed = postings closed in the last 24 hours, by any path (two missed
 *    checks on a polled board, or a source stating the award is closed).
 *
 * WHEN THE PIPELINE STALLS, THE STRIP SAYS SO. A pulse that quietly vanished
 * whenever ingest broke would only ever show good news, which is the opposite
 * of proof. `describePulse` reports "paused" past `STALE_AFTER_MINUTES`.
 *
 * `describePulse` is pure and tested; `getLivePulse` is the one query.
 */

export const STALE_AFTER_MINUTES = 90;

export interface LivePulse {
  boardsCheckedLastHour: number;
  /** ISO, or null when no board has ever polled successfully. */
  lastCheckAt: string | null;
  newLast24h: number;
  closedLast24h: number;
  measuredAt: string;
}

export interface PulseDescription {
  state: "live" | "paused" | "unknown";
  /** "last board check 4m ago" / "last board check 3h ago". */
  lastCheck: string | null;
  facts: string[];
}

function ago(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const n = (x: number) => x.toLocaleString("en-US");

export function describePulse(p: LivePulse, now: Date): PulseDescription {
  if (!p.lastCheckAt) return { state: "unknown", lastCheck: null, facts: [] };
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(p.lastCheckAt).getTime()) / 60_000));
  const state = minutes > STALE_AFTER_MINUTES ? "paused" : "live";
  const facts: string[] = [];
  if (state === "live" && p.boardsCheckedLastHour > 0) {
    facts.push(`${n(p.boardsCheckedLastHour)} employer boards checked in the last hour`);
  }
  facts.push(`${n(p.newLast24h)} new listings found in 24h`);
  if (p.closedLast24h > 0) facts.push(`${n(p.closedLast24h)} closed in 24h`);
  return { state, lastCheck: `last board check ${ago(minutes)}`, facts };
}
