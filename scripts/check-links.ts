/**
 * Request the apply URL of open postings and record what it answered.
 *
 *   npm run check:links                 # check the default batch
 *   npm run check:links -- --limit 50   # smaller batch
 *   npm run check:links -- --dry-run    # request, report, write nothing
 *
 * This flags and never closes. `closed_at` means the employer stopped listing
 * the job; a 404 is one HTTP response, and two of them in a row is the most
 * this is ever allowed to conclude. See lib/ingest/linkcheck.ts.
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { flaggedCount, runLinkCheck } from "../src/lib/ingest/linkcheck-run";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function value(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const limitRaw = value("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isInteger(limit) || limit! < 1)) {
    console.error(`--limit must be a positive integer, got "${limitRaw}"`);
    process.exitCode = 1;
    return;
  }

  const dryRun = flag("dry-run");
  console.log(`checking apply urls${dryRun ? " (dry run — nothing will be written)" : ""}…`);

  const started = Date.now();
  const summary = await runLinkCheck({ limit, dryRun });
  const seconds = Math.round((Date.now() - started) / 1000);

  console.log(
    `\nchecked ${summary.checked} in ${seconds}s — ` +
      `${summary.alive} alive · ${summary.dead} answered dead · ${summary.inconclusive} inconclusive`,
  );

  if (summary.newlyFlagged.length > 0) {
    console.log(
      `\n${summary.newlyFlagged.length} newly flagged (second consecutive dead answer):`,
    );
    for (const p of summary.newlyFlagged) {
      console.log(`  ${p.status ?? "—"}  ${p.title}`);
      console.log(`       ${p.url}`);
    }
  }

  if (summary.errors.length > 0) {
    console.log(`\n${summary.errors.length} errors:`);
    for (const e of summary.errors.slice(0, 10)) console.log(`  ${e}`);
  }

  if (!dryRun) {
    console.log(`\n${await flaggedCount()} open postings currently carry the dead flag.`);
  }

  console.log(
    "\nnothing here closed a posting. a link check flags; only disappearance from " +
      "the employer's own feed closes.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
