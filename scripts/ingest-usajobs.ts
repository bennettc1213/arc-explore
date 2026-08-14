/**
 * USAJobs ingestion — federal student openings.
 *
 *   npm run ingest:usajobs
 *
 * WHY THIS IS ITS OWN SCRIPT AND NOT A BOARD ADAPTER. Every Tier A source is
 * "one company, one board slug, one HTTP call", and `orgsDueForPoll` walks the
 * registry handing each slug to its adapter. USAJobs is the opposite shape:
 * one call returns openings from dozens of agencies at once, and there is no
 * per-agency endpoint to poll. So the fetch happens once here and the result
 * is *grouped* by agency before being handed to the ordinary reconcile path.
 *
 * That grouping is what makes closure correct. `persistPoll` closes anything
 * it holds for an org that is missing from the snapshot, so each agency must
 * be reconciled against its own openings — pass the whole federal set against
 * one agency and every other agency's postings would be closed on the spot.
 *
 * Agencies are enrolled with `atsType: "unknown"`, which is load-bearing:
 * `orgsDueForPoll` filters `ats_type != 'unknown'`, so the 20-minute ATS
 * poller can never pick one up and try to fetch a Greenhouse board for the
 * Veterans Health Administration.
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { describeError } from "../src/lib/ingest/errors";
import { normalizeCompanyName } from "../src/lib/ingest/normalize";
import { persistPoll, upsertOrg } from "../src/lib/ingest/persist";
import { finishRun, startRun } from "../src/lib/ingest/runs";
import { fetchUsaJobsStudentPostings } from "../src/lib/ingest/sources/usajobs";
import type { SourcePosting } from "../src/lib/ingest/types";

function groupByAgency(postings: SourcePosting[]): Map<string, SourcePosting[]> {
  const byAgency = new Map<string, SourcePosting[]>();

  for (const p of postings) {
    const agency = p.companyName.trim();
    // An announcement with no hiring office cannot be attributed to an
    // employer, and inventing one ("Federal Government") would put a name on
    // a row the source never gave us.
    if (!agency) continue;

    const existing = byAgency.get(agency);
    if (existing) existing.push(p);
    else byAgency.set(agency, [p]);
  }

  return byAgency;
}

async function main() {
  const runId = await startRun("usajobs", "usajobs");
  const started = Date.now();

  try {
    const postings = await fetchUsaJobsStudentPostings();

    // Same fail-loud rule the scholarship sources use: a scope that has
    // carried ~100 openings every time we have looked does not empty out, so
    // zero means the fetch or the parse broke. Persisting it would close every
    // federal posting we hold.
    if (postings.length === 0) {
      throw new Error("usajobs: parsed zero postings — API shape or scope likely changed");
    }

    const byAgency = groupByAgency(postings);

    let inserted = 0;
    let closed = 0;
    let filteredOut = 0;

    for (const [agency, agencyPostings] of byAgency) {
      const { id: orgId } = await upsertOrg({
        name: agency,
        normalizedName: normalizeCompanyName(agency),
        atsType: "unknown",
        atsSlug: `usajobs:${normalizeCompanyName(agency)}`,
        discoveredVia: "usajobs",
      });

      const outcome = await persistPoll(orgId, agencyPostings, agencyPostings.length, undefined, {
        // Daily, not the 20-minute Tier A loop — so these rows may not claim
        // "confirmed live". Upgrade this only if the cadence changes.
        freshnessTier: "periodic_check",
      });
      inserted += outcome.inserted;
      closed += outcome.closed;
      filteredOut += outcome.filteredOut;
    }

    await finishRun(runId, {
      orgsPolled: byAgency.size,
      postingsSeen: postings.length,
      postingsNew: inserted,
      postingsClosed: closed,
      errors: 0,
      detail: { source: "usajobs", agencies: byAgency.size, filteredOut },
    });

    console.log(
      [
        "usajobs",
        `  fetched  : ${postings.length} announcements open to students`,
        `  agencies : ${byAgency.size}`,
        `  kept     : ${postings.length - filteredOut} (${filteredOut} classified as not early-career)`,
        `  inserted : ${inserted}`,
        `  closed   : ${closed}`,
        `  duration : ${((Date.now() - started) / 1000).toFixed(1)}s`,
      ].join("\n"),
    );
  } catch (err) {
    const error = describeError(err);
    await finishRun(runId, {
      orgsPolled: 0,
      postingsSeen: 0,
      postingsNew: 0,
      postingsClosed: 0,
      errors: 1,
      detail: { source: "usajobs", error },
    });
    console.error(`usajobs: FAILED — ${error}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
