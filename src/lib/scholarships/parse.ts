/**
 * Scholarships.com + ScholarshipPortal, both served by the Parse API
 * (parse.bot) — the two directory sources behind the `PARSE_API_KEY` you
 * configured in `.env`.
 *
 * WHY THIS IS NOT A SCRAPED PAGE LIKE CFT/UNL. Parse is a hosted REST wrapper
 * over the two directories. One API key (`X-API-Key: PARSE_API_KEY`) is shared
 * by every Parse API we subscribe to, and every successful call costs one
 * credit against the free tier (200/month, 5 req/min). There is no unbounded
 * HTML page to walk, so this module is shaped by a hard call budget instead.
 *
 * SCOPE — AND WHY CLOSE-ON-REMOVAL IS STILL HONEST. We crawl a fixed scope on
 * every run, so "not in today's snapshot" still means "gone", the same
 * inference CFT and UNL rely on:
 *  - scholarships.com: a curated, constant list of `category/subcategory`
 *    directory slugs. Every scholarship listed under them is fetched.
 *  - scholarshipportal.com: the full US bachelor's set
 *    (`country_iso=US&study_level=bachelor`), paginated until the source says
 *    there is no more.
 * Because the scope never changes between runs, absence is a signal. Editing
 * `SCHOLARSHIPS_COM_DIRECTORY_SLUGS` changes the scope, and rows outside the
 * new scope will be closed on the next run — that is the config changing the
 * dataset, not a source change, and it is documented rather than silently
 * prevented.
 *
 * ON ABSENCE OF DETAIL. The listing endpoints return name/slug/url only — no
 * sponsor, no amount, no deadline (the title-embedded amounts are demonstrably
 * stale — a $10,000 title sits in a $100–$1,000 category — and are never
 * parsed). The detail endpoints cost a credit per call, so a full detail pass
 * would burn the entire free-tier budget in one run. The base crawl stays at
 * listing level: amount/deadline/eligibility remain null, and `isOpen`
 * defaults to open because there is no evidence of closure — the same rule
 * UNL applies to a row with no parseable deadline.
 *
 * FAIL-LOUD, NOT PARTIAL. If any single API call fails, the fetch throws and
 * the whole source run fails with nothing persisted — a partial crawl that
 * silently omitted rows would close live scholarships on the strength of our
 * own fetch failure, which is precisely the failure this pipeline exists to
 * avoid.
 */

import { HttpError, getJson } from "../ingest/http";
import { parseAmount } from "./amount";
import type { ScholarshipListing } from "./types";

/* ------------------------------------------------------------------ *
 * Shared Parse plumbing
 * ------------------------------------------------------------------ */

const SCHOLARSHIPS_COM_BASE =
  process.env.PARSE_SCHOLARSHIPS_COM_BASE_URL ??
  "https://api.parse.bot/scraper/e39726f8-b69f-440d-a6f6-d53c1a3e549b/";
const SCHOLARSHIPPORTAL_BASE =
  process.env.PARSE_SCHOLARSHIPPORTAL_BASE_URL ??
  "https://api.parse.bot/scraper/d8ac1888-45af-4a2b-9aee-a54938204f94/";

function parseHeaders(): Record<string, string> {
  const key = process.env.PARSE_API_KEY;
  if (!key) {
    throw new Error(
      "PARSE_API_KEY is not set — add it to .env (parse.bot → Settings → API Keys)",
    );
  }
  return { "X-API-Key": key };
}

/**
 * One Parse API call, on a hard credit budget.
 *
 * Parse is metered two ways: a per-minute refill and a daily credit window.
 * `getJson` already retries with backoff, but a daily-quota 429 carries a
 * `Retry-After` measured in hours — and the right response to "your daily
 * credits are gone" is to fail this run loudly so a human sees it, not to
 * burn the workflow's entire 10-minute timeout re-waiting a capped minute
 * three times. Distinguish the two: transient 429s come back quickly, so
 * after retries any 429 that survives is a quota problem.
 */
