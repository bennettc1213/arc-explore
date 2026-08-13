/**
 * Scholarship ingestion — scraped sources, checked periodically rather than
 * polled every 20 minutes. See `src/lib/scholarships/cftexas.ts` for why this
 * is not just Tier A pointed at a new source: there is no ATS underneath a
 * scholarship page, and the source states open/closed directly instead of
 * requiring us to infer it from what disappeared between two polls.
 *
 *   npm run ingest:scholarships
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { fetchScholarships } from "../src/lib/scholarships/cftexas";
import { persistScholarships } from "../src/lib/scholarships/persist";
import { finishRun, startRun } from "../src/lib/ingest/runs";

async function main() {
  const runId = await startRun("scholarships", "cftexas");
  const started = Date.now();

  try {
    const listings = await fetchScholarships();

    // Zero listings from a page that has carried dozens for as long as this
    // has been checked means the scrape broke, not that every scholarship on
    // it vanished at once. persistScholarships already refuses to close
    // anything on an empty snapshot — this is the loud version of that same
    // refusal, so a broken parser gets noticed instead of quietly no-op'ing
    // in CI forever.
    if (listings.length === 0) {
      throw new Error("cftexas: parsed zero listings — page structure likely changed");
    }

    const result = await persistScholarships("cftexas", listings);
    const openCount = listings.filter((l) => l.isOpen).length;

    await finishRun(runId, {
      orgsPolled: 1,
      postingsSeen: listings.length,
      postingsNew: result.inserted,
      postingsClosed: result.closed,
      errors: 0,
      detail: { source: "cftexas", updated: result.updated, open: openCount },
    });

    console.log(
      [
        `scholarships run ${runId}`,
        `  source     : cftexas`,
        `  seen       : ${listings.length} (${openCount} currently open)`,
        `  inserted   : ${result.inserted}`,
        `  updated    : ${result.updated}`,
        `  closed     : ${result.closed}`,
        `  duration   : ${((Date.now() - started) / 1000).toFixed(1)}s`,
      ].join("\n"),
    );
  } catch (err) {
    await finishRun(runId, {
      orgsPolled: 0,
      postingsSeen: 0,
      postingsNew: 0,
      postingsClosed: 0,
      errors: 1,
      detail: { source: "cftexas", error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
