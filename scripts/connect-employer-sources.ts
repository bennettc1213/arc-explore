/** Manually validate/import all discovered boards of an implemented source. No scheduling. */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { organizations } from "../src/db/schema";
import { describeError } from "../src/lib/ingest/errors";
import { mapLimit } from "../src/lib/ingest/http";
import { persistPoll, upsertOrg } from "../src/lib/ingest/persist";
import { startRun, finishRun } from "../src/lib/ingest/runs";
import { discoverOrgs } from "../src/lib/ingest/sources/simplify";
import { createOracleAdapter } from "../src/lib/ingest/sources/oracle";
import { rippling } from "../src/lib/ingest/sources/rippling";
import { jobvite } from "../src/lib/ingest/sources/jobvite";
import { createTaleoAdapter } from "../src/lib/ingest/sources/taleo";
import type { SourceName } from "../src/lib/ingest/types";

const flag = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const MANUAL_INTERVAL = 315360000;
async function countSource(source: string) {
  const [row] = await db.execute<{ n: number }>(sql`select count(distinct posting_id)::int as n from posting_sources where source=${source}`);
  return row.n;
}
async function main() {
  const source = flag("source") as SourceName;
  if (!["oracle", "rippling", "jobvite", "taleo"].includes(source)) throw new Error("Choose --source oracle|rippling|jobvite|taleo");
  const limit = Number(flag("limit") ?? 500);
  const concurrency = Number(flag("concurrency") ?? 2);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error("Invalid request bounds");
  const apply = process.argv.includes("--apply");
  const discovered = await discoverOrgs();
  const boards = discovered.orgs.filter(b => b.atsType === source && b.atsSlug && (!flag("match") || b.name.toLowerCase().includes(flag("match")!.toLowerCase()))).slice(0, limit);
  const report: object[] = [];
  const before = apply ? await countSource(source) : 0;
  let ok = 0, errors = 0, seen = 0, refreshed = 0;
  const runId = apply ? await startRun(`${source}-manual`, source) : undefined;
  console.log(JSON.stringify({ source, mode: apply ? "manual import" : "dry-run", boards: boards.length }));
  try {
    await mapLimit(boards, concurrency, async board => {
      try {
        const adapter = source === "oracle" ? createOracleAdapter({ detailLimit: Number(flag("details") ?? 10) }) : source === "rippling" ? rippling : source === "jobvite" ? jobvite : createTaleoAdapter(board.seedUrls ?? []);
        const result = await adapter.fetchBoard(board.atsSlug!, { companyName: board.name });
        seen += result.postings.length;
        const row = { company: board.name, board: board.atsSlug, source, postings: result.postings.length, described: result.postings.filter(p => !!p.descriptionText).length, successful: result.successfulComplete, completeness: result.completeness };
        report.push(row); console.log(JSON.stringify(row));
        if (!result.successfulComplete) { errors++; return; }
        ok++;
        if (!apply || !result.postings.length) return;
        const org = await upsertOrg(board, { lastPolledAt: new Date(), pollIntervalSec: MANUAL_INTERVAL });
        const [current] = await db.select({ interval: organizations.pollIntervalSec }).from(organizations).where(and(eq(organizations.id, org.id), eq(organizations.atsType, board.atsType)));
        if (!current || current.interval !== MANUAL_INTERVAL) throw new Error("Existing organization is outside this manual import; skipped");
        const outcome = await persistPoll(org.id, result.postings, result.postings.length, null, { absenceAuthoritative: false, successfulComplete: true, freshnessTier: "periodic_check", pollIntervalSec: MANUAL_INTERVAL, runId });
        if (outcome.closed || outcome.missing1) throw new Error("Manual source unexpectedly changed absence state");
        refreshed += outcome.touched;
        console.log(JSON.stringify({ imported: board.name, candidatesInserted: outcome.inserted, refreshed: outcome.touched, closed: 0 }));
      } catch (e) { errors++; const row = { company: board.name, board: board.atsSlug, source, error: describeError(e) }; report.push(row); console.error(JSON.stringify(row)); }
    });
  } finally {
    const added = apply ? await countSource(source) - before : 0;
    if (runId) await finishRun(runId, { orgsPolled: boards.length, postingsSeen: seen, postingsNew: added, postingsClosed: 0, errors,
      status: errors ? (ok ? "partial" : "failed") : added || refreshed ? "successful_complete" : "successful_no_changes", detail: { cadence: "manual; scheduling deferred by owner", ok, refreshed } });
    const summary = { generatedAt: new Date().toISOString(), source, mode: apply ? "manual import" : "dry-run", boardsChecked: boards.length, ok, errors, seen, sourcePostingsAdded: added, refreshed };
    if (flag("report")) { await mkdir(dirname(flag("report")!), { recursive: true }); await writeFile(flag("report")!, JSON.stringify({ ...summary, boards: report }, null, 2)); }
    console.log(JSON.stringify(summary));
  }
  if (errors) process.exitCode = 1;
}
main().catch(e => { console.error(describeError(e)); process.exitCode = 1; }).finally(() => closeDb());
