/**
 * Indiana University of Pennsylvania — outside scholarships and fellowships.
 *
 * Verified before writing this, per the standing rule: `robots.txt` blocks
 * only `/_resources/`, `/_cms/`, `/_qa/`, `/cgi-bin/`, `/search/`,
 * `/workarea/`, `/iup-only/`, the login paths and query-string searches, then
 * ends with an explicit `Allow: /`. Nothing under `/financialaid/` is
 * restricted. One server-rendered page, no pagination, no JavaScript.
 *
 * WHY THIS SOURCE. Not for volume — it is ~30 rows against UNL's 259. It was
 * chosen for the one field the corpus is starving for: **an outbound link to
 * the sponsor's own application**. 1,559 of the 1,879 open scholarships point
 * at Scholarships.com *listing* pages, which carry no application form at all;
 * they cannot be autofilled, now or ever, and no amount of code changes that
 * — the directory exposes no sponsor on its listing endpoints and none on its
 * detail endpoints either, so there is nothing to buy with Parse credits.
 * Every row here links straight to the awarding organisation — 28 distinct
 * hosts across ~30 entries — so each one is a scholarship the extension can
 * actually fill. Density is a bonus rather than the reason: measured on the
 * live page, 69% state an amount and 72% a parseable deadline.
 *
 * ON DATA QUALITY. Like UNL's list, a large share are law-firm and small-
 * business content-marketing awards — Robinson Law, Castelli, Meza, Kadzai.
 * They are real and winnable, and `sponsorName` carries the title verbatim so
 * the difference stays visible rather than being flattened away.
 *
 * FOUR THINGS ONLY READING THE LIVE PAGE FOUND, each pinned by a test:
 *
 *  1. **The last entry bleeds into the page footer.** The final `<h2>` block
 *     runs to end-of-document, so its body swallowed IUP's own address, phone
 *     number and a row of campus links. Left in, the description of the last
 *     scholarship on the page would contain "Financial Aid Office, 200 Clark
 *     Hall … 724-357-2218" every day, and `parseAmount` would be reading a
 *     postal code. The body is cut at the footer marker as well as at the
 *     next heading.
 *  2. **"Applications open in May 2026" is not a deadline.** It is the
 *     opposite one. The deadline pattern therefore requires the word
 *     "deadline" within a short window before the date, so an opening date
 *     reads as no deadline rather than as a very wrong one.
 *  3. **Not every `<h2>` is a scholarship.** The page opens with "First, File
 *     Your FAFSA" (a federal form) and carries "Links to Regional Scholarship
 *     Opportunities", a directory of 23 community foundations. Admitted as
 *     rows they would be a dead-end application and a link farm.
 *  4. **A heading can repeat.** "Attorney Ambitions Scholarship" appears
 *     twice. Two rows from one award would then close each other on
 *     alternating runs, which is exactly the false-closure failure the
 *     two-observation rule in `reconcile()` exists to prevent.
 */

import { htmlToText } from "../ingest/html";
import { getText } from "../ingest/http";
import { parseAmount } from "./amount";
import type { ScholarshipListing } from "./types";

const PAGE_URL =
  "https://www.iup.edu/financialaid/types-of-financial-aid/scholarships/outside-scholarships-and-fellowships.html";

/** Each scholarship is one `<h2>` and everything after it. */
const HEADING_RE = /<h2[^>]*>/;
const HEADING_SPLIT_RE = /<h2[^>]*>/g;

/** Where the page chrome starts. See note 1 — without this the final entry
 *  absorbs the whole site footer. */
const FOOTER_MARKER = '<div class="row internal-footer"';

/** Links back into IUP are navigation, never the sponsor's application. */
const INTERNAL_HOST = "iup.edu";
const HREF_RE = /href="(https?:\/\/[^"]+)"/g;

/**
 * A block that is a list of links rather than one scholarship.
 *
 * "Links to Regional Scholarship Opportunities" carries 23 outbound links to
 * community foundations. The largest genuine entry has 6, so the threshold
 * sits well clear of it — deliberately loose, because wrongly dropping a real
 * scholarship is the more expensive mistake and the shape being excluded here
 * is unmistakable.
 */
const MAX_LINKS_PER_ENTRY = 10;

/**
 * Something on the page has to actually call it a scholarship. Checked against
 * the body as well as the title, because several entries are named after the
 * sponsor alone ("Pennsylvania Restaurant and Lodging Association") and a
 * title-only test dropped two real awards.
 */
