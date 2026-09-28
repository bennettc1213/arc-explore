/**
 * Backfill term_source / term_season / term_year / term_raw / term_ended_flag_at
 * for open postings, using the INS-004 parser.
 *
 * Usage:
 *   npx tsx scripts/backfill-terms.ts              # live run, open rows only
 *   npx tsx scripts/backfill-terms.ts --dry-run    # count only
 *   npx tsx scripts/backfill-terms.ts --all        # include closed rows
 *   npx tsx scripts/backfill-terms.ts --cursor <uuid>
 *   npx tsx scripts/backfill-terms.ts --batch-size 200
 *
 * Resumable via --cursor. Idempotent: re-running changes only rows whose
 * computed term differs from what is stored.
 *
 * The script parses from title + first_seen first, and only fetches
 * description_text for the small subset of rows where the title alone is
 * insufficient or might discard an existing explicit JD term.
 */

import "dotenv/config";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { postings } from "@/db/schema";
import { parseTerm, displayTerm, type TermParseResult } from "@/lib/terms/parser";
import { isTermEnded } from "@/lib/terms/bounds";
import { parseTermLabel } from "@/lib/terms/display";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const allRows = args.includes("--all");
const batchSize = Number(
  args.find((_, i) => args[i - 1] === "--batch-size") ?? "1000",
);
const cursor = args.find((_, i) => args[i - 1] === "--cursor") ?? null;

const now = new Date();

interface Counts {
  explicit: number;
  inferred: number;
  unknown: number;
  pastFlagged: number;
  /** Free text that disagreed with the structured season/year. */
  divergedRepaired: number;
  unchanged: number;
  failed: number;
  total: number;
}

/**
 * True when the stored display text describes a different term than the
 * structured columns. Those rows are rewritten from the structured values,
 * because the structured columns are what every ended-term check reads.
 */
function isDivergent(
  term: string | null,
  season: string | null,
  year: number | null,
): boolean {
  if (!term || !season || year === null) return false;
  const parsed = parseTermLabel(term);
  if (!parsed) return true;
  return parsed.season !== season || parsed.year !== year;
}

async function fetchDescriptions(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: postings.id, descriptionText: postings.descriptionText })
    .from(postings)
    .where(inArray(postings.id, ids));
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.descriptionText) map.set(r.id, r.descriptionText);
  }
  return map;
}

async function main() {
  const counts: Counts = {
    explicit: 0,
    inferred: 0,
    unknown: 0,
    pastFlagged: 0,
    divergedRepaired: 0,
    unchanged: 0,
    failed: 0,
    total: 0,
  };

  let lastId: string | null = cursor;
  let done = false;

  while (!done) {
    const cursorCond = lastId ? gt(postings.id, lastId) : undefined;
    const openCondition = allRows ? undefined : isNull(postings.closedAt);
    const baseCondition =
      cursorCond && openCondition
        ? and(openCondition, cursorCond)
        : cursorCond ?? openCondition;

    const rows = await db
      .select({
        id: postings.id,
        title: postings.title,
        firstSeenAt: postings.firstSeenAt,
        closedAt: postings.closedAt,
        term: postings.term,
        termSource: postings.termSource,
        termSeason: postings.termSeason,
        termYear: postings.termYear,
        termRaw: postings.termRaw,
        termEndedFlagAt: postings.termEndedFlagAt,
      })
      .from(postings)
      .where(baseCondition)
      .orderBy(postings.id)
      .limit(batchSize);

    if (rows.length === 0) {
      done = true;
      break;
    }

    // First pass: title + first_seen only.
    const firstPass: Map<string, TermParseResult> = new Map();
    const needsDescription: string[] = [];

    for (const row of rows) {
      const computed = parseTerm(row.title, null, row.firstSeenAt);
      firstPass.set(row.id, computed);

      if (
        computed.termSource === "unknown" ||
        (row.termSource === "explicit" && computed.termSource !== "explicit")
      ) {
        needsDescription.push(row.id);
      }
    }

    // Fetch descriptions only for rows that need them.
    const descriptions = await fetchDescriptions(needsDescription);

    for (const row of rows) {
      try {
        const divergent = isDivergent(row.term, row.termSeason, row.termYear);
        let computed = firstPass.get(row.id)!;
        const descriptionText = descriptions.get(row.id);
        if (descriptionText) {
          computed = parseTerm(row.title, descriptionText, row.firstSeenAt);
        }

        /*
         * Repair divergence.
         *
         * On a row whose label already contradicts its structured columns, the
         * label is the untrustworthy half, and a season/year found only in the
         * JD is exactly what put it there: an eligibility window ("graduation
         * date from Spring 2027 to Fall 2028") reads as an explicit term to a
         * regex. Re-reading that JD would just re-derive the same bad term and
         * promote it to `explicit`, which is worse than the state we are
         * repairing.
         *
         * So the title decides, and the stored structured pair is the fallback:
         * a term the employer put in the title is real, otherwise the row keeps
         * the term the ingest inferred. Either way label and structure end up
         * describing the same term.
         */
        if (divergent) {
          const fromTitle = parseTerm(row.title, null, null);
          computed =
            fromTitle.termSource === "explicit"
              ? fromTitle
              : {
                  termSource: "inferred" as const,
                  termSeason: row.termSeason,
                  termYear: row.termYear,
                  term:
                    row.termSeason && row.termYear
                      ? displayTerm(row.termSeason, row.termYear)
                      : computed.term,
                  termRaw: null,
                };
        }

        const endedFlag =
          row.closedAt === null &&
          computed.termSource !== "unknown" &&
          isTermEnded(computed.termSeason, computed.termYear, now)
            ? now
            : null;

        const same =
          row.term === computed.term &&
          row.termSource === computed.termSource &&
          row.termSeason === computed.termSeason &&
          row.termYear === computed.termYear &&
          row.termRaw === computed.termRaw &&
          ((row.termEndedFlagAt === null && endedFlag === null) ||
            row.termEndedFlagAt?.getTime() === endedFlag?.getTime());

        counts.total++;

        if (same) {
          counts.unchanged++;
        } else {
          counts[computed.termSource]++;
          if (endedFlag) counts.pastFlagged++;
          if (divergent) counts.divergedRepaired++;

          if (!dryRun) {
            await db
              .update(postings)
              .set({
                term: computed.term,
                termSource: computed.termSource,
                termSeason: computed.termSeason,
                termYear: computed.termYear,
                termRaw: computed.termRaw,
                termEndedFlagAt: endedFlag,
              })
              .where(eq(postings.id, row.id));
          }
        }

        lastId = row.id;
      } catch (e) {
        counts.failed++;
        console.error(`failed at ${row.id}:`, e);
      }
    }

    if (rows.length < batchSize) done = true;
    if (dryRun) {
      console.log(`counted ${counts.total} rows...`);
    } else {
      console.log(`processed ${counts.total} rows, last id ${lastId}`);
    }
  }

  console.log("---");
  console.log(dryRun ? "DRY RUN — no rows updated" : "BACKFILL COMPLETE");
  console.log(JSON.stringify(counts, null, 2));
  if (lastId) console.log(`resume cursor: ${lastId}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
