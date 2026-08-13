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

    const postings: SourcePosting[] = (res.data.jobs ?? []).map((j) => {
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

    return { postings, etag: res.etag, notModified: false };
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
