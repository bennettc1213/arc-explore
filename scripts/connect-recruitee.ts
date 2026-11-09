/** One-shot Recruitee validation/import. Dry run unless --apply is explicit. */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { organizations, sources } from "../src/db/schema";
import { describeError } from "../src/lib/ingest/errors";
import { normalizeCompanyName } from "../src/lib/ingest/normalize";
import { persistPoll, upsertOrg } from "../src/lib/ingest/persist";
import { startRun, finishRun } from "../src/lib/ingest/runs";
import { recruitee, recruiteeBoardFromUrl } from "../src/lib/ingest/sources/recruitee";
import { RECRUITEE_BOARDS } from "../src/lib/ingest/sources/recruitee-boards";

const MANUAL_INTERVAL = 315360000;
const flag = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name} value`);
  return value;
};

async function countSource() {
  const [row] = await db.execute<{ n: number }>(sql`select count(distinct posting_id)::int as n from posting_sources where source='recruitee'`);
  return row.n;
}

async function main() {
  const board = flag("board");
  const reportPath = flag("report");
  const apply = process.argv.includes("--apply");
  const match = flag("match")?.toLowerCase();
  const selected: ReadonlyArray<readonly [string, string]> = board ? [[board, board]] : RECRUITEE_BOARDS;
  const boards = selected.filter(([slug, name]) => !match || `${slug} ${name}`.toLowerCase().includes(match));
  if (!boards.length || boards.some(([slug]) => recruiteeBoardFromUrl(`https://${slug}.recruitee.com`) !== slug)) throw new Error("Choose a valid --board slug or matching employer");
  const before = apply ? await countSource() : 0;
  const runId = apply ? await startRun("recruitee-manual", "recruitee") : undefined;
  const results: object[] = [];
  let ok = 0, errors = 0, seen = 0, refreshed = 0;
  try {
    // Sequential boards keep host load low and avoid bulk-import contention.
    for (const [slug, name] of boards) {
      try {
        const result = await recruitee.fetchBoard(slug, { companyName: name });
        if (!result.successfulComplete) throw new Error(`Incomplete Recruitee response: ${result.completeness?.reason}`);
        seen += result.postings.length;
        const company = result.postings[0]?.companyName ?? name;
        const row = { board: slug, company, read: result.completeness?.claimedTotal,
          internships: result.postings.length, described: result.postings.filter(p => p.descriptionText).length };
        if (apply) {
          const org = await upsertOrg({ name: company, normalizedName: normalizeCompanyName(company),
            atsType: "recruitee", atsSlug: slug, discoveredVia: "recruitee-public-careers" },
          { lastPolledAt: new Date(), pollIntervalSec: MANUAL_INTERVAL });
          const [current] = await db.select({ interval: organizations.pollIntervalSec }).from(organizations)
            .where(and(eq(organizations.id, org.id), eq(organizations.atsType, "recruitee")));
          if (current?.interval !== MANUAL_INTERVAL) throw new Error("Existing organization is outside manual cadence; held");
          await db.insert(sources).values({ key: `recruitee:${slug}`, provider: "recruitee", orgId: org.id,
            authority: "source_of_truth", state: "active", opportunityKind: "internship",
            publicPageUrl: `https://${slug}.recruitee.com`, pollTier: "B", pollIntervalSec: MANUAL_INTERVAL,
            rawStorage: "hash_only", termsReviewStatus: "not_reviewed",
            termsReviewNote: "Public careers API documented at https://docs.recruitee.com/reference/offers; employer-specific reuse terms not approved. Employer tokens mandatory 2027-02-10. Manual only.",
            robotsReviewStatus: "approved", robotsReviewedAt: new Date(),
            adapterConfig: { manualOnly: true, absenceAuthoritative: false, tokenRequiredFrom: "2027-02-10" },
          }).onConflictDoNothing({ target: sources.key });
          const outcome = await persistPoll(org.id, result.postings, result.completeness?.claimedTotal ?? result.postings.length,
            null, { absenceAuthoritative: false, successfulComplete: true, freshnessTier: "periodic_check", pollIntervalSec: MANUAL_INTERVAL, runId });
          if (outcome.closed || outcome.missing1) throw new Error("Manual import unexpectedly changed absence state");
          refreshed += outcome.touched;
        }
        ok++;
        results.push(row); console.log(JSON.stringify(row));
      } catch (error) {
        errors++;
        const row = { board: slug, error: describeError(error) };
        results.push(row); console.error(JSON.stringify(row));
      }
    }
  } finally {
    const sourcePostingsAdded = apply ? await countSource() - before : 0;
    const summary = { generatedAt: new Date().toISOString(), source: "recruitee", mode: apply ? "manual import" : "dry-run",
      boardsChecked: boards.length, ok, errors, seen, sourcePostingsAdded, refreshed, closed: 0,
      cadence: "manual; scheduling deferred", tokenRequiredFrom: "2027-02-10" };
    if (runId) await finishRun(runId, { orgsPolled: boards.length, postingsSeen: seen, postingsNew: sourcePostingsAdded,
      postingsClosed: 0, errors, status: errors ? (ok ? "partial" : "failed") : sourcePostingsAdded || refreshed ? "successful_complete" : "successful_no_changes", detail: summary });
    if (reportPath) {
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, JSON.stringify({ ...summary, boards: results }, null, 2));
    }
    console.log(JSON.stringify(summary));
  }
  if (errors) process.exitCode = 1;
}

main().catch(e => { console.error(describeError(e)); process.exitCode = 1; }).finally(() => closeDb());
