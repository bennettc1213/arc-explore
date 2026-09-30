/**
 * Schema drift check (INS-012 hygiene).
 *
 * `drizzle-kit generate` cannot run non-interactively in this repo because the
 * committed snapshot and `src/db/schema.ts` already disagree — drizzle asks
 * which added column is a rename of which removed one, and there is no TTY in CI
 * or an agent shell. This script reports the disagreement instead, comparing
 * three sources of truth:
 *
 *   1. `src/db/schema.ts`      — what the code believes exists
 *   2. `src/db/migrations/*.sql` snapshot — what drizzle would generate against
 *   3. the live database (staging or production) — what is actually applied
 *
 * Read-only. Run with no DATABASE_URL override to check production, or with the
 * staging URL exported to check staging.
 */

import "dotenv/config";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { sql as rawSql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";

import * as appSchema from "../src/db/schema";

type ColumnSet = Map<string, Set<string>>;

/** Every pgTable carries these symbols; plain objects in the module do not. */
function asTable(value: unknown): PgTable | null {
  const v = value as Record<symbol, unknown> | null;
  if (!v || typeof v !== "object") return null;
  if (!v[Symbol.for("drizzle:Name")] && !v[Symbol.for("drizzle:Columns")]) return null;
  return value as PgTable;
}

function columnsFromSchema(): ColumnSet {
  const out: ColumnSet = new Map();
  for (const value of Object.values(appSchema)) {
    const table = asTable(value);
    if (!table) continue;
    const config = getTableConfig(table);
    // config.columns is keyed by index, so read the values, not the keys.
    const names = Object.values(config.columns).map((col) =>
      (col as { name: string }).name,
    );
    out.set(config.name, new Set(names));
  }
  return out;
}

function columnsFromLatestSnapshot(): { file: string; set: ColumnSet } | null {
  const metaDir = join(process.cwd(), "src", "db", "migrations", "meta");
  let files: string[];
  try {
    files = readdirSync(metaDir).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
  const latest = files
    .filter((f) => f !== "_journal.json")
    .sort()
    .pop();
  if (!latest) return null;

  const snapshot = JSON.parse(readFileSync(join(metaDir, latest), "utf8")) as {
    tables: Record<string, { columns: Record<string, unknown> }>;
  };
  const set: ColumnSet = new Map();
  for (const [table, def] of Object.entries(snapshot.tables)) {
    // Snapshots key tables as "public.name"; schema.ts uses "name".
    set.set(table.replace(/^public\./, ""), new Set(Object.keys(def.columns)));
  }
  return { file: latest, set };
}

async function columnsFromDatabase(url: string): Promise<ColumnSet> {
  const client = postgres(url, { max: 1, prepare: false, ssl: "require" });
  try {
    const rows = await client.unsafe(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, column_name`);
    const set: ColumnSet = new Map();
    // postgres.js types a result as RowList<Row[]>, which is a mutable array of
    // untyped rows. Widen through unknown to the shape this query selects.
    for (const row of rows as unknown as { table_name: string; column_name: string }[]) {
      if (!set.has(row.table_name)) set.set(row.table_name, new Set());
      set.get(row.table_name)!.add(row.column_name);
    }
    return set;
  } finally {
    await client.end();
  }
}

function diff(label: string, left: ColumnSet, right: ColumnSet): void {
  const onlyLeft: string[] = [];
  const onlyRight: string[] = [];
  for (const [table, cols] of left) {
    const other = right.get(table);
    if (!other) {
      onlyLeft.push(`${table} (whole table)`);
      continue;
    }
    for (const col of cols) if (!other.has(col)) onlyLeft.push(`${table}.${col}`);
  }
  for (const [table, cols] of right) {
    const other = left.get(table);
    if (!other) {
      onlyRight.push(`${table} (whole table)`);
      continue;
    }
    for (const col of cols) if (!other.has(col)) onlyRight.push(`${table}.${col}`);
  }
  console.log(`\n${label}`);
  console.log(`  only in left  : ${onlyLeft.length ? onlyLeft.join(", ") : "none"}`);
  console.log(`  only in right : ${onlyRight.length ? onlyRight.join(", ") : "none"}`);
}

async function main() {
  void rawSql;
  const schemaCols = columnsFromSchema();
  const snapshot = columnsFromLatestSnapshot();
  const dbCols = await columnsFromDatabase(process.env.DATABASE_URL!);

  console.log(`tables — schema.ts: ${schemaCols.size}, database: ${dbCols.size}`);

  if (snapshot) {
    console.log(`latest snapshot: ${snapshot.file}`);
    diff("schema.ts  vs  latest snapshot", schemaCols, snapshot.set);
  } else {
    console.log("latest snapshot: none found");
  }
  diff("schema.ts  vs  live database", schemaCols, dbCols);
}

void main();
