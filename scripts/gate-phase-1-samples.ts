/**
 * Phase 1 trust gate manual samples.
 *
 * Generates the random samples used by `phase-1-trust-gate.md`. Every query is
 * a SELECT; the script only writes the local gate document.
 *
 *   npx tsx scripts/gate-phase-1-samples.ts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db, closeDb } from "@/db/client";
import { postings, postingSources, profiles } from "@/db/schema";
import { getFeed } from "@/lib/feed";
import { toScoreProfile } from "@/lib/profile/types";
import { FREE_DAILY_RESULTS } from "@/lib/feed-trim";

const OUT = "docs/instela-market-ready/gates/phase-1-samples.md";

/*
 * Read-only by construction: every query below is a SELECT.
 *
 * No `SET default_transaction_read_only = on` here. That GUC is
 * session-scoped, and DATABASE_URL points at Supabase's Transaction Pooler,
 * which keeps the physical backend alive between clients — so the setting
 * outlives this process and silently breaks writes for whoever borrows the
 * connection next.
 */
async function assertNotReadOnly(): Promise<void> {
  const [row] = await db.execute<{ readOnly: string }>(
    sql`select current_setting('default_transaction_read_only') as "readOnly"`,
  );
  if (row?.readOnly === "on") {
    console.warn(
      "[samples] backend is in read-only mode; sampling still works, but another " +
        "process sharing this pooler backend cannot write.",
    );
  }
}

