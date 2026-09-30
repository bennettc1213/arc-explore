/**
 * Synthetic rows for the staging database, so an INS-012 migration and backfill
 * can be rehearsed without touching production or carrying any student data.
 *
 * Shapes deliberately include the awkward cases, because those are what a
 * migration breaks on:
 *   - a scholarship row with no organization (a multi-sponsor portal listing)
 *   - a posting two independent sources both list (corroboration)
 *   - a posting whose only observation comes from an unregistered provider,
 *     which must end up quarantined rather than silently attached to something
 *   - a user with a saved search and a match, to prove user relationships and
 *     first-seen history survive a schema migration
 *
 * Everything is fake: `example.test` names, no real people, no real employers.
 *
 * Usage:
 *   npx tsx scripts/seed-staging-synthetic.ts            # dry run (default)
 *   npx tsx scripts/seed-staging-synthetic.ts --reset    # empty the tables first
 *   npx tsx scripts/seed-staging-synthetic.ts --apply
 *
 * Refuses to run anywhere but the staging project.
 */

import "dotenv/config";

import { readFileSync } from "node:fs";

import postgres from "postgres";

const STAGING_REF = "dgkjfmohtphrmispucwf";

function stagingUrl(): string {
  const line = readFileSync(".env.staging", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL missing from .env.staging");
  const url = line.slice("DATABASE_URL=".length).trim();
  if (!new URL(url).username.includes(STAGING_REF)) {
    throw new Error(`ABORT: ${url} is not the staging project`);
  }
  return url;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const reset = process.argv.includes("--reset");
  const url = stagingUrl();
  console.log(`target : ${new URL(url).hostname}`);
  console.log(`mode   : ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  if (reset && !apply) {
    console.error("\n--reset needs --apply; it deletes rows.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
  try {
    if (apply) {
      await sql.begin(async (tx) => {
        if (reset) {
          // Order does not matter with CASCADE; doing it in one statement keeps
          // the reset atomic with the seed that follows.
          await tx`
            truncate table posting_corroborations, posting_field_provenance,
                            posting_lifecycle_events, discovery_candidates,
                            posting_sources, sources, matches, saved_searches,
                            profiles, postings, organizations restart identity cascade`;
          console.log("  tables reset");
        }
        // Two companies, each on a real ATS type, with a board slug.
        const orgs = await tx`
          insert into organizations (name, normalized_name, domain, ats_type, ats_slug,
                                     poll_interval_sec, last_polled_at, last_poll_ok)
          values ('Northwind Robotics', 'northwind robotics', 'northwind.example',
                  'greenhouse', 'NorthwindRobotics', 1200, now() - interval '2 hours', true),
                 ('Contoso Health', 'contoso health', 'contoso.example',
                  'lever', 'contoso-health', 1200, now() - interval '1 day', true),
                 ('Fabrikam University', 'fabrikam university', 'fabrikam.example',
                  'ashby', 'fabrikam', 1200, null, null)
          returning id, name, ats_type, ats_slug`;
        console.log(`  organizations inserted: ${orgs.length}`);

        const postings = await tx`
          insert into postings (org_id, kind, freshness_tier, canonical_hash, title,
                                normalized_title, url, locations, is_remote, term,
                                term_source, term_season, term_year, description_text,
                                first_seen_at, last_seen_at, sponsor_name)
          values
            -- 1. internship on a real ATS board, explicit term
            ((select id from organizations where ats_slug = 'NorthwindRobotics'),
             'internship', 'live_polled', 'seed-hash-1', 'Software Engineer Intern',
             'software engineer intern', 'https://northwind.example/jobs/1',
             array['Remote'], true, 'Summer 2027', 'explicit', 'summer', 2027,
             'Summer 2027 internship.', now() - interval '30 days', now() - interval '2 hours', null),
            -- 2. second internship on the other ATS, inferred term
            ((select id from organizations where ats_slug = 'contoso-health'),
             'internship', 'live_polled', 'seed-hash-2', 'Data Analyst Intern',
             'data analyst intern', 'https://contoso.example/jobs/2',
             array['Boston, MA'], false, null, 'unknown', null, null,
             null, now() - interval '20 days', now() - interval '1 day', null),
            -- 3. scholarship from a multi-sponsor portal: no organization at all
            (null, 'scholarship', 'periodic_check', 'seed-hash-3', 'Women in Engineering Scholarship',
             'women in engineering scholarship', 'https://portal.example/scholarships/3',
             array[]::text[], false, null, 'unknown', null, null,
             null, now() - interval '10 days', now() - interval '3 days', 'Example Foundation'),
            -- 4. on Fabrikam's own Ashby board, but the ingest path never wrote an
            --    observation row for it, so the backfill has to reconstruct one
            --    from the URL. Should end up unverified, never verified.
            ((select id from organizations where ats_slug = 'fabrikam'),
             'internship', 'live_polled', 'seed-hash-4', 'Research Intern',
             'research intern', 'https://jobs.ashbyhq.com/fabrikam/req-4',
             array['Remote'], true, null, 'unknown', null, null,
             null, now() - interval '9 days', now() - interval '3 days', null),
            -- 5. a row from a provider nobody registered: must end up quarantined
            (null, 'scholarship', 'unverified_static', 'seed-hash-5', 'Mystery Award',
             'mystery award', 'https://mystery.example/award/5',
             array[]::text[], false, null, 'unknown', null, null,
             null, now() - interval '5 days', now() - interval '5 days', 'Mystery Trust'),
            -- 6. Fabrikam's slug appears in this URL but it is the company's
            --    marketing site, not its Ashby board. Reconstructing provenance
            --    from it would credit an authoritative source for a row nothing
            --    observed, so it must stay unmapped and be quarantined.
            ((select id from organizations where ats_slug = 'fabrikam'),
             'internship', 'unverified_static', 'seed-hash-6', 'Marketing Intern (unconfirmed)',
             'marketing intern', 'https://fabrikam.example/careers/marketing-6',
             array['Remote'], true, null, 'unknown', null, null,
             null, now() - interval '4 days', now() - interval '4 days', null),
            -- 7. known only to a discovery-only source. Must land as a candidate:
            --    a discovery hit is a lead to check, never a posting to publish.
            (null, 'internship', 'unverified_static', 'seed-hash-7', 'Software Engineer Intern (Simplify)',
             'software engineer intern', 'https://simplify.jobs/listing/7',
             array['Remote'], true, null, 'unknown', null, null,
             null, now() - interval '2 days', now() - interval '2 days', 'Initech')
          returning id, canonical_hash`;
        console.log(`  postings inserted: ${postings.length}`);

        await tx`
          insert into posting_sources (posting_id, source, source_id, source_url, first_seen_at, last_seen_at)
          values
            ((select id from postings where canonical_hash = 'seed-hash-1'), 'greenhouse', 'gh-1',
             'https://boards.greenhouse.io/northwindrobotics/jobs/1', now() - interval '30 days', now() - interval '2 hours'),
            ((select id from postings where canonical_hash = 'seed-hash-2'), 'lever', 'lv-2',
             'https://jobs.lever.co/contoso-health/2', now() - interval '20 days', now() - interval '1 day'),
            -- two independent sources for the same scholarship = corroboration
            ((select id from postings where canonical_hash = 'seed-hash-3'), 'scholarshipscom', 'sc-3',
             'https://scholarships.com/awards/3', now() - interval '10 days', now() - interval '3 days'),
            ((select id from postings where canonical_hash = 'seed-hash-3'), 'unl', 'unl-3b',
             'https://financialaid.unl.edu/awards/3', now() - interval '9 days', now() - interval '3 days'),
            -- unregistered provider: the backfill must leave this unmapped
            ((select id from postings where canonical_hash = 'seed-hash-5'), 'mysteryprovider', 'mp-5',
             'https://mystery.example/api/5', now() - interval '5 days', now() - interval '5 days'),
            -- discovery only: names a company but is not a source of truth for the
            -- listing, so this posting must end up a candidate, never published
            ((select id from postings where canonical_hash = 'seed-hash-7'), 'simplify', 'sm-7',
             'https://simplify.jobs/listing/7', now() - interval '2 days', now() - interval '2 days')`;
        console.log("  posting_sources inserted: 6");

        // The discovery-only source itself, plus a queued candidate row for it.
        await tx`
          insert into sources (key, provider, authority, state, opportunity_kind, poll_tier,
                               raw_storage, public_page_url, terms_review_status, adapter_config)
          values ('simplify', 'simplify', 'discovery_only', 'active', 'internship', 'B',
                  'none', 'https://simplify.jobs/', 'approved', '{}'::jsonb)
          on conflict (key) do nothing`;
        await tx`
          update posting_sources ps
          set registry_source_id = s.id, authority = 'discovery_only',
              is_authoritative_observation = false
          from sources s
          where ps.source = 'simplify' and s.key = 'simplify'`;
        await tx`
          insert into discovery_candidates (source_id, origin, candidate_key,
                                            organization_name, organization_domain,
                                            ats_type, status)
          values ((select id from sources where key = 'simplify'), 'simplify', 'sm-7',
                  'Initech', 'initech.example', 'greenhouse', 'pending')`;
        console.log("  discovery-only source + candidate queued: 1 each");

        // Field-level evidence and lifecycle history, so the inspection command
        // has something to show. `term` is the field the term-anchor work cares
        // about, so it gets an explicit, superseded-then-corrected pair.
        await tx`
          insert into posting_field_provenance (posting_id, source_id, field, method,
                                                confidence, rule_id, rule_version,
                                                evidence, value_text, decided_at, superseded_at)
          values
            ((select id from postings where canonical_hash = 'seed-hash-1'),
             (select id from sources where key = 'greenhouse:NorthwindRobotics'),
             'term', 'deterministic_rule', 0.95, 'term-anchor-v2', '2',
             'title says "Summer 2027"', 'summer|2027', now() - interval '10 days', null),
            ((select id from postings where canonical_hash = 'seed-hash-1'),
             (select id from sources where key = 'greenhouse:NorthwindRobotics'),
             'term', 'llm', 0.42, 'term-llm-v1', '1',
             'description mentioned "this past summer"', 'unknown|',
             now() - interval '11 days', now() - interval '10 days'),
            ((select id from postings where canonical_hash = 'seed-hash-3'),
             null, 'amount', 'source_value', 1.0, null, null,
             'award_amount listed on the portal', '5000', now() - interval '5 days', null)`;
        await tx`
          insert into posting_lifecycle_events (posting_id, event, at, source_id, detail)
          values
            ((select id from postings where canonical_hash = 'seed-hash-1'), 'first_seen',
             now() - interval '30 days', null, null),
            ((select id from postings where canonical_hash = 'seed-hash-1'), 'confirmed',
             now() - interval '28 days', (select id from sources where key = 'greenhouse:NorthwindRobotics'),
             '{"note":"second consecutive complete poll"}'::jsonb),
            ((select id from postings where canonical_hash = 'seed-hash-1'), 'term_flagged',
             now() - interval '9 days', null, '{"from":"summer|2026"}'::jsonb),
            ((select id from postings where canonical_hash = 'seed-hash-1'), 'term_unflagged',
             now() - interval '2 days', null, '{"to":"summer|2027"}'::jsonb),
            ((select id from postings where canonical_hash = 'seed-hash-5'), 'quarantined',
             now() - interval '1 hour', null, '{"reason":"unregistered provider"}'::jsonb)`;
        console.log("  field provenance + lifecycle events inserted: 3 + 5");

        // A user, to prove user relationships survive the migration.
        const [user] = await tx`
          insert into profiles (id, display_name, plan, major, grad_year)
          values (gen_random_uuid(), 'Test Student', 'free', 'Computer Science', 2027)
          returning id`;
        await tx`
          insert into saved_searches (user_id, name, filters, notify)
          values (${user.id}, 'SWE internships', '{"kind":"internship"}'::jsonb, true)`;
        await tx`
          insert into matches (user_id, posting_id, fit_score, timing_score, reasons)
          values (${user.id}, (select id from postings where canonical_hash = 'seed-hash-1'),
                  88, 72, '["major","grad_year"]'::jsonb)`;
        console.log("  user + saved_search + match inserted: 1 each");
      });
      console.log("\nseeded.");
    } else {
      const [counts] = await sql`
        select
          (select count(*)::int from organizations) as orgs,
          (select count(*)::int from postings) as postings,
          (select count(*)::int from posting_sources) as observations,
          (select count(*)::int from sources) as sources,
          (select count(*)::int from profiles) as users`;
      console.log(`\nstaging currently holds: ${JSON.stringify(counts)}`);
    }
  } finally {
    await sql.end();
  }
}

void main();
