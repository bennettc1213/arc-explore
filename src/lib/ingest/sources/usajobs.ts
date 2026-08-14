/**
 * USAJobs — the U.S. federal government's official job board.
 *
 *   https://data.usajobs.gov/api/search
 *
 * NOT AN AGGREGATOR, which is why it belongs beside the ATS adapters rather
 * than with Adzuna/Muse/RemoteOK. USAJobs is the authoritative system of
 * record for federal hiring — an announcement is not copied here from
 * somewhere else, this *is* where it lives. Absence from a response therefore
 * carries the same meaning it does on a company's own ATS: the announcement is
 * gone. That is what lets these rows sit in the same freshness tier as Tier A
 * instead of being labelled unverified.
 *
 * WHY `HiringPath=student` IS A SCOPE AND NOT A CLASSIFIER. It is tempting to
 * treat the filter as the answer — it is a structured field, published by the
 * employer, that literally says "student". It does not mean what it looks
 * like. Measured against the live corpus on 2026-08-14, all 102 postings it
 * returns:
 *
 *   - 58 of 102 also list `public` in `HiringPath`: the announcement is open
 *     to everyone and students are merely among the eligible, not its target.
 *   - The 44 that are student-exclusive are no better a signal. That bucket
 *     contains a grade-15 "Physician (Radiology-Diagnostic)", a "Staff
 *     Psychologist" and a "Social Worker" — senior clinical roles that happen
 *     to accept student applicants.
 *   - `PositionOfferingType[].Name` is blank on 91 of them, so the field that
 *     would have said "Internships" outright almost never does.
 *
 * So the hiring path narrows ~800k federal announcements to ~100 candidates,
 * and nothing more. What each one *is* gets decided by `classifyOpportunity`
 * off the title, exactly as it is for every other source — the same rule, for
 * the same reason, with the federal naming convention added to the vocabulary
 * it matches (see INTERNSHIP_RE in ../normalize.ts).
 *
 * ON PAY. USAJobs publishes a real salary range, which almost no ATS does, and
 * it is deliberately dropped here rather than written to `amountMin`/
 * `amountMax`. Those columns currently hold scholarship award dollars, a
 * one-off figure, while `PositionRemuneration` carries a rate whose unit lives
 * in a separate `RateIntervalCode` ("PA" per year, "PH" per hour). Writing 17
 * (dollars/hour) into the same column as 5000 (a scholarship award) would make
 * the feed's "min award" filter quietly wrong in both directions. Pay needs a
 * rate-interval column before it can share that space.
 */

import { htmlToText } from "../html";
import { getJson } from "../http";
import type { SourcePosting } from "../types";

const API_BASE = "https://data.usajobs.gov/api/search";

/** USAJobs caps a page at 500. The student scope is ~100 rows, so this is one
 *  request in practice — the loop exists for the day that changes. */
const PAGE_SIZE = 500;

/** A pagination bug must not walk forever. */
const MAX_PAGES = 10;

/* ------------------------------------------------------------------ *
 * Response shape — only the fields we actually read
 * ------------------------------------------------------------------ */

interface UsaJobsLocation {
  LocationName?: string | null;
}

interface UsaJobsDetails {
  JobSummary?: string | null;
  HiringPath?: string[] | null;
  RemoteIndicator?: boolean | null;
}

export interface UsaJobsDescriptor {
  PositionID?: string | null;
  PositionTitle?: string | null;
  PositionURI?: string | null;
  ApplyURI?: string[] | null;
  OrganizationName?: string | null;
  DepartmentName?: string | null;
  PositionLocation?: UsaJobsLocation[] | null;
  PositionLocationDisplay?: string | null;
  PositionOfferingType?: Array<{ Name?: string | null }> | null;
  PublicationStartDate?: string | null;
  ApplicationCloseDate?: string | null;
  UserArea?: { Details?: UsaJobsDetails | null } | null;
}

interface UsaJobsResponse {
  SearchResult?: {
    SearchResultCount?: number;
    SearchResultCountAll?: number;
    SearchResultItems?: Array<{ MatchedObjectDescriptor?: UsaJobsDescriptor }>;
  };
}

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

/**
 * USAJobs timestamps carry no timezone: `2026-12-31T23:59:59.9970`.
 *
 * `new Date()` reads a bare ISO datetime as *server-local* time, which makes
 * the parsed instant depend on where the ingest happened to run — this laptop
 * (Pacific) and CI (UTC) would store two different moments for one
 * announcement, and a deadline of 11:59pm on the 31st renders as the 1st for
 * anyone reading in UTC. A closing date that moves by a day depending on the
 * machine is exactly the kind of quietly-wrong data the timing score would
 * present with total confidence.
 *
 * So a naive stamp is pinned to UTC. That keeps the calendar date identical to
 * the one USAJobs displays and makes the result deterministic everywhere. It
 * is not the true instant — federal deadlines are Eastern, so we are off by
 * the ET offset — but it is off by hours in a known direction rather than by a
 * day in whichever direction the runner's clock happens to point.
 */
