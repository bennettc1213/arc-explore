/**
 * SmartRecruiters public postings. No auth required.
 *
 *   https://api.smartrecruiters.com/v1/companies/{slug}/postings
 *
 * Two things make this adapter different from the other three:
 *
 * 1. Volume. Bosch alone publishes 4,758 roles. Pulling whole boards every 20
 *    minutes would be wasteful and rude, so we use the API's server-side `q=`
 *    filter and only page through early-career matches.
 *
 * 2. Vocabulary. A single `q=intern` misses "Summer Analyst", "Working
 *    Student", "Apprentice". We run a small set of queries and union by id —
 *    still far cheaper than a full board pull.
 *
 * This adapter is also our main foothold in large non-tech enterprises, which
 * is where the business/finance vertical is thinnest.
 */

import { htmlToText } from "../html";
import { getJson, repairMojibake } from "../http";
import type { BoardAdapter, FetchBoardResult, SourcePosting } from "../types";

/**
 * Fetch one posting's job ad text.
 *
 * The list endpoint carries no description at all, which made SmartRecruiters
 * — 57% of the corpus when measured — permanently unknown for work
 * authorization and term, since both are derived from JD text. It is the
 * largest single blind spot in scoring, and this endpoint closes it.
 *
 * Called from the description backfill rather than the poll path: this is one
 * request per posting, and a board like Bosch publishes thousands.
 */
export async function fetchSmartRecruitersDescription(
  slug: string,
  postingId: string,
): Promise<string | null> {
  const url =
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}` +
    `/postings/${encodeURIComponent(postingId)}`;
  try {
    const res = await getJson<SrDetail>(url);
    const sections = res.data?.jobAd?.sections;
    if (!sections) return null;

    // Concatenated because the requirement we are looking for moves around:
    // work authorization is as often in "qualifications" or the boilerplate of
    // "additionalInformation" as in the description proper.
    const text = [
      sections.jobDescription?.text,
      sections.qualifications?.text,
      sections.additionalInformation?.text,
    ]
      .map((t) => htmlToText(t))
      .filter((t): t is string => Boolean(t))
      .join(" ");

    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

interface SrSection {
  title?: string | null;
  text?: string | null;
}

interface SrDetail {
  jobAd?: {
    sections?: {
      companyDescription?: SrSection | null;
      jobDescription?: SrSection | null;
      qualifications?: SrSection | null;
      additionalInformation?: SrSection | null;
    } | null;
  } | null;
}

/** Early-career vocabulary. Kept deliberately small — each term is a request. */
const QUERIES = [
  "intern",
  "internship",
  "co-op",
  "graduate",
  "summer analyst",
  "working student",
  "apprentice",
  "trainee",
] as const;

const PAGE_SIZE = 100;
/** Safety valve so a pathological board cannot spin forever. */
const MAX_PAGES_PER_QUERY = 10;

interface SrLocation {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  address?: string | null;
  fullLocation?: string | null;
  remote?: boolean | null;
  hybrid?: boolean | null;
}

interface SrPosting {
  id: string;
  uuid?: string | null;
  name: string;
  refNumber?: string | null;
  releasedDate?: string | null;
  location?: SrLocation | null;
  company?: { identifier?: string | null; name?: string | null } | null;
  experienceLevel?: { id?: string | null; label?: string | null } | null;
  typeOfEmployment?: { id?: string | null; label?: string | null } | null;
  department?: { label?: string | null } | null;
  function?: { label?: string | null } | null;
}

interface SrResponse {
  content: SrPosting[];
  totalFound?: number;
  limit?: number;
  offset?: number;
}

function formatLocation(loc?: SrLocation | null): string[] {
  if (!loc) return [];
  if (loc.fullLocation?.trim()) {
    // "Antofagasta, , Chile" — collapse the empty region segment.
    const cleaned = loc.fullLocation
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
    if (cleaned) return [cleaned];
  }
  const parts = [loc.city, loc.region, loc.country].filter(
    (x): x is string => Boolean(x && x.trim()),
  );
  return parts.length ? [parts.join(", ")] : [];
}

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const smartrecruiters: BoardAdapter = {
  name: "smartrecruiters",

  async fetchBoard(slug: string): Promise<FetchBoardResult> {
    const byId = new Map<string, SrPosting>();

    for (const q of QUERIES) {
      for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
        const offset = page * PAGE_SIZE;
        const url =
          `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings` +
          `?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}`;

        const res = await getJson<SrResponse>(url);
        const content = res.data?.content ?? [];
        for (const p of content) {
          if (p?.id) byId.set(p.id, p);
        }

        const total = res.data?.totalFound ?? 0;
        if (content.length < PAGE_SIZE || offset + PAGE_SIZE >= total) break;
      }
    }

    const postings: SourcePosting[] = [...byId.values()].map((p) => {
      const companyIdentifier = p.company?.identifier ?? slug;
      const loc = p.location;
      return {
        source: "smartrecruiters",
        sourceId: p.id,
        // Their feed contains double-encoded UTF-8 in places; repair so the
        // employer's name renders as authored.
        companyName: repairMojibake(p.company?.name ?? slug),
        title: repairMojibake((p.name ?? "").trim()),
        // The list response exposes only an API `ref`; this is the human page.
        url: `https://jobs.smartrecruiters.com/${companyIdentifier}/${p.id}`,
        locations: formatLocation(loc),
        isRemote: loc?.remote === true,
        postedAt: toDate(p.releasedDate),
        deadlineAt: null,
        // Not in the list payload; the detail endpoint has it if we ever need it.
        descriptionText: null,
        employmentHint: p.experienceLevel?.label ?? p.experienceLevel?.id ?? null,
        raw: p,
      };
    });

    // This adapter queries rather than mirroring a whole board, so a stable
    // ETag is not meaningful here.
    return { postings, etag: null, notModified: false };
  },
};
