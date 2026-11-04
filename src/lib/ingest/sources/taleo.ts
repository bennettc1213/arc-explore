/**
 * Validate discovered public Taleo job pages. This is seed coverage, not a full
 * board crawl. The legacy UI's text fields are client-populated, so use only
 * its employer-authored OpenGraph job title; other facts remain unknown.
 */
import { incomplete } from "../contract";
import { getText, mapLimit } from "../http";
import { classifyOpportunity } from "../normalize";
import { checkPublicRobots, robotsAllows } from "../robots";
import type { BoardAdapter, SourcePosting } from "../types";
import { scopedResult, sourcePosting, splitPublicBoard, taleoBoardFromUrl, text } from "./public-board";

export function parseTaleoTitle(html: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map([...m[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(a => [a[1].toLowerCase(), a[3]]));
    if (attrs.get("property") === "og:title" || attrs.get("name") === "og:title") {
      let raw = attrs.get("content");
      if (raw && /%[0-9a-f]{2}/i.test(raw)) { try { raw = decodeURIComponent(raw); } catch { /* Preserve literal percent text. */ } }
      const title = text(raw);
      if (!title || /(?:not available|no longer|job search|find a career)/i.test(title)) return null;
      return title.replace(/^Job Description\s*[-:]\s*/i, "").replace(/\s*\(\d+\)\s*$/, "").trim();
    }
  }
  return null;
}

export function createTaleoAdapter(seedUrls: readonly string[]): BoardAdapter {
  return { name: "taleo", async fetchBoard(slug, opts) {
    const { origin, site } = splitPublicBoard(slug, "taleo");
    const jobs = new Map<string, URL>();
    for (const raw of seedUrls) {
      if (taleoBoardFromUrl(raw) !== slug) continue;
      const u = new URL(raw); const id = u.searchParams.get("job");
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || !u.pathname.endsWith("/jobdetail.ftl")) continue;
      const canonical = new URL(`/careersection/${site}/jobdetail.ftl`, origin); canonical.searchParams.set("job", id); jobs.set(id, canonical);
    }
    if (!jobs.size) return scopedResult([], 0, null, incomplete("malformed_response", 0, null, "No discovered job URLs for this board"));
    const robots = await checkPublicRobots(origin, [...jobs.values()].map(u => u.pathname));
    const postings: SourcePosting[] = [];
    let failed = false, pages = 0;
    await mapLimit([...jobs], 2, async ([id, u]) => {
      if (!robotsAllows(robots, u.pathname + u.search)) { failed = true; return; }
      try {
        const title = parseTaleoTitle(await getText(u.href, { attempts: 1, timeoutMs: 20_000 })); pages++;
        if (!title) return;
        if (classifyOpportunity(title) === "other") return;
        postings.push(sourcePosting("taleo", `${slug}/${id}`, opts?.companyName ?? origin, title, u.href));
      } catch { failed = true; }
    });
    return scopedResult(postings, pages, jobs.size, failed ? incomplete("page_failed", pages, jobs.size) : undefined);
  } };
}
