/**
 * Does the search find what a student was actually asking for?
 *
 * The measurement that produced `search/query.ts`. A script rather than a test
 * because the answer is a property of the **live corpus**, not of the code:
 * whether "psychology" finds anything depends entirely on whether anything in
 * the database says psychology, and only running it against real data says so.
 *
 * The queries below are fixed deliberately. They were written *before* the
 * implementation, from what a student would plausibly type — misspellings,
 * abbreviations, plurals, amounts, hyphens — rather than chosen afterwards from
 * the set that happens to work. Six of the 25 returned nothing when this list
 * was first run.
 *
 *   npm run search:quality
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { getFeed } from "../src/lib/feed";
import { parseQuery } from "../src/lib/search/query";
import type { ScoreProfile } from "../src/lib/score/fit";

/** Signed out, because that is the hardest case: no profile to fall back on. */
const VISITOR: ScoreProfile = {};

const QUERIES = [
  "software engineering internship",
  "software enginer",
  "compsci",
  "CS internship",
  "computer science",
  "nursing scholarships",
  "nurse",
  "mechanical engineer",
  "engineering",
  "$5000",
  "5000",
  "scholarships over $10000",
  "first generation",
  "first-generation",
  "women in stem",
  "marketing intern",
  "data analyst",
  "machine learning",
  "summer 2026 internship",
  "remote internship",
  "psychology",
  "teaching",
  "art",
  "business administration",
  "accounting",
];

/** What the query understanding did, in one line, so a surprise is visible. */
function describe(raw: string): string {
  const q = parseQuery(raw);
  const bits: string[] = [];
  if (q.kind) bits.push(`kind=${q.kind}`);
  if (q.minAmount !== null) bits.push(`min=$${q.minAmount}`);
  if (q.remoteOnly) bits.push("remote");
  for (const t of q.terms) {
    bits.push(t.alternates.length > 1 ? `${t.literal}[+${t.alternates.length - 1}]` : t.literal);
  }
  return bits.join(" ") || "(nothing)";
}

async function main() {
  console.log(
    "query".padEnd(30) + "rows".padStart(6) + "  " + "understood as".padEnd(38) + "top hit",
  );
  console.log("-".repeat(132));

  let empty = 0;
  for (const raw of QUERIES) {
    const r = await getFeed(VISITOR, { q: raw, limit: 3 });
    if (r.total === 0) empty++;
    const top = r.items[0];
    console.log(
      raw.padEnd(30) +
        String(r.total).padStart(6) +
        "  " +
        describe(raw).slice(0, 36).padEnd(38) +
        (top ? `[${top.kind.slice(0, 4)}] ${top.title.slice(0, 52)}` : "-- NOTHING --"),
    );
  }

  console.log(`\n${empty} of ${QUERIES.length} queries return nothing at all.`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
