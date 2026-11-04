/**
 * Read live Workday boards; dry-run by default.
 *   npx tsx scripts/connect-workday.ts --limit 5 [--match NVIDIA] [--apply]
 *
 * --apply imports employer observations into the configured database. Boards
 * remain MANUAL, marked periodic_check, until the scheduled runner has this
 * adapter. This avoids enrolling them into master's older, incompatible cron.
 * No migration, production app deployment, or job-closing pass is performed.
 */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { organizations } from "../src/db/schema";
import { describeError } from "../src/lib/ingest/errors";
import { mapLimit } from "../src/lib/ingest/http";
import { persistPoll, upsertOrg } from "../src/lib/ingest/persist";
import { finishRun, startRun } from "../src/lib/ingest/runs";
import { discoverOrgs } from "../src/lib/ingest/sources/simplify";
import { createWorkdayAdapter } from "../src/lib/ingest/sources/workday";

const value = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
// A held/manual board never becomes due during this rollout. Once the adapter
// is on master, explicitly reset these boards to 1200 seconds to activate them.
const MANUAL_INTERVAL = 10 * 365 * 24 * 60 * 60;

async function main() {
  const limit = Number(value("limit") ?? 5);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("--limit must be 1–500");
  const match = value("match")?.toLowerCase();
  const offset = Number(value("offset") ?? 0);
  const concurrency = Number(value("concurrency") ?? 1);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("Invalid offset/concurrency");
  const adapter = createWorkdayAdapter({ detailLimit: Number(value("details") ?? 40), maxPages: Number(value("max-pages") ?? 10) });
  const report: object[] = [];
  const apply = process.argv.includes("--apply");
  const discovery = await discoverOrgs();
  const prior = value("retry-report") ? JSON.parse(await readFile(value("retry-report")!, "utf8")) as { boards: Array<{ company: string; board: string; error?: string; successful?: boolean }> } : undefined;
  const failedCompanies = new Set(prior?.boards.filter(b => b.error || b.successful === false).map(b => b.company));
  const knownBoards = new Set(prior?.boards.map(b => b.board));
  const boards = discovery.orgs.filter(o => o.atsType === "workday" && o.atsSlug && (!match || o.name.toLowerCase().includes(match))
    && (!prior || failedCompanies.has(o.name) || !knownBoards.has(o.atsSlug)));
  const selected = boards.slice(offset, offset + limit);
  console.log(JSON.stringify({ mode: apply ? "import, manual cadence" : "dry-run", discoveredWorkdayBoards: boards.length, selected: Math.min(limit, boards.length) }));
  let seen = 0, added = 0, touched = 0, errors = 0, ok = 0;
  const countRows = async () => (await db.execute<{ n: number }>(sql`select count(distinct posting_id)::int as n from posting_sources where source='workday'`))[0].n;
  const before = apply ? await countRows() : 0;
  const runId = apply ? await startRun("workday-manual", "workday") : undefined;
  try {
    await mapLimit(selected, concurrency, async board => {
      try {
        const result = await adapter.fetchBoard(board.atsSlug!, { companyName: board.name });
        seen += result.postings.length;
        console.log(JSON.stringify({ company: board.name, board: board.atsSlug, internships: result.postings.length, described: result.postings.filter(p => p.descriptionText).length, completeSearch: result.successfulComplete, completeness: result.completeness }));
        const entry = { company: board.name, board: board.atsSlug, internships: result.postings.length, described: result.postings.filter(p => p.descriptionText).length, successful: result.successfulComplete, completeness: result.completeness, inserted: 0, refreshed: 0 };
        report.push(entry);
        // Don't enroll broken boards or publish observations from a capped read.
        if (!result.successfulComplete) { errors++; return; }
        ok++;
        if (!apply || !result.postings.length) return;
        const org = await upsertOrg(board, { lastPolledAt: new Date(), pollIntervalSec: MANUAL_INTERVAL });
        // An already-active board belongs to its existing scheduler. Do not
        // change cadence here; this command is only for manual rollout imports.
        const [current] = await db.select({ interval: organizations.pollIntervalSec }).from(organizations)
          .where(and(eq(organizations.id, org.id), eq(organizations.atsType, "workday")));
        if (!current || current.interval !== MANUAL_INTERVAL) throw new Error("Workday board already has another cadence; skipped manual import");
        const outcome = await persistPoll(org.id, result.postings, result.postings.length, null, {
          successfulComplete: true, absenceAuthoritative: false, freshnessTier: "periodic_check",
          pollIntervalSec: MANUAL_INTERVAL, runId,
        });
        if (outcome.closed || outcome.missing1) throw new Error("Workday search unexpectedly changed absence state");
        added += outcome.inserted; touched += outcome.touched;
        entry.inserted = outcome.inserted; entry.refreshed = outcome.touched;
        console.log(JSON.stringify({ imported: board.name, inserted: outcome.inserted, refreshed: outcome.touched, closed: outcome.closed, missingStrikes: outcome.missing1, cadence: "manual" }));
      } catch (e) { errors++; const entry = { company: board.name, board: board.atsSlug, error: describeError(e) }; report.push(entry); console.error(JSON.stringify(entry)); }
    });
  } finally {
    const sourcePostingsAdded = apply ? await countRows() - before : 0;
    if (runId) await finishRun(runId, { orgsPolled: selected.length, postingsSeen: seen, postingsNew: sourcePostingsAdded, postingsClosed: 0, errors,
      status: errors ? (ok ? "partial" : "failed") : added || touched ? "successful_complete" : "successful_no_changes",
      detail: { cadence: "manual; scheduling deferred by owner", ok, touched } });
    if (value("report")) {
      await mkdir(dirname(value("report")!), { recursive: true });
      await writeFile(value("report")!, JSON.stringify({ generatedAt: new Date().toISOString(), mode: apply ? "import" : "dry-run", selected: selected.length, ok, errors, seen, candidatesInserted: added, sourcePostingsAdded, refreshed: touched, boards: report }, null, 2));
    }
  }
  console.log(JSON.stringify({ ok, errors, seen, inserted: added, refreshed: touched }));
  if (errors) process.exitCode = 1;
}
main().catch(e => { console.error(describeError(e)); process.exitCode = 1; }).finally(() => closeDb());
