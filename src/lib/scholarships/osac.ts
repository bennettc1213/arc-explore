/**
 * Oregon Office of Student Access and Completion (OSAC) — the state's
 * scholarship catalogue, ~600 privately funded awards behind one application.
 *
 * Verified before writing this (2026-11-10): `osacapps.hecc.oregon.gov/robots.txt`
 * is `User-agent: * / Disallow:` with an empty value, which permits everything.
 * It is a state agency's public catalogue.
 *
 * WHY THIS SOURCE. Depth, not row count (HANDOFF §3). Every entry states its
 * requirements as typed fields — high school, county, enrollment, GPA,
 * colleges, FAFSA — and lists each essay it asks for with a length limit.
 * Essay counts were measured at 0% known across the corpus (FIXES §4); this is
 * the first source that states them. They are kept in the eligibility lines
 * verbatim, because there is no column for them yet.
 *
 * WHAT IT DOES NOT STATE. No per-award dollar amount (OSAC sets awards
 * case by case), so amounts stay unknown. No per-award page either: the
 * catalogue is one ASP.NET search, and every award is applied for through the
 * single OSAC application, so that application is the honest `url` for each
 * row. Rows dedup on sponsor + title, not URL, so a shared URL is safe here.
 *
 * DEADLINE. Stated once, for the whole cycle, on the application page:
 * "March 1*: Final deadline for all materials to be submitted to OSAC". The
 * year comes from the catalogue's own heading ("2027-28 OSAC Scholarship
 * Catalog"), so nothing is hard-coded; if either sentence stops matching, the
 * deadline becomes null rather than a guess.
 *
 * PAGING. 50 entries a page via ASP.NET postbacks. Each page is requested by
 * replaying the previous page's hidden form fields with `__EVENTTARGET` set to
 * the next page button, which is exactly what the browser's link does.
 */

import { getText, USER_AGENT } from "../ingest/http";
import { htmlToText } from "../ingest/html";
import { parseAmount } from "./amount";
import type { ScholarshipListing } from "./types";

const CATALOG_URL = "https://osacapps.hecc.oregon.gov/Catalog/Default.aspx";
const APPLICATION_URL = "https://oregonstudentaid.gov/scholarships/osac-scholarship-application/";
const SPONSOR = "Oregon Office of Student Access and Completion (OSAC)";
/** The catalogue had 13 pages on 2026-11-10; a runaway paginator stops here. */
const MAX_PAGES = 40;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The cycle's first year from "2027-28 OSAC Scholarship Catalog". */
export function catalogCycleYear(html: string): number | null {
  const m = html.match(/(20\d{2})\s*[-–]\s*\d{2}\s+OSAC Scholarship Catalog/i);
  return m ? Number(m[1]) : null;
}

/** "March 1*: Final deadline for all materials…" as a UTC date in the cycle's first year. */
export function finalDeadline(applicationText: string, cycleYear: number | null): Date | null {
  if (!cycleYear) return null;
  const m = applicationText.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\*?\s*:\s*Final deadline/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  const day = Number(m[2]);
  const d = new Date(Date.UTC(cycleYear, month, day));
  return d.getUTCMonth() === month && d.getUTCDate() === day ? d : null;
}

const clean = (s: string) => (htmlToText(s) ?? "").replace(/\s+/g, " ").trim();

/** Entries on one catalogue page. Pure, so it is testable against captured markup. */
export function parseCatalogPage(html: string, deadlineAt: Date | null): ScholarshipListing[] {
  const out: ScholarshipListing[] = [];
  for (const block of html.split(/<fieldset>/i).slice(1)) {
    const legend = block.match(/<legend>\s*(\d{1,5}):\s*([\s\S]*?)<\/legend>/i);
    if (!legend) continue;
    const id = legend[1];
    const title = clean(legend[2]);
    if (!title) continue;
    const body = block.split(/<\/fieldset>/i)[0];
    const lines: string[] = [];
    for (const li of body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const line = clean(li[1]);
      if (line) lines.push(line);
    }
    const amount = parseAmount(lines.join(" "));
    out.push({
      source: "osac",
      sourceId: id,
      title,
      url: APPLICATION_URL,
      sponsorName: SPONSOR,
      amountMin: amount.amountPerAwardMin,
      amountMax: amount.amountPerAwardMax,
      amountNeedsReview: amount.needsReview,
      amountStatus: amount.status,
      programTotal: amount.programTotal,
      awardsCount: amount.awardsCount,
      amountIsEstimated: amount.isEstimated,
      eligibility: lines,
      deadlineAt,
      // Listed in the current cycle's catalogue; absence on a later crawl is
      // the closure signal, as for UNL and UNR.
      isOpen: true,
      // OSAC's own award id. Letters around the digits keep the title
      // normaliser's year and requisition rules from stripping it.
      identityKey: `osac award id${id}`,
    });
  }
  return out;
}

/** The hidden ASP.NET fields a postback must carry, decoded. */
export function hiddenFields(html: string): URLSearchParams {
  const body = new URLSearchParams();
  for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) {
    body.set(m[1], m[2].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  }
  return body;
}

/** The postback target of the page-number link for `page` (1-based), when present. */
export function pageTarget(html: string, page: number): string | null {
  const ctrl = page - 1;
  const re = new RegExp(`__doPostBack\\(&#39;(ctl00\\$MainContent\\$SearchPage\\$PageNumbers\\$ctrl${ctrl}\\$PageNumberButton)&#39;`);
  return html.match(re)?.[1] ?? null;
}

export async function fetchScholarships(): Promise<ScholarshipListing[]> {
  const first = await fetch(CATALOG_URL, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
  if (!first.ok) throw new Error(`OSAC catalogue answered ${first.status}`);
  const cookie = (first.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
  let html = await first.text();

  const application = clean(await getText(APPLICATION_URL));
  const deadlineAt = finalDeadline(application, catalogCycleYear(html));

  const byId = new Map<string, ScholarshipListing>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = parseCatalogPage(html, deadlineAt);
    if (!rows.length) throw new Error(`OSAC catalogue page ${page} parsed zero entries`);
    for (const r of rows) if (!byId.has(r.sourceId)) byId.set(r.sourceId, r);
    const next = pageTarget(html, page + 1);
    if (!next) break;
    const form = hiddenFields(html);
    form.set("__EVENTTARGET", next);
    form.set("__EVENTARGUMENT", "");
    const res = await fetch(CATALOG_URL, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: form,
    });
    if (!res.ok) throw new Error(`OSAC catalogue page ${page + 1} answered ${res.status}`);
    html = await res.text();
  }
  return [...byId.values()];
}
