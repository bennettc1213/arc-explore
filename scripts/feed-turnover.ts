/**
 * Does the feed actually turn over, and at what cost to match quality?
 *
 * The measurement that produced `score/evidence.ts`. Kept as a script rather
 * than a test because the answer is a property of the **live corpus**, not of
 * the code: the same ranking is fresh against 5,000 rows and frozen against
 * 50, and only running it against real data says which we have.
 *
 * It asks the real `getFeed` for a different `day` rather than re-implementing
 * the comparator — an earlier version of this script did re-implement it, and
 * a second copy of the ranking rules is the duplicate-definition trap that
 * already cost this project the remote-only filter bug.
 *
 *   npm run feed:turnover
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { getFeed } from "../src/lib/feed";
import { FREE_DAILY_RESULTS, reservationFor } from "../src/lib/feed-trim";
import { TIMING_PRIORITY_POINTS } from "../src/lib/pricing/tiers";
import type { ScoreProfile } from "../src/lib/score/fit";
import { dayIndex } from "../src/lib/score/rotation";

/** A visitor who has told us nothing — the case the complaint came from. */
const SIGNED_OUT: ScoreProfile = {};

/** A student who has filled everything in, to check the feed still sharpens. */
const FILLED: ScoreProfile = {
  major: "computer science",
  gradYear: 2027,
  workAuth: "us_citizen",
  targetLocations: ["New York, NY", "Boston, MA"],
  targetVerticals: ["software", "data_ai"],
  openToRemote: true,
  skills: ["python", "javascript", "react", "sql", "typescript", "aws", "docker", "git"],
};

const WINDOWS = [FREE_DAILY_RESULTS, 20, 50];

async function head(profile: ScoreProfile, timingPoints: number, day: number, limit: number) {
  const r = await getFeed(profile, {
    limit,
    reservePerKind: reservationFor(limit),
    timingPoints,
    day,
  });
  return r.items;
}

async function report(label: string, profile: ScoreProfile, timingPoints: number) {
  const today = dayIndex();
  console.log(`\n=== ${label} ===`);

  for (const limit of WINDOWS) {
    const base = new Set((await head(profile, timingPoints, today, limit)).map((i) => i.id));
    const parts: string[] = [];
    for (const d of [1, 2, 7, 30]) {
      const later = await head(profile, timingPoints, today + d, limit);
      parts.push(`+${d}d ${later.filter((i) => base.has(i.id)).length}/${limit}`);
    }
    console.log(`  window ${String(limit).padStart(2)} unchanged:  ${parts.join("   ")}`);
  }

  for (const limit of [FREE_DAILY_RESULTS, 50]) {
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      for (const i of await head(profile, timingPoints, today + d, limit)) seen.add(i.id);
    }
    console.log(`  window ${String(limit).padStart(2)}: ${seen.size} distinct rows reachable over 30 days`);
  }

  // Freshness is only worth having if it did not cost the match. Printed
  // beside the turnover for exactly that reason.
  const top = await head(profile, timingPoints, today, 20);
  const fits = top.map((i) => i.fit.score).filter((s): s is number => s !== null);
  const scholarships = top.filter((i) => i.kind === "scholarship").length;
  console.log(
    `  top20 fit: mean ${(fits.reduce((a, b) => a + b, 0) / Math.max(1, fits.length)).toFixed(1)}` +
      ` min ${fits.length ? Math.min(...fits) : "n/a"}` +
      `  |  ${scholarships} scholarships / ${top.length - scholarships} internships` +
      `  |  ${top.filter((i) => i.deadlineAt).length} carry a stated deadline`,
  );
}

async function main() {
  await report("SIGNED OUT (free)", SIGNED_OUT, 0);
  await report("FILLED PROFILE (free)", FILLED, 0);
  await report("FILLED PROFILE (paid)", FILLED, TIMING_PRIORITY_POINTS.apply);

  // The paid entitlement is only real if it changes the answer. An earlier
  // version of the ranking made these byte-identical without failing anything.
  const today = dayIndex();
  const free = (await head(FILLED, 0, today, 20)).map((i) => i.id);
  const paid = (await head(FILLED, TIMING_PRIORITY_POINTS.apply, today, 20)).map((i) => i.id);
  console.log(
    `\npaid vs free top20: ${paid.filter((id) => free.includes(id)).length}/20 shared, ` +
      `identical order ${free.every((id, n) => id === paid[n])}`,
  );
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
