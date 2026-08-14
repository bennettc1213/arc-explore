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
    vertical: text("vertical"),

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
    category: text("category"),
    degrees: text("degrees").array().notNull().default([]),

    /** Scholarship dollar value. Both null means "amount varies" or unstated —
     *  never guessed. Equal min/max means an exact, stated amount. */
    amountMin: integer("amount_min"),
    amountMax: integer("amount_max"),
    /** The source stated a dollar figure the parser could not read, as
     *  opposed to stating none. Both leave the bounds null, but only this is
     *  a defect — without the distinction every parser regression looks
     *  exactly like an honest blank. Surfaced by `npm run ingest:status`. */
    amountNeedsReview: boolean("amount_needs_review").notNull().default(false),
    /** Small-award law-firm scholarships run for inbound links rather than
     *  by an institution. A tag, never a filter: the row stays in the feed
     *  and the scholarship Fit Score (Phase 02) decides what to do with it.
     *  Stamped at ingest so the signal is already on every row when that
     *  score is built. See `lib/scholarships/classify.ts`. */
    isContentMarketing: boolean("is_content_marketing").notNull().default(false),
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

    /* --- freshness engine --- */
    /** First moment we ever observed this posting. Drives the timing score. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Last poll in which the source still listed it. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when it disappears from its ATS feed — our "filled/closed" signal. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Employer-stated posting date, when a source provides one. May be null —
     *  we never invent one, per the honest-slots rule. */
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** Employer-stated application deadline. Greenhouse publishes this; the
     *  others do not. Drives the "closes soon" timing boost, and is almost
     *  always null — rendered as an honest slot rather than a guess. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posting_canonical_unique").on(t.canonicalHash),
    index("posting_org_idx").on(t.orgId),
    index("posting_open_idx").on(t.closedAt, t.firstSeenAt),
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
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posting_source_unique").on(t.source, t.sourceId),
    index("posting_source_posting_idx").on(t.postingId),
  ],
);

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

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
  /** Deadline reminder emails. On by default — a student who saved something
   *  with a deadline asked to be reminded of it in every sense but the
   *  literal one — and switched off by the unsubscribe link on every send. */
  deadlineRemindersEnabled: boolean("deadline_reminders_enabled").notNull().default(true),
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
