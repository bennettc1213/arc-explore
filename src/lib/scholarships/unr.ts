/**
 * University of Nevada, Reno — external scholarship list.
 *
 * Verified before writing this: `robots.txt` is `User-Agent: * / Disallow:`
 * with an empty value, which permits everything — the most open policy a site
 * can publish. One server-rendered page, 60 accordion entries, no pagination.
 *
 * WHY THIS SOURCE, GIVEN WE ALREADY HAVE 1,800 SCHOLARSHIPS. Because almost
 * none of them say anything. Measured across the open corpus on 2026-08-14:
 * the 1,559 Scholarships.com rows carry an amount on 0%, a deadline on 0% and
 * eligibility on 0% — that source's listing endpoint returns a name and a URL
 * and nothing else, and its detail endpoints cost a Parse credit each, so
 * enriching them is arithmetically impossible on a 200/month budget. UNL, a
 * direct scrape, carries an amount and deadline on 100%.
 *
 * UNR adds the one thing neither has: **eligibility prose**, on every entry.
 * That is the field the scholarship Fit Score matches a student's major
 * against, and the reason the category filter can currently place only 10% of
 * scholarships. A row here states "graduate students pursuing a master's,
 * doctorate or law degree in a field related to law, policy or public
 * administration" — which is exactly what `fieldsFromDegreeLanguage` reads.
 *
 * WHAT IT DOES NOT STATE. Amounts appear in prose on 31 of 60 and deadlines on
 * 13 of 60, both as free text inside the description rather than in their own
 * fields. They are parsed where `parseAmount` is confident and left null
 * otherwise — never inferred from surrounding sentences. There is no per-entry
 * open/closed flag, so `isOpen` is true for everything and closure comes from
 * an entry disappearing from the page, the same inference UNL relies on.
 */

import { getText } from "../ingest/http";
import { htmlToText } from "../ingest/html";
import { parseAmount } from "./amount";
import type { ScholarshipListing } from "./types";

const PAGE_URL = "https://www.unr.edu/financial-aid/scholarships/external-scholarships";

/** Each scholarship is one accordion, keyed by its heading. Split on rather
 *  than matched, so an entry's body is whatever follows it up to the next. */
const HEADING_MARKER = '<h3 class="unr-accordion--heading">';

/**
 * The accordion icon is an inline `<svg>` whose `<path d="…">` is a few
 * hundred characters of coordinates. Stripped before any text extraction —
 * left in, it lands in the middle of every description and `parseAmount`
 * would be reading path data looking for dollar figures.
 */
const SVG_RE = /<svg[\s\S]*?<\/svg>/gi;

/** The first outbound link in an entry is the scholarship's own page. */
const HREF_RE = /href="(https?:\/\/[^"]+)"/;

/**
 * Deadlines as UNR writes them in prose: "Deadline: March 1", "deadline is
 * April 15, 2027". Only a form carrying an explicit month and day is read;
 * "applications open in the fall" is left null rather than invented.
 */
const DEADLINE_RE =
  /deadline[^.]{0,40}?\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i;

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * A deadline stated without a year.
 *
 * "Deadline: March 1" means the next March 1 that has not passed. Assuming the
 * current year would mark a scholarship closed for ten months of every year;
 * rolling forward keeps it open and is what the page means. `now` is injected
 * so this is testable rather than dependent on when the suite runs.
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
 * The page gives us no identifier of its own, so the title is it. Normalized
 * rather than used raw: an editor fixing capitalisation or trailing whitespace
 * would otherwise read as the old scholarship closing and a new one opening.
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
 * Exported and pure so it can be tested against captured markup — the parser
 * is the part that breaks when a CMS changes, and it must be checkable without
 * the network.
 */
export function parseListings(html: string, now: Date = new Date()): ScholarshipListing[] {
  const clean = html.replace(SVG_RE, " ");
  const out: ScholarshipListing[] = [];
  const seen = new Set<string>();

  // Split on the headings, so each chunk is one accordion body.
  const chunks = clean.split(HEADING_MARKER).slice(1);

  for (const chunk of chunks) {
    const [rawHeading, rawBody = ""] = chunk.split("</h3>");
    const title = (htmlToText(rawHeading) ?? "").trim();
    if (!title) continue;

    const sourceId = sourceIdFor(title);
    // The page renders each entry once, but a duplicated heading would
    // otherwise become two rows that then close each other on the next run.
    if (!sourceId || seen.has(sourceId)) continue;

    // Body only to the next section; an accordion never nests another.
    const body = rawBody.split(/<h[23][\s>]/)[0];
    const description = (htmlToText(body) ?? "").replace(/\s+/g, " ").trim();

    const href = HREF_RE.exec(body)?.[1];
    // With no outbound link there is nowhere to send a student, and the UNR
    // page itself is not an application. Skipped rather than listed as a
    // dead end.
    if (!href) continue;

    const amount = parseAmount(description);

    seen.add(sourceId);
    out.push({
      source: "unr",
      sourceId,
      title,
      url: href,
      // UNR states no separate sponsor field; the scholarship's own name is
      // the only attribution the page gives, so it stands in rather than an
      // invented organisation.
      sponsorName: title,
      amountMin: amount.min,
      amountMax: amount.max,
      amountNeedsReview: amount.needsReview,
      // The whole reason for this source. Kept as the source's own prose —
      // one entry, unparsed, per the ScholarshipListing contract.
      eligibility: description ? [description] : [],
      deadlineAt: resolveDeadline(description, now),
      // No per-entry status on the page. Absence on a later crawl is the
      // closure signal, exactly as for UNL.
      isOpen: true,
    });
  }

  return out;
}

export async function fetchScholarships(): Promise<ScholarshipListing[]> {
  const html = await getText(PAGE_URL);
  return parseListings(html);
}
