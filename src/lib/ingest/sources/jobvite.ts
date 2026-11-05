/** Public customer job boards; Jobvite documents this job-board use explicitly. */
import { incomplete } from "../contract";
import { getText, mapLimit } from "../http";
import { classifyOpportunity } from "../normalize";
import { checkPublicRobots, robotsAllows } from "../robots";
import type { BoardAdapter } from "../types";
import { isoDate, jobPostingSchemas, scopedResult, sourcePosting, text } from "./public-board";

export const jobvite: BoardAdapter = {
  name: "jobvite", async fetchBoard(slug, opts) {
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error("Invalid Jobvite board slug");
    const origin = "https://jobs.jobvite.com";
    const robots = await checkPublicRobots(origin, [`/${slug}/jobs`]);
    const html = await getText(`${origin}/${slug}/jobs`, { attempts: 1, timeoutMs: 20_000 });
    const all = new Map<string, { id: string; title: string }>();
    for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const u = new URL(m[1], origin);
      const parts = u.pathname.match(/^\/([a-zA-Z0-9_-]+)\/job\/([a-zA-Z0-9_-]+)\/?$/);
      if (u.origin !== origin || !parts || parts[1] !== slug) continue;
      const title = text(m[2]); if (title) all.set(parts[2], { id: parts[2], title });
    }
    if (!all.size && !/\b(no (?:current |open )?(?:openings|positions|jobs)|jv-job-list)\b/i.test(html)) return scopedResult([], 1, null, incomplete("malformed_response", 1));
    const postings = [...all.values()].filter(j => classifyOpportunity(j.title) !== "other").map(j => sourcePosting("jobvite", `${slug}/${j.id}`, opts?.companyName ?? slug, j.title, `${origin}/${slug}/job/${j.id}`));
    await mapLimit(postings.slice(0, 50), 2, async p => {
      if (!robotsAllows(robots, new URL(p.url).pathname)) return;
      try {
        const schemas = jobPostingSchemas(await getText(p.url, { attempts: 1, timeoutMs: 15_000 }));
        const s = schemas.find(j => typeof j.title === "string"); if (!s) return;
        p.title = text(s.title) ?? p.title; p.descriptionText = text(s.description);
        p.postedAt = isoDate(s.datePosted); p.deadlineAt = isoDate(s.validThrough);
        const org = s.hiringOrganization as { name?: string } | undefined;
        if (typeof org?.name === "string") p.companyName = org.name;
        const locations = (Array.isArray(s.jobLocation) ? s.jobLocation : [s.jobLocation]) as Array<{ address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }>;
        p.locations = locations.filter(Boolean).map(l => [l.address?.addressLocality, l.address?.addressRegion, l.address?.addressCountry].filter(v => typeof v === "string" && v).join(", ")).filter(Boolean);
        if (s.jobLocationType === "TELECOMMUTE") { p.isRemote = true; p.workArrangement = "remote"; }
        p.employmentHint = typeof s.employmentType === "string" ? s.employmentType : null;
        p.raw = { id: p.sourceId, title: p.title, datePosted: s.datePosted, validThrough: s.validThrough };
      } catch { /* Public board observation is still valid. */ }
    });
    return scopedResult(postings, 1, all.size);
  },
};