function toDate(v?: string | null): Date | null {
  if (!v) return null;

  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(v);
  const d = new Date(hasZone ? v : `${v}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "Gunter AFB, Alabama" repeated across a dozen bases is still a dozen
 * locations, but the same base listed twice is not. Deduped, order preserved.
 */
function locationsOf(d: UsaJobsDescriptor): string[] {
  const named = (d.PositionLocation ?? [])
    .map((l) => (l?.LocationName ?? "").trim())
    .filter(Boolean);

  const unique = [...new Set(named)];
  if (unique.length > 0) return unique;

  const display = (d.PositionLocationDisplay ?? "").trim();
  return display ? [display] : [];
}

/**
 * The one structured field worth handing the classifier.
 *
 * `PositionOfferingType[].Name` is blank on the overwhelming majority of
 * announcements, but when an agency does fill it in it says "Internships"
 * outright — an employer-authored statement of what the posting is, which is
 * exactly what `classifyOpportunity` accepts a hint for. Free text the agency
 * typed into the same field ("Required to serve for a period of 10 consecutive
 * weeks…") is left for the length guard on the other side to reject.
 */
function employmentHintOf(d: UsaJobsDescriptor): string | null {
  const name = (d.PositionOfferingType ?? [])
    .map((o) => (o?.Name ?? "").trim())
    .find(Boolean);
  return name || null;
}

/**
 * One USAJobs announcement as a `SourcePosting`.
 *
 * Pure and exported so the mapping is testable against a captured payload
 * without touching the network.
 */
export function mapUsaJobsPosting(d: UsaJobsDescriptor): SourcePosting | null {
  const sourceId = (d.PositionID ?? "").trim();
  const title = (d.PositionTitle ?? "").trim();
  // The apply link is what makes a row actionable; without one there is
  // nothing to send a student to, so the row is dropped rather than rendered
  // as a dead end.
  const url = (d.ApplyURI ?? []).find(Boolean)?.trim() || (d.PositionURI ?? "").trim();
  if (!sourceId || !title || !url) return null;

  const details = d.UserArea?.Details ?? {};
  const summary = details.JobSummary ?? null;

  return {
    source: "usajobs",
    sourceId,
    // The hiring office, not the cabinet department: "Air Force Civilian
    // Career Training" is who a student would actually be working for, and
    // "Department of the Air Force" is shared by hundreds of unrelated offices.
    companyName: (d.OrganizationName ?? d.DepartmentName ?? "").trim(),
    title,
    url,
    locations: locationsOf(d),
    // A published boolean, not inferred from location text.
    isRemote: details.RemoteIndicator === true,
    postedAt: toDate(d.PublicationStartDate),
    // A real, employer-stated deadline. Federal announcements nearly always
    // carry one, which is rare enough among our sources to be worth saying.
    deadlineAt: toDate(d.ApplicationCloseDate),
    descriptionText: summary ? htmlToText(summary) : null,
    employmentHint: employmentHintOf(d),
    raw: d,
  };
}

/* ------------------------------------------------------------------ *
 * Fetch
 * ------------------------------------------------------------------ */

function headers(): Record<string, string> {
  const key = process.env.USAJOBS_API_KEY;
  const agent = process.env.USAJOBS_USER_AGENT;

  if (!key || !agent) {
    throw new Error(
      "USAJOBS_API_KEY and USAJOBS_USER_AGENT must both be set — see .env. " +
        "USAJobs requires the registered email address as the User-Agent and " +
        "rejects the request without it.",
    );
  }

  return { Host: "data.usajobs.gov", "User-Agent": agent, "Authorization-Key": key };
}

/**
 * Every federal announcement open to students.
 *
 * Fails loudly rather than returning a partial set: a truncated crawl that
 * silently omitted announcements would read downstream as "these closed", and
 * closing live opportunities on the strength of our own fetch failure is the
 * one thing this pipeline must never do.
 */
export async function fetchUsaJobsStudentPostings(): Promise<SourcePosting[]> {
  const out: SourcePosting[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API_BASE}?HiringPath=student&ResultsPerPage=${PAGE_SIZE}&Page=${page}`;
    const res = await getJson<UsaJobsResponse>(url, { headers: headers() });

    const result = res.data?.SearchResult;
    const items = result?.SearchResultItems ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      const descriptor = item?.MatchedObjectDescriptor;
      if (!descriptor) continue;

      const posting = mapUsaJobsPosting(descriptor);
      // USAJobs repeats an announcement across pages when the underlying set
      // shifts mid-crawl. Deduping on the announcement number keeps that from
      // looking like two openings.
      if (posting && !seen.has(posting.sourceId)) {
        seen.add(posting.sourceId);
        out.push(posting);
      }
    }

    const total = result?.SearchResultCountAll ?? 0;
    if (out.length >= total || items.length < PAGE_SIZE) break;
  }

  return out;
}
