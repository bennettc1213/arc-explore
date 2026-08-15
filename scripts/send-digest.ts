/**
 * The weekly digest of new matches.
 *
 *   npm run digest            # dry run — prints exactly what would go out
 *   npm run digest -- --send  # actually sends
 *
 * Dry-run by default, like the reminders and the alerts. A mistake in an ingest
 * run is a row we fix; a mistake in this one lands in somebody else's inbox.
 *
 * The skip counts are printed rather than hidden, because on a healthy week
 * most profiles are skipped and the interesting question is *which* reason. A
 * job that reports "sent 0" and nothing else cannot be told apart from a broken
 * one.
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { runDigests } from "../src/lib/digest/run";

async function main() {
  const send = process.argv.includes("--send");

  if (send && !process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set — refusing to run with --send.");
    process.exitCode = 1;
    return;
  }

  console.log(send ? "sending weekly digests…" : "dry run — nothing will be sent\n");

  const summary = await runDigests({ send });

  console.log(
    `${summary.candidates} opted in · ${summary.due} due this week · ${summary.planned} with something to say`,
  );
  console.log(
    `  skipped: ${summary.skipped.not_due} not due · ` +
      `${summary.skipped.empty_profile} empty profile · ` +
      `${summary.skipped.nothing_new} nothing new · ` +
      `${summary.skipped.nothing_above_floor} nothing above the floor`,
  );

  for (const plan of summary.plans) {
    console.log(`\n  ${plan.email}${plan.displayName ? ` (${plan.displayName})` : ""}`);
    console.log(
      `    ${plan.items.length} picked from ${plan.considered} new` +
        (plan.coveredBySearches > 0
          ? ` · ${plan.coveredBySearches} left to saved-search alerts`
          : ""),
    );
    for (const item of plan.items) {
      const fit =
        item.score === null
          ? ""
          : ` — fit ${item.score} (on ${item.knownDimensions}/${item.totalDimensions})`;
      const deadline = item.deadlineAt
        ? ` — closes ${item.deadlineAt.toISOString().slice(0, 10)}`
        : "";
      console.log(`      ${item.title} · ${item.company}${fit}${deadline}`);
    }
  }

  if (send) {
    console.log(`\nsent ${summary.sent}`);
    if (summary.failed.length > 0) {
      console.log(`${summary.failed.length} failed:`);
      for (const f of summary.failed) console.log(`  ${f.userId}: ${f.error}`);
      process.exitCode = 1;
    }
  } else if (summary.planned > 0) {
    console.log(`\nnothing was sent. re-run with --send to actually mail these.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
