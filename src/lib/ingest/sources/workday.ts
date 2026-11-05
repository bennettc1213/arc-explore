/**
 * Workday's public careers search (the same CXS requests as its careers UI).
 * Search totals include fuzzy matches such as "International". We page the
 * query "intern" until a page has no internships, or our request cap is hit.
 * This is a SEARCH, never a board mirror: absenceAuthoritative is always false.
 * No cookies, login, anti-bot workarounds, or application submission endpoints.
 */
import { incomplete } from "../contract";
import { htmlToText } from "../html";
import { getJson, getText, HttpError, mapLimit } from "../http";
import { checkPublicRobots as checkRobots, robotsAllows as workdayRobotsAllows } from "../robots";
export { robotsAllows as workdayRobotsAllows } from "../robots";
import { classifyOpportunity } from "../normalize";
import type { BoardAdapter, FetchBoardResult, SourcePosting } from "../types";
import { parseWorkdayBoard, workdayApiFromShell } from "./workday-board";

const PAGE_SIZE = 20;
const MAX_PAGES = 10;
const DETAIL_CAP = 40;

interface SearchJob {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  bulletFields?: string[];
}
interface SearchResponse { total?: number; jobPostings?: SearchJob[] }
interface JobInfo {
  title?: string;
  jobReqId?: string;
  jobDescription?: string;
  location?: string;
  additionalLocations?: string[];
  startDate?: string;
  endDate?: string;
  remoteType?: string;
  canApply?: boolean;
  posted?: boolean;
}
interface DetailResponse { jobPostingInfo?: JobInfo }

