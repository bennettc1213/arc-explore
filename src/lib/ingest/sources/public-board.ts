import { htmlToText } from "../html";
import type { SourceName, SourcePosting, FetchBoardResult } from "../types";

export function oracleBoardFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !/^[a-z0-9.-]+\.oraclecloud\.com$/.test(u.hostname)) return null;
    const site = u.pathname.match(/^\/hcmUI\/CandidateExperience\/[^/]+\/sites\/([a-zA-Z0-9_-]+)(?:\/|$)/)?.[1];
    return site ? `${u.hostname}/${site}` : null;
  } catch { return null; }
}

export function taleoBoardFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !/^[a-z0-9-]+\.taleo\.net$/.test(u.hostname)) return null;
    const site = u.pathname.match(/^\/careersection\/([a-zA-Z0-9_-]+)\//)?.[1];
    return site ? `${u.hostname}/${site}` : null;
  } catch { return null; }
}

export function splitPublicBoard(slug: string, kind: "oracle" | "taleo") {
  const [host, site, ...extra] = slug.split("/");
  if (extra.length || !host || !site) throw new Error(`Invalid ${kind} board`);
  const origin = `https://${host}`;
  const verify = kind === "oracle" ? oracleBoardFromUrl(`${origin}/hcmUI/CandidateExperience/en/sites/${site}`) : taleoBoardFromUrl(`${origin}/careersection/${site}/jobsearch.ftl`);
  if (verify !== slug) throw new Error(`Invalid ${kind} board`);
  return { host, site, origin };
}

export function sourcePosting(source: SourceName, sourceId: string, company: string, title: string, url: string): SourcePosting {
  return { source, sourceId, companyName: company, title: title.trim(), url, locations: [], isRemote: false, workArrangement: null,
    compensationMinCents: null, compensationMaxCents: null, compensationInterval: null, postedAt: null, deadlineAt: null,
    descriptionText: null, employmentHint: null, raw: {} };
}

export function isoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseNextData(html: string): Record<string, unknown> {
  const data = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!data) throw new Error("Public careers page has no structured page data");
  return JSON.parse(data);
}

export function scopedResult(postings: SourcePosting[], pages: number, total: number | null = null, failure?: FetchBoardResult["completeness"]): FetchBoardResult {
  return { postings, notModified: false, etag: null, absenceAuthoritative: false, successfulComplete: !failure,
    completeness: { ...(failure ?? { complete: true, pagesFetched: pages, claimedTotal: total }), scope: "search" } };
}

/** Parse only the employer-published JobPosting schema, never unrelated JSON. */
export function jobPostingSchemas(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (!v || typeof v !== "object") return;
    const row = v as Record<string, unknown>;
    if (row["@type"] === "JobPosting") found.push(row);
    if (row["@graph"]) visit(row["@graph"]);
  };
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1])); } catch { /* A broken block does not validate a different block. */ }
  }
  return found;
}

export const text = (value: unknown): string | null => typeof value === "string" ? htmlToText(value) : null;
