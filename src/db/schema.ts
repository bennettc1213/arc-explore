/**
 * Database schema.
 *
 * Design notes that are load-bearing:
 *  - `postings` is the canonical, deduped opportunity. `posting_sources` records
 *    every place we saw it, so one role seen on both Greenhouse and Simplify
 *    collapses to a single row the user sees once.
 *  - `lastSeenAt` / `closedAt` on `postings` are the freshness engine. Because we
 *    poll each company's ATS directly, a posting present in today's response is
 *    *verifiably* live, and one that vanishes is closed. No source exposes
 *    "is this filled" — we derive it. This is the product's core claim.
 *  - `applications.outcome` is the seed of the v2 odds model. Nothing predicts
 *    win probability until this table has real data behind it.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ *
 * Company registry — the heart of Tier A polling
 * ------------------------------------------------------------------ */

/** Which public ATS feed a company is served from. */
export const ATS_TYPES = [
  "greenhouse",
  "ashby",
  "lever",
  "smartrecruiters",
  "unknown",
] as const;
export type AtsType = (typeof ATS_TYPES)[number];

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Display name, as authored by the employer. Never lowercased. */
    name: text("name").notNull(),
    /** Lowercased, punctuation-stripped — used for dedup joins only. */
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain"),
    atsType: text("ats_type").$type<AtsType>().notNull().default("unknown"),
    /** The board slug within that ATS, e.g. "stripe" or "BoschGroup". */
    atsSlug: text("ats_slug"),
    /** Alternate spellings seen in the wild, for dedup. */
    aliases: text("aliases").array().notNull().default([]),

    /** Polling state. */
    pollIntervalSec: integer("poll_interval_sec").notNull().default(1200),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    lastPollOk: boolean("last_poll_ok"),
    lastPollError: text("last_poll_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    /** Cached ETag so unchanged boards cost us nothing. */
    etag: text("etag"),

    /** How this company entered the registry (e.g. "simplify-discovery"). */
    discoveredVia: text("discovered_via"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_ats_unique").on(t.atsType, t.atsSlug),
    index("org_normalized_name_idx").on(t.normalizedName),
    // Drives the "who is due for polling" query.
    index("org_poll_due_idx").on(t.lastPolledAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Source registry (INS-012) — where a fact may legally come from
 * ------------------------------------------------------------------ */

/**
 * May this source's observation publish a verified listing on its own?
 *
 * `source_of_truth` — we read the employer's/sponsor's own feed, so the row is
 *                    the thing itself rather than a description of it.
 * `discovery_only`  — we learn the company *exists* here and must then fetch its
 *                    own ATS before anything may be shown. Simplify is the case
 *                    that matters: it names companies but carries no licence to
 *                    redistribute listings, so a hit from it can never become a
 *                    live row. See sources/simplify.ts.
 *
 * Enforced in code by `lib/ingest/publication-gate.ts` and by the database
 * default on `posting_sources.is_authoritative_observation`.
 */
export const SOURCE_AUTHORITIES = ["source_of_truth", "discovery_only"] as const;
export type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];

/**
 * Whether we are allowed to keep asking this source.
 *
 * Separate from a poll failing: `paused` is our own decision (cadence too
 * aggressive, no value), `blocked` is a decision someone recorded after a terms
 * or robots problem. The 49 dead ATS slugs belong in `paused` with a last-failure
 * reason rather than being retried forever.
 */
export const SOURCE_STATES = ["active", "paused", "blocked"] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

/** Result of reading a source's own terms/robots policy. Never assume "allowed". */
export const ACCESS_REVIEW_STATUSES = [
  "not_reviewed",
  "approved",
  "restricted",
  "denied",
] as const;
export type AccessReviewStatus = (typeof ACCESS_REVIEW_STATUSES)[number];

/** Poll tier, matching `ingest_runs.tier`: A = sub-hour ATS, B = aggregator. */
export const POLL_TIERS = ["A", "B", "C"] as const;
export type PollTier = (typeof POLL_TIERS)[number];

/**
 * One approved place we may read opportunities from.
 *
 * This is the row the whole Phase 2 "verified-data spine" hangs off. It answers,
 * for one place: what is it, whose is it, is it allowed to publish, may we keep
 * polling it, and did it last succeed. `organizations` answers "which company's
 * board" and keeps the hot poll columns; this answers "are we allowed, and why".
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Stable, human-readable identity, e.g. `greenhouse:stripe` or
     * `university-portal:mit-scholarships`. Survives renames so that provenance
     * and lifecycle history stay attached to the same source over time.
     */
    key: text("key").notNull(),
    /** Which adapter/provider serves it: "greenhouse", "lever", "university-portal", ... */
    provider: text("provider").notNull(),
    authority: text("authority").$type<SourceAuthority>().notNull().default("source_of_truth"),
    state: text("state").$type<SourceState>().notNull().default("active"),

    /** The company whose board this is. Null for portals with many sponsors
     *  (a university scholarship page, USAJOBS) and for discovery hints. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    /** Which opportunity kinds this source can yield. */
    opportunityKind: text("opportunity_kind")
      .$type<"internship" | "scholarship" | "both">()
      .notNull()
      .default("both"),
    /** The public board/page a human can see. Provenance for a claim, not a fetch target. */
    publicPageUrl: text("public_page_url"),

    pollTier: text("poll_tier").$type<PollTier>().notNull().default("B"),
    pollIntervalSec: integer("poll_interval_sec").notNull().default(1200),
    /** How much of each payload this source's terms let us keep. See posting_sources.rawStorage. */
    rawStorage: text("raw_storage").$type<"full" | "hash_only" | "none">().notNull().default("full"),

    /* --- terms/robots review: the record that we asked, and what it said --- */
    termsReviewStatus: text("terms_review_status")
      .$type<AccessReviewStatus>()
      .notNull()
      .default("not_reviewed"),
    termsReviewedAt: timestamp("terms_reviewed_at", { withTimezone: true }),
    /** Why it came out this way, in reviewer's words. Kept short and quotable. */
    termsReviewNote: text("terms_review_note"),
    robotsReviewStatus: text("robots_review_status")
      .$type<AccessReviewStatus>()
      .notNull()
      .default("not_reviewed"),
    robotsReviewedAt: timestamp("robots_reviewed_at", { withTimezone: true }),

    /** How a human/operator identifies us to this source. An identity, not a
     *  secret: never an API key, never a session token. */
    crawlerContact: text("crawler_contact"),

    /** Last poll that completed *completely* — not merely returned rows. Absence
     *  is only allowed to close a listing when this is recent (INS-013). */
    lastCompletePollAt: timestamp("last_complete_poll_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    /** Short, quotable reason: "HTTP 404", "timeout", "403 block". */
    lastFailureSummary: text("last_failure_summary"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),

    /**
     * Adapter settings that are not secrets: cursor, page size, field mappings.
     *
     * Credentials never go here. The inspection command redacts anything that
     * looks like a key regardless, so a future mistake cannot leak one.
     */
    adapterConfig: jsonb("adapter_config").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("source_key_unique").on(t.key),
    // "What is due to poll, and is it allowed to?" — the scheduler's hot query.
    index("source_state_tier_idx").on(t.state, t.pollTier, t.lastCompletePollAt),
    index("source_org_idx").on(t.orgId),
    index("source_authority_idx").on(t.authority),
    // The INS-012 acceptance query: which live rows have no source of truth yet.
    index("source_state_authority_idx").on(t.state, t.authority),
  ],
);

/* ------------------------------------------------------------------ *
 * Postings — canonical, deduped
 * ------------------------------------------------------------------ */

/** What kind of opportunity a row is. One shared table, per the roadmap's own
 *  design intent — a combined browse/search feed needs one list to query, not
 *  a union of two. */
export const POSTING_KINDS = ["internship", "scholarship"] as const;
export type PostingKind = (typeof POSTING_KINDS)[number];

/**
 * How confident the freshness claim on a row is allowed to be, driven by how
 * often we actually reverify it — not by kind. An Adzuna-sourced internship
 * and a scraped scholarship are the same case: neither can carry "confirmed
 * live Xh ago", because neither is polled the way Tier A polls an ATS.
 *  - live_polled: Tier A, sub-hour ATS polling. "Confirmed live Xh ago" is true.
 *  - periodic_check: reverified on a slower loop (daily/weekly scrape,
 *    aggregator pull). Renders as "checked as of <date>".
 *  - unverified_static: imported once, no recheck loop yet.
 */
export const FRESHNESS_TIERS = ["live_polled", "periodic_check", "unverified_static"] as const;
export type FreshnessTier = (typeof FRESHNESS_TIERS)[number];

export const postings = pgTable(
  "postings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for scholarships scraped from a page that lists many sponsors —
     *  there is no single employer to poll, so there is nothing to link to
     *  the ATS-oriented `organizations` registry. Use `sponsorName` instead. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").$type<PostingKind>().notNull().default("internship"),
    freshnessTier: text("freshness_tier")
      .$type<FreshnessTier>()
      .notNull()
      .default("live_polled"),

    /** Stable dedup key: normalized company/sponsor + title + location + term. */
    canonicalHash: text("canonical_hash").notNull(),

    /** Employer-authored strings. Rendered as-is, never lowercased. */
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    /** Canonical apply URL, tracking params stripped. */
    url: text("url").notNull(),
    /** Awarding org as named on the source page, for rows with no `orgId` —
     *  a scraped scholarship page lists many sponsors, not one employer. */
    sponsorName: text("sponsor_name"),

    locations: text("locations").array().notNull().default([]),
    isRemote: boolean("is_remote").notNull().default(false),
    /** e.g. "Summer 2027" for internships, an academic year for scholarships. */
    term: text("term"),
    /** Whether the term was stated in the source, inferred from first_seen, or is unknown. */
    termSource: text("term_source")
      .notNull()
      .default("unknown")
      .$type<"explicit" | "inferred" | "unknown">(),
    /** Normalised season when known: summer, fall, spring, winter, or co-op. */
    termSeason: text("term_season").$type<
      "summer" | "fall" | "spring" | "winter" | "co-op"
    >(),
    /** Four-digit year derived from the term. */
    termYear: integer("term_year"),
    /** Raw source text that justified an explicit term, preserved for audit. */
    termRaw: text("term_raw"),
    /** Set when an open row carries a term that has already ended. The row is
     * excluded from normal results until the source lifecycle closes or
     * corrects it. */
    termEndedFlagAt: timestamp("term_ended_flag_at", { withTimezone: true }),

    /** Scholarship dollar value. Both null means "amount varies" or unstated —
     *  never guessed. Equal min/max means an exact, stated amount. */
    amountMin: integer("amount_min"),
    amountMax: integer("amount_max"),
    /** The source stated a dollar figure the parser could not read, as
     *  opposed to stating none. Both leave the bounds null, but only this is
     *  a defect — without the distinction every parser regression looks
     *  exactly like an honest blank. Surfaced by `npm run ingest:status`. */
    amountNeedsReview: boolean("amount_needs_review").notNull().default(false),
    /** Normalized award shape: exact | range | varies | unparseable. */
    amountStatus: text("amount_status")
      .$type<"exact" | "range" | "varies" | "unparseable">()
      .notNull()
      .default("varies"),
    /** Known program-wide total, never confused with a single award. */
    programTotal: integer("program_total"),
    /** Number of awards the source states, when known. */
    awardsCount: integer("awards_count"),
    /** True when the per-award amount was computed from program_total / awards_count. */
    amountIsEstimated: boolean("amount_is_estimated").notNull().default(false),
    /** Small-award law-firm scholarships run for inbound links rather than
     *  by an institution. A tag, never a filter: the row stays in the feed
     *  and the scholarship Fit Score (Phase 02) decides what to do with it.
     *  Stamped at ingest so the signal is already on every row when that
     *  score is built. See `lib/scholarships/classify.ts`. */
    isContentMarketing: boolean("is_content_marketing").notNull().default(false),
    /**
     * V1 trust score (0–100) for scholarships. 50 is neutral; higher means
     * more trustworthy signals, lower means more caution signals. Internships
     * carry the neutral default. Never presented as certainty — every score
     * travels with `trust_reasons` explaining what moved it.
     */
    trustScore: integer("trust_score").notNull().default(50),
    /**
     * Stored reasons for the trust score. Each reason names the signal, its
     * direction ("positive" or "caution"), and a one-line human explanation.
     * Keeping them in the row means every visible warning has a stored reason.
     */
    trustReasons: jsonb("trust_reasons").notNull().default([]),
    /**
     * True for sweepstakes/lottery-style awards: random drawing, no essay,
     * enter-to-win language, etc. These are excluded from the Competition
     * dimension and surfaced on a separate shelf.
     */
    isLottery: boolean("is_lottery").notNull().default(false),
    /**
     * Why a row was flagged as lottery-style. Stored for the same reason
     * `trust_reasons` are: every visible warning must have a stored reason.
     */
    lotteryReasons: jsonb("lottery_reasons").notNull().default([]),
    /**
     * How many independent source portals list this canonical award. Used as
     * a positive trust signal (corroboration). Updated during scholarship
     * ingest and backfilled from `posting_sources`.
     */
    corroborationCount: integer("corroboration_count").notNull().default(0),
    /** Structured where we can confidently extract it (majors, minGpa,
     *  gradLevels, citizenship, states); absent fields are omitted, never
     *  invented, same rule as the resume parser. Kept as jsonb rather than
     *  fixed columns because we have not yet seen enough real scraped
     *  listings to know the right shape — see resumes.parsed for the same
     *  unknown-at-the-boundary pattern. */
    eligibility: jsonb("eligibility"),

    /** Derived from JD text — the source `sponsorship` field is 98% "Other". */
    workAuth: text("work_auth"),
    descriptionText: text("description_text"),
    /**
     * Canonical skill names named by the title or description.
     *
     * Derived once at ingest rather than at render. Extraction depends only on
     * the posting, never on who is looking, and the feed scores up to 500
     * postings per request — re-running ~70 patterns over multi-kilobyte
     * descriptions for every visitor would be the same answer computed
     * thousands of times a minute. Also lets the competitiveness summary
     * aggregate in SQL instead of scanning every description.
     */
    skills: text("skills").array().notNull().default([]),

    /**
     * Legacy leftover, declared here only so the schema matches the database.
     *
     * Nothing in the app reads or writes it — `degrees` was replaced by the
     * structured `eligibility` jsonb long ago. It still exists in every
     * environment because the drizzle snapshot chain stopped tracking columns
     * after 0020, so a generated migration would have tried to drop it blind.
     * Declaring it keeps `drizzle-kit generate` honest; removing it is a
     * separate, deliberate decision (see the INS-012 ledger entry).
     */
    degrees: text("degrees").array(),

    /* --- freshness engine --- */
    /** First moment we ever observed this posting. Drives the timing score. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Last poll in which the source still listed it. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when it disappears from its ATS feed — our "filled/closed" signal. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /**
     * Consecutive times this posting was absent from its source feed.
     *
     * Mirrors `urlDeadStrikes` from the apply-URL health checker: a single
     * missing scrape is not enough to close a live scholarship. The first
     * absence increments this to 1; only the second consecutive absence
     * sets `closedAt`. Any scrape that lists the posting again resets it
     * to 0, so a transient scrape that lost a row never hides a live award.
     * Stamped in UTC, not session-local time, so the dry-run timestamp
     * rule (see HANDOFF §6) holds in CI.
     */
    missingStrikes: integer("missing_strikes").notNull().default(0),
    /**
     * First scrape in the current run of consecutive absences, cleared on
     * recovery. Stamped once, on the absence that crosses the threshold,
     * and never moved afterwards — the same rule `urlDeadSince` follows.
     */
    missingSince: timestamp("missing_since", { withTimezone: true }),

    /* --- INS-012: source-of-truth confirmation and publication state --- */
    /**
     * Last time an *authoritative* source listed this posting.
     *
     * Deliberately separate from `lastSeenAt`. `lastSeenAt` moves for any
     * observation, including a discovery-only aggregator that merely mentions
     * the company — a Simplify hit must never be able to manufacture the
     * "confirmed live 5h ago" claim that `lastSeenAt` alone would suggest.
     * Only a source whose own board we poll writes this column.
     */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** When this posting last came back after being closed. Null if never. */
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    /** How many times it has been closed and then seen again. */
    reopenCount: integer("reopen_count").notNull().default(0),
    /**
     * Which registry source published this row, when known.
     *
     * Null means we never established the source of truth — for pre-INS-012 rows
     * that is an honest unknown, not a claim. Paired with
     * `posting_sources.sourceId` once the registry backfill has run.
     */
    authoritativeSourceId: uuid("authoritative_source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    /**
     * Whether this row may be shown as a verified opportunity.
     *
     * `verified`   — an authoritative source of truth published it.
     * `unverified` — published before provenance existed; provenance unknown.
     * `candidate`  — only discovery references exist; not a verified listing.
     * `quarantined`— a person or a rule set it aside pending repair.
     *
     * Defaults to `unverified`, not `verified`. A migration that stamped every
     * one of the ~6,600 existing rows as verified would be fabricating the one
     * thing this whole phase exists to prove. Nothing reads this column yet, so
     * the default changes no live behavior; the backfill that promotes rows to
     * `verified` does the proving row by row.
     */
    publicationState: text("publication_state")
      .$type<"verified" | "unverified" | "candidate" | "quarantined">()
      .notNull()
      .default("unverified"),
    /** Employer-stated posting date, when a source provides one. May be null —
     *  we never invent one, per the honest-slots rule. */
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** Employer-stated application deadline. Greenhouse publishes this; the
     *  others do not. Drives the "closes soon" timing boost, and is almost
     *  always null — rendered as an honest slot rather than a guess. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),

    /* --- apply-URL health --- */
    /**
     * Last time we actually requested the apply URL, and what it answered.
     *
     * Separate from the freshness engine above and deliberately weaker than it.
     * `closedAt` means the posting vanished from its employer's own ATS feed,
     * which is the employer telling us it is gone. A 404 from the apply URL is
     * one HTTP response, and responses lie: WAFs return 403, rate limiters
     * return 429, and a redirect to a generic careers page is a 200 that means
     * nothing. So these columns **flag**, and never close anything.
     */
    urlCheckedAt: timestamp("url_checked_at", { withTimezone: true }),
    urlStatus: integer("url_status"),
    /**
     * First of the current run of hard-dead observations, cleared on recovery.
     *
     * Two consecutive checks are required before this is set — the same rule
     * the UNL crawl needs and does not yet have. One 404 is not evidence.
     */
    urlDeadSince: timestamp("url_dead_since", { withTimezone: true }),
    /** Consecutive hard-dead observations. Reset to 0 by any non-dead answer. */
    urlDeadStrikes: integer("url_dead_strikes").notNull().default(0),
    /**
     * Consecutive observations that this page's headers permit us to frame it.
     *
     * Read off the response the link checker was already fetching, so it costs
     * no extra request. Two are required before we embed and a single refusal
     * withdraws it — see `lib/apply/frame-headers.ts` for why that asymmetry.
     *
     * Replaces a four-host allowlist that could never have covered the ~300
     * distinct scholarship hosts, one row per host, or any source added later.
     * It says nothing about whether a captcha works inside a frame, which is a
     * separate and unheadered question — `EMBED_WITHHELD_HOSTS` still outranks
     * this.
     */
    frameAllowStrikes: integer("frame_allow_strikes").notNull().default(0),
    /** When framing headers were last read. Null means never looked. */
    frameCheckedAt: timestamp("frame_checked_at", { withTimezone: true }),

    /* --- human curation --- */
    /**
     * Suppressed from the feed by a person.
     *
     * Deliberately not a "not yet approved" gate. Every row here is polled from
     * an employer's own board and the product's claim is "confirmed live 5h
     * ago" — a row sitting in a queue waiting for a human cannot make that
     * claim, and gating 3,765 existing rows behind review would empty the feed
     * to zero. So the default is visible, and this is the override: a person
     * looked at a specific row and took it down.
     */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    /** Why, in the reviewer's words. Shown in the admin queue, never publicly. */
    hiddenReason: text("hidden_reason"),
    /**
     * A person looked at this and left it up.
     *
     * What takes a row *out* of the triage queue without hiding it. Without it
     * every flagged row would reappear forever and the queue would stop being
     * a queue.
     */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posting_canonical_unique").on(t.canonicalHash),
    index("posting_org_idx").on(t.orgId),
    index("posting_open_idx").on(t.closedAt, t.firstSeenAt),
    // INS-012: "which live rows still have no verified source of truth", and the
    // sweep the provenance backfill will run.
    index("posting_publication_state_idx").on(t.publicationState, t.closedAt),
    // Drives "check the least recently checked first". Nulls sort first, which
    // is what we want: a posting never checked is the highest priority.
    index("posting_url_check_idx").on(t.urlCheckedAt),
    index("posting_term_idx").on(t.term),
    // Every existing query (the internship feed, competitiveness) implicitly
    // assumed one kind. This is what lets a scholarship feed query scope
    // itself out of the way without a table scan.
    index("posting_kind_idx").on(t.kind),
  ],
);

