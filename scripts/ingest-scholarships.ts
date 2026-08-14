/**
 * Scholarship ingestion — scraped sources, checked periodically rather than
 * polled every 20 minutes. See `src/lib/scholarships/cftexas.ts` for why this
 * is not just Tier A pointed at a new source: there is no ATS underneath a
 * scholarship page, and each source states or dates its own open/closed
 * status instead of requiring us to infer it from what disappeared between
 * two polls.
 *
 *   npm run ingest:scholarships [-- --source unl]
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import * as cftexas from "../src/lib/scholarships/cftexas";
import * as parse from "../src/lib/scholarships/parse";
import * as unl from "../src/lib/scholarships/unl";
import * as unr from "../src/lib/scholarships/unr";
import { persistScholarships } from "../src/lib/scholarships/persist";
import type { ScholarshipSource } from "../src/lib/scholarships/types";
import { describeError } from "../src/lib/ingest/errors";
import { finishRun, startRun } from "../src/lib/ingest/runs";

interface Source {
  name: ScholarshipSource;
  fetchScholarships: () => Promise<import("../src/lib/scholarships/types").ScholarshipListing[]>;
}

const SOURCES: Source[] = [
  { name: "cftexas", fetchScholarships: cftexas.fetchScholarships },
  { name: "unl", fetchScholarships: unl.fetchScholarships },
  { name: "unr", fetchScholarships: unr.fetchScholarships },
  { name: "scholarshipscom", fetchScholarships: parse.fetchScholarshipsCom },
  { name: "scholarshipportal", fetchScholarships: parse.fetchScholarshipPortal },
];

function requestedSource(): string | undefined {
  const i = process.argv.indexOf("--source");
  return i === -1 ? undefined : process.argv[i + 1];
}

async function runSource(source: Source): Promise<boolean> {
  const runId = await startRun("scholarships", source.name);
  const started = Date.now();

  try {
    const listings = await source.fetchScholarships();

    // Zero listings from a page that has carried dozens every time it has
    // been checked means the scrape broke, not that every scholarship on it
    // vanished at once. persistScholarships already refuses to close anything
    // on an empty snapshot — this is the loud version of the same refusal, so
    // a broken parser gets noticed instead of quietly no-op'ing in CI forever.
    if (listings.length === 0) {
      throw new Error(`${source.name}: parsed zero listings — page structure likely changed`);
    }

    const result = await persistScholarships(source.name, listings);
    const openCount = listings.filter((l) => l.isOpen).length;

    await finishRun(runId, {
      orgsPolled: 1,
      postingsSeen: listings.length,
      postingsNew: result.inserted,
      postingsClosed: result.closed,
      errors: 0,
      detail: { source: source.name, updated: result.updated, open: openCount },
    });

    console.log(
      [
        `${source.name}`,
        `  seen     : ${listings.length} (${openCount} currently open)`,
        `  inserted : ${result.inserted}`,
        `  updated  : ${result.updated}`,
        `  closed   : ${result.closed}`,
        `  duration : ${((Date.now() - started) / 1000).toFixed(1)}s`,
      ].join("\n"),
    );
    return true;
  } catch (err) {
    // describeError, not err.message: a failed bulk insert's message is the
    // whole statement plus every bound parameter, and the part that says what
    // actually broke is on err.cause. See lib/ingest/errors.ts.
    const error = describeError(err);
    await finishRun(runId, {
      orgsPolled: 0,
      postingsSeen: 0,
      postingsNew: 0,
      postingsClosed: 0,
      errors: 1,
      detail: { source: source.name, error },
    });
    console.error(`${source.name}: FAILED — ${error}`);
    return false;
  }
}

async function main() {
  const only = requestedSource();
  const sources = only ? SOURCES.filter((s) => s.name === only) : SOURCES;

  if (sources.length === 0) {
    console.error(`unknown source "${only}" — known: ${SOURCES.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  const results: boolean[] = [];
  for (const source of sources) {
    results.push(await runSource(source));
  }

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} sources ok`);

  // One broken source must not hide the others' results, but every source
  // failing is systemic and should turn the workflow red.
  if (failed === results.length) {
    console.error("FAILED: every source errored");
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
