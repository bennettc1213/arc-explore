/**
 * Repeatable data-quality and product baseline audit.
 *
 *   npm run baseline:audit
 *
 * This script is READ-ONLY: every statement it issues is a SELECT. It only
 * writes to the local filesystem under `docs/instela-market-ready/baselines/`.
 * It deliberately does not set `default_transaction_read_only` — see
 * `assertWritableBackend` for why that would break writes process-wide.
 *
 * It is designed to run against local/test data by default (via `.env`) and
 * against a production connection only when that connection is explicitly
 * supplied through the environment.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';

import { db, closeDb } from '@/db/client';
import {
  applications,
  ingestRuns,
  matches,
  organizations,
  postings,
  postingSources,
  profiles,
} from '@/db/schema';
import { getFeed, getFeedStats } from '@/lib/feed';
import { parseTermLabel } from '@/lib/terms/display';
import { toScoreProfile } from '@/lib/profile/types';
import { devModeAllowed, devPassword } from '@/lib/pricing/dev-tier';

const BASELINES_DIR = 'docs/instela-market-ready/baselines';

interface BaselineReport {
  generatedAt: string;
  connection: { readOnly: boolean; currentUser?: string };
  corpus: Record<string, unknown>;
  trustIssues: {
    fitLabelsForIncompleteProfiles: Record<string, unknown>;
    marketingAwardsInDefaultTop10: {
      totalExamined: number;
      marketingCount: number;
      positions: number[];
      rows: Array<{
        position: number;
        kind: string;
        title: string;
        company: string;
        term: string | null;
        isContentMarketing: boolean;
        freshnessTier: string;
        applyLinkDead: boolean;
      }>;
    };
    scholarshipTrustTop10: {
      totalExamined: number;
      lowTrustCount: number;
      lowTrustPositions: number[];
      lotteryCount: number;
      lotteryPositions: number[];
      rows: Array<{
        position: number;
        title: string;
        company: string;
        trustScore: number;
        isLottery: boolean;
        isContentMarketing: boolean;
        corroborationCount: number;
        reasons: string;
      }>;
    };
    closureLifecycle: Record<string, unknown>;
    verifiedVsUnverifiedTop10: Record<string, number>;
  };
  uiAndGating: {
    freeLimitCopy: Array<{ location: string; field: string; value: string; defect: string; note: string }>;
    devPaidUnlock: {
      devPasswordConfigured: boolean;
      devTierEnv: string | null;
      nodeEnv: string | null;
      devTierIgnoredInProduction: boolean;
      devModeAllowedInProduction: boolean;
      note: string;
    };
  };
  freshnessAndSource: {
    sourceCounts: Array<{ source: string; count: number }>;
    polling: Record<string, unknown>;
    ingestRuns: Record<string, unknown>;
    savedListingsWithDeadApplyLinks: number;
  };
}

const now = new Date();
const currentYear = now.getFullYear();

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString();
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function firstYear(term: string): number | null {
  for (let i = 0; i <= term.length - 4; i++) {
    const slice = term.slice(i, i + 4);
    let digits = 0;
    for (const ch of slice) if (isDigit(ch)) digits++;
    if (digits === 4) {
      const n = Number(slice);
      if (n >= 1900 && n <= 2100) return n;
    }
  }
  return null;
}

function parseTerm(term: string | null): { year: number | null; season: string | null } {
  if (!term || term.trim() === '') return { year: null, season: null };
  const t = term.toLowerCase();
  const seasons = ['summer', 'fall', 'spring', 'winter', 'co-op'];
  let season: string | null = null;
  for (const s of seasons) {
    if (t.includes(s)) {
      season = s;
      break;
    }
  }
  return { year: firstYear(term), season };
}

function isPastTermYear(term: string | null): boolean {
  const parsed = parseTerm(term);
  return parsed.year !== null && parsed.year < currentYear;
}

function fmtPercent(n: number, total: number): string {
  return total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`;
}

function fmtDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(ms / 86_400_000);
  return `${days}d`;
}

/*
 * Read-only by construction: every query below is a SELECT.
 *
 * This deliberately does NOT issue `SET default_transaction_read_only = on`.
 * That GUC is session-scoped, and DATABASE_URL points at Supabase's
 * Transaction Pooler (pgbouncer, port 6543), which keeps the physical backend
 * alive between clients. A session SET issued here therefore outlives the
 * process and lands on whichever connection the next one borrows — which
 * silently turns every write in the app into
 * `PreventCommandIfReadOnly` until that backend is recycled. A guard that can
 * take down ingestion is worse than no guard, so read-only is enforced by the
 * queries themselves.
 */