async function parseGetJson<T>(url: string): Promise<T> {
  try {
    const res = await getJson<T>(url, { headers: parseHeaders() });
    return res.data as T;
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) {
      throw new Error(
        `Parse API rate-limited (HTTP 429) after retries — daily credit quota likely exhausted. ` +
          `The run cannot proceed until the daily window resets.`,
        { cause: err },
      );
    }
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Politeness gap between calls — the free tier advertises a per-minute cap. */
const PAGE_DELAY_MS = 1500;

/* ------------------------------------------------------------------ *
 * Date parsing — both sources publish month-name prose, not ISO.
 * ------------------------------------------------------------------ */

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/** "18 Dec 2026" */
const DD_MON_YYYY_RE = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/;
/** "December 18, 2026" */
const MONTH_DD_YYYY_RE = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/;

function toUtcDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month, day));
  // Reject impossible dates rather than letting Date roll them over (Feb 31
  // becoming March 3) — a wrong deadline moves a real one by a month.
  if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return d;
}

export function parseDateText(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /^not specified$/i.test(s)) return null;

  const ddmonyyyy = s.match(DD_MON_YYYY_RE);
  if (ddmonyyyy) {
    const month = MONTH_NAMES[ddmonyyyy[2].toLowerCase()];
    if (month === undefined) return null;
    return toUtcDate(Number(ddmonyyyy[3]), month, Number(ddmonyyyy[1]));
  }

  const monthddyyyy = s.match(MONTH_DD_YYYY_RE);
  if (monthddyyyy) {
    const month = MONTH_NAMES[monthddyyyy[1].toLowerCase()];
    if (month === undefined) return null;
    return toUtcDate(Number(monthddyyyy[3]), month, Number(monthddyyyy[2]));
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Scholarships.com — curated directory slugs, listing-level
 * ------------------------------------------------------------------ */

/**
 * `category/subcategory` pairs under the top-level directory categories
 * (get_scholarship_directory_categories). Each is one call, one credit, and
 * returns every scholarship in that subcategory in a single response.
 * Overridable with `PARSE_SCHOLARSHIPSCOM_SLUGS` (comma-separated).
 */
export const SCHOLARSHIPS_COM_DIRECTORY_SLUGS: readonly string[] = [
  "academic-major/computer-science",
  "academic-major/computer-engineering",
  "academic-major/engineering",
  "academic-major/electrical-engineering",
  "academic-major/mechanical-engineering",
  "residence-state/texas",
  "residence-state/california",
  "scholarship-amount/scholarships-from-1001-to-2500",
];

/**
 * The directory never exposes a sponsor on the listing or detail endpoints,
 * so rows fall back to the aggregator — same rule as UNL, which only names
 * itself when the source states no sponsor.
 */
const SCHOLARSHIPS_COM_FALLBACK_SPONSOR = "Scholarships.com (listed)";

export interface ScholarshipsComRow {
  name: string;
  slug: string;
  url: string;
}

/**
 * Pure transform from one listing response — no I/O, so this is what the
 * test suite exercises. Dedupes on slug: the same scholarship appears under
 * every directory subcategory it qualifies for, and it must only reach the
 * persist layer once.
 */
export function mapScholarshipsCom(rows: ScholarshipsComRow[]): ScholarshipListing[] {
  const seen = new Set<string>();
  const out: ScholarshipListing[] = [];

  for (const row of rows) {
    if (!row?.name || !row?.url || !row?.slug) continue; // unusable row — skip, don't guess
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);

    out.push({
      source: "scholarshipscom",
      sourceId: row.slug,
      title: row.name,
      url: row.url,
      sponsorName: SCHOLARSHIPS_COM_FALLBACK_SPONSOR,
      amountMin: null,
      amountMax: null,
      amountNeedsReview: false,
      eligibility: [],
      deadlineAt: null,
      // No status or deadline in the listing payload → no evidence of closure.
      isOpen: true,
    });
  }

  return out;
}

