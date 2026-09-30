/**
 * Backfill the INS-012 source registry from what already exists.
 *
 * Turns the facts the ingest path has been recording implicitly — an ATS slug on
 * `organizations`, a provider name on `posting_sources` — into explicit `sources`
 * rows, then resolves every observation to one. Nothing is invented: a source is
 * created only where we can name the place we read from, and a posting whose
 * provenance cannot be resolved is quarantined rather than attached to a
 * convenient-looking parent.
 *
 * Usage:
 *   npx tsx scripts/backfill-source-registry.ts              # dry run (default)
 *   npx tsx scripts/backfill-source-registry.ts --apply      # write
 *   npx tsx scripts/backfill-source-registry.ts --apply --allow-production
 *
 * Defaults to a dry run because it writes to whichever database DATABASE_URL
 * points at, and in this repo that is production unless overridden. The extra
 * flag is required to write there, so a rehearsed staging run cannot become a
 * live change by accident.
 *
 * Idempotent: sources are keyed by a stable `key`, observations are linked by
 * id, and reconstructed observations are skipped once they exist.
 *
 * Only OPEN postings get a publication state; closed history is left alone.
 */

import "dotenv/config";

import postgres from "postgres";

/** How we classify each provider already present in `posting_sources.source`. */
interface ProviderSpec {
  /** True when the provider is one company's own board (per-organization row). */
  perOrg: boolean;
  authority: "source_of_truth" | "discovery_only";
  opportunityKind: "internship" | "scholarship" | "both";
  pollTier: "A" | "B" | "C";
  rawStorage: "full" | "hash_only" | "none";
  publicPageUrl: string | null;
  note: string;
}

/**
 * The ten provider values that exist in `posting_sources.source` today, plus the
 * two adapters that write `organizations` rather than `posting_sources`.
 *
 * A value missing from this map is not an error to paper over: the backfill
 * reports it and leaves its observations unmapped, which is what surfaces a new
 * adapter that was never registered.
 */
const PROVIDERS: Record<string, ProviderSpec> = {
  greenhouse: {
    perOrg: true,
    authority: "source_of_truth",
    opportunityKind: "internship",
    pollTier: "A",
    rawStorage: "full",
    publicPageUrl: null,
    note: "Company's own Greenhouse board, polled directly.",
  },
  ashby: {
    perOrg: true,
    authority: "source_of_truth",
    opportunityKind: "internship",
    pollTier: "A",
    rawStorage: "full",
    publicPageUrl: null,
    note: "Company's own Ashby board, polled directly.",
  },
  lever: {
    perOrg: true,
    authority: "source_of_truth",
    opportunityKind: "internship",
    pollTier: "A",
    rawStorage: "full",
    publicPageUrl: null,
    note: "Company's own Lever board, polled directly.",
  },
  smartrecruiters: {
    perOrg: true,
    authority: "source_of_truth",
    opportunityKind: "internship",
    pollTier: "A",
    rawStorage: "full",
    publicPageUrl: null,
    note: "Company's own SmartRecruiters board, polled directly.",
  },
  usajobs: {
    perOrg: false,
    authority: "source_of_truth",
    opportunityKind: "internship",
    pollTier: "B",
    rawStorage: "full",
    publicPageUrl: "https://www.usajobs.gov/",
    note: "Whole-government search, not one employer's board, so it is a single source.",
  },
  scholarshipscom: {
    perOrg: false,
    authority: "source_of_truth",
    opportunityKind: "scholarship",
    pollTier: "B",
    rawStorage: "full",
    publicPageUrl: "https://www.scholarships.com/",
    note: "Multi-sponsor scholarship portal; no single employer to link to.",
  },
  unl: {
    perOrg: false,
    authority: "source_of_truth",
    opportunityKind: "scholarship",
    pollTier: "B",
    rawStorage: "full",
    publicPageUrl: "https://financialaid.unl.edu/",
    note: "University of Nebraska-Lincoln financial-aid page.",
  },
  unr: {
    perOrg: false,
    authority: "source_of_truth",
    opportunityKind: "scholarship",
    pollTier: "B",
    rawStorage: "full",
    publicPageUrl: "https://www.unr.edu/",
    note: "University of Nevada, Reno financial-aid page.",
  },
  cftexas: {
    perOrg: false,
    authority: "source_of_truth",
    opportunityKind: "scholarship",
    pollTier: "B",
    rawStorage: "full",
    publicPageUrl: "https://www.cftexas.edu/",
    note: "Community college financial-aid page.",
  },
  iup: {
    perOrg: false,
    authority: "source_of_truth",
    opportunityKind: "scholarship",
    pollTier: "B",
    rawStorage: "full",
    publicPageUrl: "https://www.iup.edu/",
    note: "Indiana University of Pennsylvania financial-aid page.",
  },
  scholarshipportal: {
    perOrg: false,
    authority: "source_of_truth",
    opportunityKind: "scholarship",
    pollTier: "B",
    rawStorage: "none",
    publicPageUrl: null,
    note: "Parse.bot ScholarshipPortal API; no raw payload retained.",
  },
  simplify: {
    perOrg: false,
    authority: "discovery_only",
    opportunityKind: "internship",
    pollTier: "B",
    rawStorage: "none",
    publicPageUrl: "https://simplify.jobs/",
    note: "Discovery only: names companies, redistributes nothing. Never publishes.",
  },
};

