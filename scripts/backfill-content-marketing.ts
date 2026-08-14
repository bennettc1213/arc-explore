import "dotenv/config";
import postgres from "postgres";
import { isContentMarketing } from "../src/lib/scholarships/classify";

/**
 * Re-stamps `is_content_marketing` on every scholarship row.
 *
 * The flag is derived from the sponsor's name and award amount at ingest. When
 * the classifier changes (a new legal-practice suffix, a new override), only
 * rows that get re-ingested would pick it up — everything already in the table
 * keeps its old label. This backfills the whole corpus in one pass.
 *
 * Idempotent: it only writes rows whose computed label differs from what is
 * stored, and the classifier is deterministic.
 */
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require", idle_timeout: 55 });

  const rows = await sql`
    SELECT id, sponsor_name, amount_min, amount_max, is_content_marketing
    FROM postings
    WHERE kind = 'scholarship'
  `;

  let toTrue = 0;
  let toFalse = 0;
  const changed: Array<{ sponsor: string; from: boolean; to: boolean }> = [];

  for (const r of rows) {
    const computed = isContentMarketing({
      sponsorName: r.sponsor_name ?? "",
      amountMin: r.amount_min,
      amountMax: r.amount_max,
    });
    if (computed === r.is_content_marketing) continue;
    if (computed) toTrue += 1;
    else toFalse += 1;
    changed.push({ sponsor: r.sponsor_name ?? "", from: r.is_content_marketing, to: computed });
    await sql`
      UPDATE postings
      SET is_content_marketing = ${computed}
      WHERE id = ${r.id}
    `;
  }

  console.log(`rows: ${rows.length}`);
  console.log(`flipped false->true:  ${toTrue}`);
  console.log(`flipped true->false:  ${toFalse}`);
  if (changed.length <= 40) {
    for (const c of changed) console.log(`  ${c.sponsor}: ${c.from} -> ${c.to}`);
  } else {
    for (const c of changed.slice(0, 40)) console.log(`  ${c.sponsor}: ${c.from} -> ${c.to}`);
    console.log(`  … and ${changed.length - 40} more`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
