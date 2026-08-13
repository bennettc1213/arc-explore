/**
 * Tier B — daily registry discovery.
 *
 * Reads the Simplify repo for **company names only** and enrolls them, so Tier
 * A can start polling their real boards. No listing content is stored: that
 * repo has no license (default all-rights-reserved), and its own data measured
 * 50% stale on postings over 30 days old — so pulling listings from each
 * employer's ATS instead is both the legally clean path and the better data.
 *
 *   npm run ingest:daily [-- --max-new 400]
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { runTierB } from "../src/lib/ingest/run";

function flag(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : undefined;
}

async function main() {
  const res = await runTierB({ maxNewOrgs: flag("max-new") });

  console.log(
    [
      `tier B run ${res.runId}`,
      `  records scanned   : ${res.recordsScanned}`,
      `  companies found   : ${res.companiesFound}`,
      `  pollable          : ${res.pollable}`,
      `  newly enrolled    : ${res.created}`,
      `  already known     : ${res.alreadyKnown}`,
      `  held back by cap  : ${res.skippedForCap}`,
      `  by ats            : ${JSON.stringify(res.byAts)}`,
      `  duration          : ${(res.durationMs / 1000).toFixed(1)}s`,
    ].join("\n"),
  );

  // Zero companies means the upstream format changed or the fetch failed —
  // silently enrolling nothing forever is the failure mode to catch here.
  if (res.pollable === 0) {
    console.error("\nFAILED: discovery produced no pollable companies");
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