/** Every place we observed a given posting. Many-to-one with `postings`. */
export const postingSources = pgTable(
  "posting_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    /** "greenhouse" | "ashby" | "lever" | "smartrecruiters" | "simplify" | ... */
    source: text("source").notNull(),
    /** The source's own id for this row, used for incremental reconcile. */
    sourceId: text("source_id"),
    sourceUrl: text("source_url"),
    /** Raw payload, kept for debugging parser drift.
     *  NOTE: Tier B (Simplify) is discovery-only and stores no listing payload —
     *  that repo carries no license, so we take company names (facts) and pull
     *  listings from each company's own ATS instead. */
    raw: jsonb("raw"),

    /* --- INS-012: registry link and reproducible provenance --- */
    /**
     * The registry row for the place this observation came from.
     *
     * Named `registry_source_id`, not `source_id`: this table already has a
     * `source_id` column meaning something entirely different — the *source's own*
     * id for the row, used for incremental reconcile. Reusing that name would
     * have made the two indistinguishable in a query and silently shadowed the
     * text column in this object literal.
     *
     * Null until the INS-012 backfill runs, because 3,700+ existing rows have no
     * registry entry to point at yet. The backfill resolves it from
     * (`source`, organization, ats slug) and then quarantines whatever it cannot
     * resolve rather than guessing a parent source.
     */
    registrySourceId: uuid("registry_source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    /**
     * Whether this source may publish a verified listing on its own, or is
     * discovery-only.
     *
     * Denormalized from `sources.authority` so the publication gate is a single
     * indexed read on the hot path instead of a join per posting. If the two
     * ever disagree, the registry is authoritative and a test asserts it.
     */
    authority: text("authority")
      .$type<"source_of_truth" | "discovery_only">()
      .notNull()
      .default("source_of_truth"),
    /** True only when this source's own feed listed the row, not a mention. */
    isAuthoritativeObservation: boolean("is_authoritative_observation")
      .notNull()
      .default(false),
    /**
     * SHA-256 of the raw payload we normalized.
     *
     * Lets us prove *which* bytes produced a stored value without keeping every
     * payload forever, and detects silent parser drift when a re-fetch returns
     * a different hash for an unchanged `sourceId`.
     */
    payloadHash: text("payload_hash"),
    /** Parser/adapter version that produced the stored fields. */
    adapterVersion: text("adapter_version"),
    /** When this payload was fetched, as distinct from when the row was seen. */
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    /**
     * How much of the payload we keep, per that source's terms/licence.
     * - full      — raw JSON retained (sources whose terms allow it).
     * - hash_only — payload discarded, hash kept for drift detection.
     * - none      — nothing stored; discovery facts only (see sources/simplify.ts,
     *               where the upstream repo carries no licence).
     *
     * The policy lives on the source row so a licence change is one update, not
     * a sweep through every payload we ever stored.
     */
    rawStorage: text("raw_storage")
      .$type<"full" | "hash_only" | "none">()
      .notNull()
      .default("full"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posting_source_unique").on(t.source, t.sourceId),
    index("posting_source_posting_idx").on(t.postingId),
    // INS-012: walk every observation of a source, and resolve an unmapped row
    // to its registry entry during the provenance backfill.
    index("posting_source_registry_idx").on(t.registrySourceId),
  ],
);

/* ------------------------------------------------------------------ *
 * Provenance, discovery candidates, and lifecycle history (INS-012)
 * ------------------------------------------------------------------ */

/** Where a discovery hint came from. Never a publishing source. */
export const DISCOVERY_ORIGINS = ["simplify", "adzuna", "community", "manual"] as const;
export type DiscoveryOrigin = (typeof DISCOVERY_ORIGINS)[number];

/**
 * "This company probably has a board we should read" — and nothing more.
 *
 * A candidate is deliberately *not* a listing. It carries no title, no
 * description, no term, nothing a student could be shown, because we have not
 * read the employer's own feed yet. It becomes a `postings` row only when the
 * resolved ATS poll succeeds (`resolvedPostingId`). This table is what makes
 * "a discovery hit must not become a live verified listing" checkable rather
 * than a convention.
 */
export const discoveryCandidates = pgTable(
  "discovery_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Which discovery source produced the hint. */
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    origin: text("origin").$type<DiscoveryOrigin>().notNull(),
    /**
     * Stable dedup key for the hint, e.g. `domain:stripe.com` or
     * `ats:greenhouse/stripe`. Mirrors `postings.canonicalHash`: mutable display
     * text is never the identity.
     */
    candidateKey: text("candidate_key").notNull(),

    organizationName: text("organization_name").notNull(),
    organizationDomain: text("organization_domain"),
    /** ATS the hint claims the company is on, if it claims one. */
    atsType: text("ats_type"),
    atsSlug: text("ats_slug"),

    status: text("status")
      .$type<"pending" | "resolved" | "rejected">()
      .notNull()
      .default("pending"),
    /** Set when the company's own ATS succeeded and produced a real listing. */
    resolvedPostingId: uuid("resolved_posting_id").references(() => postings.id, {
      onDelete: "set null",
    }),
    resolvedOrgId: uuid("resolved_org_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    /** Why it was rejected (company has no board, domain is a redirect, ...). */
    note: text("note"),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("discovery_candidate_unique").on(t.sourceId, t.candidateKey),
    // The work queue: what still needs a board lookup.
    index("discovery_candidate_status_idx").on(t.status, t.lastSeenAt),
  ],
);

/** The fields whose value we must be able to justify. */
export const PROVENANCE_FIELDS = [
  "term",
  "eligibility",
  "amount",
  "effort",
  "award_count",
  "sponsor_type",
] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];

