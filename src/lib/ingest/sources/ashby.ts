/**
 * Ashby public job boards. No auth required.
 *
 *   https://api.ashbyhq.com/posting-api/job-board/{slug}
 *
 * Ashby ships `descriptionPlain` inline on every row, so work-auth detection
 * needs no second request. The tradeoff is a heavy response on large boards
 * (OpenAI returns 736 jobs with full descriptions), which is why the poller
 * relies on ETags here.
 */

import { getJson } from "../http";
import type { BoardAdapter, FetchBoardResult, SourcePosting } from "../types";

interface AshbyJob {
  id: string;
  title: string;
  location?: string | null;
  secondaryLocations?: Array<{ location?: string | null }> | null;
  publishedAt?: string | null;
  isListed?: boolean | null;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  jobUrl?: string | null;
  applyUrl?: string | null;
  descriptionPlain?: string | null;
  employmentType?: string | null;
  department?: string | null;
  team?: string | null;
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const ashby: BoardAdapter = {
  name: "ashby",

  async fetchBoard(slug: string, opts): Promise<FetchBoardResult> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
    const res = await getJson<AshbyResponse>(url, { etag: opts?.etag, timeoutMs: 45_000 });

    if (res.notModified || !res.data) {
      return { postings: [], etag: res.etag, notModified: true };
    }

    const postings: SourcePosting[] = (res.data.jobs ?? [])
      // isListed === false means the employer has unpublished it.
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const locations = [
          j.location ?? null,
          ...(j.secondaryLocations ?? []).map((s) => s?.location ?? null),
        ].filter((x): x is string => Boolean(x && x.trim()));

        const remote =
          j.isRemote === true ||
          /remote/i.test(j.workplaceType ?? "") ||
          locations.some((l) => /\bremote\b/i.test(l));

        return {
          source: "ashby",
          sourceId: j.id,
          companyName: slug,
          title: (j.title ?? "").trim(),
          url: j.jobUrl ?? j.applyUrl ?? "",
          locations,
          isRemote: remote,
          postedAt: toDate(j.publishedAt),
          // Ashby exposes no deadline field — null, never guessed.
          deadlineAt: null,
          descriptionText: j.descriptionPlain?.replace(/\s+/g, " ").trim() ?? null,
          employmentHint: j.employmentType ?? null,
          raw: { ...j, descriptionPlain: undefined },
        };
      });

    return { postings, etag: res.etag, notModified: false };
  },
};