const BOARD_PROVIDERS = Object.keys(PROVIDERS).filter((k) => PROVIDERS[k].perOrg);
const PORTAL_PROVIDERS = Object.keys(PROVIDERS).filter((k) => !PROVIDERS[k].perOrg);
const AUTHORITATIVE = Object.keys(PROVIDERS).filter(
  (k) => PROVIDERS[k].authority === "source_of_truth",
);

/**
 * The hosts each ATS serves a company's own board from.
 *
 * Reconstructed provenance requires the posting's URL to sit on one of those hosts
 * and under that company's slug. Matching the slug anywhere in the URL would be
 * looser and wrong: it would happily call a company's marketing page an ATS
 * observation and credit an authoritative source for a row nothing observed.
 *
 * Greenhouse gets three hosts because it deploys that way: `boards.greenhouse.io`
 * for older boards, `job-boards.greenhouse.io` for current US boards, and
 * `job-boards.eu.greenhouse.io` for its EU region. A read-only production scan of
 * the open zero-observation rows found 73 on `job-boards.greenhouse.io`, 15 on
 * `boards.greenhouse.io`, and 3 on the EU host, with the organization slug
 * present in the URL for all 91.
 */
const BOARD_HOSTS: Record<string, string[]> = {
  greenhouse: [
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
    "job-boards.eu.greenhouse.io",
  ],
  lever: ["jobs.lever.co"],
  ashby: ["jobs.ashbyhq.com"],
  smartrecruiters: ["jobs.smartrecruiters.com"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `url` is a listing on the company's own board for that ATS. */
function isOwnBoardUrl(url: string, atsType: string, slug: string): boolean {
  const hosts = BOARD_HOSTS[atsType];
  if (!hosts || !slug) return false;
  return hosts.some((host) =>
    new RegExp(
      `^https?://${escapeRegExp(host)}/${escapeRegExp(slug)}(?:[/?#]|$)`,
      "i",
    ).test(url),
  );
}

/** The board's own id for a listing, which is the last path segment. */
function urlLastSegment(url: string): string | null {
  const withoutQuery = url.split(/[?#]/)[0];
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/**
 * Marks an observation the backfill inferred from a posting's URL rather than
 * from a poll we ran. Kept as a constant because three separate queries have to
 * agree on what counts as witnessed.
 */
const RECONSTRUCTED = "url-reconstructed:v1";

const STAGING_REF = "dgkjfmohtphrmispucwf";

interface Plan {
  sourcesCreated: number;
  observationsLinked: number;
  observationsReconstructed: number;
  postingsVerified: number;
  postingsCandidates: number;
  postingsUnverified: number;
  postingsQuarantined: number;
  corroborationPairs: number;
  unregistered: { source: string; n: number }[];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const allowProduction = process.argv.includes("--allow-production");
  const url = process.env.DATABASE_URL!;
  const isProduction = !new URL(url).username.includes(STAGING_REF);

  console.log(`target : ${new URL(url).hostname}`);
  console.log(`mode   : ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  if (!apply) console.log("         re-run with --apply to write");
  if (apply && isProduction && !allowProduction) {
    console.error(
      "\nRefusing to write to what looks like production without --allow-production.",
    );
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false, ssl: "require" });
  /**
   * Rebound to the transaction-scoped client while an apply runs, so every
   * statement below takes part in one transaction: a failure part-way through
   * rolls the whole back instead of leaving sources created but states unset.
   */
  let sql = client;
  const plan: Plan = {
    sourcesCreated: 0,
    observationsLinked: 0,
    observationsReconstructed: 0,
    postingsVerified: 0,
    postingsCandidates: 0,
    postingsUnverified: 0,
    postingsQuarantined: 0,
    corroborationPairs: 0,
    unregistered: [],
  };

  /**
   * The state distribution, computed the same way before and after a run.
   *
   * Resolution is derived from `organizations` rather than from `sources`, so a
   * dry run predicts the outcome even before any source exists.
   *
   * A board observation resolves when the posting's own organization is on that
   * board; a portal observation resolves when the posting has no organization
   * and the provider is a portal rather than a per-company ATS.
   *
   * The four states mirror `publication-gate.ts` exactly, which is the point: one
   * definition of "may this publish", in the gate and in the backfill.
   *   verified    - a source of truth was polled and listed it
   *   candidate   - the only authority available is discovery-only
   *   unverified  - a source of truth is involved but nothing witnessed it
   *   quarantined - no provenance resolved at all
   *
   * "Witnessed" is keyed on `adapter_version`, not `payload_hash`: the hash column
   * is new in INS-012, so every historical observation has it null and treating
   * that as unverified would demote the entire live feed.
   */
  const PLAN_SQL = `
    with resolved as (
      select ps.posting_id, ps.source, ps.adapter_version, ps.registry_source_id
      from posting_sources ps
      join postings p on p.id = ps.posting_id
      left join organizations o on o.id = p.org_id
      where (o.ats_slug is not null and o.ats_type = ps.source and ps.source = any($2::text[]))
         or (p.org_id is null and ps.source = any($3::text[]))
    ),
    per_posting as (
      select posting_id,
             bool_or(source = any($1::text[])) as has_authoritative,
             bool_or(source = any($1::text[])
                     and adapter_version is distinct from $4) as has_witnessed
      from resolved
      group by posting_id
    )
    select
      (select count(*)::int from postings where closed_at is null) as open_postings,
      (select count(*)::int from resolved) as resolved_obs,
      (select count(*)::int from resolved where registry_source_id is null) as newly_linkable,
      (select count(*)::int from per_posting) as resolvable,
      (select count(*)::int from per_posting where has_witnessed) as verified,
      (select count(*)::int from per_posting where not has_authoritative) as candidates,
      (select count(*)::int from postings p
        where p.closed_at is null
          and not exists (select 1 from per_posting r where r.posting_id = p.id)) as unresolvable_open`;
  const planArgs = [AUTHORITATIVE, BOARD_PROVIDERS, PORTAL_PROVIDERS, RECONSTRUCTED];

  const run = async () => {
    /* 1. One source per company's board. */
    const boardRows = (await sql`
      select id, ats_type, ats_slug, poll_interval_sec, last_polled_at, last_poll_ok
      from organizations
      where ats_slug is not null
      order by ats_type, ats_slug`) as {
      id: string;
      ats_type: string;
      ats_slug: string;
      poll_interval_sec: number;
      last_polled_at: Date | null;
      last_poll_ok: boolean | null;
    }[];
    const boards = boardRows.filter((b) => PROVIDERS[b.ats_type]);
    const unknownBoards = boardRows.filter((b) => !PROVIDERS[b.ats_type]);

    console.log(`\norganizations with a board: ${boardRows.length}`);
    if (unknownBoards.length) {
      // A slug we cannot classify is a source we do not understand; say so
      // rather than inventing a provider for it.
      console.log(
        `  ${unknownBoards.length} on an unregistered ATS: ${[
          ...new Set(unknownBoards.map((b) => b.ats_type)),
        ].join(", ")}`,
      );
    }

    if (apply) {
      for (const b of boards) {
        const spec = PROVIDERS[b.ats_type];
        await sql`
          insert into sources (key, provider, authority, state, org_id, opportunity_kind,
                               poll_tier, poll_interval_sec, raw_storage, terms_review_status,
                               last_complete_poll_at, adapter_config)
          values (${`${b.ats_type}:${b.ats_slug}`}, ${b.ats_type}, ${spec.authority}, 'active',
                  ${b.id}, ${spec.opportunityKind}, ${spec.pollTier}, ${b.poll_interval_sec},
                  ${spec.rawStorage}, 'not_reviewed',
                  ${b.last_poll_ok ? b.last_polled_at : null},
                  '{}'::jsonb)
          on conflict (key) do update
            set org_id = excluded.org_id,
                poll_interval_sec = excluded.poll_interval_sec,
                last_complete_poll_at = excluded.last_complete_poll_at`;
      }
    }
    plan.sourcesCreated += boards.length;

    /* 2. One source per provider that is not a per-company board. */
    const providers = (await sql`
      select ps.source, count(*)::int as n
      from posting_sources ps
      group by ps.source
      order by n desc`) as { source: string; n: number }[];

    console.log("\nproviders in posting_sources.source:");
    for (const p of providers) {
      const spec = PROVIDERS[p.source];
      if (!spec) {
        plan.unregistered.push({ source: p.source, n: p.n });
        console.log(`  ${p.source.padEnd(20)} n=${String(p.n).padEnd(6)} UNREGISTERED`);
        continue;
      }
      console.log(
        `  ${p.source.padEnd(20)} n=${String(p.n).padEnd(6)} ${
          spec.perOrg ? "per-board" : "portal  "
        } ${spec.authority}`,
      );
      if (spec.perOrg) continue;
      plan.sourcesCreated += 1;
      if (apply) {
        await sql`
          insert into sources (key, provider, authority, state, opportunity_kind, poll_tier,
                               raw_storage, public_page_url, terms_review_status, adapter_config)
          values (${p.source}, ${p.source}, ${spec.authority}, 'active', ${spec.opportunityKind},
                  ${spec.pollTier}, ${spec.rawStorage}, ${spec.publicPageUrl}, 'not_reviewed',
                  ${JSON.stringify({ note: spec.note })}::jsonb)
          on conflict (key) do update
            set public_page_url = excluded.public_page_url,
                adapter_config = excluded.adapter_config`;
      }
    }

    /* 3. Link each observation to its registry source. */
    if (apply) {
      const linked = await sql`
        update posting_sources ps
        set registry_source_id = s.id,
            authority = s.authority,
            is_authoritative_observation = (s.authority = 'source_of_truth')
        from sources s
        where ps.registry_source_id is null
          and s.provider = ps.source
          and (
            (s.org_id is not null and exists (
               select 1 from postings p
               where p.id = ps.posting_id and p.org_id = s.org_id
             ))
            or (s.org_id is null and exists (
               select 1 from postings p
               where p.id = ps.posting_id and p.org_id is null
             ))
          )
        returning ps.id`;
      plan.observationsLinked = Array.isArray(linked) ? linked.length : 0;
      console.log(`\nobservations linked: ${plan.observationsLinked}`);
    }

    /* 4. Open postings the ingest path left with no observation row at all.
     *
     *    These are live, visible listings, so quarantining them would hide real
     *    internships over a bookkeeping gap. Where the URL is on the company's own
     *    ATS board, the observation is reconstructed and labelled as such:
     *    `payload_hash` stays null and `adapter_version` records that it came from a
     *    URL rather than a poll we ran. They land as `unverified`, never
     *    `verified`, because nothing witnessed them this cycle.
     *
     *    Candidates are matched in JS rather than in SQL so the board-host rule
     *    lives next to BOARD_HOST instead of being spread across three queries. */
    const candidates = (await sql`
      select p.id, p.org_id, p.url, p.first_seen_at, p.last_seen_at,
             o.ats_type, o.ats_slug
      from postings p
      join organizations o on o.id = p.org_id
      where p.closed_at is null
        and o.ats_slug is not null
        and o.ats_type = any(${BOARD_PROVIDERS})
        and not exists (select 1 from posting_sources ps where ps.posting_id = p.id)
      order by p.id`) as {
      id: string;
      org_id: string;
      url: string;
      first_seen_at: Date;
      last_seen_at: Date;
      ats_type: string;
      ats_slug: string;
    }[];

    const onBoard = candidates.filter((c) => isOwnBoardUrl(c.url, c.ats_type, c.ats_slug));
    const offBoard = candidates.filter((c) => !isOwnBoardUrl(c.url, c.ats_type, c.ats_slug));
    plan.observationsReconstructed = onBoard.length;
    console.log(
      `\nopen postings with no observation: ${candidates.length}; ` +
        `${onBoard.length} sit on their own board, ${offBoard.length} do not`,
    );
    for (const c of offBoard.slice(0, 5)) {
      const hosts = BOARD_HOSTS[c.ats_type];
      console.log(`  not on ${hosts ? hosts.join(" or ") : c.ats_type}: ${c.url}`);
    }

    if (apply && onBoard.length > 0) {
      // Resolved here rather than by joining `sources` in the INSERT: the ids
      // were just written in step 1, so a lookup is both simpler and cheaper than
      // re-deriving them per row.
      const sourceRows = (await sql`
        select id, org_id, provider, authority
        from sources
        where org_id is not null`) as {
        id: string;
        org_id: string;
        provider: string;
        authority: string;
      }[];
      const byOrgProvider = new Map(
        sourceRows.map((s) => [`${s.org_id}:${s.provider}`, s]),
      );

      const toInsert = onBoard
        .map((c) => {
          const s = byOrgProvider.get(`${c.org_id}:${c.ats_type}`);
          if (!s) return null;
          return {
            posting_id: c.id,
            source: c.ats_type,
            source_id: urlLastSegment(c.url),
            source_url: c.url,
            first_seen_at: c.first_seen_at,
            last_seen_at: c.last_seen_at,
            registry_source_id: s.id,
            authority: s.authority,
            is_authoritative_observation: true,
            payload_hash: null,
            adapter_version: RECONSTRUCTED,
            fetched_at: null,
            raw_storage: "hash_only",
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (toInsert.length !== onBoard.length) {
        console.log(
          `  NOTE: ${onBoard.length - toInsert.length} candidate(s) had no registry` +
            " source to attach; left unmapped",
        );
        plan.observationsReconstructed = toInsert.length;
      }

      await sql`
        insert into posting_sources ${sql(
          toInsert,
          "posting_id",
          "source",
          "source_id",
          "source_url",
          "first_seen_at",
          "last_seen_at",
          "registry_source_id",
          "authority",
          "is_authoritative_observation",
          "payload_hash",
          "adapter_version",
          "fetched_at",
          "raw_storage",
        )}`;
      console.log(`observations reconstructed from URL: ${toInsert.length}`);
    }

    /* 5. Publication state, in decreasing order of evidence.
     *
     *    `verified` means an authoritative source of truth was actually polled
     *    and listed the row. */
    /** Rows this run actually changed; the resulting distribution is measured
     * separately below, because a row already in the target state changes
     * nothing and would otherwise be reported as a gap. */
    const changed = { verified: 0, candidates: 0, unverified: 0, quarantined: 0 };

    if (apply) {
      // `array_agg` rather than `min()` because there is no min(uuid); ordering by
      // last_seen_at picks the source that saw the listing most recently, and the
      // id breaks ties so repeated runs choose the same source.
      const verified = await sql`
        update postings p
        set publication_state = 'verified',
            authoritative_source_id = src.source_id,
            confirmed_at = p.last_seen_at
        from (
          select ps.posting_id,
                 (array_agg(ps.registry_source_id
                            order by ps.last_seen_at desc nulls last,
                                     ps.registry_source_id))[1] as source_id
          from posting_sources ps
          where ps.registry_source_id is not null
            and ps.is_authoritative_observation
            and ps.adapter_version is distinct from ${RECONSTRUCTED}
          group by ps.posting_id
        ) src
        where p.closed_at is null
          and p.id = src.posting_id
          and (p.publication_state is distinct from 'verified'
               or p.authoritative_source_id is distinct from src.source_id)
        returning p.id`;
      changed.verified = Array.isArray(verified) ? verified.length : 0;

      // A posting only a discovery-only source knows about is a candidate, never
      // a published row. This is the database half of the rule the gate enforces
      // in application code.
      const toCandidate = await sql`
        update postings p
        set publication_state = 'candidate'
        where p.closed_at is null
          and p.publication_state is distinct from 'candidate'
          and exists (
            select 1 from posting_sources ps
            where ps.posting_id = p.id and ps.registry_source_id is not null
          )
          and not exists (
            select 1 from posting_sources ps
            where ps.posting_id = p.id
              and ps.registry_source_id is not null
              and ps.is_authoritative_observation
          )
        returning p.id`;
      changed.candidates = Array.isArray(toCandidate) ? toCandidate.length : 0;

      const unverified = await sql`
        update postings p
        set publication_state = 'unverified'
        where p.closed_at is null
          and p.publication_state is distinct from 'unverified'
          and exists (
            select 1 from posting_sources ps
            where ps.posting_id = p.id and ps.registry_source_id is not null
          )
          and exists (
            select 1 from posting_sources ps
            where ps.posting_id = p.id
              and ps.registry_source_id is not null
              and ps.is_authoritative_observation
          )
          and not exists (
            select 1 from posting_sources ps
            where ps.posting_id = p.id
              and ps.registry_source_id is not null
              and ps.is_authoritative_observation
              and ps.adapter_version is distinct from ${RECONSTRUCTED}
          )`;
      changed.unverified = Array.isArray(unverified) ? unverified.length : 0;

      const quarantined = await sql`
        update postings p
        set publication_state = 'quarantined'
        where p.closed_at is null
          and p.publication_state is distinct from 'quarantined'
          and not exists (
            select 1 from posting_sources ps
            where ps.posting_id = p.id and ps.registry_source_id is not null
          )
        returning p.id`;
      changed.quarantined = Array.isArray(quarantined) ? quarantined.length : 0;
    }

    /* 6. Corroboration: postings two independent sources both list. */
    const [corr] = await sql`
      select count(*)::int as n from (
        select posting_id from posting_sources
        group by posting_id having count(distinct source) > 1
      ) t`;
    plan.corroborationPairs = corr.n;

    /* 7. Record corroboration where a second, non-primary source also lists a
     *    posting. Only the non-primary source is stored; the primary one is
     *    already recorded on the posting itself. */
    if (apply) {
      const corroborations = await sql`
        insert into posting_corroborations (posting_id, portal_source_id, org_id,
                                            source_ref, url, listed_at)
        select ps.posting_id, ps.registry_source_id, p.org_id,
               coalesce(nullif(ps.source_id, ''), ps.source, ''),
               ps.source_url, ps.last_seen_at
        from posting_sources ps
        join postings p on p.id = ps.posting_id
        where ps.registry_source_id is not null
          and p.closed_at is null
          and p.authoritative_source_id is distinct from ps.registry_source_id
          and exists (
            select 1 from posting_sources o
            where o.posting_id = ps.posting_id and o.registry_source_id is not null
            group by o.posting_id having count(distinct o.registry_source_id) > 1
          )
        on conflict (posting_id, portal_source_id, source_ref) do nothing
        returning id`;
      const made = Array.isArray(corroborations) ? corroborations.length : 0;
      console.log(`corroborations recorded: ${made}`);
    }

    /* 8. The resulting distribution, measured the same way in both modes.
     *
     *    In apply mode this re-reads the rows just written, so it is a check on
     *    the work rather than a restatement of the plan. A dry run has to add the
     *    rows step 4 would reconstruct, because they are not in the database yet. */
    const [final] = await sql.unsafe(PLAN_SQL, planArgs);
    const pending = apply ? 0 : plan.observationsReconstructed;
    plan.postingsVerified = final.verified;
    plan.postingsCandidates = final.candidates;
    // A reconstructed row is authoritative but unwitnessed, so it lands in
    // `unverified`; in a dry run it is not in the database yet, hence `pending`.
    plan.postingsUnverified = final.resolvable - final.verified - final.candidates + pending;
    // `unresolvable_open` counts rows that step 4 is about to fix, so they have to
    // come back out of the quarantine count.
    plan.postingsQuarantined = final.unresolvable_open - pending;
    if (!apply) {
      // In a dry run the UPDATE above never ran, so predict the same delta it
      // would have produced. `resolved` is the set that *will* be linkable once
      // the board and portal sources exist, so counting the still-unlinked ones
      // is an accurate prediction, and 0 means a later --apply is a no-op.
      plan.observationsLinked = final.newly_linkable;
    }
    console.log(
      `\nopen postings: ${final.open_postings}; provenance resolves for ${final.resolvable}` +
        ` (${final.resolved_obs} observations)`,
    );

    console.log("\nplan");
    console.log("  (changes this run would make; all zeros means --apply is a no-op)");
    // Always 6-ish: this is the number of upsert statements issued, and
    // `on conflict do update` fires every time, so it is not a change count.
    console.log(`  sources upserted           : ${plan.sourcesCreated} (idempotent, not a change)`);
    console.log(`  observations newly linked  : ${plan.observationsLinked}`);
    console.log(`  observations reconstructed : ${plan.observationsReconstructed}`);
    console.log("  resulting publication state");
    console.log(`    verified                 : ${plan.postingsVerified}`);
    console.log(`    candidates               : ${plan.postingsCandidates}`);
    console.log(`    unverified               : ${plan.postingsUnverified}`);
    console.log(`    quarantined              : ${plan.postingsQuarantined}`);
    // A total, not a change: this counts postings that two or more distinct
    // sources list, so it stays non-zero once those rows exist.
    console.log(`  corroborated by 2+ sources : ${plan.corroborationPairs} (total, not a change)`);
    if (plan.corroborationPairs === 0) {
      console.log(
        "    (none yet: every observation so far comes from a single source, so\n" +
          "     no posting is confirmed by two independent sources)",
      );
    }
    if (plan.unregistered.length) {
      console.log(
        `\n  UNREGISTERED providers, observations left unmapped:\n${plan.unregistered
          .map((u) => `    ${u.source} (${u.n})`)
          .join("\n")}`,
      );
    }
    if (apply) {
      console.log(
        `\nrows changed by this run: verified ${changed.verified}, ` +
          `candidates ${changed.candidates}, unverified ${changed.unverified}, ` +
          `quarantined ${changed.quarantined}` +
          " (all zeros on a repeat run mean it is idempotent)",
      );
      console.log("applied (one transaction; any error rolls all of it back).");
    }
  };

  try {
    if (apply) {
      await client.begin(async (tx) => {
        // A postgres.js TransactionSql is not assignable to the Sql type, even
        // though it supports everything this script calls. The cast is confined
        // to this one assignment so every query below stays type-checked.
        sql = tx as unknown as typeof sql;
        return run();
      });
    } else {
      await run();
    }
  } finally {
    await client.end();
  }
}

void main();
