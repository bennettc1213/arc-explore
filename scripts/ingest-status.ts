/**
 * Where does the corpus actually stand?
 *
 * The one question this product has to be able to answer about itself: is the
 * data still moving. Reads only what the scheduled runs left behind.
 *
 *   npm run ingest:status
 */

import "dotenv/config";
import { sql } from "drizzle-orm";

import { closeDb, db } from "../src/db/client";

interface Row {
  [k: string]: unknown;
}

async function main() {
  const [orgs] = await db.execute<Row>(sql`
    select
      count(*)::int                                                          as total,
      count(*) filter (where ats_slug is not null and ats_type <> 'unknown')::int as pollable,
      count(*) filter (where last_polled_at is null)::int                    as never_polled,
      count(*) filter (where last_poll_ok is false)::int                     as failing,
      count(*) filter (where consecutive_failures >= 3)::int                 as backed_off,
      count(*) filter (where last_polled_at > now() - interval '1 hour')::int as polled_last_hour
    from organizations`);

  // Scoped to kind = 'internship': term/work-auth/description coverage are
  // internship-specific concepts, always null for a scholarship row, and
  // blending the two kinds would read as internship detection quietly
  // getting worse every time a scholarship scrape adds rows.
  const [posts] = await db.execute<Row>(sql`
    select
      count(*)::int                                             as total,
      count(*) filter (where closed_at is null)::int             as open,
      count(*) filter (where closed_at is not null)::int         as closed,
      count(*) filter (where first_seen_at > now() - interval '24 hours')::int as new_24h,
      count(*) filter (where last_seen_at  > now() - interval '1 hour')::int   as confirmed_1h,
      count(*) filter (where term is not null)::int              as term_known,
      count(*) filter (where work_auth is not null)::int         as work_auth_known,
      count(*) filter (where description_text is not null)::int  as described
    from postings where kind = 'internship'`);

  const [scholarships] = await db.execute<Row>(sql`
    select
      count(*)::int                                              as total,
      count(*) filter (where closed_at is null)::int              as open,
      count(*) filter (where closed_at is not null)::int          as closed,
      count(*) filter (where amount_max is not null or amount_min is not null)::int as amount_known,
      count(*) filter (where deadline_at is not null)::int        as deadline_known,
      count(*) filter (where last_seen_at > now() - interval '14 days')::int as checked_2w
    from postings where kind = 'scholarship'`);

  const runs = await db.execute<Row>(sql`
    select tier, source, started_at, finished_at,
           orgs_polled, postings_seen, postings_new, postings_closed, errors
    from ingest_runs order by started_at desc limit 8`);

  const show = (label: string, o: Row) => {
    console.log(`\n${label}`);
    for (const [k, v] of Object.entries(o)) console.log(`  ${k.padEnd(18)} ${v}`);
  };

  show("organizations", orgs);
  show("postings (internships)", posts);
  show("postings (scholarships)", scholarships);

  console.log("\nrecent runs");
  if (runs.length === 0) {
    console.log("  NONE — nothing has ever run. The freshness claim is not backed by anything.");
  } else {
    for (const r of runs) {
      const started = new Date(String(r.started_at));
      const secs = r.finished_at
        ? ((new Date(String(r.finished_at)).getTime() - started.getTime()) / 1000).toFixed(1) + "s"
        : "unfinished";
      console.log(
        `  ${started.toISOString()}  tier ${r.tier}  ` +
          `polled=${String(r.orgs_polled).padStart(3)} seen=${String(r.postings_seen).padStart(5)} ` +
          `new=${String(r.postings_new).padStart(4)} closed=${String(r.postings_closed).padStart(3)} ` +
          `err=${String(r.errors).padStart(2)}  ${secs}`,
      );
    }
  }

  // The whole product rests on this being recent.
  const lastA = runs.find((r) => r.tier === "A");
  if (lastA) {
    const ageMin = (Date.now() - new Date(String(lastA.started_at)).getTime()) / 60_000;
    console.log(`\nlast tier A run was ${ageMin.toFixed(0)} minutes ago`);
    if (ageMin > 60) console.log("  ^ stale. the cron is not running.");
  }
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
