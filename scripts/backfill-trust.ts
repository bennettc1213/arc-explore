/**
 * Backfill trust/lottery/corroboration columns for existing scholarship rows.
 *
 * Run after applying migration 0024_scholarship_trust.sql.
 *
 *   npx tsx scripts/backfill-trust.ts
 *
 * It recomputes the v1 trust assessment from the row's own text and the
 * current corroboration count across `posting_sources`, then writes the
 * resulting columns back to `postings`. Safe to re-run: every row is re-derived
 * from observable signals, not from the current stored values.
 */

import "dotenv/config";

import { count, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { postings, postingSources } from "@/db/schema";
import { assessTrust, lotteryReasonsForStorage, trustReasonsForStorage } from "@/lib/scholarships/trust";

const BATCH = 500;

async function main(): Promise<void> {
  const [{ n }] = await db.select({ n: count() }).from(postings).where(eq(postings.kind, "scholarship"));
  console.log(`Backfilling trust columns for ${n} scholarship rows...`);

  let offset = 0;
  let updated = 0;

  while (offset < n) {
    const rows = await db
      .select({
        id: postings.id,
        title: postings.title,
        sponsorName: postings.sponsorName,
        amountMin: postings.amountMin,
        amountMax: postings.amountMax,
        eligibility: postings.eligibility,
      })
      .from(postings)
      .where(eq(postings.kind, "scholarship"))
      .orderBy(postings.id)
      .limit(BATCH)
      .offset(offset);

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const counts = await db
      .select({
        postingId: postingSources.postingId,
        sources: sql<number>`count(distinct ${postingSources.source})::int`,
      })
      .from(postingSources)
      .where(inArray(postingSources.postingId, ids))
      .groupBy(postingSources.postingId);

    const countById = new Map(counts.map((c) => [c.postingId, c.sources]));

    for (const row of rows) {
      const corroborationCount = countById.get(row.id) ?? 0;
      const eligibility = Array.isArray((row.eligibility as { criteria?: string[] } | null)?.criteria)
        ? ((row.eligibility as { criteria: string[] }).criteria)
        : [];
      const assessment = assessTrust({
        sponsorName: row.sponsorName ?? "",
        title: row.title,
        eligibility,
        amountMin: row.amountMin,
        amountMax: row.amountMax,
        corroborationCount,
      });

      await db
        .update(postings)
        .set({
          trustScore: assessment.score,
          trustReasons: trustReasonsForStorage(assessment.reasons),
          isLottery: assessment.isLottery,
          lotteryReasons: lotteryReasonsForStorage(assessment.lotteryReasons),
          corroborationCount,
        })
        .where(eq(postings.id, row.id));
      updated++;
    }

    console.log(`  ... ${updated} / ${n}`);
    offset += BATCH;
  }

  console.log(`Done. Updated ${updated} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