/**
 * How a stored value was arrived at.
 *
 * `source_value`       — the source stated it; we copied it.
 * `deterministic_rule` — a parser rule fired; `ruleId`/`ruleVersion` name it.
 * `llm`                — a model decided it; `confidence` says how sure it was.
 * `human`              — a person set it.
 *
 * Deterministic fields record a rule rather than a confidence number on
 * purpose: "0.97 confident" is a guess about a guess, while "term-v3 rule 12"
 * is a fact you can re-run and get the same answer.
 */
export const EXTRACTION_METHODS = [
  "source_value",
  "deterministic_rule",
  "llm",
  "human",
] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

/**
 * Why this field holds the value it holds — the record that lets us reproduce a
 * normalization or enrichment decision later.
 *
 * Append-only: a re-parse writes a new row and stamps the old one
 * `supersededAt` instead of overwriting it, so "why did it say Summer 2026 in
 * March" has an answer. The partial unique index keeps exactly one current row
 * per field, which is what the feed reads.
 */
export const postingFieldProvenance = pgTable(
  "posting_field_provenance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    /** Which source's data justified the value. Null when derived locally. */
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    field: text("field").$type<ProvenanceField>().notNull(),
    method: text("method").$type<ExtractionMethod>().notNull(),

    /** 0..1, required for `llm`, null for rules and copied source values. */
    confidence: real("confidence"),
    ruleId: text("rule_id"),
    ruleVersion: text("rule_version"),
    /** The snippet that decided it — short, and never a full private payload. */
    evidence: text("evidence"),
    /** The value produced, as text, so history reads without joining `postings`. */
    valueText: text("value_text"),

    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when a later decision replaced this one. Null = current. */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (t) => [
    // Exactly one current row per (posting, field); history keeps the rest.
    uniqueIndex("posting_field_provenance_current")
      .on(t.postingId, t.field)
      .where(sql`${t.supersededAt} is null`),
    index("posting_field_provenance_posting_idx").on(t.postingId),
    index("posting_field_provenance_field_idx").on(t.field),
  ],
);

