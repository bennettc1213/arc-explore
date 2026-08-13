/**
 * Live smoke test for the Tier A adapters.
 *
 * Hits real boards and reports what came back, so adapter drift shows up as a
 * failed run rather than as silently empty ingestion.
 *
 *   npx tsx scripts/probe-adapters.ts
 */

import { ashby } from "../src/lib/ingest/sources/ashby";
import { greenhouse } from "../src/lib/ingest/sources/greenhouse";
import { lever } from "../src/lib/ingest/sources/lever";
import { smartrecruiters } from "../src/lib/ingest/sources/smartrecruiters";
import { classifyOpportunity, detectTerm } from "../src/lib/ingest/normalize";
import type { BoardAdapter } from "../src/lib/ingest/types";

const TARGETS: Array<{ adapter: BoardAdapter; slug: string }> = [
  { adapter: greenhouse, slug: "databricks" },
  { adapter: ashby, slug: "openai" },
  { adapter: lever, slug: "wealthfront" },
  { adapter: smartrecruiters, slug: "BoschGroup" },
];

async function main() {
  let failures = 0;

  for (const { adapter, slug } of TARGETS) {
    const started = Date.now();
    try {
      const { postings } = await adapter.fetchBoard(slug);
      // Title + structured hint only — never the description. See
      // classifyOpportunity for the measured reason.
      const early = postings.filter(
        (p) => classifyOpportunity(p.title, p.employmentHint) !== "other",
      );
      const withDate = postings.filter((p) => p.postedAt).length;
      const withDesc = postings.filter((p) => p.descriptionText).length;
      const terms = new Set(
        early.map((p) => detectTerm(p.title, p.descriptionText)).filter(Boolean),
      );

      console.log(
        `\n=== ${adapter.name} / ${slug} — ${Date.now() - started}ms ===`,
      );
      console.log(`  total postings   : ${postings.length}`);
      console.log(`  early-career     : ${early.length}`);
      console.log(`  with postedAt    : ${withDate}`);
      console.log(`  with description : ${withDesc}`);
      console.log(`  terms detected   : ${[...terms].slice(0, 6).join(", ") || "(none)"}`);

      for (const p of early.slice(0, 3)) {
        console.log(
          `    - ${p.title}  |  ${p.locations.slice(0, 2).join(" / ") || "(no location)"}  |  ${
            p.postedAt ? p.postedAt.toISOString().slice(0, 10) : "(no date)"
          }`,
        );
      }

      if (postings.length === 0) {
        console.log("  !! returned zero postings");
        failures++;
      }
      // Every posting must carry a usable link; a row we cannot click is dead weight.
      const noUrl = postings.filter((p) => !p.url).length;
      if (noUrl > 0) {
        console.log(`  !! ${noUrl} postings missing a url`);
        failures++;
      }
    } catch (err) {
      console.log(`\n=== ${adapter.name} / ${slug} — FAILED ===`);
      console.log(`  ${err instanceof Error ? err.message : String(err)}`);
      failures++;
    }
  }

  console.log(`\n${failures === 0 ? "OK — all adapters returned data" : `FAILURES: ${failures}`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
