/**
 * The numbers, on the command line.
 *
 *   npm run metrics
 *
 * Exists alongside the `/admin` panel because citing a number usually happens
 * while writing something — a resume line, an application, a message to a
 * career centre — and going and finding an admin session first is the step that
 * makes someone reach for a remembered figure instead. Every value prints with
 * its definition, and anything below the citable floor prints marked.
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { filterUsage, metricCounts, recentCounts } from "../src/lib/metrics/store";
import { GROUP_LABELS, buildMetrics, rate, type MetricGroup } from "../src/lib/metrics/types";

const ORDER: MetricGroup[] = ["reach", "activation", "output", "usage", "corpus"];

async function main() {
  const [counts, recent, filters] = await Promise.all([
    metricCounts(),
    recentCounts(),
    filterUsage(),
  ]);
  const metrics = buildMetrics(counts);

  console.log("last 7 days");
  console.log(`  ${recent.signups} signups · ${recent.applicationsTracked} applications tracked · ${recent.savedSearches} searches saved · ${recent.filteredFeedRequests} filtered feed requests`);

  const emptyRate = rate(counts.zeroResultSearches, counts.filteredFeedRequests);
  console.log(
    `  empty-result rate: ${emptyRate === null ? "not enough searches yet" : `${emptyRate}%`}`,
  );

  for (const group of ORDER) {
    const rows = metrics.filter((m) => m.group === group);
    if (rows.length === 0) continue;

    console.log(`\n== ${GROUP_LABELS[group]} ==`);
    for (const m of rows) {
      const flag = m.citable ? "" : "   (too small to cite)";
      console.log(`\n  ${String(m.value).padStart(6)}  ${m.label}${flag}`);
      console.log(`          ${m.definition}`);
      if (m.caveat) console.log(`          ! ${m.caveat}`);
    }
  }

  if (filters.length > 0) {
    console.log("\n== filters used ==");
    for (const f of filters) console.log(`  ${String(f.n).padStart(6)}  ${f.filter}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
