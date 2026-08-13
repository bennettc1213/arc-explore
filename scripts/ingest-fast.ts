/**
 * Tier A — poll every registered company's own ATS.
 *
 * Runs every 20 minutes in CI. This is the loop the product's central claim
 * depends on: a posting in today's response is verifiably live, and one that
 * has disappeared gets closed. Neither is derivable from a single run.
 *
 *   npm run ingest:fast [-- --limit 250 --concurrency 6]
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { runTierA } from "../src/lib/ingest/run";

function flag(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : undefined;
}

async function main() {
  const res = await runTierA({
    limit: flag("limit"),
    concurrency: flag("concurrency"),
    budgetMs: flag("budgetMinutes") ? flag("budgetMinutes")! * 60_000 : undefined,
  });

  console.log(
    [
      `tier A run ${res.runId}`,
      `  boards polled     : ${res.orgsPolled} (${res.notModified} unchanged, ${res.errors} failed)`,
      `  skipped for time  : ${res.orgsSkippedForTime}`,
      `  postings seen     : ${res.postingsSeen}`,
      `  new               : ${res.postingsNew}`,
      `  closed            : ${res.postingsClosed}`,
      `  reopened          : ${res.postingsReopened}`,
      `  close suppressed  : ${res.closeSuppressed} board(s)`,
      `  descriptions      : ${res.backfill.enriched}/${res.backfill.attempted} backfilled`,
      `  duration          : ${(res.durationMs / 1000).toFixed(1)}s`,
    ].join("\n"),
  );

  for (const e of res.errorSamples) console.log(`  ! ${e}`);

  /*
   * Fail the job only on a systemic problem.
   *
   * Individual boards break constantly — a company renames a slug, an ATS
   * 502s. Exiting non-zero for those would put the workflow permanently red
   * and train us to ignore it, which is exactly how stale data goes unnoticed.
   * A majority-failure run is different: that is our side, or an outage.
   */
  const attempted = res.orgsPolled + res.errors;
  if (attempted > 0 && res.errors > attempted / 2) {
    console.error(`\nFAILED: ${res.errors}/${attempted} boards errored — that is not normal`);
    process.exit(1);
  }
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
