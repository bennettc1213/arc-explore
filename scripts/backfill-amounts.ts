import "dotenv/config";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db/client";
import { postings } from "@/db/schema";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batchSize = Number(args.find((_, i) => args[i - 1] === "--batch-size") ?? "1000");
const cursor = args.find((_, i) => args[i - 1] === "--cursor") ?? null;

interface Counts {
  exact: number;
  range: number;
  varies: number;
  unparseable: number;
  unchanged: number;
  total: number;
}

function deriveStatus(
  min: number | null,
  max: number | null,
  needsReview: boolean,
): "exact" | "range" | "varies" | "unparseable" {
  if (needsReview) return "unparseable";
  if (min !== null && max !== null && min !== max) return "range";
  if (min !== null) return "exact";
  return "varies";
}

async function main() {
  const counts: Counts = { exact: 0, range: 0, varies: 0, unparseable: 0, unchanged: 0, total: 0 };
  let lastId: string | null = cursor;
  let done = false;

  while (!done) {
    const cursorCond = lastId ? gt(postings.id, lastId) : undefined;
    const baseCondition = cursorCond ? and(cursorCond, eq(postings.kind, "scholarship")) : eq(postings.kind, "scholarship");

    const rows = await db
      .select({
        id: postings.id,
        amountMin: postings.amountMin,
        amountMax: postings.amountMax,
        amountNeedsReview: postings.amountNeedsReview,
        amountStatus: postings.amountStatus,
      })
      .from(postings)
      .where(baseCondition)
      .orderBy(postings.id)
      .limit(batchSize);

    if (rows.length === 0) {
      done = true;
      break;
    }

    for (const row of rows) {
      const status = deriveStatus(row.amountMin, row.amountMax, row.amountNeedsReview);
      const same = row.amountStatus === status;
      counts.total++;
      if (same) {
        counts.unchanged++;
      } else {
        counts[status]++;
        if (!dryRun) {
          await db
            .update(postings)
            .set({ amountStatus: status })
            .where(eq(postings.id, row.id));
        }
      }
      lastId = row.id;
    }

    if (rows.length < batchSize) done = true;
    console.log(`${dryRun ? "counted" : "processed"} ${counts.total} rows${lastId ? `, last id ${lastId}` : ""}`);
  }

  console.log("---");
  console.log(dryRun ? "DRY RUN — no rows updated" : "BACKFILL COMPLETE");
  console.log(JSON.stringify(counts, null, 2));
  if (lastId) console.log(`resume cursor: ${lastId}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
