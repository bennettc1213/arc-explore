/**
 * New-match alerts for saved searches.
 *
 *   npm run alerts            # dry run — prints exactly what would go out
 *   npm run alerts -- --send  # actually sends
 *
 * Dry-run by default, like the deadline reminders and unlike every other
 * script here. A mistake in an ingest run is a row we fix; a mistake in this
 * one lands in somebody else's inbox and cannot be recalled.
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { runAlerts } from "../src/lib/searches/run";
import { describeFilters } from "../src/lib/searches/types";

async function main() {
  const send = process.argv.includes("--send");

  if (send && !process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set — refusing to run with --send.");
    process.exitCode = 1;
    return;
  }

  console.log(send ? "sending saved-search alerts…" : "dry run — nothing will be sent\n");

  const summary = await runAlerts({ send });

  console.log(
    `${summary.considered} search${summary.considered === 1 ? "" : "es"} watching · ` +
      `${summary.withMatches} with new matches`,
  );

  for (const plan of summary.plans) {
    console.log(`\n  ${plan.email} — “${plan.name}”`);
    console.log(`    ${describeFilters(plan.filters)}`);
    console.log(`    ${plan.matchCount} new:`);
    for (const m of plan.matches.slice(0, 5)) {
      const deadline = m.deadlineAt ? ` — closes ${m.deadlineAt.toISOString().slice(0, 10)}` : "";
      console.log(`      ${m.title} · ${m.company}${deadline}`);
    }
    if (plan.matchCount > 5) console.log(`      …and ${plan.matchCount - 5} more`);
  }

  if (send) {
    console.log(`\nsent ${summary.sent}`);
    if (summary.failed.length > 0) {
      console.log(`${summary.failed.length} failed:`);
      for (const f of summary.failed) console.log(`  ${f.searchId}: ${f.error}`);
      process.exitCode = 1;
    }
  } else if (summary.withMatches > 0) {
    console.log(`\nnothing was sent. re-run with --send to actually mail these.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
