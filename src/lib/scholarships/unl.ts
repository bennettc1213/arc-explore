/**
 * University of Nebraska–Lincoln — external scholarship list.
 *
 * Verified before writing this: standard Drupal `robots.txt` disallowing only
 * `/core/`, `/profiles/`, `/admin/` and the user/login paths — nothing under
 * `/types-funding/`. The list is a server-rendered `<table>` (title + sponsor,
 * award, deadline, outbound apply URL), 8 pages of ~30 rows.
 *
 * ON DATA QUALITY. UNL aggregates *external* scholarships, and a large share
 * of them are law-firm and small-business content-marketing awards — a $1,000
 * essay contest run to earn inbound links. They are real, a student can really
 * win them, and the deadlines are genuinely open, which is why they are worth
 * carrying. But they are not the same kind of thing as an endowed institutional
 * fund, and the corpus should not silently imply otherwise. `sponsorName` is
 * recorded exactly as UNL states it so the difference stays visible on screen
 * rather than being flattened into an anonymous list.
 */

import { getText } from "../ingest/http";
import { htmlToText } from "../ingest/html";
import { parseAmount } from "./amount";
import type { ScholarshipListing } from "./types";

const BASE_URL = "https://financialaid.unl.edu/types-funding/external-scholarships/";

/**
 * Force a stable sort key before paginating.
 *
 * The table's default order is by deadline, and dozens of rows share a
 * deadline — the order within a tie is not stable between requests. Walking
 * 8 pages takes ~45s, so rows drift across page boundaries mid-crawl: some
 * are fetched twice and others missed entirely. Measured on two identical
 * back-to-back runs, that churned 2 listings out and 2 in, which then read
 * downstream as scholarships *closing* when their deadlines were months
 * away. `closed_at` is the one signal this product's honesty rests on, so
 * it cannot be an artifact of how the source happened to paginate.
 *
 * Sorting by title gives a near-unique key and was verified reproducible:
 * page 3 came back byte-identical across repeated fetches.
 */
const SORT_QUERY = "order=title&sort=asc";
/** Hard ceiling so a pagination bug can never walk the site indefinitely. */
const MAX_PAGES = 15;
/** Politeness gap between page requests. */
const PAGE_DELAY_MS = 1500;

const TBODY_RE = /<tbody[\s\S]*?<\/tbody>/;
const ROW_RE = /<tr[\s\S]*?<\/tr>/g;
const CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;
const HREF_RE = /href="([^"]+)"/;
const SPONSOR_RE = /dcf-txt-sm">([^<]*)<\/span>/;
/** UNL writes deadlines as MM-DD-YYYY. */
const DEADLINE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse MM-DD-YYYY explicitly rather than handing it to `new Date`.
 *
 * `new Date("08-10-2026")` happens to work in V8 but is not specified, and
 * the same string is a valid DD-MM date in most of the world — a silent
 * month/day swap would put a deadline four months off with no error.
 * Constructed as UTC so the stored instant does not shift with the runner's
 * timezone (CI is UTC, this laptop is not).
 */
export function parseDeadline(raw: string): Date | null {
  const m = raw.trim().match(DEADLINE_RE);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible dates that Date would silently roll over (02-31).
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Pure parse over one already-fetched page of HTML.
 *
 * @param now Injected so the open/closed derivation is testable against a
 *   fixed clock rather than whenever the suite happens to run.
 */
export function parseListings(html: string, now: Date = new Date()): ScholarshipListing[] {
  const tbody = html.match(TBODY_RE)?.[0];
  if (!tbody) return [];

  const out: ScholarshipListing[] = [];

  for (const row of tbody.match(ROW_RE) ?? []) {
    const cells = [...row.matchAll(CELL_RE)].map((m) => m[1]);
    if (cells.length < 3) continue;

    const [titleCell, amountCell, deadlineCell] = cells;

    // The title cell is `<a>Title</a><span>Sponsor</span>` — split on the
    // anchor close so the sponsor name never leaks into the title.
    const title = htmlToText(titleCell.split("</a>")[0]);
    const url = titleCell.match(HREF_RE)?.[1];
    if (!title || !url) continue; // no title or no way to apply — not usable

    const sponsor = htmlToText(titleCell.match(SPONSOR_RE)?.[1] ?? "");
    const { min, max, needsReview } = parseAmount(htmlToText(amountCell) ?? "");
    const deadlineAt = parseDeadline(htmlToText(deadlineCell) ?? "");

    out.push({
      source: "unl",
      // UNL exposes no per-row id, so identity is the outbound URL plus the
      // title: one firm often lists several distinct scholarships pointing at
      // the same landing page, and the URL alone would collapse them.
      sourceId: `${url}::${title}`,
      title,
      url,
      // Falls back to the aggregator only when UNL states no sponsor. Naming
      // UNL as sponsor for every row would be wrong — they publish the list,
      // they do not award the money.
      sponsorName: sponsor || "University of Nebraska–Lincoln (listed)",
      amountMin: min,
      amountMax: max,
      amountNeedsReview: needsReview,
      // UNL publishes no eligibility column; the detail lives on each
      // sponsor's own page. Empty rather than invented.
      eligibility: [],
      deadlineAt,
      // Derived, unlike CFT which states status directly. This is arithmetic
      // on a date the source published, not a guess — and a row with no
      // parseable deadline is treated as open rather than hidden, since we
      // have no evidence it closed.
      isOpen: deadlineAt === null || deadlineAt.getTime() >= now.getTime(),
    });
  }

  return out;
}

export async function fetchScholarships(): Promise<ScholarshipListing[]> {
  const bySourceId = new Map<string, ScholarshipListing>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${BASE_URL}?${SORT_QUERY}&page=${page}`;
    const html = await getText(url);
    const listings = parseListings(html);

    // An empty page is the end of the table — Drupal serves a valid page with
    // no rows past the last one rather than 404ing.
    if (listings.length === 0) break;

    let added = 0;
    for (const l of listings) {
      if (bySourceId.has(l.sourceId)) continue;
      bySourceId.set(l.sourceId, l);
      added++;
    }

    // Every row already seen means pagination stopped advancing (a bad
    // `?page=` param serving page 1 forever). Stop rather than loop to the cap.
    if (added === 0) break;

    await sleep(PAGE_DELAY_MS);
  }

  return [...bySourceId.values()];
}
