/** Validate/use existing local USAJobs credentials for a manual, non-closing import. */
import "dotenv/config";
import { closeDb } from "../src/db/client";
import { describeError } from "../src/lib/ingest/errors";
import { normalizeCompanyName } from "../src/lib/ingest/normalize";
import { persistPoll, upsertOrg } from "../src/lib/ingest/persist";
import { startRun, finishRun } from "../src/lib/ingest/runs";
import { fetchUsaJobsStudentPostings } from "../src/lib/ingest/sources/usajobs";
import type { SourcePosting } from "../src/lib/ingest/types";

async function main() {
  const listings = await fetchUsaJobsStudentPostings();
  if (!listings.length) throw new Error("USAJobs returned no valid announcements; import held");
  console.log(JSON.stringify({ source: "usajobs", announcements: listings.length, authenticated: true }));
  if (!process.argv.includes("--apply")) return;
  const byAgency = new Map<string, SourcePosting[]>();
  for (const p of listings) { if (!p.companyName.trim()) continue; const group = byAgency.get(p.companyName) ?? []; group.push(p); byAgency.set(p.companyName, group); }
  const runId = await startRun("usajobs-manual", "usajobs");
  let inserted = 0, refreshed = 0, errors = 0;
  for (const [name, postings] of byAgency) {
    try {
      const org = await upsertOrg({ name, normalizedName: normalizeCompanyName(name), atsType: "unknown", atsSlug: `usajobs:${normalizeCompanyName(name)}`, discoveredVia: "usajobs" });
      const outcome = await persistPoll(org.id, postings, postings.length, undefined, { successfulComplete: true, absenceAuthoritative: false, freshnessTier: "periodic_check", runId });
      inserted += outcome.inserted; refreshed += outcome.touched;
      if (outcome.closed || outcome.missing1) throw new Error("Unexpected USAJobs absence state change");
    } catch (e) { errors++; console.error(JSON.stringify({ agency: name, error: describeError(e) })); }
  }
  await finishRun(runId, { orgsPolled: byAgency.size, postingsSeen: listings.length, postingsNew: inserted, postingsClosed: 0, errors,
    status: errors ? "partial" : inserted || refreshed ? "successful_complete" : "successful_no_changes", detail: { cadence: "manual", refreshed } });
  console.log(JSON.stringify({ source: "usajobs", agencies: byAgency.size, candidatesInserted: inserted, refreshed, closed: 0, errors }));
  if (errors) process.exitCode = 1;
}
main().catch(e => { console.error(describeError(e)); process.exitCode = 1; }).finally(() => closeDb());
