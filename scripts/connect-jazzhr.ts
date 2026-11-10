/**
 * One-shot JazzHR validation/import. Dry run unless --apply is explicit.
 *
 * Boards are seeded from the Simplify Summer 2027 listings, reading only the
 * company name and the apply URL's host — the same company-names-only rule
 * Tier B follows (see scripts/ingest-daily.ts). Every listing stored comes
 * from the employer's own JazzHR page, never from Simplify.
 *
 *   npm run sources:connect:jazzhr                       # dry run, every seeded board
 *   npm run sources:connect:jazzhr -- --board fintools    # one board
 *   npm run sources:connect:jazzhr -- --apply --report .local/source-connections/jazzhr.json
 *   npm run sources:connect:jazzhr -- --list new-grad --apply
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { organizations, sources } from "../src/db/schema";
import { describeError } from "../src/lib/ingest/errors";
import { getJson } from "../src/lib/ingest/http";
import { normalizeCompanyName } from "../src/lib/ingest/normalize";
import { persistPoll, upsertOrg } from "../src/lib/ingest/persist";
import { startRun, finishRun } from "../src/lib/ingest/runs";
import { jazzhr, jazzhrBoardFromUrl } from "../src/lib/ingest/sources/jazzhr";

/** The same company-name lists scripts/connect-employer-sources.ts reads. */
const LISTS: Record<string, string> = {
  summer2027: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
  "new-grad": "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
};
const MANUAL_INTERVAL = 315360000;
const flag = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name} value`);
  return value;
};

async function seededBoards(list: string): Promise<Array<[string, string]>> {
  const url = LISTS[list];
  if (!url) throw new Error(`Choose --list ${Object.keys(LISTS).join("|")}`);
  const res = await getJson<Array<{ company_name?: string; url?: string; company_url?: string }>>(url, { timeoutMs: 120_000 });
  const boards = new Map<string, string>();
  for (const r of Array.isArray(res.data) ? res.data : []) {
    const slug = jazzhrBoardFromUrl(r.url) ?? jazzhrBoardFromUrl(r.company_url);
    const name = r.company_name?.trim();
    if (slug && name && !boards.has(slug)) boards.set(slug, name);
  }
  return [...boards].sort(([a], [b]) => a.localeCompare(b));
}

async function countSource() {
  const [row] = await db.execute<{ n: number }>(sql`select count(distinct posting_id)::int as n from posting_sources where source='jazzhr'`);
  return row.n;
}

async function main() {
  const board = flag("board");
  const reportPath = flag("report");
  const apply = process.argv.includes("--apply");
  const list = flag("list") ?? "summer2027";
  const all = await seededBoards(list);
  const boards = board ? all.filter(([slug]) => slug === board) : all;
  if (!boards.length) throw new Error(board ? `Board ${board} is not in the seeded list` : "No JazzHR boards seeded");
  const before = apply ? await countSource() : 0;
  const runId = apply ? await startRun("jazzhr-manual", "jazzhr") : undefined;
  const results: object[] = [];
  let ok = 0, errors = 0, seen = 0, refreshed = 0;
  try {
    // Sequential boards keep host load low; each board is 1 + (internships) requests.
    for (const [slug, name] of boards) {
      try {
        const result = await jazzhr.fetchBoard(slug, { companyName: name });
        if (!result.successfulComplete) throw new Error(`Incomplete JazzHR response: ${result.completeness?.reason}`);
        seen += result.postings.length;
        const row = { board: slug, company: name, read: result.completeness?.claimedTotal,
          internships: result.postings.length, described: result.postings.filter(p => p.descriptionText).length };
        if (apply && result.postings.length) {
          const org = await upsertOrg({ name, normalizedName: normalizeCompanyName(name),
            atsType: "jazzhr", atsSlug: slug, discoveredVia: "jazzhr-public-careers" },
          { lastPolledAt: new Date(), pollIntervalSec: MANUAL_INTERVAL });
          const [current] = await db.select({ interval: organizations.pollIntervalSec }).from(organizations)
            .where(and(eq(organizations.id, org.id), eq(organizations.atsType, "jazzhr")));
          if (current?.interval !== MANUAL_INTERVAL) throw new Error("Existing organization is outside manual cadence; held");
          await db.insert(sources).values({ key: `jazzhr:${slug}`, provider: "jazzhr", orgId: org.id,
            authority: "source_of_truth", state: "active", opportunityKind: "internship",
            publicPageUrl: `https://${slug}.applytojob.com/apply`, pollTier: "B", pollIntervalSec: MANUAL_INTERVAL,
            rawStorage: "hash_only", termsReviewStatus: "not_reviewed",
            termsReviewNote: "Public server-rendered JazzHR career page; robots.txt disallows only /cb (checked per read). JazzHR's JSON API needs the employer's key and is not used. Manual only.",
            robotsReviewStatus: "approved", robotsReviewedAt: new Date(),
            adapterConfig: { manualOnly: true, absenceAuthoritative: false },
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
    const summary = { generatedAt: new Date().toISOString(), source: "jazzhr", mode: apply ? "manual import" : "dry-run",
      boardsChecked: boards.length, ok, errors, seen, sourcePostingsAdded, refreshed, closed: 0,
      cadence: "manual; scheduling deferred" };
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
