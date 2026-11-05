/**
 * The foundation's own administered-scholarship page. Public robots lists only
 * sitemaps. Inspected 2026-11-04: five named programs, explicit accepting/closed
 * statements, four individual Jotform application links. No amounts/deadlines
 * are stated; keep those unknown. Do not read forms or any applicant data.
 */
import { htmlToText } from "../ingest/html";
import { getText } from "../ingest/http";
import { checkPublicRobots } from "../ingest/robots";
import type { ScholarshipListing } from "./types";

export const BROWARD_URL = "https://www.cfbroward.org/receive/community-foundation-administered-scholarships";

export function parseBrowardScholarships(html: string): ScholarshipListing[] {
  const content = html.split(/<div\b[^>]*class=["'][^"']*\bnewsletter\b/i)[0];
  const out: ScholarshipListing[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)) {
    const title = htmlToText(match[1])?.trim();
    if (!title || !/scholarship|fund.*education/i.test(title)) continue;
    const body = htmlToText(match[2])?.replace(/\s+/g, " ").trim() ?? "";
    const closed = /APPLICATIONS\s+(?:ARE\s+)?CLOSED/i.test(body);
    const accepting = /ACCEPTING APPLICATIONS/i.test(body);
    if (!closed && !accepting) throw new Error(`Broward scholarship has no explicit application status: ${title}`);
    const url = [...match[2].matchAll(/href=["'](https:\/\/form\.jotform\.com\/[0-9]+)["']/gi)][0]?.[1];
    const sourceId = url?.split("/").pop() ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (seen.has(sourceId)) continue; seen.add(sourceId);
    out.push({ source: "cfbroward", sourceId, title,
      url: url ?? `${BROWARD_URL}#:~:text=${encodeURIComponent(title)}`,
      sponsorName: "Community Foundation of Broward",
      amountMin: null, amountMax: null, amountNeedsReview: false, amountStatus: "varies", programTotal: null,
      awardsCount: null, amountIsEstimated: false,
      eligibility: body ? [body.replace(/CLICK HERE TO APPLY/gi, "").trim()] : [], deadlineAt: null, isOpen: accepting && !closed });
  }
  return out;
}

export async function fetchBrowardScholarships(): Promise<ScholarshipListing[]> {
  await checkPublicRobots("https://www.cfbroward.org", [new URL(BROWARD_URL).pathname]);
  const listings = parseBrowardScholarships(await getText(BROWARD_URL, { attempts: 1, timeoutMs: 20_000 }));
  if (!listings.length) throw new Error("Broward page parsed no scholarships");
  return listings;
}
