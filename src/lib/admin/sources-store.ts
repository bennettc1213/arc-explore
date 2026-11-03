import { sql } from "drizzle-orm";

import { db } from "@/db/client";

import {
  SOURCE_CATALOGUE,
  classifySource,
  type RunFacts,
  type SourceDefinition,
  type SourceFacts,
  type SourceVerdict,
} from "./source-health";

/**
 * The facts behind `/admin/sources`, one row per source.
 *
 * Timestamps are formatted to ISO in SQL and parsed explicitly: `db.execute`
 * hands timestamptz back as a string, and a field typed `Date` would compile
 * and then throw on the first real row (HANDOFF §6).
 */

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

export interface SourceRow {
  def: SourceDefinition | null;
  key: string;
  facts: SourceFacts;
  verdict: SourceVerdict;
}

export interface PipelineSummary {
  /** Finished tier A runs in the last 24 hours (n8n fires one every 20 min). */
  pollsLast24h: number;
  lastPollAt: Date | null;
  lastPollRunning: boolean;
}

export interface SourcesReport {
  now: Date;
  rows: SourceRow[];
  pipeline: PipelineSummary;
}

type RunRow = {
  tier: string;
  source: string | null;
  started_at: string;
  finished_at: string | null;
  postings_seen: number;
  postings_new: number;
  errors: number;
  error_message: string | null;
};

const toDate = (s: string | null) => (s ? new Date(s) : null);

export async function getSourcesReport(): Promise<SourcesReport> {
  const [counts, finished, running, boards, polls] = await Promise.all([
    db.execute<{ source: string; open: number; new24h: number; new7d: number }>(sql`
      select ps.source,
        count(distinct p.id) filter (where p.closed_at is null)::int                              as open,
        count(distinct p.id) filter (where p.first_seen_at > now() - interval '24 hours')::int   as new24h,
        count(distinct p.id) filter (where p.first_seen_at > now() - interval '7 days')::int     as new7d
      from posting_sources ps join postings p on p.id = ps.posting_id
      group by ps.source`),

    // Latest FINISHED run per (tier, source). Tier A's source label has changed
    // over time (null, then 'ats-direct'), so tier A collapses to one key.
    db.execute<RunRow>(sql.raw(`
      select distinct on (tier, case when tier = 'A' then '' else coalesce(source, '') end)
        tier, source,
        to_char(started_at at time zone 'UTC', ${ISO})  as started_at,
        to_char(finished_at at time zone 'UTC', ${ISO}) as finished_at,
        postings_seen, postings_new, errors,
        detail->>'error' as error_message
      from ingest_runs
      where finished_at is not null
      order by tier, case when tier = 'A' then '' else coalesce(source, '') end, started_at desc`)),

    db.execute<{ tier: string; source: string | null; started_at: string }>(sql.raw(`
      select tier, source, to_char(max(started_at) at time zone 'UTC', ${ISO}) as started_at
      from ingest_runs
      where finished_at is null and started_at > now() - interval '1 hour'
      group by tier, source`)),

    db.execute<{ ats_type: string; total: number; failing: number }>(sql`
      select ats_type, count(*)::int as total,
        count(*) filter (where consecutive_failures >= 5)::int as failing
      from organizations group by ats_type`),

    db.execute<{ n: number }>(sql`
      select count(*)::int as n from ingest_runs
      where tier = 'A' and finished_at is not null and started_at > now() - interval '24 hours'`),
  ]);

  const now = new Date();

  const findRun = (def: SourceDefinition): RunFacts | null => {
    const r = finished.find(
      (x) => x.tier === def.runTier && (def.runSource === null || x.source === def.runSource),
    );
    if (!r) return null;
    return {
      startedAt: new Date(r.started_at),
      finishedAt: toDate(r.finished_at),
      postingsSeen: r.postings_seen,
      postingsNew: r.postings_new,
      errors: r.errors,
      errorMessage: r.error_message,
    };
  };

  const findRunning = (def: SourceDefinition): Date | null => {
    const r = running.find((x) => x.tier === def.runTier && (def.runSource === null || x.source === def.runSource));
    return r ? new Date(r.started_at) : null;
  };

  const known = new Set(SOURCE_CATALOGUE.map((d) => d.key));
  const countFor = (key: string) => counts.find((c) => c.source === key);

  const rows: SourceRow[] = SOURCE_CATALOGUE.map((def) => {
    const c = countFor(def.key);
    const b = def.runTier === "A" ? boards.find((x) => x.ats_type === def.key) : undefined;
    const facts: SourceFacts = {
      open: c?.open ?? 0,
      new24h: c?.new24h ?? 0,
      new7d: c?.new7d ?? 0,
      lastRun: findRun(def),
      runningSince: findRunning(def),
      boards: b ? { total: b.total, failing: b.failing } : null,
    };
    return { def, key: def.key, facts, verdict: classifySource(def, facts, now) };
  });

  // Anything writing rows that nobody added to the catalogue still shows up.
  for (const c of counts) {
    if (known.has(c.source)) continue;
    const facts: SourceFacts = {
      open: c.open,
      new24h: c.new24h,
      new7d: c.new7d,
      lastRun: null,
      runningSince: null,
      boards: null,
    };
    rows.push({
      def: null,
      key: c.source,
      facts,
      verdict: { health: "degraded", reason: "writes rows but is not in the source catalogue, so its runs are not tracked" },
    });
  }

  const tierA = finished.find((r) => r.tier === "A");
  return {
    now,
    rows,
    pipeline: {
      pollsLast24h: polls[0]?.n ?? 0,
      lastPollAt: tierA ? new Date(tierA.started_at) : null,
      lastPollRunning: running.some((r) => r.tier === "A"),
    },
  };
}
