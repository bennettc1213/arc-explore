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

import { incomplete, validateRows } from "../contract";
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

    if (res.notModified) {
      return { postings: [], etag: res.etag, notModified: true };
    }

// A 200 whose body is not the documented shape means we learned nothing.
      // Distinguishing it from an empty board is the whole point: an empty board
      // is a valid answer, and it is the answer that may close listings.
      //
      // The key must be *present*, not merely well-typed when present. Ashby
      // answers an unknown board with `{"message":"job board not found"}` and no
      // `jobs` key at all, which previously defaulted to `[]` and was reported as
      // a complete empty board — enough to close every Acme listing two polls
      // later. A real empty board carries `{"jobs":[]}`.
      if (!res.data || !Array.isArray(res.data.jobs)) {
      return {
        postings: [],
        etag: res.etag,
        notModified: false,
        successfulComplete: false,
        completeness: incomplete("malformed_response", 1, null),
      };
    }

    const postings: SourcePosting[] = (res.data.jobs ?? [])
      // isListed === false means the employer has unpublished it. That is the
      // employer telling us the row is gone, so it is a legitimate absence and
      // must stay in the poll result rather than being filtered before the
      // lifecycle engine sees it.
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

    // Unpaginated, and Ashby publishes no total on this endpoint, so a
    // well-formed array means we hold the whole board.
    const { valid, rejected } = validateRows(postings);

    return {
      postings: valid,
      etag: res.etag,
      notModified: false,
      successfulComplete: true,
      completeness: { complete: true, pagesFetched: 1, claimedTotal: valid.length },
      rejected,
    };
  },
};
