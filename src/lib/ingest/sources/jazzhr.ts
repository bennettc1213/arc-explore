/**
 * JazzHR public career pages (`{slug}.applytojob.com/apply`).
 *
 * JazzHR's JSON API needs the employer's own key, so this reads the public,
 * server-rendered board an applicant sees. robots.txt was read on four boards
 * before writing this (2026-11-10): every one disallows only `/cb` for `*`,
 * leaving `/apply` and each `/apply/{id}/{slug}` job page permitted, and the
 * adapter re-checks robots on every read rather than trusting that sample.
 *
 * Manual-only, like Recruitee: `inferAts` deliberately does not map this
 * host, so Tier B discovery cannot enroll JazzHR boards into the 20-minute
 * Tier A poll — there is no entry for it in `ADAPTERS`, and an enrolled board
 * would fail every poll. `scripts/connect-jazzhr.ts` is the only caller.
 *
 * What a board page carries, measured on stellarscience, fintools, blackcape
 * and spherixglobalinsights: one `<li class="list-group-item">` per opening
 * with a link, a title and a location, and nothing else. So the list is
 * classified on the title alone, and only rows that pass are opened, which
 * keeps a 40-role board from becoming 40 requests. A job page adds the
 * description and two structured fields, "Type" (e.g. "Internship") and
 * "Experience" (e.g. "Student (College)"), which become the employment hint.
 * No date, deadline or pay is published, so those stay null.
 */
import { incomplete } from "../contract";
import { getText } from "../http";
import { classifyOpportunity } from "../normalize";
import { checkPublicRobots, robotsAllows } from "../robots";
import type { BoardAdapter, SourcePosting } from "../types";
import { sourcePosting, text } from "./public-board";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const JOB_ID = /^[A-Za-z0-9]{6,20}$/;
/** A board this large is not a careers page; refuse rather than read it. */
const MAX_ROWS = 2_000;
/** Ceiling on job pages opened per board, the same guest manners as Tier A enrichment. */
const MAX_DETAILS = 40;

/** The board slug from any JazzHR applicant URL, or null. */
export function jazzhrBoardFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    if (!host.endsWith(".applytojob.com")) return null;
    const slug = host.slice(0, -".applytojob.com".length);
    return SLUG.test(slug) && slug !== "www" && slug !== "app" ? slug : null;
  } catch {
    return null;
  }
}

export interface JazzhrListRow {
  id: string;
  path: string;
  title: string;
  location: string | null;
}

/** Parse the openings list. Returns null when the page is not a board. */
export function parseJazzhrBoard(html: string, slug: string): JazzhrListRow[] | null {
  // The employer switched the board off; JazzHR says so in the title. That is a
  // stated fact (no openings), unlike a redirect to jazzhr.com, which is drift.
  if (/<title>\s*JazzHR - Inactive Career Page/i.test(html)) return [];
  if (!/list-group-item-heading/.test(html) && !/page-title-open|Current Openings/i.test(html)) {
    // An empty board still renders its frame; anything else is drift.
    return /resumator/i.test(html) ? [] : null;
  }
  const rows: JazzhrListRow[] = [];
  const seen = new Set<string>();
  const origin = `https://${slug}.applytojob.com`;
  for (const block of html.split(/<li class=["']list-group-item["']>/).slice(1)) {
    const link = block.match(/<h3 class=["']list-group-item-heading["']>\s*<a href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    let url: URL;
    try { url = new URL(link[1], origin); } catch { continue; }
    if (url.origin !== origin) continue;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "apply" || !parts[1] || !JOB_ID.test(parts[1])) continue;
    if (seen.has(parts[1])) continue;
    const title = text(link[2]);
    if (!title) continue;
    seen.add(parts[1]);
    const loc = block.match(/fa-map-marker['"]><\/i>([\s\S]*?)<\/li>/);
    rows.push({ id: parts[1], path: url.pathname, title, location: loc ? text(loc[1]) : null });
    if (rows.length > MAX_ROWS) return null;
  }
  return rows;
}

export interface JazzhrDetail {
  descriptionText: string | null;
  employmentType: string | null;
  experience: string | null;
  location: string | null;
}

/** Description and the structured attributes from one job page. */
export function parseJazzhrJob(html: string): JazzhrDetail {
  const attr = (title: string) => {
    const m = html.match(new RegExp(`<div[^>]*title=["']${title}["'][^>]*>\\s*<i[^>]*></i>([\\s\\S]*?)</div>`));
    return m ? text(m[1]) : null;
  };
  const start = html.search(/<div[^>]*id=["']job-description["'][^>]*>/);
  let descriptionText: string | null = null;
  if (start >= 0) {
    const open = html.indexOf(">", start) + 1;
    const end = html.indexOf("job-application-form-container", open);
    const body = html.slice(open, end > open ? html.lastIndexOf("<div", end) : open + 40_000);
    descriptionText = text(body)?.slice(0, 40_000) || null;
  }
  return { descriptionText, employmentType: attr("Type"), experience: attr("Experience"), location: attr("Location") };
}

export const jazzhr: BoardAdapter = {
  name: "jazzhr",
  async fetchBoard(slug, opts) {
    if (!SLUG.test(slug)) throw new Error("Invalid JazzHR board slug");
    const origin = `https://${slug}.applytojob.com`;
    const robots = await checkPublicRobots(origin, ["/apply"]);
    const rows = parseJazzhrBoard(await getText(`${origin}/apply`, { attempts: 2 }), slug);
    if (!rows) {
      return { postings: [], etag: null, notModified: false, absenceAuthoritative: false, successfulComplete: false,
        completeness: incomplete("malformed_response", 1) };
    }
    const company = opts?.companyName;
    if (!company) throw new Error("JazzHR boards need the employer name from discovery");

    const candidates = rows.filter(r => classifyOpportunity(r.title, null) !== "other").slice(0, MAX_DETAILS);
    const postings: SourcePosting[] = [];
    for (const row of candidates) {
      if (!robotsAllows(robots, row.path)) continue;
      const p = sourcePosting("jazzhr", `${slug}/${row.id}`, company, row.title, `${origin}${row.path}`);
      p.locations = row.location ? [row.location] : [];
      try {
        const detail = parseJazzhrJob(await getText(`${origin}${row.path}`, { attempts: 2 }));
        p.descriptionText = detail.descriptionText;
        // "Type" is the employer's own field, kept as the structured hint.
        p.employmentHint = detail.employmentType;
        if (!p.locations.length && detail.location) p.locations = [detail.location];
        p.raw = { id: row.id, type: detail.employmentType, experience: detail.experience };
      } catch {
        // A job page that will not load keeps the list facts; nothing is guessed.
        p.raw = { id: row.id };
      }
      p.isRemote = p.locations.some(l => /\bremote\b/i.test(l));
      postings.push(p);
    }
    return { postings, etag: null, notModified: false, absenceAuthoritative: false, successfulComplete: true,
      completeness: { complete: true, pagesFetched: 1 + candidates.length, claimedTotal: rows.length, scope: "board" } };
  },
};
