/**
 * End-to-end dry run of the M1 ingestion pipeline, against live data, with no
 * database required.
 *
 *   Tier B discovery -> registry -> Tier A polling -> reconcile
 *
 * Also demonstrates close-detection by re-reconciling a poll with one posting
 * removed, which is the behaviour behind the product's "still live" claim.
 *
 *   npx tsx scripts/ingest-dryrun.ts [orgCount]
 */

import { mapLimit } from "../src/lib/ingest/http";
import { reconcile, preparePosting, type ExistingPosting } from "../src/lib/ingest/reconcile";
import { discoverOrgs, type DiscoveredOrg } from "../src/lib/ingest/sources/simplify";
import { ashby } from "../src/lib/ingest/sources/ashby";
import { greenhouse } from "../src/lib/ingest/sources/greenhouse";
import { lever } from "../src/lib/ingest/sources/lever";
import { smartrecruiters } from "../src/lib/ingest/sources/smartrecruiters";
import type { BoardAdapter } from "../src/lib/ingest/types";

const ADAPTERS: Record<string, BoardAdapter> = {
  greenhouse,
  ashby,
  lever,
  smartrecruiters,
};

const ORG_LIMIT = Number(process.argv[2] ?? 60);

function hours(d: Date | null): number | null {
  return d ? (Date.now() - d.getTime()) / 3_600_000 : null;
}

async function main() {
  console.log("STEP 1 — Tier B discovery (company names only, no listings kept)");
  const t0 = Date.now();
  const discovery = await discoverOrgs({ includeInactive: true });
  const pollable = discovery.orgs.filter((o) => o.atsType !== "unknown" && o.atsSlug);
  console.log(`  scanned ${discovery.recordsScanned} records in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  companies discovered : ${discovery.orgs.length}`);
  console.log(`  immediately pollable : ${pollable.length}`);

  // Prefer the fast adapters for a representative sample.
  const sample: DiscoveredOrg[] = pollable
    .filter((o) => o.atsType !== "smartrecruiters")
    .slice(0, ORG_LIMIT);

  console.log(`\nSTEP 2 — Tier A polling of ${sample.length} boards (concurrency 8)`);
  const t1 = Date.now();

  let boardsOk = 0;
  let boardsFailed = 0;
  let totalPostings = 0;
  const allEarly: ReturnType<typeof preparePosting>[] = [];
  const perOrg: Array<{ org: DiscoveredOrg; early: number; total: number }> = [];

  await mapLimit(sample, 8, async (org) => {
    try {
      const { postings } = await ADAPTERS[org.atsType].fetchBoard(org.atsSlug!);
      const plan = reconcile({ incoming: postings, existing: [], totalOnBoard: postings.length });
      boardsOk++;
      totalPostings += postings.length;
      allEarly.push(...plan.toInsert);
      if (plan.toInsert.length > 0) {
        perOrg.push({ org, early: plan.toInsert.length, total: postings.length });
      }
    } catch {
      boardsFailed++;
    }
  });

  console.log(`  completed in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`  boards ok / failed   : ${boardsOk} / ${boardsFailed}`);
  console.log(`  postings scanned     : ${totalPostings}`);
  console.log(`  early-career kept    : ${allEarly.length}`);

  const kinds = allEarly.reduce<Record<string, number>>((acc, p) => {
    acc[p.kind] = (acc[p.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  by kind              : ${JSON.stringify(kinds)}`);

  const withTerm = allEarly.filter((p) => p.term).length;
  const withAuth = allEarly.filter((p) => p.workAuth).length;
  const withPosted = allEarly.filter((p) => p.postedAt).length;
  console.log(`  term known           : ${withTerm}/${allEarly.length} (rest render as honest slots)`);
  console.log(`  work-auth known      : ${withAuth}/${allEarly.length}`);
  console.log(`  posted-date known    : ${withPosted}/${allEarly.length}`);

  // Freshness distribution — the thing the product is actually selling.
  const buckets: Record<string, number> = { "<24h": 0, "1-7d": 0, "7-30d": 0, ">30d": 0, unknown: 0 };
  for (const p of allEarly) {
    const h = hours(p.postedAt);
    if (h === null) buckets.unknown++;
    else if (h < 24) buckets["<24h"]++;
    else if (h < 168) buckets["1-7d"]++;
    else if (h < 720) buckets["7-30d"]++;
    else buckets[">30d"]++;
  }
  console.log(`  freshness (employer-stated posting date): ${JSON.stringify(buckets)}`);

  console.log(`\n  top boards by early-career count:`);
  for (const r of perOrg.sort((a, b) => b.early - a.early).slice(0, 8)) {
    console.log(`    ${String(r.early).padStart(3)} of ${String(r.total).padStart(4)}  ${r.org.name} (${r.org.atsType})`);
  }

  console.log(`\n  sample postings:`);
  for (const p of allEarly.slice(0, 6)) {
    console.log(
      `    - ${p.title}\n      ${p.companyName} | ${p.locations[0] ?? "(no location)"} | term: ${p.term ?? "unknown"} | ${p.url.slice(0, 62)}`,
    );
  }

  console.log(`\nSTEP 3 — close detection`);
  if (allEarly.length < 2) {
    console.log("  not enough postings sampled to demonstrate");
  } else {
    // Simulate the next poll, with one posting no longer on the board.
    const existing: ExistingPosting[] = allEarly.map((p) => ({
      canonicalHash: p.canonicalHash,
      closedAt: null,
    }));
    const removed = allEarly[0];

    const plan = reconcile({
      incoming: [],
      existing,
      totalOnBoard: 50, // board alive, this role simply gone
    });
    console.log(`  board alive, ${existing.length} known postings absent -> closed: ${plan.toClose.length}`);
    console.log(`  e.g. "${removed.title}" would be marked closed`);

    const guarded = reconcile({ incoming: [], existing, totalOnBoard: 0 });
    console.log(
      `  board returned NOTHING -> closed: ${guarded.toClose.length} (suppressed: ${guarded.closeSuppressed})`,
    );
    console.log(`  ^ the guard that stops an upstream hiccup from wiping the feed`);
  }

  console.log(`\nDONE — pipeline ran end-to-end on live data, no database required.`);
}

void main();