/**
 * The lifecycle transitions we can prove happened, in order.
 *
 * `postings` holds the *current* state; this holds what happened. The two are
 * kept apart on purpose — `lastSeenAt` answers "when did we last see it" and
 * `confirmedAt` answers "when did its own source last vouch for it", and
 * collapsing them into one column is how a product ends up claiming a 2023
 * posting was confirmed this morning.
 */
export const LIFECYCLE_EVENTS = [
  "first_seen",
  "confirmed",
  "last_seen",
  "missing_1",
  "closed",
  "reopened",
  "quarantined",
  "unquarantined",
  "rejected",
  "term_flagged",
  "term_unflagged",
] as const;
export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number];

export const postingLifecycleEvents = pgTable(
  "posting_lifecycle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    event: text("event").$type<LifecycleEvent>().notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** Which ingest run made the change, when it came from one. */
    runId: uuid("run_id").references(() => ingestRuns.id, { onDelete: "set null" }),
    /** The source whose observation caused it. */
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    /** Small structured context: strike counts, prior values, reason codes. */
    detail: jsonb("detail"),
  },
  (t) => [
    index("posting_lifecycle_posting_at_idx").on(t.postingId, t.at),
    index("posting_lifecycle_event_at_idx").on(t.event, t.at),
  ],
);