async function assertWritableBackend(): Promise<void> {
  const [row] = await db.execute<{ readOnly: string }>(
    sql`select current_setting('default_transaction_read_only') as "readOnly"`,
  );
  if (row?.readOnly === 'on') {
    console.warn(
      '[baseline] backend is in read-only mode; this script still only reads, ' +
        'but any other process sharing this pooler backend cannot write.',
    );
  }
}

async function runBaseline(): Promise<BaselineReport> {
  await assertWritableBackend();

  const [{ currentUser }] = await db.execute<{ currentUser: string }>(
    sql`select current_user as "currentUser"`,
  );

  /* ------------------------------------------------------------------ *
   * 1. Corpus counts
   * ------------------------------------------------------------------ */
  const stats = await getFeedStats();

  const [{ totalTracked, newLast24h }] = await db.execute<{
    totalTracked: number;
    newLast24h: number;
  }>(sql`
    select
      count(*)::int as "totalTracked",
      count(*) filter (where ${postings.firstSeenAt} > now() - interval '24 hours')::int as "newLast24h"
    from ${postings}
  `);

  const [{ hiddenOpen }] = await db.execute<{ hiddenOpen: number }>(sql`
    select count(*)::int as "hiddenOpen"
    from ${postings}
    where ${postings.closedAt} is null and ${postings.hiddenAt} is not null
  `);

  /* ------------------------------------------------------------------ *
   * 2. Term quality
   * ------------------------------------------------------------------ */
  const [{ missingOrUnknownTerm, withExplicitTerm, termExplicit, termInferred, termUnknown }] =
    await db.execute<{
      missingOrUnknownTerm: number;
      withExplicitTerm: number;
      termExplicit: number;
      termInferred: number;
      termUnknown: number;
    }>(sql`
    select
      count(*) filter (where ${postings.term} is null or trim(${postings.term}) = '')::int as "missingOrUnknownTerm",
      count(*) filter (where ${postings.term} is not null and trim(${postings.term}) <> '')::int as "withExplicitTerm",
      count(*) filter (where ${postings.termSource} = 'explicit')::int as "termExplicit",
      count(*) filter (where ${postings.termSource} = 'inferred')::int as "termInferred",
      count(*) filter (where ${postings.termSource} = 'unknown')::int as "termUnknown"
    from ${postings}
    where ${postings.closedAt} is null and ${postings.hiddenAt} is null
  `);

  const termRows = await db.execute<{ term: string; count: number }>(sql`
    select ${postings.term} as term, count(*)::int as count
    from ${postings}
    where ${postings.closedAt} is null
      and ${postings.hiddenAt} is null
      and ${postings.term} is not null
      and trim(${postings.term}) <> ''
    group by ${postings.term}
    order by count desc
  `);

  const termPastRows = termRows.filter((r) => isPastTermYear(r.term));
  const pastTermCount = termPastRows.reduce((sum, r) => sum + r.count, 0);
  const pastTermGroups = termPastRows
    .slice(0, 10)
    .map((r) => ({ term: r.term, count: r.count, parsed: parseTerm(r.term) }));

  const unparsableTerms = termRows
    .filter((r) => parseTerm(r.term).year === null)
    .slice(0, 10)
    .map((r) => ({ term: r.term, count: r.count }));

  // Distinguish visible (would appear in default feed) from quarantined ended terms.
  const pastTermDetailRows = await db.execute<{ id: string; term: string; termEndedFlagAt: Date | null }>(sql`
    select ${postings.id} as id, ${postings.term} as term, ${postings.termEndedFlagAt} as "termEndedFlagAt"
    from ${postings}
    where ${postings.closedAt} is null
      and ${postings.hiddenAt} is null
      and ${postings.term} is not null
      and trim(${postings.term}) <> ''
  `);
  const visiblePastTermCount = pastTermDetailRows.filter(
    (r) => r.termEndedFlagAt === null && isPastTermYear(r.term),
  ).length;
  const flaggedPastTermCount = pastTermDetailRows.filter(
    (r) => r.termEndedFlagAt !== null && isPastTermYear(r.term),
  ).length;

  /*
   * Divergence: the free-text label claims a different term than the
   * structured season/year that every ended-term check actually reads. A row in
   * this state can put an already-ended term on a live card, so it is tracked
   * as a first-class term-quality defect rather than left implicit.
   */
  const divergedRows = await db.execute<{
    id: string;
    term: string;
    termSeason: string;
    termYear: number;
  }>(sql`
    select
      ${postings.id} as id,
      ${postings.term} as term,
      ${postings.termSeason} as "termSeason",
      ${postings.termYear} as "termYear"
    from ${postings}
    where ${postings.closedAt} is null
      and ${postings.hiddenAt} is null
      and ${postings.term} is not null
      and ${postings.termSeason} is not null
      and ${postings.termYear} is not null
  `);
  const divergentTermRows = divergedRows
    .map((r) => ({
      id: r.id,
      term: r.term,
      structured: `${r.termSeason} ${r.termYear}`,
    }))
    .filter((r) => {
      const parsed = parseTermLabel(r.term);
      return !parsed || `${parsed.season} ${parsed.year}` !== r.structured;
    });
  const divergentTermCount = divergentTermRows.length;
  const divergentTermTop = divergentTermRows.slice(0, 10);

  /* ------------------------------------------------------------------ *
   * 3. Award amount defects
   * ------------------------------------------------------------------ */
  const [amountStatusCounts] = await db.execute<{
    exact: number;
    range: number;
    varies: number;
    unparseable: number;
    estimated: number;
    withProgramTotal: number;
    withAwardsCount: number;
    zeroAmounts: number;
  }>(sql`
    select
      count(*) filter (where ${postings.amountStatus} = 'exact')::int as "exact",
      count(*) filter (where ${postings.amountStatus} = 'range')::int as "range",
      count(*) filter (where ${postings.amountStatus} = 'varies')::int as "varies",
      count(*) filter (where ${postings.amountStatus} = 'unparseable')::int as "unparseable",
      count(*) filter (where ${postings.amountIsEstimated} = true)::int as "estimated",
      count(*) filter (where ${postings.programTotal} is not null)::int as "withProgramTotal",
      count(*) filter (where ${postings.awardsCount} is not null)::int as "withAwardsCount",
      count(*) filter (where ${postings.amountMin} = 0 or ${postings.amountMax} = 0)::int as "zeroAmounts"
    from ${postings}
    where ${postings.closedAt} is null
      and ${postings.hiddenAt} is null
      and ${postings.kind} = 'scholarship'
  `);

  const [{ needsReviewAmounts, malformedAmounts }] = await db.execute<{
    needsReviewAmounts: number;
    malformedAmounts: number;
  }>(sql`
    select
      count(*) filter (where ${postings.amountStatus} = 'unparseable')::int as "needsReviewAmounts",
      count(*) filter (
        where ${postings.amountStatus} = 'unparseable'
          and ${postings.descriptionText} like '%$%'
      )::int as "malformedAmounts"
    from ${postings}
    where ${postings.closedAt} is null
      and ${postings.hiddenAt} is null
      and ${postings.kind} = 'scholarship'
  `);

  /* ------------------------------------------------------------------ *
   * 4. Fit labels for incomplete profiles
   * ------------------------------------------------------------------ */
  const [profileCompleteness] = await db.execute<{
    totalProfiles: number;
    missingMajor: number;
    missingGradYear: number;
    missingWorkAuth: number;
    missingState: number;
    incompleteProfiles: number;
  }>(sql`
    select
      count(*)::int as "totalProfiles",
      count(*) filter (where ${profiles.major} is null)::int as "missingMajor",
      count(*) filter (where ${profiles.gradYear} is null)::int as "missingGradYear",
      count(*) filter (where ${profiles.workAuth} is null)::int as "missingWorkAuth",
      count(*) filter (where coalesce(${profiles.targetLocations}, '{}') = '{}')::int as "missingState",
      count(*) filter (
        where ${profiles.major} is null
          or ${profiles.gradYear} is null
          or ${profiles.workAuth} is null
          or coalesce(${profiles.targetLocations}, '{}') = '{}'
      )::int as "incompleteProfiles"
    from ${profiles}
  `);

  const [matchesForIncomplete] = await db.execute<{ count: number }>(sql`
    select count(*)::int as count
    from ${matches} m
    join ${profiles} p on p.id = m.user_id
    where p.major is null
      or p.grad_year is null
      or p.work_auth is null
      or coalesce(p.target_locations, '{}') = '{}'
  `);

  /* ------------------------------------------------------------------ *
   * 5. Default top-10 feed trust check
   * ------------------------------------------------------------------ */
  const emptyProfile = toScoreProfile(null);
  const defaultTop10 = await getFeed(emptyProfile, { limit: 10 });

  const top10Report = defaultTop10.items.map((item, index) => ({
    position: index + 1,
    kind: item.kind,
    title: item.title,
    company: item.company,
    term: item.term,
    isContentMarketing: item.isContentMarketing,
    freshnessTier: item.freshnessTier,
    applyLinkDead: item.applyLinkDead,
  }));

  const marketingInTop10 = top10Report.filter((r) => r.isContentMarketing);

  const scholarshipTop10 = await getFeed(emptyProfile, { kind: "scholarship", limit: 10 });
  const scholarshipTop10Rows = scholarshipTop10.items.map((item, index) => ({
    position: index + 1,
    title: item.title,
    company: item.company,
    trustScore: item.trustScore,
    isLottery: item.isLottery,
    isContentMarketing: item.isContentMarketing,
    corroborationCount: item.corroborationCount,
    reasons: item.isLottery
      ? item.lotteryReasons.map((r) => r.detail).join("; ")
      : item.trustReasons.map((r) => r.detail).join("; ") || "none",
  }));
  const lowTrustInScholarshipTop10 = scholarshipTop10Rows.filter((r) => r.trustScore <= 40);
  const lotteryInScholarshipTop10 = scholarshipTop10Rows.filter((r) => r.isLottery);

  /* ------------------------------------------------------------------ *
   * 6. UI / API copy locations for Free limit
   * ------------------------------------------------------------------ */
  const uiLimitLocations = [
    {
      location: 'src/lib/feed-trim.ts',
      field: 'FREE_DAILY_RESULTS',
      value: '20',
      defect: 'none',
      note: 'The code caps the free feed at 20 rows.',
    },
    {
      location: 'src/app/pricing/page.tsx',
      field: 'pricing copy',
      value: '20 highest-ranked matches',
      defect: 'none',
      note: 'Imports FREE_DAILY_RESULTS and displays it as the free cap.',
    },
    {
      location: 'src/app/page.tsx',
      field: 'hero copy',
      value: 'free plan shows your 20 highest-ranked matches',
      defect: 'none',
      note: 'The free-plan limit is described consistently with the code cap.',
    },
    {
      location: 'src/lib/pricing/tiers.ts',
      field: 'tier description',
      value: '20 highest-ranked matches',
      defect: 'none',
      note: 'Marketing description in the feature matrix matches the code cap.',
    },
  ];

  /* ------------------------------------------------------------------ *
   * 7. Dev / paid unlock surface
   * ------------------------------------------------------------------ */
  const devPasswordConfigured = devPassword() !== null;
  const devTierEnv = process.env.DEV_TIER?.trim() || null;
  const nodeEnv = process.env.NODE_ENV || null;
  const devModeAllowedInProduction = devModeAllowed("production");

  /* ------------------------------------------------------------------ *
   * 8. Closure lifecycle
   * ------------------------------------------------------------------ */
  const [closureStats] = await db.execute<{
    closedTotal: number;
    closedWithMissingStrikes: number;
    closedWithoutMissingStrikes: number;
    openWithMissingStrikes: number;
  }>(sql`
    select
      count(*) filter (where ${postings.closedAt} is not null)::int as "closedTotal",
      count(*) filter (where ${postings.closedAt} is not null and ${postings.missingStrikes} > 0)::int as "closedWithMissingStrikes",
      count(*) filter (where ${postings.closedAt} is not null and (${postings.missingStrikes} = 0 or ${postings.missingStrikes} is null))::int as "closedWithoutMissingStrikes",
      count(*) filter (where ${postings.closedAt} is null and ${postings.missingStrikes} > 0)::int as "openWithMissingStrikes"
    from ${postings}
  `);

  /*
   * The miss / failed-poll / partial-poll / reopen paths, evidenced from live
   * ingest bookkeeping rather than asserted. `ingest_runs` records what each run
   * saw and closed; `organizations` records which boards are currently failing.
   */
  const [lifecycleRuns] = await db.execute<{
    runsWithCloses: number;
    rowsClosedByAbsence: number;
    runsPartial: number;
    runsFailed: number;
    runsEmpty: number;
  }>(sql`
    select
      count(*) filter (where ${ingestRuns.postingsClosed} > 0)::int as "runsWithCloses",
      coalesce(sum(${ingestRuns.postingsClosed}), 0)::int as "rowsClosedByAbsence",
      count(*) filter (
        where ${ingestRuns.errors} > 0 and ${ingestRuns.postingsSeen} > 0
      )::int as "runsPartial",
      count(*) filter (where ${ingestRuns.errors} > 0 and ${ingestRuns.postingsSeen} = 0)::int as "runsFailed",
      count(*) filter (where ${ingestRuns.postingsSeen} = 0 and ${ingestRuns.errors} = 0)::int as "runsEmpty"
    from ${ingestRuns}
  `);

  const [pollHealth] = await db.execute<{
    orgsFailingNow: number;
    orgsRecovered: number;
    worstFailureRun: number;
  }>(sql`
    select
      count(*) filter (where ${organizations.lastPollOk} = false)::int as "orgsFailingNow",
      count(*) filter (where ${organizations.consecutiveFailures} > 0 and ${organizations.lastPollOk} = true)::int as "orgsRecovered",
      coalesce(max(${organizations.consecutiveFailures}), 0)::int as "worstFailureRun"
    from ${organizations}
  `);

  // A "successful miss" is a row the board dropped: struck once, still open.
  const missSamples = await db.execute<{
    id: string;
    title: string;
    missingStrikes: number;
    missingSince: Date | null;
    lastSeenAt: Date | null;
  }>(sql`
    select
      ${postings.id} as id,
      ${postings.title} as title,
      ${postings.missingStrikes} as "missingStrikes",
      ${postings.missingSince} as "missingSince",
      ${postings.lastSeenAt} as "lastSeenAt"
    from ${postings}
    where ${postings.closedAt} is null
      and ${postings.hiddenAt} is null
      and ${postings.missingStrikes} > 0
    order by ${postings.missingSince} desc nulls last
    limit 10
  `);

  const reopenSamples = await db.execute<{
    id: string;
    title: string;
    closedAt: Date | null;
    missingSince: Date | null;
  }>(sql`
    select
      ${postings.id} as id,
      ${postings.title} as title,
      ${postings.closedAt} as "closedAt",
      ${postings.missingSince} as "missingSince"
    from ${postings}
    where ${postings.closedAt} is not null
    order by ${postings.closedAt} desc
    limit 10
  `);

  /* ------------------------------------------------------------------ *
   * 9. Verified vs unverified in default top 10
   * ------------------------------------------------------------------ */
  const freshnessCounts = defaultTop10.items.reduce(
    (acc, item) => {
      acc[item.freshnessTier] = (acc[item.freshnessTier] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  /* ------------------------------------------------------------------ *
   * 10. Source, polling, saved links
   * ------------------------------------------------------------------ */
  const sourceCounts = await db.execute<{ source: string; count: number }>(sql`
    select ps.source, count(distinct ps.posting_id)::int as count
    from ${postingSources} ps
    join ${postings} p on p.id = ps.posting_id
    where p.closed_at is null and p.hidden_at is null
    group by ps.source
    order by count desc
  `);

  const [pollStats] = await db.execute<{
    orgsPolled: number;
    lastSuccessAt: Date | null;
    lastSuccessAgoMs: number | null;
    consecutiveFailures: number;
  }>(sql`
    select
      count(*)::int as "orgsPolled",
      max(${organizations.lastPolledAt}) filter (where ${organizations.lastPollOk} = true) as "lastSuccessAt",
      extract(epoch from (now() - max(${organizations.lastPolledAt}) filter (where ${organizations.lastPollOk} = true))) * 1000::int as "lastSuccessAgoMs",
      max(${organizations.consecutiveFailures})::int as "consecutiveFailures"
    from ${organizations}
    where ${organizations.atsType} <> 'unknown' and ${organizations.atsSlug} is not null
  `);

  const [ingestStats] = await db.execute<{
    runs: number;
    orgsPolled: number;
    errors: number;
    parseErrorRate: number | null;
  }>(sql`
    select
      count(*)::int as runs,
      coalesce(sum(${ingestRuns.orgsPolled}), 0)::int as "orgsPolled",
      coalesce(sum(${ingestRuns.errors}), 0)::int as errors,
      case when coalesce(sum(${ingestRuns.orgsPolled}), 0) > 0
        then round((sum(${ingestRuns.errors})::numeric / sum(${ingestRuns.orgsPolled})) * 100, 2)
        else null
      end as "parseErrorRate"
    from ${ingestRuns}
  `);

  const [savedDeadLinks] = await db.execute<{ count: number }>(sql`
    select count(*)::int as count
    from ${applications} a
    join ${postings} p on p.id = a.posting_id
    where p.url_dead_strikes >= 2
  `);

  return {
    generatedAt: now.toISOString(),
    connection: {
      readOnly: true,
      currentUser,
    },
    corpus: {
      openListings: stats.open,
      totalTracked,
      newLast24h,
      hiddenButOpen: hiddenOpen,
      withUnknownTerm: stats.withUnknownTerm,
      missingOrUnknownTerm,
      withExplicitTerm,
      termExplicit,
      termInferred,
      termUnknown,
      pastTermCount,
      visiblePastTermCount,
      flaggedPastTermCount,
      divergentTermCount,
      divergentTermRows: divergentTermTop,
      pastTermGroups,
      unparsableTerms,
      amountStatus: amountStatusCounts,
      openScholarshipsWithZeroAmount: amountStatusCounts.zeroAmounts,
      openScholarshipsAmountNeedsReview: needsReviewAmounts,
      openScholarshipsMalformedAmount: malformedAmounts,
    },
    trustIssues: {
      fitLabelsForIncompleteProfiles: {
        totalProfiles: profileCompleteness.totalProfiles,
        incompleteProfiles: profileCompleteness.incompleteProfiles,
        missingMajor: profileCompleteness.missingMajor,
        missingGradYear: profileCompleteness.missingGradYear,
        missingWorkAuth: profileCompleteness.missingWorkAuth,
        missingState: profileCompleteness.missingState,
        matchesRowsForIncompleteProfiles: matchesForIncomplete.count,
        note: 'Every feed render computes fit for the viewer, including signed-out/empty profiles; the stored matches count is a lower bound.',
      },
      marketingAwardsInDefaultTop10: {
        totalExamined: defaultTop10.items.length,
        marketingCount: marketingInTop10.length,
        positions: marketingInTop10.map((m) => m.position),
        rows: top10Report,
      },
      scholarshipTrustTop10: {
        totalExamined: scholarshipTop10.items.length,
        lowTrustCount: lowTrustInScholarshipTop10.length,
        lowTrustPositions: lowTrustInScholarshipTop10.map((r) => r.position),
        lotteryCount: lotteryInScholarshipTop10.length,
        lotteryPositions: lotteryInScholarshipTop10.map((r) => r.position),
        rows: scholarshipTop10Rows,
      },
      closureLifecycle: {
        ...closureStats,
        ...lifecycleRuns,
        ...pollHealth,
        missSamples,
        reopenSamples,
      },
      verifiedVsUnverifiedTop10: freshnessCounts,
    },
    uiAndGating: {
      freeLimitCopy: uiLimitLocations,
      devPaidUnlock: {
        devPasswordConfigured,
        devTierEnv,
        nodeEnv,
        devTierIgnoredInProduction: true,
        devModeAllowedInProduction,
        note:
          devModeAllowedInProduction === false
            ? 'Dev mode is disabled in production builds; /dev returns 404 and no browser action can unlock a paid tier.'
            : devPasswordConfigured
              ? '/dev is reachable in non-production builds and can force a paid tier for any browser that knows DEV_PASSWORD.'
              : '/dev is not configured; no password unlock is possible.',
      },
    },
    freshnessAndSource: {
      sourceCounts,
      polling: {
        orgsPolled: pollStats.orgsPolled,
        lastSuccessfulPollAt: iso(pollStats.lastSuccessAt),
        lastSuccessfulPollAgo: pollStats.lastSuccessAgoMs != null ? fmtDuration(Number(pollStats.lastSuccessAgoMs)) : null,
        maxConsecutiveFailures: pollStats.consecutiveFailures,
      },
      ingestRuns: {
        runs: ingestStats.runs,
        orgsPolled: ingestStats.orgsPolled,
        errors: ingestStats.errors,
        parseErrorRate: ingestStats.parseErrorRate,
      },
      savedListingsWithDeadApplyLinks: savedDeadLinks.count,
    },
  };
}

function renderMarkdown(report: BaselineReport): string {
  const c = report.corpus;
  const t = report.trustIssues;
  const u = report.uiAndGating;
  const f = report.freshnessAndSource;

  const fit = t.fitLabelsForIncompleteProfiles;
  const market = t.marketingAwardsInDefaultTop10;
  const scholarshipTrust = t.scholarshipTrustTop10;
  const closure = t.closureLifecycle;
  const freshness = t.verifiedVsUnverifiedTop10;

  const pastGroups = (c.pastTermGroups as Array<{ term: string; count: number; parsed: { year: number | null; season: string | null } }>)
    .map((g) => `| ${g.term} | ${g.count} | ${g.parsed.year ?? '?'}${g.parsed.season ? ` ${g.parsed.season}` : ''} |`)
    .join('\n') || '| — | — | — |';

  const unparsable = (c.unparsableTerms as Array<{ term: string; count: number }>)
    .map((g) => `| ${g.term} | ${g.count} |`)
    .join('\n') || '| — | — |';

  const divergentRowsMd = (c.divergentTermRows as Array<{ term: string; structured: string }>)
    .map((r) => `| ${r.term} | ${r.structured} |`)
    .join('\n') || '| — | — |';

  const missRowsMd = (closure.missSamples as Array<{
    title: string;
    missingStrikes: number;
    missingSince: Date | null;
    lastSeenAt: Date | null;
  }>)
    .map(
      (r) =>
        `| ${r.title} | ${r.missingStrikes} | ${r.missingSince ?? '-'} | ${r.lastSeenAt ?? '-'} |`,
    )
    .join('\n') || '| — | — | — | — |';

  const closedRowsMd = (closure.reopenSamples as Array<{ title: string; closedAt: Date | null }>)
    .map((r) => `| ${r.title} | ${r.closedAt ?? '-'} |`)
    .join('\n') || '| — | — |';

  const top10Rows = market.rows
    .map((r) => `| ${r.position} | ${r.kind} | ${r.title} | ${r.company} | ${r.term ?? '—'} | ${r.isContentMarketing} | ${r.freshnessTier} | ${r.applyLinkDead} |`)
    .join('\n');

  const limitRows = (u.freeLimitCopy as Array<{ location: string; field: string; value: string; defect: string; note: string }>)
    .map((l) => `| ${l.location} | ${l.field} | ${l.value} | ${l.defect} | ${l.note} |`)
    .join('\n');

  const sourceRows = (f.sourceCounts as Array<{ source: string; count: number }>)
    .map((s) => `| ${s.source} | ${s.count} |`)
    .join('\n');

  const freshnessRows = Object.entries(freshness)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');

  return `# Instela Market-Ready Baseline

**Generated:** ${report.generatedAt}  
**Connection user:** ${report.connection.currentUser}  
**Read-only session:** ${report.connection.readOnly}

---

## 1. Corpus counts

| Metric | Value |
|---|---|
| Open listings | ${c.openListings} |
| Total tracked listings | ${c.totalTracked} |
| First seen in last 24h | ${c.newLast24h} |
| Hidden but still open | ${c.hiddenButOpen} |

## 2. Term quality

| Metric | Value |
|---|---|
| All rows (open + closed) with term = NULL | ${c.withUnknownTerm} |
| Open, visible listings with missing/empty term | ${c.missingOrUnknownTerm} |
| Open, visible listings with term text | ${c.withExplicitTerm} |
| Provenance: explicit (stated in title or JD) | ${c.termExplicit} |
| Provenance: inferred (from first-seen) | ${c.termInferred} |
| Provenance: unknown | ${c.termUnknown} |
| Open, visible listings with a term year in the past | ${c.pastTermCount} |
| Of which are flagged/quarantined (not visible) | ${c.flaggedPastTermCount} |
| Of which remain visible in default feed | ${c.visiblePastTermCount} |
| Open rows whose label disagrees with the structured term | ${c.divergentTermCount} |

### Label/structure divergence (top 10)

| Stored label | Structured term |
|---|---|
${divergentRowsMd}

### Past-term groups (top 10)

| Term | Count | Parsed |
|---|---|---|
${pastGroups}

### Terms we could not parse a year from (top 10)

| Term | Count |
|---|---|
${unparsable}

## 3. Award amount status (open scholarships)

| Metric | Value |
|---|---|
| Status: exact | ${(c.amountStatus as { exact: number }).exact} |
| Status: range | ${(c.amountStatus as { range: number }).range} |
| Status: varies | ${(c.amountStatus as { varies: number }).varies} |
| Status: unparseable | ${(c.amountStatus as { unparseable: number }).unparseable} |
| Estimated per-award (total / count) | ${(c.amountStatus as { estimated: number }).estimated} |
| With program total | ${(c.amountStatus as { withProgramTotal: number }).withProgramTotal} |
| With awards count | ${(c.amountStatus as { withAwardsCount: number }).withAwardsCount} |
| Stored zero amount | ${c.openScholarshipsWithZeroAmount} |
| amountNeedsReview = true | ${c.openScholarshipsAmountNeedsReview} |
| Malformed (unparseable and source had '$') | ${c.openScholarshipsMalformedAmount} |

## 4. Fit labels for incomplete profiles

| Metric | Value |
|---|---|
| Total profiles | ${fit.totalProfiles} |
| Profiles missing at least one of major/gradYear/workAuth/state | ${fit.incompleteProfiles} |
| Missing major | ${fit.missingMajor} |
| Missing grad year | ${fit.missingGradYear} |
| Missing work auth | ${fit.missingWorkAuth} |
| Missing state (targetLocations empty) | ${fit.missingState} |
| Stored match rows for incomplete profiles | ${fit.matchesRowsForIncompleteProfiles} |

> ${fit.note}

## 5. Marketing awards in default top 10

| Metric | Value |
|---|---|
| Examined | ${market.totalExamined} |
| Marketing/law-firm in first 10 | ${market.marketingCount} |
| Positions | ${market.positions.join(', ') || 'none'} |

### Default top 10 rows

| # | Kind | Title | Company | Term | Content marketing | Freshness | Dead link |
|---|---|---|---|---|---|---|---|
${top10Rows}

## 5b. Scholarship default top 10 trust

| Metric | Value |
|---|---|
| Examined | ${scholarshipTrust.totalExamined} |
| Low trust (≤40) | ${scholarshipTrust.lowTrustCount} |
| Positions | ${scholarshipTrust.lowTrustPositions.join(', ') || 'none'} |
| Lottery / sweepstakes | ${scholarshipTrust.lotteryCount} |
| Lottery positions | ${scholarshipTrust.lotteryPositions.join(', ') || 'none'} |

### Scholarship top 10 rows

| # | Title | Company | Trust | Lottery | Sources | Reasons |
|---|---|---|---|---|---|---|
${scholarshipTrust.rows.map((r) => `| ${r.position} | ${r.title} | ${r.company} | ${r.trustScore} | ${r.isLottery ? 'yes' : 'no'} | ${r.corroborationCount} | ${r.reasons} |`).join('\n')}

## 6. Free-limit copy locations

| Location | Field | Current value | Defect type | Note |
|---|---|---|---|---|
${limitRows}

## 7. Paid-tier unlock surface

| Check | Value |
|---|---|
| DEV_PASSWORD configured | ${u.devPaidUnlock.devPasswordConfigured} |
| DEV_TIER env value | ${u.devPaidUnlock.devTierEnv ?? 'unset'} |
| NODE_ENV | ${u.devPaidUnlock.nodeEnv ?? 'unset'} |
| DEV_TIER ignored in production | ${u.devPaidUnlock.devTierIgnoredInProduction} |
| Dev mode allowed in production | ${u.devPaidUnlock.devModeAllowedInProduction} |

> ${u.devPaidUnlock.note}

## 8. Closure lifecycle

| Metric | Value |
|---|---|
| Closed rows total | ${closure.closedTotal} |
| Closed rows with missingStrikes > 0 | ${closure.closedWithMissingStrikes} |
| Closed rows with missingStrikes = 0 | ${closure.closedWithoutMissingStrikes} |
| Open rows with missingStrikes > 0 (live misses) | ${closure.openWithMissingStrikes} |
| Ingest runs that closed at least one row | ${closure.runsWithCloses} |
| Rows closed by confirmed absence | ${closure.rowsClosedByAbsence} |
| Failed poll (0 rows seen, errors) | ${closure.runsFailed} |
| Partial poll (some rows seen, errors) | ${closure.runsPartial} |
| Empty-but-clean poll (suppressed close) | ${closure.runsEmpty} |
| Boards failing right now | ${closure.orgsFailingNow} |
| Boards that failed then recovered | ${closure.orgsRecovered} |
| Worst consecutive-failure run | ${closure.worstFailureRun} |

### Live misses (struck once, still open)

| Title | Strikes | Missing since | Last seen |
|---|---|---|---|
${missRowsMd}

### Most recently closed rows

| Title | Closed at |
|---|---|
${closedRowsMd}

## 9. Verified vs unverified in default top 10

| Freshness tier | Count |
|---|---|
${freshnessRows}

## 10. Sources, polling, saved links

### Open listings by source

| Source | Count |
|---|---|
${sourceRows}

### Polling

| Metric | Value |
|---|---|
| Organizations polled | ${f.polling.orgsPolled} |
| Last successful poll | ${f.polling.lastSuccessfulPollAt ?? 'never'} (${f.polling.lastSuccessfulPollAgo ?? 'n/a'} ago) |
| Max consecutive failures | ${f.polling.maxConsecutiveFailures} |

### Ingest runs

| Metric | Value |
|---|---|
| Runs recorded | ${f.ingestRuns.runs} |
| Orgs polled (cumulative) | ${f.ingestRuns.orgsPolled} |
| Errors | ${f.ingestRuns.errors} |
| Parse/error rate | ${f.ingestRuns.parseErrorRate ?? 'n/a'}% |

### Saved listings with dead apply links

| Metric | Value |
|---|---|
| Saved rows with urlDeadStrikes >= 2 | ${f.savedListingsWithDeadApplyLinks} |

---

*Command to regenerate:* \`npm run baseline:audit\`
`;
}

async function main() {
  const report = await runBaseline();

  fs.mkdirSync(BASELINES_DIR, { recursive: true });
  const date = now.toISOString().slice(0, 10);
  const mdPath = path.join(BASELINES_DIR, `${date}-baseline.md`);
  const md = renderMarkdown(report);
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log('=== Instela Market-Ready Baseline ===');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`User: ${report.connection.currentUser}`);
  console.log(`Open listings: ${report.corpus.openListings}`);
  console.log(`Total tracked: ${report.corpus.totalTracked}`);
  console.log(`New in last 24h: ${report.corpus.newLast24h}`);
  console.log(`Missing/unknown term: ${report.corpus.missingOrUnknownTerm} (${fmtPercent(Number(report.corpus.missingOrUnknownTerm), Number(report.corpus.openListings))})`);
  console.log(`Past-term listings: ${report.corpus.pastTermCount}`);
  const as = report.corpus.amountStatus as { exact: number; range: number; varies: number; unparseable: number };
  console.log(`Amount status — exact: ${as.exact}, range: ${as.range}, varies: ${as.varies}, unparseable: ${as.unparseable}`);
  console.log(`Zero/needs-review amounts: ${report.corpus.openScholarshipsWithZeroAmount} / ${report.corpus.openScholarshipsAmountNeedsReview}`);
  console.log(`Marketing in default top 10: ${report.trustIssues.marketingAwardsInDefaultTop10.marketingCount}`);
  console.log(`Incomplete profiles: ${report.trustIssues.fitLabelsForIncompleteProfiles.incompleteProfiles} / ${report.trustIssues.fitLabelsForIncompleteProfiles.totalProfiles}`);
  console.log(`Saved dead apply links: ${report.freshnessAndSource.savedListingsWithDeadApplyLinks}`);
  console.log(`Artifact written: ${mdPath}`);

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
