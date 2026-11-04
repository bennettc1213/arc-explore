/**
 * Workable public job widget. No auth required.
 *
 *   https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true
 *
 * The same endpoint Workable's own embeddable careers widget reads, served
 * from a host whose `robots.txt` disallows nothing (checked 2026-11-03).
 * Returns `{ name, description, jobs: [...] }`; `details=true` inlines each
 * job's HTML description, so work-auth detection needs no second request.
 *
 * WHY WORKABLE. Of the 689 active intern-hiring companies in the discovery
 * list whose board we could not read, 38 apply through apply.workable.com
 * (measured 2026-11-03). Workday is the larger prize at 411; this one was
 * cheap and is first only for that reason.
 *
 * THREE THINGS READING LIVE BOARDS FOUND:
 *
 *  1. **The internship signal is `experience`, not `employment_type`.** An
 *     intern role reads `employment_type: "Temporary"` (or "Other", or
 *     "Full-time") beside `experience: "Internship"`. Using the employment type
 *     as the hint would have hidden every one of them from the hint path.
 *  2. **No ETag.** Every poll re-reads the board, as SmartRecruiters does.
 *  3. **An unknown account answers a plain 404**, which the shared HTTP layer
 *     already treats as "learned nothing", never as an empty board.
 */

import { incomplete, validateRows } from "../contract";
import { htmlToText } from "../html";
import { getJson } from "../http";
import type { BoardAdapter, FetchBoardResult, SourcePosting } from "../types";

interface WorkableLocation {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  hidden?: boolean | null;
}

interface WorkableJob {
  title?: string | null;
  shortcode?: string | null;
  employment_type?: string | null;
  experience?: string | null;
  telecommuting?: boolean | null;
  url?: string | null;
  shortlink?: string | null;
  application_url?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  locations?: WorkableLocation[] | null;
  description?: string | null;
}

interface WorkableResponse {
  name?: string | null;
  jobs?: WorkableJob[];
}

/** "2026-10-14" is a calendar date; anchor it at UTC midnight rather than local time. */
function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function place(parts: Array<string | null | undefined>): string | null {
  const s = parts.map((p) => p?.trim()).filter(Boolean).join(", ");
  return s || null;
}

export const workable: BoardAdapter = {
  name: "workable",

  async fetchBoard(slug: string): Promise<FetchBoardResult> {
    const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`;
    const res = await getJson<WorkableResponse>(url, { timeoutMs: 45_000 });

    // A 200 without a `jobs` array is not a board, and must not be read as an
    // empty one: an empty board is the answer that closes listings.
    if (!res.data || !Array.isArray(res.data.jobs)) {
      return {
        postings: [],
        etag: null,
        notModified: false,
        successfulComplete: false,
        completeness: incomplete("malformed_response", 1, null),
      };
    }

    const companyName = res.data.name?.trim() || slug;

    const postings: SourcePosting[] = res.data.jobs.map((j) => {
      const listed = (j.locations ?? []).filter((l) => l && l.hidden !== true);
      const locations = Array.from(
        new Set(
          (listed.length > 0
            ? listed.map((l) => place([l.city, l.region, l.country]))
            : [place([j.city, j.state, j.country])]
          ).filter((x): x is string => Boolean(x)),
        ),
      );
      // `telecommuting` is the only remote signal Workable states. Its absence
      // says nothing about hybrid or on-site, so it never becomes "in_person".
      const remote = j.telecommuting === true;

      return {
        source: "workable",
        sourceId: j.shortcode ?? "",
        companyName,
        title: (j.title ?? "").trim(),
        url: j.shortlink ?? j.url ?? j.application_url ?? "",
        locations,
        isRemote: remote,
        workArrangement: remote ? "remote" : null,
        compensationMinCents: null,
        compensationMaxCents: null,
        compensationInterval: null,
        postedAt: toDate(j.published_on) ?? toDate(j.created_at),
        // Workable exposes no deadline field — null, never guessed.
        deadlineAt: null,
        descriptionText: htmlToText(j.description),
        employmentHint: j.experience?.trim() || j.employment_type?.trim() || null,
        raw: { ...j, description: undefined },
      };
    });

    // Unpaginated, and no total is published, so a well-formed array is the
    // whole board.
    const { valid, rejected } = validateRows(postings);

    return {
      postings: valid,
      etag: null,
      notModified: false,
      successfulComplete: true,
      completeness: { complete: true, pagesFetched: 1, claimedTotal: valid.length },
      rejected,
    };
  },
};