/**
 * Independent portals that also list this scholarship.
 *
 * The corroboration signal behind "two universities' financial-aid pages list
 * this same award, and neither copied the other". Kept separate from
 * `posting_sources` because a corroborating page is evidence about a listing's
 * reality, not a place we fetched the listing from.
 */
export const postingCorroborations = pgTable(
  "posting_corroborations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    /** The portal that also lists it. */
    portalSourceId: uuid("portal_source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** The university/operator behind that portal, when it is one organisation. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    /** That portal's own id for the listing, when it exposes one. */
    sourceRef: text("source_ref").notNull().default(""),
    url: text("url"),
    listedAt: timestamp("listed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posting_corroboration_unique").on(t.postingId, t.portalSourceId, t.sourceRef),
    index("posting_corroboration_portal_idx").on(t.portalSourceId),
    // "Which scholarships do multiple independent portals agree on?"
    index("posting_corroboration_posting_idx").on(t.postingId),
  ],
);

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

/**
 * Subscription tier. See `src/lib/pricing/tiers.ts` for what each one
 * unlocks — this file only needs to know the three names exist.
 */
export const PLAN_IDS = ["free", "apply"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Mirrors auth.users.id from Supabase. RLS scopes every row below to it. */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name"),
  school: text("school"),
  major: text("major"),
  gradYear: integer("grad_year"),
  gpa: real("gpa"),
  /** "us_citizen" | "permanent_resident" | "needs_sponsorship" | ... */
  workAuth: text("work_auth"),
  targetVerticals: text("target_verticals").array().notNull().default([]),
  targetLocations: text("target_locations").array().notNull().default([]),
  /** Defaults true: a remote role is rarely a downgrade, and assuming "no"
   *  would silently bury inventory the user never said they didn't want. */
  openToRemote: boolean("open_to_remote").notNull().default(true),
  portfolioUrl: text("portfolio_url"),
  /**
   * The GitHub handle, not a URL — it is what every API path needs, and storing
   * the URL would mean re-parsing it on every audit.
   *
   * Separate from `portfolio_url` on purpose: the resume parser deliberately
   * picks a *non-platform* link for that field, so a GitHub URL would never
   * land there and overwriting it with one would lose the personal site.
   */
  githubUsername: text("github_username"),
  /** Stored so a student can get back to it. Never fetched — see CLAUDE.md. */
  linkedinUrl: text("linkedin_url"),
  /** Deadline reminder emails. On by default — a student who saved something
   *  with a deadline asked to be reminded of it in every sense but the
   *  literal one — and switched off by the unsubscribe link on every send. */
  deadlineRemindersEnabled: boolean("deadline_reminders_enabled").notNull().default(true),
  /**
   * The weekly digest of new matches.
   *
   * On by default for the same reason reminders are: a filled-in profile is a
   * standing statement of what someone is looking for, and the digest is the
   * only thing here that answers it without being asked. It is gated on the
   * profile actually saying something (`isProfileUsable`) — an empty profile
   * produces nothing worth mailing, so the default costs a silent user nothing.
   */
  weeklyDigestEnabled: boolean("weekly_digest_enabled").notNull().default(true),
  /**
   * Watermark for the digest, exactly as `saved_searches.last_notified_at`
   * works: new means "first seen since we last wrote to you".
   *
   * Defaults to now so a profile created today never receives a first digest
   * containing the entire corpus, and moves **only after a send succeeds**.
   */
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Bearer token for the unsubscribe link.
   *
   * Random per profile rather than the user id, and separate from any session:
   * someone who wants our email to stop must be able to stop it from the email
   * itself, without logging in. A guessable value would let anyone unsubscribe
   * anyone, so this is generated by the database and never derived from
   * anything else the user exposes.
   */
  unsubscribeToken: uuid("unsubscribe_token").notNull().defaultRandom(),
  /**
   * The seam a billing provider writes to.
   *
   * Defaults "free" — fail-closed, the same call `ADMIN_EMAILS` makes: an
   * unset or unrecognised value must resolve to the least capable tier, never
   * the most. Nothing in this codebase sets this to anything but "free" yet.
   * No Stripe object, webhook or checkout flow exists — see FIXES.md. Whoever
   * wires billing later flips this column on a successful charge and drops it
   * back to "free" on cancellation/non-renewal; everything downstream of
   * `getUserTier` already reads live from here.
   */
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  /** Stamped whenever `plan` changes, so a support conversation can ask "since
   *  when" without a billing provider's own dashboard. Null until it moves
   *  once — a profile created on "free" was never actually "changed" to it. */
  planUpdatedAt: timestamp("plan_updated_at", { withTimezone: true }),
  /**
   * The first moment the profile was complete (major, graduation year, state,
   * work authorization) and the user saved at least one posting. Set once and
   * never moved; it is the durable activation fact behind the `profile_activated`
   * event.
   */
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    fileName: text("file_name"),
    rawText: text("raw_text"),
    /** LLM-parsed structure. The cold-email generator may ONLY assert facts
     *  present here or in `profiles` — see lib/email/prompt.ts. */
    parsed: jsonb("parsed"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resume_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ *
 * Cover letters — the Phase 03 submission material, grounded in the
 * same resume + profile + match data as the Fit Score.
 * ------------------------------------------------------------------ */

export const coverLetters = pgTable(
  "cover_letters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    /** Ordered, editable paragraphs — one regenerable unit each. Shape is
     *  validated on read by `lib/cover-letter/types.ts` (jsonb, so an older
     *  draft degrades field-by-field instead of breaking the page). */
    paragraphs: jsonb("paragraphs")
      .$type<Array<{ id: string; role: string; text: string }>>()
      .notNull(),
    /** `[YOUR SPECIFIC DETAIL: …]` slots the generator emitted because it had
     *  no real fact to assert. Derived from paragraph text, surfaced as honest
     *  gaps — the same rule as `outreach_drafts.unfilled_slots`. */
    unfilledSlots: text("unfilled_slots").array().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cover_letter_user_posting_unique").on(t.userId, t.postingId),
    index("cover_letter_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

export const matches = pgTable(
  "matches",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    /** Deterministic rules only — 0..100. */
    fitScore: real("fit_score").notNull(),
    /** Recency/competition heuristics — 0..100. */
    timingScore: real("timing_score").notNull(),
    /** Human-readable justification for every point awarded. A score with no
     *  reasons is a bug: we never show a number we cannot explain. */
    reasons: jsonb("reasons").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postingId] }),
    index("match_rank_idx").on(t.userId, t.fitScore),
  ],
);

