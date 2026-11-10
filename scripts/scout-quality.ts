/**
 * Scout quality, measured against the live corpus.
 *
 *   npm run scout:quality
 *
 * The cases were written on 2026-11-10 before the tiered Scout existed, so the
 * list cannot be reselected to the ones that pass (the same rule
 * `search-quality.ts` follows). For each case it prints the per-tier counts and
 * the top rows, and fails if a Scout with only soft preferences returns nothing.
 * Read-only: it ranks and prints, it never writes.
 */
import "dotenv/config";

import { closeDb } from "../src/db/client";
import { getFeed } from "../src/lib/feed";
import { toScoringProfile } from "../src/lib/score/v2/profile";
import { scoutFeedFilters } from "../src/lib/scout/filters";
import { buildScoutTiers, resolveScout } from "../src/lib/scout/results";
import { defaultScout, scoutSchema, type ScoutPreferences } from "../src/lib/scout/types";

const CASES: Array<Partial<ScoutPreferences>> = [
  { field: "cyber security, with grad of 2028" },
  { field: "Cybersecurity", gradYear: 2028, kind: "scholarship" },
  { field: "Cybersecurity", gradYear: 2028, kind: "internship", location: "Texas" },
  { field: "Nursing", location: "Texas", gradYear: 2027 },
  { field: "Accounting", remote: true },
  { field: "Mechanical engineering", location: "Michigan" },
  { field: "marine biology" },
  { field: "underwater basket weaving" },
  { field: "Education & teaching", kind: "scholarship", minAward: "5000" },
  { field: "Finance", deadline: "30" },
  { field: "pre med in California" },
  { field: "graphic design remote" },
  { field: "Data science", location: "Colorado", locationStrict: true },
  { field: "Law & pre-law", kind: "scholarship" },
  { field: "Skilled trades" },
  { field: "", location: "Ohio" },
  { field: "" },
  { field: "compsci class of '29" },
  { merit: true, kind: "scholarship" },
  { merit: true, kind: "scholarship", college: "University of Nevada" },
];

function hasOnlySoftPreferences(p: ScoutPreferences): boolean {
  return !p.remote && !p.merit && !p.locationStrict;
}

async function main() {
  let failures = 0;
  for (const c of CASES) {
    const prefs = scoutSchema.parse({ ...defaultScout, ...c });
    const scout = resolveScout(prefs);
    const profile = { ...toScoringProfile(null, [], undefined), major: scout.interestText || null, gradYear: scout.gradYear ?? undefined, targetLocations: scout.location ? [scout.location] : [], openToRemote: prefs.remote || scout.preferRemote };
    const started = Date.now();
    const feed = await getFeed(profile as never, { ...scoutFeedFilters(prefs), limit: 1_000_000, reservePerKind: 0 });
    const result = buildScoutTiers(feed.items, scout, { limit: 20, reservePerKind: prefs.kind === "both" ? 5 : 0 });
    const ms = Date.now() - started;
    const shown = result.tiers.reduce((n, t) => n + t.items.length, 0);
    const fail = shown === 0 && hasOnlySoftPreferences(prefs);
    if (fail) failures++;
    console.log(`\n${fail ? "FAIL" : "ok  "} ${JSON.stringify(c)}  (${ms}ms)`);
    console.log(`     interest=${JSON.stringify(scout.interestText)} grad=${scout.gradYear ?? "-"} location=${scout.location || "-"} admitted=${result.total} best=${result.bestTotal}${result.emptyBecause.length ? ` empty because: ${result.emptyBecause.join(", ")}` : ""}`);
    for (const t of result.tiers) {
      console.log(`     [${t.id}] ${t.title} (${t.items.length})${t.relaxed.length ? ` relaxed: ${t.relaxed.join(", ")}` : ""}`);
      for (const i of t.items.slice(0, 4)) console.log(`        ${i.kind === "scholarship" ? "S" : "I"} ${i.title.slice(0, 80)} | ${i.company.slice(0, 30)} | ${i.locations.slice(0, 2).join("; ").slice(0, 40)}`);
    }
  }
  console.log(`\n${failures} soft-only Scout(s) returned nothing.`);
  await closeDb();
  if (failures) process.exitCode = 1;
}

main();
