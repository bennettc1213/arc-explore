/** Explicit one-shot connections only; does not modify the scheduled source list. */
import "dotenv/config";
import { closeDb } from "../src/db/client";
import { describeError } from "../src/lib/ingest/errors";
import { startRun, finishRun } from "../src/lib/ingest/runs";
import { fetchBrowardScholarships } from "../src/lib/scholarships/cfbroward";
import { persistScholarships } from "../src/lib/scholarships/persist";

async function main() {
  const source = process.argv[process.argv.indexOf("--source") + 1];
  if (source !== "cfbroward") throw new Error("Choose --source cfbroward");
  const listings = await fetchBrowardScholarships();
  console.log(JSON.stringify({ source, read: listings.length, open: listings.filter(l => l.isOpen).length,
    amountsKnown: listings.filter(l => l.amountMax !== null).length, deadlinesKnown: listings.filter(l => l.deadlineAt).length,
    titles: listings.map(l => ({ title: l.title, url: l.url, open: l.isOpen })) }));
  if (!process.argv.includes("--apply")) return;
  const runId = await startRun("scholarships-manual", source);
  try {
    const result = await persistScholarships(source, listings, { absenceAuthoritative: false });
    await finishRun(runId, { orgsPolled: 1, postingsSeen: listings.length, postingsNew: result.inserted, postingsClosed: result.closed, errors: 0,
      status: result.inserted || result.updated ? "successful_complete" : "successful_no_changes", detail: { ...result, cadence: "manual; scheduling deferred by owner" } });
    console.log(JSON.stringify(result));
  } catch (e) {
    await finishRun(runId, { orgsPolled: 1, postingsSeen: 0, postingsNew: 0, postingsClosed: 0, errors: 1, status: "failed", detail: { error: describeError(e) } }); throw e;
  }
}
main().catch(e => { console.error(describeError(e)); process.exitCode = 1; }).finally(() => closeDb());
