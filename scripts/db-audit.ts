/**
 * Security audit for the Supabase Postgres instance.
 *
 * Why this exists: we run migrations with drizzle-kit rather than the Supabase
 * CLI, and Supabase's default privileges grant `anon` and `authenticated` full
 * CRUD on every new table in `public`. Those roles are what PostgREST assumes
 * for requests carrying the (publicly shipped) anon key, so **a table without
 * RLS is readable and writable by anyone on the internet** at
 * `https://<ref>.supabase.co/rest/v1/<table>` — regardless of what our own
 * Drizzle queries do.
 *
 * Our app connection is the owner role and bypasses RLS entirely, so this
 * cannot be caught by exercising the app. It has to be asserted directly.
 *
 * Run:  npm run db:audit
 * Exits non-zero if any table is unprotected, so it can gate a deploy.
 */

import "dotenv/config";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see .env");

const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });

interface TableRow {
  relname: string;
  relrowsecurity: boolean;
}

async function main() {
  const [who] = await sql<{ current_user: string }[]>`select current_user`;
  console.log(`connected as: ${who.current_user}\n`);

  const tables = await sql<TableRow[]>`
    select c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname`;

  const policies = await sql<{ tablename: string; policyname: string; cmd: string }[]>`
    select tablename, policyname, cmd from pg_policies where schemaname = 'public'`;

  const exposed = await sql<{ table_name: string; grantee: string; privs: string }[]>`
    select table_name, grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
    group by 1, 2 order by 1, 2`;

  const grantsFor = (t: string) =>
    exposed.filter((e) => e.table_name === t).map((e) => `${e.grantee}:${e.privs}`);

  const unprotected: string[] = [];

  for (const t of tables) {
    const pols = policies.filter((p) => p.tablename === t.relname);
    const grants = grantsFor(t.relname);
    const reachable = grants.length > 0;
    const ok = t.relrowsecurity || !reachable;
    if (!ok) unprotected.push(t.relname);

    console.log(
      `${ok ? "ok  " : "FAIL"}  ${t.relname.padEnd(20)} ` +
        `rls=${t.relrowsecurity ? "on " : "off"}  policies=${String(pols.length).padStart(2)}  ` +
        `grants=[${grants.join(" ") || "none"}]`,
    );
  }

  await sql.end();

  if (unprotected.length > 0) {
    console.error(
      `\n${unprotected.length} table(s) reachable via the public anon key with no RLS: ` +
        unprotected.join(", "),
    );
    process.exit(1);
  }
  console.log("\nall tables protected");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
