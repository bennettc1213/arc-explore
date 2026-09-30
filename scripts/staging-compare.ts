import "dotenv/config";

import { readFileSync } from "node:fs";

import postgres from "postgres";

const STAGING_REF = "dgkjfmohtphrmispucwf";

type Shape = {
  tables: number;
  views: number;
  indexes: number;
  fks: number;
  rls: number;
  names: string[];
  columns: string[];
};

function stagingUrl(): string {
  const line = readFileSync(".env.staging", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL missing from .env.staging");
  const url = line.slice("DATABASE_URL=".length).trim();
  if (!new URL(url).username.includes(STAGING_REF)) {
    throw new Error("ABORT: .env.staging does not point at the staging project");
  }
  return url;
}

async function shape(url: string): Promise<Shape> {
  const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
  try {
    const [c] = await sql.unsafe(`
      select
        (select count(*)::int from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
        (select count(*)::int from information_schema.views
          where table_schema = 'public') as views,
        (select count(*)::int from pg_indexes where schemaname = 'public') as indexes,
        (select count(*)::int from information_schema.table_constraints
          where table_schema = 'public' and constraint_type = 'FOREIGN KEY') as fks,
        (select count(*)::int from pg_policies where schemaname = 'public') as rls`);
    const tables = await sql.unsafe(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
    const cols = await sql.unsafe(`
      select table_name || '.' || column_name as c
      from information_schema.columns where table_schema = 'public'
      order by c`);
    // postgres.js types a result as RowList<Row[]>; widen through unknown to the
    // two shapes the queries above select.
    const tableNames = tables as unknown as { table_name: string }[];
    const columnNames = cols as unknown as { c: string }[];
    return {
      tables: c.tables,
      views: c.views,
      indexes: c.indexes,
      fks: c.fks,
      rls: c.rls,
      names: tableNames.map((t) => t.table_name),
      columns: columnNames.map((r) => r.c),
    };
  } finally {
    await sql.end();
  }
}

async function main() {
  // process.env.DATABASE_URL is production (.env). Read-only introspection only.
  const prod = await shape(process.env.DATABASE_URL!);
  const stg = await shape(stagingUrl());

  const row = (label: string, a: number, b: number) =>
    console.log(`  ${label.padEnd(12)} prod=${String(a).padEnd(6)} staging=${String(b).padEnd(6)} ${a === b ? "match" : "DIFFERS"}`);

  console.log("schema shape comparison (production is read-only here)");
  row("tables", prod.tables, stg.tables);
  row("views", prod.views, stg.views);
  row("indexes", prod.indexes, stg.indexes);
  row("fks", prod.fks, stg.fks);
  row("rls", prod.rls, stg.rls);

  const missing = prod.names.filter((n) => !stg.names.includes(n));
  const extra = stg.names.filter((n) => !prod.names.includes(n));
  console.log(`  tables only in prod    : ${missing.length ? missing.join(", ") : "none"}`);
  console.log(`  tables only in staging : ${extra.length ? extra.join(", ") : "none"}`);

  const prodCols = new Set(prod.columns);
  const stgCols = new Set(stg.columns);
  const missingCols = prod.columns.filter((c) => !stgCols.has(c));
  const extraCols = stg.columns.filter((c) => !prodCols.has(c));
  console.log(`  columns only in prod    : ${missingCols.length ? missingCols.join(", ") : "none"}`);
  console.log(`  columns only in staging : ${extraCols.length ? extraCols.join(", ") : "none"}`);
}

void main();