/* ------------------------------------------------------------------ *
 * Application tracker — and the v2 training data
 * ------------------------------------------------------------------ */

export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    status: text("status").$type<ApplicationStatus>().notNull().default("saved"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    /**
     * When the student first tracked this.
     *
     * Added late, for the Phase 07 metrics: the table only ever carried
     * `updatedAt`, so "how many applications were tracked in the last week" was
     * unanswerable — a row saved in March and re-read in August looks identical
     * to one saved this morning. Existing rows are backfilled from `updatedAt`,
     * which is exactly right for a row nobody has touched since saving it and
     * the best available estimate for one they have.
     */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Free-text final outcome. Together with `status` this is what a real
     *  odds model will eventually train on. */
    outcome: text("outcome"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("application_user_posting_unique").on(t.userId, t.postingId),
    index("application_user_idx").on(t.userId, t.status),
  ],
);

/**
 * One deadline reminder we have actually sent.
 *
 * Exists to make sending idempotent. The job runs daily and recomputes what is
 * due from scratch, so without a record of what went out it would mail the
 * same student about the same scholarship every morning until the deadline —
 * the fastest way to make someone mark us as spam.
 *
 * `deadlineAt` is part of the unique key, not just cargo. If a sponsor moves a
 * deadline, that is a genuinely new fact worth a fresh reminder, and keying on
 * (user, posting, window) alone would suppress it forever.
 */
