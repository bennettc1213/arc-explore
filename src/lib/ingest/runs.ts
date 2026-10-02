/**
 * Ingest run bookkeeping.
 *
 * A silent ingestion failure means stale data, which is precisely the problem
 * this product exists to solve — so every scheduled run leaves a row behind
 * whether it succeeded or not. `ingest_runs` is how you answer "when did this
 * corpus last actually move?" without reading CI logs.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { ingestRuns, type RunStatus } from "@/db/schema";

export interface RunTotals {
  orgsPolled: number;
  postingsSeen: number;
  postingsNew: number;
  postingsClosed: number;
  errors: number;
  /**
   * Defaults to `successful_complete` for callers that predate the column. A run
   * that never set it is far more likely to be an older caller than a genuine
   * claim, and `failed` would be the wrong thing to assume.
   */
  status?: RunStatus;
  detail?: unknown;
}

export async function startRun(tier: string, source?: string): Promise<string> {
  const [row] = await db
    .insert(ingestRuns)
    .values({ tier, source })
    .returning({ id: ingestRuns.id });
  return row.id;
}

export async function finishRun(id: string, totals: RunTotals): Promise<void> {
  await db
    .update(ingestRuns)
    .set({
      finishedAt: new Date(),
      orgsPolled: totals.orgsPolled,
      postingsSeen: totals.postingsSeen,
      postingsNew: totals.postingsNew,
      postingsClosed: totals.postingsClosed,
      errors: totals.errors,
      status: totals.status ?? "successful_complete",
      detail: (totals.detail ?? null) as object | null,
    })
    .where(eq(ingestRuns.id, id));
}