const SCHOLARSHIP_WORD_RE = /scholarship|fellowship|scholars\b/i;

/**
 * Deadlines as IUP writes them: "Deadline: September 14, 2026", "Application
 * deadline: December 8, 2026", "The deadline for the fall 2026 applications is
 * August 5, 2026".
 *
 * The word "deadline" must appear within a short window before the date — see
 * note 2. Same shape as the UNR rule, deliberately: two sources stating the
 * same kind of fact should not disagree about what counts as stating it.
 */
const DEADLINE_RE =
  /deadline[^.]{0,60}?\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i;

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/**
 * A deadline stated without a year means the next one that has not passed.
 *
 * Identical to UNR's rule and for the same reason: assuming the current year
 * marks a scholarship closed for most of every year. `now` is injected so the
 * suite does not depend on when it runs.
 */
function resolveDeadline(text: string, now: Date): Date | null {
  const m = DEADLINE_RE.exec(text);
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;

  if (m[3]) return new Date(Date.UTC(Number(m[3]), month, day));

  const candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day));
  if (candidate.getTime() < now.getTime()) {
    return new Date(Date.UTC(now.getUTCFullYear() + 1, month, day));
  }
  return candidate;
}

/**
 * A stable id for an entry.
 *
 * The page gives no identifier of its own, so the title is it — normalized, so
 * an editor fixing an apostrophe does not read as the old scholarship closing
 * and a new one opening. Same function as UNR's, same reasoning.
 */
function sourceIdFor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Entries as they appear on the page.
 *
 * Exported and pure so it is testable against captured markup — the parser is
 * the part that breaks when a CMS changes, and it has to be checkable without
 * the network.
 */
export function parseListings(html: string, now: Date = new Date()): ScholarshipListing[] {
  const out: ScholarshipListing[] = [];
  const seen = new Set<string>();

  for (const chunk of html.split(HEADING_SPLIT_RE).slice(1)) {
    const [rawHeading, rawRest = ""] = chunk.split("</h2>");
    const title = (htmlToText(rawHeading) ?? "").trim();
    if (!title) continue;

    // Body runs to the next heading — and to the page footer, whichever comes
    // first. The footer only ever truncates the final entry, which is exactly
    // the one that would otherwise absorb it.
    const body = rawRest.split(HEADING_RE)[0].split(FOOTER_MARKER)[0];

    const links = [...body.matchAll(HREF_RE)]
      .map((m) => m[1])
      .filter((u) => !u.includes(INTERNAL_HOST));

    // Nowhere to send a student, and IUP's own page is not an application.
    // Skipped rather than listed as a dead end — the rule UNR follows.
    if (links.length === 0) continue;
    if (links.length > MAX_LINKS_PER_ENTRY) continue;

    const description = (htmlToText(body) ?? "").replace(/\s+/g, " ").trim();
    if (!SCHOLARSHIP_WORD_RE.test(title) && !SCHOLARSHIP_WORD_RE.test(description)) continue;

    const sourceId = sourceIdFor(title);
    if (!sourceId || seen.has(sourceId)) continue;

    const amount = parseAmount(description);

    seen.add(sourceId);
    out.push({
      source: "iup",
      sourceId,
      title,
      // The first outbound link is the sponsor's own application. Verified
      // against every entry on the live page: where an entry carries several,
      // the first is the application and the rest are the sponsor's other
      // pages.
      url: links[0],
      // IUP states no separate sponsor field. The award's own name is the only
      // attribution the page gives, so it stands in rather than an invented
      // organisation — the same choice UNR's parser makes.
      sponsorName: title,
      amountMin: amount.min,
      amountMax: amount.max,
      amountNeedsReview: amount.needsReview,
      // The source's own prose, unparsed, per the ScholarshipListing contract.
      // This is what `fieldsFromDegreeLanguage` reads.
      eligibility: description ? [description] : [],
      deadlineAt: resolveDeadline(description, now),
      // No per-entry status on the page. Absence on a later crawl is the
      // closure signal — and, per the two-observation rule, absence twice.
      isOpen: true,
    });
  }

  return out;
}

export async function fetchScholarships(): Promise<ScholarshipListing[]> {
  const html = await getText(PAGE_URL);
  return parseListings(html);
}
