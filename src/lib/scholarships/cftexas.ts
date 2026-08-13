/**
 * Communities Foundation of Texas — scraped, not an API.
 *
 * Verified before writing a line of this: `robots.txt` disallows only
 * `/wp-admin/` and sets a 10s crawl-delay (respected via `mapLimit`-free
 * sequential fetch — this is one page, not a board to poll). The page is
 * server-rendered Elementor markup with no JS required to see real data:
 * 96 scholarship entries at last check, each carrying a name, deadline,
 * award-amount line, eligibility bullets, and its own detail-page URL.
 *
 * Every scholarship is duplicated in the raw HTML — the page renders each
 * entry once per filter tab (All/Open/Closed) even though only one tab is
 * visible at a time client-side. `parseListings` dedupes on the CMS post id
 * embedded in each entry's class list before returning.
 */

import { getText } from "../ingest/http";
import { htmlToText } from "../ingest/html";
import { parseAmount } from "./amount";
import type { ScholarshipListing } from "./types";

const PAGE_URL = "https://www.cftexas.org/scholarships/apply-for-scholarships/";
const SPONSOR_NAME = "Communities Foundation of Texas";

const TITLE_DEADLINE_RE =
  /e-n-accordion-item-title-text">\s*([^<]+?)<span class="deadline">([^<]*)<\/span>/;
const STATUS_RE = /(scholarship_status-\w+)/;
const POST_ID_RE = /\bpost-(\d+)\b/;
const AMOUNT_BLOCK_RE =
  /Award Amount:<\/h5>[\s\S]*?elementor-widget-container">\s*([\s\S]*?)\s*<\/div>/;
const ELIGIBILITY_BLOCK_RE =
  /Eligibility:<\/h5>[\s\S]*?elementor-widget-container">\s*(<ul>[\s\S]*?<\/ul>|<p>[\s\S]*?<\/p>)/;
const DETAIL_URL_RE =
  /(https:\/\/www\.cftexas\.org\/scholarships\/apply-for-scholarships\/[a-z0-9-]+\/)" target="_blank">/i;
const LIST_ITEM_RE = /<li>([\s\S]*?)<\/li>/g;

function parseDeadline(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEligibility(block: string): string[] {
  const items = [...block.matchAll(LIST_ITEM_RE)]
    .map((m) => htmlToText(m[1]))
    .filter((t): t is string => Boolean(t));
  if (items.length > 0) return items;

  // No <ul> matched — the fallback branch of ELIGIBILITY_BLOCK_RE caught a
  // bare <p> instead. Treat the whole paragraph as one bullet.
  const text = htmlToText(block);
  return text ? [text] : [];
}

/**
 * Pure parse over already-fetched HTML — no I/O, so this is the part that
 * gets tested against the fixture without a network call.
 */
export function parseListings(html: string): ScholarshipListing[] {
  // Every entry starts with this exact marker; splitting on it turns 96
  // duplicated-across-tabs fragments into 96 independently regex-able blocks.
  const blocks = html.split('<div data-elementor-type="loop-item"').slice(1);

  const bySourceId = new Map<string, ScholarshipListing>();

  for (const block of blocks) {
    const titleMatch = block.match(TITLE_DEADLINE_RE);
    const postIdMatch = block.match(POST_ID_RE);
    if (!titleMatch || !postIdMatch) continue; // not a scholarship entry — skip rather than guess

    const sourceId = postIdMatch[1];
    if (bySourceId.has(sourceId)) continue; // same entry, second tab — first occurrence wins

    const title = titleMatch[1].trim();
    const detailUrl = block.match(DETAIL_URL_RE)?.[1] ?? PAGE_URL;

    const statusMatch = block.match(STATUS_RE);
    // Anything other than the literal "closed" value we have actually
    // observed is treated as open, deliberately — defaulting to "assume
    // closed" on an unrecognized status would silently hide a scholarship
    // rather than misreport one, and this product doesn't hide over guess.
    const isOpen = statusMatch?.[1] !== "scholarship_status-closed";

    const amountBlock = block.match(AMOUNT_BLOCK_RE)?.[1];
    // A missing block is the page stating no amount, not a failed parse, so
    // it is not flagged for review — only a block we could not read is.
    const { min, max, needsReview } = amountBlock
      ? parseAmount(htmlToText(amountBlock) ?? "")
      : { min: null, max: null, needsReview: false };

    const eligibilityBlock = block.match(ELIGIBILITY_BLOCK_RE)?.[1];
    const eligibility = eligibilityBlock ? parseEligibility(eligibilityBlock) : [];

    bySourceId.set(sourceId, {
      source: "cftexas",
      sourceId,
      title,
      url: detailUrl,
      sponsorName: SPONSOR_NAME,
      amountMin: min,
      amountMax: max,
      amountNeedsReview: needsReview,
      eligibility,
      deadlineAt: parseDeadline(titleMatch[2]),
      isOpen,
    });
  }

  return [...bySourceId.values()];
}

export async function fetchScholarships(): Promise<ScholarshipListing[]> {
  const html = await getText(PAGE_URL);
  return parseListings(html);
}
