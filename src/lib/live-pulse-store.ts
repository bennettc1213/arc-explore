import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { getSourcesReport } from "@/lib/admin/sources-store";

import { describePulse, type LivePulse } from "./live-pulse";

/**
 * The single query behind the live pulse strip and `/live`.
 *
 * Timestamps leave Postgres as ISO text (`to_char ... at time zone 'UTC'`):
 * `db.execute` hands timestamptz back as a string, and a field typed `Date`
 * compiles and then throws on the first real row (HANDOFF §6).
 *
 * Memoised per instance for 60 seconds, like `getLandingStats`, because every
 * visitor sees the same numbers and the crawler moves on a 20-minute cadence.
 */
const TTL_MS = 60_000;
let memo: { at: number; value: LivePulse } | null = null;
let pending: Promise<LivePulse> | null = null;

const ISO = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS"Z"'`);

async function fetchPulse(): Promise<LivePulse> {
  const [boards, listings] = await Promise.all([
    db.execute<{ checked: number; last_check: string | null }>(sql`
      select
        count(*) filter (where last_poll_ok = true and last_polled_at >= now() - interval '1 hour')::int as checked,
        to_char(max(last_polled_at) filter (where last_poll_ok = true) at time zone 'UTC', ${ISO}) as last_check
      from organizations
      where ats_slug is not null and ats_type <> 'unknown'`),
    db.execute<{ new24h: number; closed24h: number }>(sql`
      select
        count(*) filter (where closed_at is null and hidden_at is null and term_ended_flag_at is null
                         and first_seen_at >= now() - interval '24 hours')::int as new24h,
        count(*) filter (where closed_at >= now() - interval '24 hours')::int as closed24h
      from postings`),
  ]);
  return {
    boardsCheckedLastHour: boards[0]?.checked ?? 0,
    lastCheckAt: boards[0]?.last_check ?? null,
    newLast24h: listings[0]?.new24h ?? 0,
    closedLast24h: listings[0]?.closed24h ?? 0,
    measuredAt: new Date().toISOString(),
  };
}

export async function getLivePulse(): Promise<LivePulse> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  if (pending) return pending;
  pending = fetchPulse()
    .then((value) => {
      memo = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/**
 * The pulse already worded against this request's clock. `now` is taken here,
 * not in a component, because React's purity rule rejects `Date.now()` during
 * render (the same reason `newSinceFromDays` lives in `feed.ts`).
 */
export async function getLivePulseDescription() {
  return describePulse(await getLivePulse(), new Date());
}

/* ------------------------------------------------------------------ *
 * The public source ledger behind `/live`.
 *
 * Built from the same report `/admin/sources` reads, with every internal
 * field dropped: no error messages, no verdict sentences (they can quote a
 * run's error), no board slugs. What is left is what anyone checking our
 * claims needs — which source, how it is read, how often, whether it is
 * keeping to that schedule, and what it holds.
 * ------------------------------------------------------------------ */

export interface PublicSourceRow {
  label: string;
  method: string;
  cadence: string;
  health: "running" | "partly failing" | "not reading" | "behind schedule" | "not run yet";
  open: number;
  new24h: number;
  /** ISO time the last run finished, or null. */
  lastRunAt: string | null;
}

const PUBLIC_HEALTH = {
  healthy: "running",
  degraded: "partly failing",
  failing: "not reading",
  stale: "behind schedule",
  never_run: "not run yet",
} as const;

let ledgerMemo: { at: number; value: PublicSourceRow[] } | null = null;

export async function getPublicSourceLedger(): Promise<PublicSourceRow[]> {
  if (ledgerMemo && Date.now() - ledgerMemo.at < TTL_MS) return ledgerMemo.value;
  const report = await getSourcesReport();
  const value = report.rows
    // Uncatalogued keys are an internal bookkeeping gap, not a source to list.
    .filter((r) => r.def !== null)
    .map((r) => ({
      label: r.def!.label,
      method: r.def!.method,
      cadence: r.def!.cadence,
      health: PUBLIC_HEALTH[r.verdict.health],
      open: r.facts.open,
      new24h: r.facts.new24h,
      lastRunAt: r.facts.lastRun?.finishedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => b.open - a.open);
  ledgerMemo = { at: Date.now(), value };
  return value;
}