function esc(s: string | null): string {
  if (s == null) return "—";
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function main() {
  await assertNotReadOnly();
  const generatedAt = new Date().toISOString();

  /* 1. Term correctness sample across source types */
  const termSamples = await db.execute<{
    id: string;
    kind: string;
    source: string;
    title: string;
    term: string;
    term_source: string;
    term_ended_flag_at: Date | null;
  }>(sql`
    with ranked as (
      select
        p.id,
        p.kind,
        ps.source,
        p.title,
        p.term,
        p.term_source,
        p.term_ended_flag_at,
        row_number() over (partition by ps.source order by random()) as rn
      from ${postings} p
      join ${postingSources} ps on ps.posting_id = p.id
      where p.closed_at is null
        and p.hidden_at is null
        and p.term is not null
        and trim(p.term) <> ''
    )
    select id, kind, source, title, term, term_source, term_ended_flag_at
    from ranked
    where rn <= 3
    order by source, rn
    limit 20
  `);

  /* 2. Scholarship amount-status sample */
  const amountSamples = await db.execute<{
    id: string;
    title: string;
    amount_status: string;
    amount_min: number | null;
    amount_max: number | null;
    program_total: number | null;
    awards_count: number | null;
    amount_is_estimated: boolean;
  }>(sql`
    with ranked as (
      select
        p.id,
        p.title,
        p.amount_status,
        p.amount_min,
        p.amount_max,
        p.program_total,
        p.awards_count,
        p.amount_is_estimated,
        row_number() over (partition by p.amount_status order by random()) as rn
      from ${postings} p
      where p.closed_at is null
        and p.hidden_at is null
        and p.kind = 'scholarship'
    )
    select id, title, amount_status, amount_min, amount_max, program_total, awards_count, amount_is_estimated
    from ranked
    where rn <= 8
    order by amount_status, rn
    limit 20
  `);

  /* 3. Profile-completeness counts and examples */
  const profileCounts = await db.execute<{
    totalProfiles: number;
    completeProfiles: number;
    incompleteProfiles: number;
    missingMajor: number;
    missingGradYear: number;
    missingWorkAuth: number;
    missingState: number;
  }>(sql`
    select
      count(*)::int as "totalProfiles",
      count(*) filter (
        where major is not null and grad_year is not null and work_auth is not null
          and coalesce(target_locations, '{}') <> '{}'
      )::int as "completeProfiles",
      count(*) filter (
        where major is null or grad_year is null or work_auth is null
          or coalesce(target_locations, '{}') = '{}'
      )::int as "incompleteProfiles",
      count(*) filter (where major is null)::int as "missingMajor",
      count(*) filter (where grad_year is null)::int as "missingGradYear",
      count(*) filter (where work_auth is null)::int as "missingWorkAuth",
      count(*) filter (where coalesce(target_locations, '{}') = '{}')::int as "missingState"
    from ${profiles}
  `);

  const profileExamples = await db.execute<{
    id: string;
    major: string | null;
    grad_year: number | null;
    work_auth: string | null;
    target_locations: string[] | null;
    state: string;
  }>(sql`
    with buckets as (
      select
        id,
        major,
        grad_year,
        work_auth,
        target_locations,
        case
          when major is not null and grad_year is not null and work_auth is not null
            and coalesce(target_locations, '{}') <> '{}' then 'complete'
          when major is null and grad_year is null and work_auth is null
            and coalesce(target_locations, '{}') = '{}' then 'empty'
          else 'partial'
        end as bucket,
        row_number() over (partition by
          case
            when major is not null and grad_year is not null and work_auth is not null
              and coalesce(target_locations, '{}') <> '{}' then 'complete'
            when major is null and grad_year is null and work_auth is null
              and coalesce(target_locations, '{}') = '{}' then 'empty'
            else 'partial'
          end
          order by random()
        ) as rn
      from ${profiles}
    )
    select id, major, grad_year, work_auth, target_locations, bucket as state
    from buckets
    where rn <= 3
    order by bucket
  `);

  /* 4. Default top-10 fit labels with an empty profile */
  const emptyProfile = toScoreProfile(null);
  const defaultTop10 = await getFeed(emptyProfile, { limit: 10 });
  const fitLabels = defaultTop10.items.map((item, index) => ({
    position: index + 1,
    title: item.title,
    kind: item.kind,
    fitScore: item.fit.score,
    blocked: item.fit.blocked,
    knownDimensions: item.fit.knownDimensions,
    totalDimensions: item.fit.totalDimensions,
  }));

  /* 5. Lottery shelf sample */
  const lotterySamples = await db.execute<{
    id: string;
    title: string;
    is_lottery: boolean;
    lottery_reasons: Array<{ signal: string; detail: string }> | null;
  }>(sql`
    select id, title, is_lottery, lottery_reasons
    from ${postings}
    where kind = 'scholarship'
      and closed_at is null
      and hidden_at is null
      and is_lottery = true
    order by random()
    limit 5
  `);

  /* 6. Ended-term rows (should all be flagged) */
  const endedTermRows = await db.execute<{
    id: string;
    term: string;
    term_ended_flag_at: Date | null;
  }>(sql`
    select id, term, term_ended_flag_at
    from ${postings}
    where closed_at is null
      and hidden_at is null
      and term is not null
      and term ~ '^.*(20[0-9]{2}).*$'
      and (
        (term ilike '%spring%' and term ~ '202[0-5]')
        or (term ilike '%summer%' and term ~ '202[0-5]')
        or (term ilike '%fall%' and term ~ '202[0-5]')
        or (term ilike '%winter%' and term ~ '202[0-5]')
      )
    order by term
    limit 10
  `);

  const termRowsMd = termSamples
    .map(
      (r, i) =>
        `| ${i + 1} | ${r.kind} | ${esc(r.source)} | ${esc(r.title)} | ${esc(r.term)} | ${esc(r.term_source)} | ${r.term_ended_flag_at ? "quarantined" : "visible"} |`,
    )
    .join("\n");

  const amountRowsMd = amountSamples
    .map(
      (r, i) =>
        `| ${i + 1} | ${esc(r.title)} | ${esc(r.amount_status)} | ${r.amount_min ?? "—"} | ${r.amount_max ?? "—"} | ${r.program_total ?? "—"} | ${r.awards_count ?? "—"} | ${r.amount_is_estimated} |`,
    )
    .join("\n");

  const profileRowsMd = profileExamples
    .map(
      (r) =>
        `| ${r.id} | ${r.major ? esc(r.major) : "—"} | ${r.grad_year ?? "—"} | ${r.work_auth ? esc(r.work_auth) : "—"} | ${r.target_locations?.length ? r.target_locations.join(", ") : "—"} | ${r.state} |`,
    )
    .join("\n");

  const fitRowsMd = fitLabels
    .map(
      (r) =>
        `| ${r.position} | ${r.kind} | ${esc(r.title)} | ${r.fitScore ?? "—"} | ${r.knownDimensions}/${r.totalDimensions} | ${r.blocked} |`,
    )
    .join("\n");

  const lotteryRowsMd = lotterySamples
    .map(
      (r, i) =>
        `| ${i + 1} | ${esc(r.title)} | ${r.is_lottery} | ${(r.lottery_reasons ?? []).map((x) => x.detail).join("; ") || "—"} |`,
    )
    .join("\n");

  const endedTermRowsMd = endedTermRows
    .map(
      (r, i) =>
        `| ${i + 1} | ${esc(r.term)} | ${r.term_ended_flag_at ? new Date(r.term_ended_flag_at).toISOString() : "NOT FLAGGED"} |`,
    )
    .join("\n");

  const md = `# Phase 1 Trust Gate — Manual Samples

**Generated:** ${generatedAt}  
**Command:** npx tsx scripts/gate-phase-1-samples.ts

All queries are read-only. Identifiers are UUIDs; titles are quoted only to make the sample reviewable. No personal profile fields (name, email, school, GPA, portfolio) are included.

---

## 1. Term correctness across source types (n=${termSamples.length})

| # | Kind | Source | Title | Term | Source label | Visible? |
|---|---|---|---|---|---|---|
${termRowsMd}

Sample method: stratified random sample, up to 3 rows per distinct source, limited to rows with a non-empty term.

## 2. Scholarship amount statuses (n=${amountSamples.length})

| # | Title | Status | Min | Max | Program total | Awards count | Estimated? |
|---|---|---|---|---|---|---|---|
${amountRowsMd}

Sample method: up to 5 random rows per amount status (exact, range, varies, unparseable).

## 3. Profile completeness (n=${profileCounts[0]?.totalProfiles ?? 0})

| State | Count |
|---|---|
| Complete (all four fields) | ${profileCounts[0]?.completeProfiles ?? 0} |
| Incomplete | ${profileCounts[0]?.incompleteProfiles ?? 0} |
| Missing major | ${profileCounts[0]?.missingMajor ?? 0} |
| Missing grad year | ${profileCounts[0]?.missingGradYear ?? 0} |
| Missing work auth | ${profileCounts[0]?.missingWorkAuth ?? 0} |
| Missing state/locations | ${profileCounts[0]?.missingState ?? 0} |

### Representative profiles

| ID | Major | Grad year | Work auth | Locations | State |
|---|---|---|---|---|---|
${profileRowsMd}

## 4. Default top-10 fit labels with an empty profile

Free-limit cap under test: ${FREE_DAILY_RESULTS}.

| # | Kind | Title | Fit score | Known/Total dimensions | Blocked |
|---|---|---|---|---|---|---|---|
${fitRowsMd}

Expected: no "Strong Fit" or percentage-like score for an empty profile.

## 5. Lottery-style awards shelf (sample)

| # | Title | Lottery? | Reasons |
|---|---|---|---|
${lotteryRowsMd}

## 6. Open rows with ended terms (should be quarantined)

| # | Term | Flagged at |
|---|---|---|
${endedTermRowsMd}

Expected: every open row whose term has ended carries a non-null termEndedFlagAt and is therefore excluded from the default feed.
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md, "utf8");
  console.log(`Wrote ${OUT}`);

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
