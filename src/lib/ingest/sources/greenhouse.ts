/**
 * Greenhouse public job boards. No auth required.
 *
 *   https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=false
 *
 * Notably provides `first_published`, which is a true posting date rather than
 * a "last touched" timestamp — that is what the timing score wants. It also
 * exposes a real `application_deadline` (usually null; we never invent one).
 *
 * Descriptions are omitted at content=false to keep the poll cheap. Work-auth
 * text is fetched per-job only for postings we actually care about.
 */

import { incomplete, validateRows } from "../contract";
import { htmlToText } from "../html";
import { getJson } from "../http";
import type { BoardAdapter, FetchBoardResult, SourcePosting } from "../types";

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: { name?: string } | null;
  updated_at?: string | null;
  first_published?: string | null;
  application_deadline?: string | null;
  requisition_id?: string | null;
}

interface GhResponse {
  jobs: GhJob[];
  meta?: { total?: number };
}

/** Greenhouse packs multiple cities into one string: "SF, NYC, SEA, CHI". */
function splitLocations(name?: string | null): string[] {
  if (!name) return [];
  return name
    .split(/[;|]|,(?![^(]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const greenhouse: BoardAdapter = {
  name: "greenhouse",

  async fetchBoard(slug: string, opts): Promise<FetchBoardResult> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=false`;
    const res = await getJson<GhResponse>(url, { etag: opts?.etag });

    if (res.notModified || !res.data) {
      return { postings: [], etag: res.etag, notModified: true };
    }

    // A 200 with a body that is not the documented shape is a broken response,
    // not an empty board. Treating it as empty would make every posting on the
    // board look absent, and two polls later the whole registry closes.
    //
    // The key must be *present*, not merely well-typed when present: an error
    // body such as `{"error":"not found"}` has no `jobs` key at all, and
    // defaulting that to `[]` is what previously turned a dead board into a
    // complete empty one. A genuinely empty board returns `{"jobs":[]}`.
    if (!res.data || !Array.isArray(res.data.jobs)) {
      return {
        postings: [],
        etag: res.etag,
        notModified: false,
        successfulComplete: false,
        completeness: incomplete("malformed_response", 1, res.data.meta?.total ?? null),
      };
    }

    const raw = res.data.jobs;

    // Greenhouse publishes `meta.total` for the unpaginated list endpoint. If it
    // disagrees with what arrived, we did not read the whole board.
    const claimedTotal = res.data.meta?.total ?? null;
    const completeness =
      claimedTotal !== null && raw.length < claimedTotal
        ? incomplete("short_page", 1, claimedTotal)
        : { complete: true, pagesFetched: 1, claimedTotal };

    const postings: SourcePosting[] = raw.map((j) => {
      const locations = splitLocations(j.location?.name);
      return {
        source: "greenhouse",
        sourceId: String(j.id),
        companyName: j.company_name?.trim() || slug,
        title: (j.title ?? "").trim(),
        url: j.absolute_url,
        locations,
        isRemote: /\bremote\b/i.test(j.location?.name ?? ""),
        postedAt: toDate(j.first_published) ?? toDate(j.updated_at),
        deadlineAt: toDate(j.application_deadline),
        // content=false: fetched separately for postings we keep.
        descriptionText: null,
        employmentHint: null,
        raw: j,
      };
    });

    // A row without an id cannot be deduplicated on replay; drop it and say so
    // rather than letting it land under a title-derived key.
    const { valid, rejected } = validateRows(postings);

    return {
      postings: valid,
      etag: res.etag,
      notModified: false,
      successfulComplete: completeness.complete,
      completeness,
      rejected,
    };
  },
};

/**
 * Fetch one job's description. Called only for postings that survived the
 * early-career filter, so we download a few dozen JDs per poll rather than
 * every job on the board.
 */
export async function fetchGreenhouseDescription(
  slug: string,
  jobId: string,
): Promise<string | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}`;
  try {
    const res = await getJson<{ content?: string }>(url);
    // Greenhouse returns markup that is itself entity-escaped; htmlToText
    // handles that and ordinary HTML alike.
    return htmlToText(res.data?.content);
  } catch {
    return null;
  }
}