export async function fetchScholarshipsCom(): Promise<ScholarshipListing[]> {
  const override = process.env.PARSE_SCHOLARSHIPSCOM_SLUGS;
  const slugs =
    override === undefined
      ? SCHOLARSHIPS_COM_DIRECTORY_SLUGS
      : override.split(",").map((s) => s.trim()).filter(Boolean);

  const bySourceId = new Map<string, ScholarshipListing>();

  for (const pair of slugs) {
    const [category, subcategory] = pair.split("/");
    if (!category || !subcategory) {
      throw new Error(`malformed scholarships.com directory slug: "${pair}" — expected category/subcategory`);
    }

    const body = await parseGetJson<{ data: { scholarships: ScholarshipsComRow[] } }>(
      `${SCHOLARSHIPS_COM_BASE}list_scholarships_in_category` +
        `?category_slug=${encodeURIComponent(category)}` +
        `&subcategory_slug=${encodeURIComponent(subcategory)}`,
    );

    for (const listing of mapScholarshipsCom(body?.data?.scholarships ?? [])) {
      bySourceId.set(listing.sourceId, listing);
    }

    await sleep(PAGE_DELAY_MS);
  }

  return [...bySourceId.values()];
}

/* ------------------------------------------------------------------ *
 * ScholarshipPortal — full US bachelor's set, paginated
 * ------------------------------------------------------------------ */
const PORTAL_PAGE_SIZE = 200;
/** 40 pages × 200 = 8,000 rows ceiling — a pagination bug must not walk forever. */
const PORTAL_MAX_PAGES = 40;

export interface PortalSearchItem {
  id: string;
  title: string;
  slug: string;
  url: string;
  provider: { name: string } | null;
  deadline: string;
  is_deadline_specified: boolean;
  /** The $-carrying human line ("Up to $20,000"), which is what we parse. */
  grant: { amount: number | null; currency: string; description: string } | null;
}

const SCHOLARSHIPPORTAL_FALLBACK_SPONSOR = "ScholarshipPortal (listed)";

/**
 * Pure transform from one search response page. `now` is injected so the
 * open/closed derivation is testable against a fixed clock.
 */
export function mapScholarshipPortal(
  items: PortalSearchItem[],
  now: Date,
): ScholarshipListing[] {
  const out: ScholarshipListing[] = [];

  for (const item of items) {
    if (!item?.id || !item?.slug || !item?.title || !item?.url) continue;

    // Parse the grant description, not the numeric amount: parseAmount only
    // reads $-denominated figures, so a €33,600 grant keeps its honest null
    // rather than being stored as if it were $33,600 — the schema carries no
    // currency column, so any non-USD figure must not render as dollars.
    const { min, max, needsReview } = parseAmount(item.grant?.description ?? "");

    const deadlineAt = item.is_deadline_specified ? parseDateText(item.deadline) : null;

    out.push({
      source: "scholarshipportal",
      sourceId: `${item.id}::${item.slug}`,
      title: item.title,
      url: item.url,
      sponsorName: item.provider?.name || SCHOLARSHIPPORTAL_FALLBACK_SPONSOR,
      amountMin: min,
      amountMax: max,
      amountNeedsReview: needsReview,
      eligibility: [],
      deadlineAt,
      // A stated future deadline is open; a stated past one is closed; an
      // unstated one is open for lack of any evidence it closed.
      isOpen: deadlineAt === null || deadlineAt.getTime() >= now.getTime(),
    });
  }

  return out;
}

export async function fetchScholarshipPortal(): Promise<ScholarshipListing[]> {
  const bySourceId = new Map<string, ScholarshipListing>();

  for (let offset = 0; offset < PORTAL_MAX_PAGES * PORTAL_PAGE_SIZE; offset += PORTAL_PAGE_SIZE) {
    const body = await parseGetJson<{
      data: { items: PortalSearchItem[]; has_more: boolean };
    }>(
      `${SCHOLARSHIPPORTAL_BASE}search_scholarships` +
        `?limit=${PORTAL_PAGE_SIZE}&offset=${offset}&country_iso=US&study_level=bachelor`,
    );

    const items = body?.data?.items ?? [];
    for (const listing of mapScholarshipPortal(items, new Date())) {
      bySourceId.set(listing.sourceId, listing);
    }

    // has_more=false or an empty page is the end of the set. Re-fetching a
    // page that stopped advancing would spin to the cap; dedupe by sourceId
    // above already makes a re-fetch harmless, but stopping is the honest
    // end-of-set signal the source itself gives us.
    if (!body?.data?.has_more || items.length === 0) break;

    await sleep(PAGE_DELAY_MS);
  }

  return [...bySourceId.values()];
}
