/** Public Oracle Candidate Experience search; never authoritative for absence. */
import { incomplete } from "../contract";
import { getJson, mapLimit } from "../http";
import { classifyOpportunity } from "../normalize";
import { checkPublicRobots, robotsAllows } from "../robots";
import type { BoardAdapter, SourcePosting } from "../types";
import { isoDate, scopedResult, sourcePosting, splitPublicBoard, text } from "./public-board";

interface Job { Id?: string; Title?: string; PrimaryLocation?: string; PostedDate?: string; PostingEndDate?: string; ShortDescriptionStr?: string; WorkplaceTypeCode?: string; JobType?: string }
interface Response { items?: Array<{ TotalJobsCount?: number; requisitionList?: Job[] }> }
interface Details { items?: Array<{ Id?: string; ExternalDescriptionStr?: string; ExternalQualificationsStr?: string; ExternalResponsibilitiesStr?: string; ExternalPostedStartDate?: string; ExternalPostedEndDate?: string; RequisitionType?: string }> }

export function createOracleAdapter(options: { detailLimit?: number } = {}): BoardAdapter {
  return { name: "oracle", async fetchBoard(slug, opts) {
    const { origin, host, site } = splitPublicBoard(slug, "oracle");
    const path = "/hcmRestApi/resources/latest/recruitingCEJobRequisitions";
    const robots = await checkPublicRobots(origin, [path, `/hcmUI/CandidateExperience/en/sites/${site}/`]);
    const jobs = new Map<string, Job>();
    let pages = 0;
    let failure: ReturnType<typeof incomplete> | undefined;
    let total: number | null = null;
    for (const keyword of ["intern", "co-op"]) {
      const signatures = new Set<string>();
      let offset = 0;
      for (let page = 0; page < 10; page++) {
        const url = new URL(path, origin);
        url.searchParams.set("onlyData", "true"); url.searchParams.set("expand", "requisitionList");
        url.searchParams.set("finder", `findReqs;siteNumber=${site},limit=100,offset=${offset},keyword=${keyword}`);
        let body: Response | null;
        try { body = (await getJson<Response>(url.href, { attempts: 1, timeoutMs: 20_000 })).data; }
        catch (e) { if (!pages) throw e; failure = incomplete("page_failed", pages, total); break; }
        const data = body?.items?.[0];
        if (!data || !Array.isArray(data.requisitionList) || !Number.isSafeInteger(data.TotalJobsCount) || data.TotalJobsCount! < 0) { failure = incomplete("malformed_response", pages, total); break; }
        pages++; total = data.TotalJobsCount!;
        if (data.requisitionList.some(j => !j || typeof j.Id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(j.Id) || typeof j.Title !== "string")) { failure = incomplete("malformed_response", pages, total); break; }
        const signature = JSON.stringify(data.requisitionList.map(j => j.Id));
        if (data.requisitionList.length && signatures.has(signature)) { failure = incomplete("malformed_response", pages, total, "Repeated search page"); break; }
        signatures.add(signature);
        const early = data.requisitionList.filter(j => classifyOpportunity(j.Title!, j.JobType) !== "other");
        for (const job of early) jobs.set(job.Id!, job);
        offset += data.requisitionList.length;
        if (offset >= total) break;
        if (!data.requisitionList.length) { failure = incomplete("short_page", pages, total); break; }
        if (!early.length) break;
        if (page === 9) failure = incomplete("page_cap_reached", pages, total);
      }
      if (failure) break;
    }
    const postings: SourcePosting[] = [...jobs.values()].map(j => {
      const p = sourcePosting("oracle", `${host}/${site}/${j.Id}`, opts?.companyName || host.split(".")[0], j.Title!, `${origin}/hcmUI/CandidateExperience/en/sites/${site}/job/${j.Id}`);
      p.locations = j.PrimaryLocation ? [j.PrimaryLocation] : [];
      p.workArrangement = ({ ORA_REMOTE: "remote", ORA_HYBRID: "hybrid", ORA_ON_SITE: "in_person" } as const)[j.WorkplaceTypeCode as "ORA_REMOTE"] ?? null;
      p.isRemote = p.workArrangement === "remote";
      p.postedAt = isoDate(j.PostedDate); p.deadlineAt = isoDate(j.PostingEndDate);
      p.descriptionText = text(j.ShortDescriptionStr); p.employmentHint = j.JobType ?? null; p.raw = j;
      return p;
    });
    const detailPath = "/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails";
    if (robotsAllows(robots, detailPath)) await mapLimit(postings.slice(0, options.detailLimit ?? 20), 2, async p => {
      const id = p.sourceId.split("/").pop()!;
      const url = new URL(detailPath, origin); url.searchParams.set("onlyData", "true"); url.searchParams.set("finder", `ById;Id="${id}",siteNumber=${site}`);
      try {
        const d = (await getJson<Details>(url.href, { attempts: 1, timeoutMs: 15_000 })).data?.items?.[0];
        if (d?.Id !== id) return;
        p.descriptionText = [d.ExternalDescriptionStr, d.ExternalQualificationsStr, d.ExternalResponsibilitiesStr].map(text).filter(Boolean).join("\n\n") || p.descriptionText;
        p.postedAt = isoDate(d.ExternalPostedStartDate) ?? p.postedAt; p.deadlineAt = isoDate(d.ExternalPostedEndDate) ?? p.deadlineAt;
        p.employmentHint = d.RequisitionType ?? p.employmentHint;
      } catch { /* A failed detail request cannot erase a successful observation. */ }
    });
    return scopedResult(postings, pages, total, failure);
  } };
}
export const oracle = createOracleAdapter();