export const deadlineReminders = pgTable(
  "deadline_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    /** Which window fired — 14, 7 or 1 days out. See lib/reminders/select.ts. */
    daysBefore: integer("days_before").notNull(),
    /** The deadline as it stood when we sent. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reminder_unique").on(t.userId, t.postingId, t.daysBefore, t.deadlineAt),
    index("reminder_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ *
 * Outreach
 * ------------------------------------------------------------------ */

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    /** Person's name as they write it. Never lowercased — doing so in an email
     *  costs the user credibility. */
    name: text("name").notNull(),
    title: text("title"),
    /** Pattern-inferred (first.last@domain) unless the user supplied it. */
    email: text("email"),
    /** Always false today: no verification API is in budget, so the UI must
     *  label these as unverified rather than implying confidence. */
    emailVerified: boolean("email_verified").notNull().default(false),
    /** How we got the address — "user_provided" | "pattern_inferred". */
    emailSource: text("email_source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contact_user_idx").on(t.userId)],
);

export const outreachDrafts = pgTable(
  "outreach_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    postingId: uuid("posting_id").references(() => postings.id, { onDelete: "set null" }),
    subjectVariants: text("subject_variants").array().notNull().default([]),
    body: text("body").notNull(),
    /** Two follow-ups (day 4, day 10), each adding new information. */
    followUps: jsonb("follow_ups"),
    /** Placeholders the generator emitted because it lacked a real fact.
     *  Non-empty means the draft is deliberately unfinished — the UI surfaces
     *  these as honest slots rather than letting the model invent details. */
    unfilledSlots: text("unfilled_slots").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outreach_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ *
 * Business vertical: recruiting cycles
 * ------------------------------------------------------------------ */

/**
 * IB and consulting recruit on fixed application windows rather than rolling
 * postings, so "what opens when" matters more there than real-time freshness.
 * Curated, not scraped.
 */
export const recruitingCycles = pgTable(
  "recruiting_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    firmName: text("firm_name").notNull(),
    vertical: text("vertical").notNull(),
    programName: text("program_name"),
    termYear: integer("term_year"),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    sourceUrl: text("source_url"),
    notes: text("notes"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [index("cycle_opens_idx").on(t.opensAt)],
);

/* ------------------------------------------------------------------ *
 * Ingestion observability — a silent failure means stale data, which is
 * precisely the problem this product exists to solve.
 * ------------------------------------------------------------------ */

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tier: text("tier").notNull(),
    source: text("source"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    orgsPolled: integer("orgs_polled").notNull().default(0),
    postingsSeen: integer("postings_seen").notNull().default(0),
    postingsNew: integer("postings_new").notNull().default(0),
    postingsClosed: integer("postings_closed").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    detail: jsonb("detail"),
  },
  (t) => [index("ingest_run_started_idx").on(t.startedAt)],
);

/* ------------------------------------------------------------------ *
 * Listing reports — the one signal that comes from a person
 * ------------------------------------------------------------------ */

/**
 * Why a student is reporting a listing.
 *
 * Ordered by how much a human is needed. The first two are things the link
 * checker and the ATS poll can eventually catch on their own; the last three
 * are things no automated check will ever see, and they are the reason this
 * feature exists at all. `asks_for_payment` in particular is the scholarship
 * scam signature — a legitimate award never charges an application fee — and
 * it is the one report worth acting on immediately.
 */
export const REPORT_REASONS = [
  "dead_link",
  "already_closed",
  "wrong_details",
  "asks_for_payment",
  "not_real",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const listingReports = pgTable(
  "listing_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    /**
     * Set null rather than cascaded when the reporter deletes their account.
     *
     * The report is a fact about the *listing*, and it stays useful after the
     * person who filed it is gone. Cascading would let a listing quietly
     * un-report itself, which is the wrong direction for a trust signal.
     */
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    reason: text("reason").$type<ReportReason>().notNull(),
    /** Optional free text. Capped in the schema layer, not here. */
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when a reviewer has dealt with it, either way. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** What the reviewer decided, in their words. */
    resolution: text("resolution"),
  },
  (t) => [
    // One report per person per listing. Someone who feels strongly can write
    // a longer detail; they cannot file the same complaint fifty times.
    uniqueIndex("listing_report_user_posting_unique").on(t.userId, t.postingId),
    index("listing_report_open_idx").on(t.resolvedAt, t.createdAt),
    index("listing_report_posting_idx").on(t.postingId),
  ],
);

/* ------------------------------------------------------------------ *
 * Pricing — usage counters for the run-capped free-tier tools
 * ------------------------------------------------------------------ */

/**
 * Which quantity-capped tools this table can meter. Kept here, beside
 * `PlanId`, rather than in `src/lib/pricing/tiers.ts` — the same split
 * `EventName` makes with `analytics/props.ts`: the set of valid keys is a
 * data-layer fact, and what each key is *worth* per tier is a product-layer
 * fact that lives in `tiers.ts` and imports this type.
 *
 * Deliberately does NOT include cover letters or the tracker — both already
 * have a real row per unit (`cover_letters`, `applications`), so counting
 * again here would be a second, driftable copy of a number the schema
 * already knows exactly. This table exists only for tools with no
 * persisted artifact to count: a critique or an audit is computed fresh on
 * every render, not stored.
 *
 * Named to match the feature keys in `src/lib/pricing/tiers.ts` exactly
 * (`resume_critique`, `github_tools`, `linkedin_tools`) rather than a
 * looser data-layer name of their own — `evaluateFeature` indexes its
 * `FEATURES` record by the same strings this column holds, and a second
 * naming scheme here would be the "restate the taxonomy" bug this codebase
 * has already been burned by once (see the remote-only filter note in
 * FIXES.md).
 */
export const USAGE_FEATURE_KEYS = ["resume_critique", "github_tools", "linkedin_tools"] as const;
export type UsageFeatureKey = (typeof USAGE_FEATURE_KEYS)[number];

/**
 * One (user, feature) counter.
 *
 * `lastKey` is what makes this a *use* counter rather than a *view* counter.
 * These tools compute their result fresh on every render — a critique panel
 * re-renders every time `/profile` loads, an audit every time the page is
 * requested — so incrementing unconditionally would burn a free user's one
 * run on the act of looking at their own resume twice. Re-running against the
 * same input (the same resume id, the same GitHub username) is a free replay
 * and does not move `count`; only a genuinely different input does. See
 * `src/lib/pricing/usage.ts`.
 */
export const featureUsage = pgTable(
  "feature_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    feature: text("feature").$type<UsageFeatureKey>().notNull(),
    count: integer("count").notNull().default(0),
    lastKey: text("last_key"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feature_usage_user_feature_unique").on(t.userId, t.feature)],
);

/* ------------------------------------------------------------------ *
 * Saved searches — a standing query, and optionally an alert on it
 * ------------------------------------------------------------------ */

/**
 * A set of feed filters a student wants to keep, and be told about.
 *
 * `filters` is jsonb rather than columns for the same reason `resumes.parsed`
 * is: the filter set is still moving (category and location arrived after the
 * feed shipped), and a column per filter means a migration every time one is
 * added. It is validated against a fixed schema on the way in *and* on the way
 * out — see `lib/searches/types.ts` — so an old shape degrades rather than
 * throwing on a page someone just wanted to look at.
 */
export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** What the student called it. Their words, never generated over the top. */
    name: text("name").notNull(),
    filters: jsonb("filters").notNull(),
    /** Per-search, so turning one alert off does not silence the others. */
    notify: boolean("notify").notNull().default(true),
    /**
     * The watermark for "new since last time".
     *
     * Set to now on creation rather than left null, so a brand-new saved search
     * does not fire an alert containing the entire corpus that matches it. The
     * first alert a student gets should be genuinely new postings.
     */
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("saved_search_user_idx").on(t.userId),
    // Drives the alert job: everything still watching, oldest watermark first.
    index("saved_search_notify_idx").on(t.notify, t.lastNotifiedAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Usage events — the only thing here not derivable from a real table
 * ------------------------------------------------------------------ */

/**
 * What we count that leaves no other trace.
 *
 * Deliberately three. Nearly every number Phase 07 asks for is already a fact
 * about a table we own — signups are `profiles`, applications tracked are
 * `applications`, resumes are `resumes`, saved searches are `saved_searches` —
 * and counting those from an event log instead would be storing a second,
 * worse copy of something the database already knows. An event is written only
 * where the action genuinely leaves nothing behind.
 *
 * THREE TOOLS ARE DELIBERATELY NOT INSTRUMENTED. `/linkedin` and `/essay` run
 * entirely in the browser — pure functions, no endpoint that takes the text —
 * and both pages say so, because for tools whose premise is "we never receive
 * this" that promise is the product. A content-free usage ping would not send
 * the text, but it would put a network call on a page that currently makes
 * none and make a plain sentence need an asterisk. The usage count is not worth
 * that, so those two are a known blind spot, stated in the metrics rather than
 * quietly estimated.
 */
export const EVENT_NAMES = [
  "search_run",
  "listing_viewed",
  "github_audited",
  "listing_reopened",
  "profile_activated",
  // The scholarship Plan view. Fired from the browser through
  // `app/explore/actions.ts`, which only accepts these names.
  "explore_view_changed",
  "explore_row_viewed",
  "card_start_clicked",
  "card_saved",
  "goal_set",
  "locked_card_clicked",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/**
 * A usage event.
 *
 * IT HOLDS NO USER ID, BY DESIGN, AND THAT IS THE POINT OF THE TABLE.
 * Every metric worth citing here is a count, and a count does not need to know
 * who. Attribution is already available for everything user-owned, from tables
 * that need the user id to function; adding it here would create the one thing
 * this schema does not otherwise contain — a behavioural log of what a named
 * student looked at. There is also no IP, no user agent, and no search text:
 * `props` carries which *filter keys* were used, never what anyone typed.
 *
 * RLS is enabled with **no policies at all** (see the migration), which denies
 * everything through the public anon key. There is no row here anyone outside
 * the server has any business reading.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").$type<EventName>().notNull(),
    /** Low-cardinality, non-identifying properties only — see `analytics/record.ts`. */
    props: jsonb("props"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_name_at_idx").on(t.name, t.at)],
);
