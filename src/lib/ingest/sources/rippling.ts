/** Employer-published careers page data. No session, candidate data, or private API. */
import { incomplete } from "../contract";
import { getText, mapLimit } from "../http";
import { classifyOpportunity } from "../normalize";
import { checkPublicRobots, robotsAllows } from "../robots";
import type { BoardAdapter, SourcePosting } from "../types";
import { parseNextData, scopedResult, sourcePosting, text } from "./public-board";

interface Location { name?: string; workplaceType?: string }
interface Job { id?: string; name?: string; locations?: Location[] }
interface Page { props?: { pageProps?: { apiData?: { jobBoard?: { companyName?: string }; jobPost?: { uuid?: string; description?: Record<string, unknown> } }; dehydratedState?: { queries?: Array<{ queryKey?: unknown[]; state?: { data?: { items?: Job[]; totalItems?: number; page?: number } } }> } } } }

export const rippling: BoardAdapter = {
  name: "rippling", async fetchBoard(slug, opts) {
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error("Invalid Rippling board slug");
    const origin = "https://ats.rippling.com";
    const robots = await checkPublicRobots(origin, [`/${slug}/jobs`]);
    const jobs = new Map<string, Job>();
    let pages = 0, company = opts?.companyName ?? slug;
    let total: number | null = null;
    let failure: ReturnType<typeof incomplete> | undefined;
    const signatures = new Set<string>();
    for (let page = 0; page < 10; page++) {
      let data: Page;
      try { data = parseNextData(await getText(`${origin}/${slug}/jobs${page ? `?page=${page}` : ""}`, { attempts: 1, timeoutMs: 20_000 })) as Page; }
      catch (e) { if (!pages) throw e; failure = incomplete("page_failed", pages, total); break; }
      const props = data.props?.pageProps;
      const listing = props?.dehydratedState?.queries?.find(q => q.queryKey?.[2] === "job-posts")?.state?.data;
      if (!listing || !Array.isArray(listing.items) || !Number.isSafeInteger(listing.totalItems) || listing.totalItems! < 0 || listing.items.some(j => !j || typeof j.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(j.id) || typeof j.name !== "string")) { failure = incomplete("malformed_response", pages, total); break; }
      pages++; total = listing.totalItems!;
      company = props?.apiData?.jobBoard?.companyName || company;
      const signature = JSON.stringify(listing.items.map(j => j.id));
      if (listing.items.length && signatures.has(signature)) { failure = incomplete("malformed_response", pages, total, "Server did not advance careers page"); break; }
      signatures.add(signature);
      for (const job of listing.items) if (classifyOpportunity(job.name!) !== "other") jobs.set(job.id!, job);
      if (pages * 20 >= total) break;
      if (listing.items.length < 20) { failure = incomplete("short_page", pages, total); break; }
      if (page === 9) failure = incomplete("page_cap_reached", pages, total);
    }
    const postings: SourcePosting[] = [...jobs.values()].map(j => {
      const p = sourcePosting("rippling", `${slug}/${j.id}`, company, j.name!, `${origin}/${slug}/jobs/${j.id}`);
      p.locations = Array.isArray(j.locations) ? j.locations.map(l => l?.name).filter((l): l is string => typeof l === "string" && !!l.trim()) : [];
      const types = Array.isArray(j.locations) ? j.locations.map(l => l?.workplaceType) : [];
      p.workArrangement = types.length && types.every(t => t === "REMOTE") ? "remote" : types.includes("HYBRID") ? "hybrid" : types.length && types.every(t => t === "ON_SITE") ? "in_person" : null;
      p.isRemote = p.workArrangement === "remote";
      p.raw = { id: j.id, name: j.name, locations: j.locations }; return p;
    });
    await mapLimit(postings.slice(0, 30), 2, async p => {
      if (!robotsAllows(robots, new URL(p.url).pathname)) return;
      try {
        const data = parseNextData(await getText(p.url, { attempts: 1, timeoutMs: 15_000 })) as Page;
        const job = data.props?.pageProps?.apiData?.jobPost;
        if (!job || job.uuid !== p.sourceId.split("/").pop() || !job.description) return;
        p.descriptionText = Object.values(job.description).map(text).filter(Boolean).join("\n\n") || null;
      } catch { /* Keep the independently observed listing when enrichment fails. */ }
    });
    return scopedResult(postings, pages, total, failure);
  },
};
