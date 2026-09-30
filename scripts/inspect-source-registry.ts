/**
 * Read-only view of the INS-012 source registry: what we read from, how far we
 * trust it, and where a given posting came from.
 *
 * Nothing here writes, and nothing prints a stored payload, a crawler identity,
 * or an adapter secret. URLs are shown with their query string dropped, because
 * board links routinely carry session or tracking tokens.
 *
 * Usage:
 *   npx tsx scripts/inspect-source-registry.ts                      # summary
 *   npx tsx scripts/inspect-source-registry.ts --unmapped           # gaps
 *   npx tsx scripts/inspect-source-registry.ts --posting <hash|url|id>
 *   npx tsx scripts/inspect-source-registry.ts --source <key>
 *   npx tsx scripts/inspect-source-registry.ts --json
 *
 * Point DATABASE_URL at staging to rehearse; it is read-only either way.
 */

import "dotenv/config";

import postgres from "postgres";

/** Drops any query string so a board link cannot leak a token. */
function safeUrl(url: string | null): string | null {
  if (!url) return null;
  return url.split(/[?#]/)[0];
}

/**
 * Formats a timestamp for display.
 *
 * Deliberately not `String(date).slice(0, 10)`: postgres.js returns real Date
 * objects, and `toString()` starts with "Mon Jan 02 2026", so slicing it gives a
 * weekday rather than a date.
 */
function fmtDate(value: unknown, withTime = false): string {
  if (!value) return "never";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const iso = d.toISOString();
  return withTime ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z` : iso.slice(0, 10);
}

function pad(value: string, width: number): string {
  // Always leave a gap, even for a value that exactly fills the column.
  return value.length >= width ? `${value} ` : value + " ".repeat(width - value.length);
}

function padStart(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const unmapped = args.includes("--unmapped");
  const posting = valueOf("--posting");
  const source = valueOf("--source");

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, ssl: "require" });

  function valueOf(flag: string): string | null {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? null) : null;
  }

  async function emit(label: string, rows: unknown[]): Promise<void> {
    if (json) {
      console.log(JSON.stringify({ [label]: rows }, null, 2));
      return;
    }
    console.log(`\n${label}`);
    for (const row of rows) console.log(`  ${JSON.stringify(row)}`);
  }

  try {
    if (posting) {
      const rows = await sql`
        select p.id, p.canonical_hash, p.kind, p.publication_state, p.freshness_tier,
               p.closed_at, p.first_seen_at, p.last_seen_at, p.confirmed_at,
               p.authoritative_source_id is not null as has_authoritative_source,
               p.title, p.url as posting_url
        from postings p
        where p.canonical_hash = ${posting}
           or p.url = ${posting}
           or p.id::text = ${posting}
        limit 1`;
      if (rows.length === 0) {
        console.log(`no posting matches ${JSON.stringify(posting)}`);
        return;
      }
      const p = rows[0] as Record<string, unknown>;
      const id = p.id as string;

      if (json) {
          const [obs, corrob, prov, events] = await Promise.all([
            sql`
              select ps.source, ps.source_id, ps.authority, ps.is_authoritative_observation,
                     ps.registry_source_id is not null as mapped_to_source,
                     ps.adapter_version, ps.payload_hash, ps.fetched_at, ps.raw_storage,
                     s.key as source_key, s.terms_review_status,
                     ps.source_url
              from posting_sources ps
              left join sources s on s.id = ps.registry_source_id
              where ps.posting_id = ${id}::uuid
              order by ps.last_seen_at desc`,
            sql`
              select c.source_ref, c.url, c.listed_at, s.key as portal_source_key
              from posting_corroborations c
              left join sources s on s.id = c.portal_source_id
              where c.posting_id = ${id}::uuid`,
            sql`
              select fp.field, fp.method, fp.confidence, fp.rule_id, fp.evidence,
                     fp.decided_at, fp.superseded_at, s.key as source_key
              from posting_field_provenance fp
              left join sources s on s.id = fp.source_id
              where fp.posting_id = ${id}::uuid
              order by fp.field, fp.decided_at desc`,
            sql`
              select le.event, le.at, le.detail, s.key as source_key
              from posting_lifecycle_events le
              left join sources s on s.id = le.source_id
              where le.posting_id = ${id}::uuid
              order by le.at`,
          ]);
        console.log(
          JSON.stringify(
            {
              posting: { ...p, posting_url: safeUrl(p.posting_url as string) },
              observations: (obs as Record<string, unknown>[]).map((o) => ({
                ...o,
                source_url: safeUrl(o.source_url as string),
              })),
              corroborations: corrob,
              field_provenance: prov,
              lifecycle_events: events,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`posting   ${p.canonical_hash}  (${p.kind})`);
      console.log(`title     ${p.title}`);
      console.log(`url       ${safeUrl(p.posting_url as string)}`);
      console.log(`state     ${p.publication_state}  tier=${p.freshness_tier}`);
      console.log(
        `seen      first=${fmtDate(p.first_seen_at)}` +
          ` last=${fmtDate(p.last_seen_at)}` +
          ` confirmed=${fmtDate(p.confirmed_at)}`,
      );
      console.log(
        p.closed_at
          ? `closed    ${fmtDate(p.closed_at)}`
          : "closed    no (live)",
      );

      const obs = await sql`
        select ps.source, ps.source_id, ps.authority, ps.is_authoritative_observation,
               ps.registry_source_id is not null as mapped,
               ps.adapter_version, ps.payload_hash, s.key as source_key,
               s.terms_review_status, ps.source_url
        from posting_sources ps
        left join sources s on s.id = ps.registry_source_id
        where ps.posting_id = ${id}::uuid
        order by ps.last_seen_at desc`;

      console.log("\nobservations");
      if (obs.length === 0) {
        console.log("  none");
      } else {
        console.log(
          `  ${pad("source", 16)}${pad("mapped", 8)}${pad("authority", 18)}` +
            `${pad("terms", 13)}${pad("evidence", 26)}source id`,
        );
        for (const o of obs as Record<string, string | boolean | null>[]) {
          const evidence = o.adapter_version
            ? `reconstructed (${o.adapter_version})`
            : o.payload_hash
              ? "polled (hashed)"
              : "polled (no hash)";
          console.log(
            `  ${pad(String(o.source), 16)}${pad(o.mapped ? "yes" : "NO", 8)}` +
              `${pad(String(o.authority), 18)}${pad(String(o.terms_review_status ?? "-"), 13)}` +
              `${pad(evidence, 26)}${o.source_id ?? "-"}`,
          );
        }
      }

      const [corrob] = await sql`
        select c.source_ref, c.url, c.listed_at, s.key as portal_source_key
        from posting_corroborations c
        left join sources s on s.id = c.portal_source_id
        where c.posting_id = ${id}::uuid`;
      if (corrob) {
        console.log("\ncorroboration");
        console.log(
          `  ${corrob.portal_source_key ?? "?"} lists it as ${corrob.source_ref} ` +
            `(${fmtDate(corrob.listed_at)}) ${safeUrl(corrob.url) ?? ""}`,
        );
      }

      const prov = await sql`
        select fp.field, fp.method, fp.confidence, fp.rule_id, fp.evidence,
               fp.decided_at, fp.superseded_at, s.key as source_key
        from posting_field_provenance fp
        left join sources s on s.id = fp.source_id
        where fp.posting_id = ${id}::uuid
        order by fp.field, fp.decided_at desc`;
      if (prov.length) {
        console.log("\nfield provenance");
        for (const f of prov as Record<string, unknown>[]) {
          const superseded = f.superseded_at ? " (superseded)" : "";
          console.log(
            `  ${pad(String(f.field), 14)}${pad(String(f.method), 18)}` +
              `confidence=${f.confidence ?? "-"}${superseded}` +
              `${f.rule_id ? `  rule=${f.rule_id}` : ""}`,
          );
        }
      }

      const events = await sql`
        select le.event, le.at, le.detail, s.key as source_key
        from posting_lifecycle_events le
        left join sources s on s.id = le.source_id
        where le.posting_id = ${id}::uuid
        order by le.at`;
      if (events.length) {
        console.log("\nlifecycle");
        for (const e of events as Record<string, unknown>[]) {
          console.log(
            `  ${pad(String(e.event), 14)}${fmtDate(e.at, true)}` +
              `${e.source_key ? `  ${e.source_key}` : ""}`,
          );
        }
      }
      return;
    }

    if (source) {
      const rows = await sql`
        select s.key, s.provider, s.authority, s.state, s.opportunity_kind, s.poll_tier,
               s.poll_interval_sec, s.raw_storage, s.terms_review_status,
               s.terms_reviewed_at, s.last_complete_poll_at, s.consecutive_failures,
               o.name as org_name,
               (select count(*)::int from postings p
                 join posting_sources ps on ps.posting_id = p.id
                where ps.registry_source_id = s.id and p.closed_at is null) as open_postings
        from sources s
        left join organizations o on o.id = s.org_id
        where s.key = ${source} or s.provider = ${source}
        order by s.key`;
      if (rows.length === 0) {
        console.log(`no source matches ${JSON.stringify(source)}`);
        return;
      }
      for (const s of rows as Record<string, unknown>[]) {
        console.log(`\n${s.key}`);
        console.log(`  provider      ${s.provider}  (${s.opportunity_kind})`);
        console.log(`  authority     ${s.authority}   state=${s.state}`);
        console.log(`  organization  ${s.org_name ?? "- (portal)"}`);
        console.log(
          `  polling       tier ${s.poll_tier}, every ${s.poll_interval_sec ?? "-"}s, ` +
            `last complete ${fmtDate(s.last_complete_poll_at)}`,
        );
        console.log(
          `  failures      ${s.consecutive_failures} consecutive`,
        );
        console.log(
          `  terms         ${s.terms_review_status}` +
            `${s.terms_reviewed_at ? ` (reviewed ${fmtDate(s.terms_reviewed_at)})` : ""}`,
        );
        console.log(`  raw storage   ${s.raw_storage}`);
        console.log(`  open postings ${s.open_postings}`);
      }
      return;
    }

    /* Summary: the questions acceptance is actually judged on. */
    const [summary] = await sql`
      select
        (select count(*)::int from sources) as sources,
        (select count(*)::int from sources where authority = 'discovery_only') as discovery_only,
        (select count(*)::int from sources where state <> 'active') as not_active,
        (select count(*)::int from sources where terms_review_status <> 'approved') as terms_unapproved,
        (select count(*)::int from sources where last_complete_poll_at is null) as never_polled_ok,
        (select count(*)::int from posting_sources) as observations,
        (select count(*)::int from posting_sources where registry_source_id is null) as unmapped_obs,
        (select count(*)::int from postings where closed_at is null) as open_postings,
        (select count(*)::int from postings where closed_at is null and publication_state = 'verified') as verified,
        (select count(*)::int from postings where closed_at is null and publication_state = 'unverified') as unverified,
        (select count(*)::int from postings where closed_at is null and publication_state = 'candidate') as candidates,
        (select count(*)::int from postings where closed_at is null and publication_state = 'quarantined') as quarantined,
        (select count(*)::int from posting_corroborations) as corroborations,
        (select count(*)::int from discovery_candidates) as discovery_candidates,
        (select count(*)::int from posting_field_provenance) as field_provenance_rows,
        (select count(*)::int from posting_lifecycle_events) as lifecycle_events`;

    if (json) {
      await emit("summary", [summary]);
      return;
    }

    const s = summary as Record<string, number>;
    const accounted = s.verified + s.unverified + s.quarantined + s.candidates;
    const pct = (n: number) => (s.open_postings ? ((n / s.open_postings) * 100).toFixed(1) : "-");

    console.log("source registry");
    console.log(`  sources                 ${padStart(s.sources, 5)}`);
    console.log(`    discovery only        ${padStart(s.discovery_only, 5)}  (cannot publish)`);
    console.log(`    not active            ${padStart(s.not_active, 5)}`);
    console.log(`    terms not approved    ${padStart(s.terms_unapproved, 5)}`);
    console.log(`    no successful poll    ${padStart(s.never_polled_ok, 5)}`);

    console.log("\nprovenance");
    console.log(`  observations            ${padStart(s.observations, 5)}`);
    console.log(`  unmapped observations   ${padStart(s.unmapped_obs, 5)}`);

    console.log(`\nopen postings            ${padStart(s.open_postings, 5)}`);
    console.log(`  verified                ${padStart(s.verified, 5)}  ${pct(s.verified)}%`);
    console.log(`  unverified              ${padStart(s.unverified, 5)}  ${pct(s.unverified)}%`);
    console.log(`  candidates              ${padStart(s.candidates, 5)}  ${pct(s.candidates)}%`);
    console.log(`  quarantined             ${padStart(s.quarantined, 5)}  ${pct(s.quarantined)}%`);
    const coverage = s.open_postings
      ? ((accounted / s.open_postings) * 100).toFixed(1)
      : "-";
    console.log(`  accounted for           ${padStart(accounted, 5)}  ${coverage}%`);

    console.log("\nsupporting records");
    console.log(`  corroborations          ${padStart(s.corroborations, 5)}`);
    console.log(`  discovery candidates    ${padStart(s.discovery_candidates, 5)}`);
    console.log(`  field provenance rows   ${padStart(s.field_provenance_rows, 5)}`);
    console.log(`  lifecycle events        ${padStart(s.lifecycle_events, 5)}`);

    if (s.open_postings > 0 && accounted < s.open_postings) {
      console.log(
        `\nWARNING: ${s.open_postings - accounted} open posting(s) are in no state at all.`,
      );
    }

    if (unmapped) {
      const rows = await sql`
        select ps.source, count(*)::int as n
        from posting_sources ps
        where ps.registry_source_id is null
        group by ps.source
        order by n desc`;
      await emit("observations with no registry source", rows);

      const q = await sql`
        select p.canonical_hash, p.kind, p.url, p.last_seen_at
        from postings p
        where p.closed_at is null and p.publication_state = 'quarantined'
        order by p.last_seen_at desc
        limit 25`;
      if (json) {
        await emit("quarantined", q);
      } else {
        console.log("\nquarantined (first 25)");
        for (const r of q as Record<string, unknown>[]) {
          console.log(
            `  ${pad(String(r.canonical_hash), 24)}${pad(String(r.kind), 12)}` +
              `${safeUrl(r.url as string) ?? ""}`,
          );
        }
      }
    }
  } finally {
    await sql.end();
  }
}

void main();
