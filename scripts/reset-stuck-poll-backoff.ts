/**
 * Clear the poll backoff from boards that were frozen by the raw-`Date` binding
 * bug (see `docs/instela-market-ready/gates/phase-1-trust-gate.md` §4.4).
 *
 *   npx tsx scripts/reset-stuck-poll-backoff.ts --dry-run    # count only
 *   npx tsx scripts/reset-stuck-poll-backoff.ts              # live run
 *
 * ## Why this is needed
 *
 * All four miss-strike and close statements threw ERR_INVALID_ARG_TYPE, which
 * rolled back the entire poll transaction for any board with a listing missing
 * long enough to earn a strike. The separate failure bookkeeping kept running,
 * so `poll_interval_sec` tripled on each attempt until it hit the 24-hour
 * ceiling, and `orgsDueForPoll` stopped selecting those boards.
 *
 * The code is fixed, so the next poll of each board now succeeds and resets its
 * own counters. All that is left is to stop the boards from sleeping through it.
 *
 * ## What it deliberately does NOT touch
 *
 * - `consecutive_failures`, `last_poll_ok`, `last_poll_error`. Zeroing those by
 *   hand would make `ingest:status` look healthy before any board has actually
 *   succeeded. They self-heal on the next real poll, which is the honest signal.
 * - Any `postings` row. Misses and closes are recorded by the normal lifecycle
 *   once the boards are polled again; hand-editing them would bypass the
 *   two-successful-miss guard that protects students from listings being closed
 *   on a bad fetch.
 * - Boards failing for other reasons. The filter below matches the bug's exact
 *   error signature, so the 49 dead-slug `HTTP 404` boards are left at their
 *   backoff and stay visible as a separate, known problem.
 *
 * Idempotent: re-running only affects rows still above the target interval.
 */

import "dotenv/config";

import { gt, sql } from "drizzle-orm";

import { db, closeDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { DEFAULT_POLL_INTERVAL_SEC } from "@/lib/ingest/persist";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

/** The exact shape the bug produced, so only its victims are selected. */
const BUG_SIGNATURE = 'update "postings" set "closed_at"';

async function main(): Promise<void> {
  const victims = sql`${organizations.consecutiveFailures} > 0
    and ${organizations.lastPollError} like ${`${BUG_SIGNATURE}%`}
    and ${organizations.lastPollError} not like 'HTTP 404%'
    and coalesce(${organizations.pollIntervalSec}, 0) > ${DEFAULT_POLL_INTERVAL_SEC}`;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizations)
    .where(victims);
  const n = Number(count);

  const preview = await db
    .select({
      name: organizations.name,
      atsType: organizations.atsType,
      atsSlug: organizations.atsSlug,
      consecutiveFailures: organizations.consecutiveFailures,
      pollIntervalSec: organizations.pollIntervalSec,
    })
    .from(organizations)
    .where(victims)
    .orderBy(sql`${organizations.pollIntervalSec} desc`)
    .limit(10);

  console.log(`Boards frozen by the raw-Date binding bug: ${n}`);
  console.log(`Target poll_interval_sec: ${DEFAULT_POLL_INTERVAL_SEC}\n`);
  for (const o of preview) {
    console.log(
      `  ${String(o.consecutiveFailures).padStart(3)} failures  ` +
        `${String(o.pollIntervalSec).padStart(6)}s  ${o.atsType}/${o.atsSlug}  ${o.name}`,
    );
  }
  if (n > preview.length) console.log(`  ... and ${n - preview.length} more`);

  if (dryRun) {
    console.log("\nDRY RUN - no rows updated");
    await closeDb();
    return;
  }
  if (n === 0) {
    console.log("\nNothing to do");
    await closeDb();
    return;
  }

  const updated = await db
    .update(organizations)
    .set({ pollIntervalSec: DEFAULT_POLL_INTERVAL_SEC })
    .where(victims)
    .returning({ id: organizations.id });

  console.log(`\nReset poll_interval_sec on ${updated.length} board(s)`);
  console.log(
    "Their next poll will now succeed, which resets consecutive_failures and\n" +
      "last_poll_error on its own. Stale listings will then be struck and closed\n" +
      "by the normal two-successful-miss lifecycle.",
  );
  await closeDb();
}

void main();