function date(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function createWorkdayAdapter(options: { detailLimit?: number; maxPages?: number } = {}): BoardAdapter {
const detailLimit = options.detailLimit ?? DETAIL_CAP;
const maxPages = options.maxPages ?? MAX_PAGES;
if (!Number.isInteger(detailLimit) || detailLimit < 0 || detailLimit > 100 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 250) throw new Error("Invalid Workday request bounds");
return {
  name: "workday",
  async fetchBoard(slug, opts): Promise<FetchBoardResult> {
    const { origin, site, tenant, api: initialApi } = parseWorkdayBoard(slug);
    let api = initialApi;
    const robots = await checkRobots(origin, [`/${site}/`, new URL(api).pathname + "/jobs"]);
    const jobs = new Map<string, SearchJob>();
    const pageSignatures = new Set<string>();
    let pages = 0;
    let total: number | null = null;
    let failure: ReturnType<typeof incomplete> | undefined;
    let rejected = 0;
    for (let page = 0; page < maxPages; page++) {
      let data: SearchResponse | null;
      try {
        const search = () => getJson<SearchResponse>(`${api}/jobs`, {
          headers: { "Accept-Language": "en-US" },
          jsonBody: { appliedFacets: {}, limit: PAGE_SIZE, offset: page * PAGE_SIZE, searchText: "intern" },
          attempts: 2, timeoutMs: 20_000,
        });
        try { data = (await search()).data; }
        catch (e) {
          if (page !== 0 || !(e instanceof HttpError) || e.status !== 422) throw e;
          // Some public hostnames use hyphens while CXS uses underscores.
          // Read the employer's published configuration rather than guessing.
          api = workdayApiFromShell(slug, await getText(`${origin}/${site}/`, { attempts: 1, timeoutMs: 15_000 }));
          if (api === initialApi) throw e;
          if (!workdayRobotsAllows(robots, new URL(api).pathname + "/jobs")) throw new Error("Workday robots excludes configured search");
          data = (await search()).data;
        }
      } catch (e) {
        if (pages === 0) throw e;
        failure = incomplete("page_failed", pages, total); break;
      }
      if (!data || !Array.isArray(data.jobPostings) || typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < 0) {
        failure = incomplete("malformed_response", pages, total); break;
      }
      pages++;
      // Live Workday boards return total: 0 after offset 0 even when that
      // page contains 20 jobs. Only the first page supplies the search total.
      total = page === 0 || data.total > 0 ? data.total : total ?? data.total;
      const rows = data.jobPostings;
      const validRows = rows.filter(j => j && typeof j.title === "string" && typeof j.externalPath === "string" && /^\/job\/[^?#]+$/.test(j.externalPath) && !/(^|\/)\.{1,2}(\/|$)/.test(j.externalPath));
      rejected += rows.length - validRows.length;
      if (rows.length && !validRows.length) {
        failure = incomplete("malformed_response", pages, total); break;
      }
      const signature = JSON.stringify(validRows.map(j => j.externalPath));
      if (rows.length && pageSignatures.has(signature)) {
        failure = incomplete("malformed_response", pages, total, "Repeated search page"); break;
      }
      pageSignatures.add(signature);
      const interns = validRows.filter(j => classifyOpportunity(j.title!) === "internship");
      for (const j of interns) jobs.set(j.externalPath!, j);
      if (page * PAGE_SIZE + rows.length >= total) break;
      if (rows.length < PAGE_SIZE) { failure = incomplete("short_page", pages, total); break; }
      // Workday's fuzzy search can continue through hundreds of irrelevant jobs.
      // Stopping here deliberately trades recall for bounded host load.
      if (!interns.length) break;
      if (pages === maxPages) failure = incomplete("page_cap_reached", pages, total);
    }

    const entries = [...jobs.values()];
    const details = new Map<string, JobInfo>();
    await mapLimit(entries.slice(0, detailLimit), 2, async job => {
      try {
        if (!workdayRobotsAllows(robots, new URL(`${api}${job.externalPath}`).pathname)) return;
        const info = (await getJson<DetailResponse>(`${api}${job.externalPath}`, { headers: { "Accept-Language": "en-US" }, attempts: 1, timeoutMs: 15_000 })).data?.jobPostingInfo;
        if (info && typeof info.title === "string") details.set(job.externalPath!, info);
      } catch { /* Search itself still confirms the job; enrichment may be absent. */ }
    });

    const postings: SourcePosting[] = [];
    for (const job of entries) {
      const info = details.get(job.externalPath!);
      if (info?.canApply === false || info?.posted === false) continue;
      const locations = [info?.location ?? job.locationsText, ...(info?.additionalLocations ?? [])]
        .filter((v): v is string => typeof v === "string" && !!v.trim() && !/^\d+ Locations?$/i.test(v));
      const remoteType = info?.remoteType;
      const arrangement = remoteType && /^remote$/i.test(remoteType) ? "remote" : remoteType && /^hybrid$/i.test(remoteType) ? "hybrid" : null;
      postings.push({
        source: "workday",
        // Requisition ids are only unique inside a tenant. Never use title/path
        // slugs as identity: those can change when a role is renamed.
        sourceId: `${tenant}/${site}/${info?.jobReqId || job.bulletFields?.[0] || job.externalPath!.split("_").pop()}`,
        companyName: opts?.companyName || tenant,
        title: job.title!, url: `${origin}/${site}${job.externalPath}`,
        locations: [...new Set(locations)], isRemote: arrangement === "remote", workArrangement: arrangement,
        compensationMinCents: null, compensationMaxCents: null, compensationInterval: null,
        postedAt: date(info?.startDate), deadlineAt: date(info?.endDate),
        descriptionText: htmlToText(info?.jobDescription), employmentHint: null,
        raw: { ...job, jobReqId: info?.jobReqId, startDate: info?.startDate, endDate: info?.endDate },
      });
    }
    return {
      postings, etag: null, notModified: false,
      absenceAuthoritative: false, successfulComplete: !failure,
      rejected,
      completeness: { ...(failure ?? { complete: true, pagesFetched: pages, claimedTotal: total }), scope: "search" },
    };
  },
};
}

export const workday = createWorkdayAdapter();
