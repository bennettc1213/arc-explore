/**
 * Tier B — Simplify repo. DISCOVERY ONLY.
 *
 * ## Why this adapter stores no listings
 *
 * The SimplifyJobs repo carries **no license** (GitHub reports `license: null`,
 * and there is no LICENSE file), which under default copyright means all rights
 * reserved — no redistribution permission is granted. Individual facts ("company
 * X has a posting at URL Y") are not copyrightable, but their *compilation* may
 * be.
 *
 * So we use the repo the way it is safest and, as it happens, most useful: as a
 * **directory of employers who hire interns**. We read company names and their
 * apply URLs, infer which ATS each company uses, and enroll them in our
 * registry. Tier A then polls those companies' own boards directly.
 *
 * This is not a compromise. It is strictly better:
 *   - Measured, the repo's own data is 50% older than 30 days and its `active`
 *     flag lags by weeks. Polling the source of truth fixes that.
 *   - We never store or serve their compiled list.
 *
 * The one thing we take is the hardest thing to get: the company list.
 */

import { getJson } from "../http";
import { normalizeCompanyName } from "../normalize";
import type { AtsType } from "@/db/schema";

const LISTINGS_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";

/** Only the two fields we use. Everything else is deliberately ignored. */
interface SimplifyRecord {
  company_name?: string | null;
  url?: string | null;
  company_url?: string | null;
  active?: boolean | null;
  is_visible?: boolean | null;
}

export interface DiscoveredOrg {
  name: string;
  normalizedName: string;
  atsType: AtsType;
  atsSlug: string | null;
  discoveredVia: string;
}

/**
 * Infer the ATS and board slug from an apply URL.
 *
 * Recognised shapes:
 *   boards.greenhouse.io/{slug}/jobs/123
 *   job-boards.greenhouse.io/{slug}/jobs/123
 *   boards.eu.greenhouse.io/{slug}/...
 *   jobs.lever.co/{slug}/{uuid}
 *   jobs.ashbyhq.com/{slug}/{uuid}
 *   {slug}.jobs.ashbyhq.com/...
 *   jobs.smartrecruiters.com/{Slug}/123
 *   any host with ?gh_jid= — a Greenhouse-backed careers page whose slug we
 *   cannot see, so we record the type and leave the slug null.
 */
/** Decodes one path segment, tolerating a malformed escape rather than throwing. */
function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function inferAts(rawUrl: string | null | undefined): {
  atsType: AtsType;
  atsSlug: string | null;
} {
  if (!rawUrl) return { atsType: "unknown", atsSlug: null };

  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { atsType: "unknown", atsSlug: null };
  }

  const host = u.hostname.toLowerCase();
  // `URL.pathname` is percent-ENCODED. A board slug containing a space arrives
  // as "Tools%20for%20Humanity", and every adapter encodes the slug again when
  // building its request — producing "Tools%2520for%2520Humanity" and a 404 on
  // every poll, forever. Decode once here so what we store is the real slug.
  const segments = u.pathname.split("/").filter(Boolean).map(decodeSegment);

  if (host.endsWith("greenhouse.io")) {
    // embed/job_board?for={slug} is an older embed form.
    const forParam = u.searchParams.get("for");
    if (forParam) return { atsType: "greenhouse", atsSlug: forParam };
    // Path artifacts that are not board slugs. "embed" without a `for` param
    // gives us no usable slug, and guessing one produces a 404 on every poll.
    const first = segments[0];
    if (!first || first === "embed" || first === "job_board") {
      return { atsType: "greenhouse", atsSlug: null };
    }
    return { atsType: "greenhouse", atsSlug: first };
  }

  if (host.endsWith("lever.co")) {
    return { atsType: "lever", atsSlug: segments[0] ?? null };
  }

  if (host.endsWith("ashbyhq.com")) {
    // Either jobs.ashbyhq.com/{slug} or {slug}.jobs.ashbyhq.com
    const sub = host.replace(/\.?jobs\.ashbyhq\.com$/, "");
    if (sub && sub !== "jobs") return { atsType: "ashby", atsSlug: sub };
    return { atsType: "ashby", atsSlug: segments[0] ?? null };
  }

  if (host.endsWith("smartrecruiters.com")) {
    return { atsType: "smartrecruiters", atsSlug: segments[0] ?? null };
  }

  // A company-hosted careers page backed by Greenhouse. We know the ATS but not
  // the board slug; the registry can still record the company.
  if (u.searchParams.has("gh_jid")) {
    return { atsType: "greenhouse", atsSlug: null };
  }

  return { atsType: "unknown", atsSlug: null };
}

export interface DiscoveryResult {
  orgs: DiscoveredOrg[];
  /** Total records scanned, for the run log. */
  recordsScanned: number;
  /** Breakdown by ATS, useful for spotting upstream format drift. */
  byAts: Record<string, number>;
}

/**
 * Pull the repo and return the set of employers worth polling.
 *
 * No listing content is retained — see the module note.
 */
export async function discoverOrgs(
  opts: { url?: string; includeInactive?: boolean } = {},
): Promise<DiscoveryResult> {
  const res = await getJson<SimplifyRecord[]>(opts.url ?? LISTINGS_URL, {
    timeoutMs: 120_000,
  });
  const records = Array.isArray(res.data) ? res.data : [];

  // Keyed by normalized name + ats + slug so one company with two boards is
  // preserved, but the same board seen 400 times collapses.
  const seen = new Map<string, DiscoveredOrg>();
  const byAts: Record<string, number> = {};

  for (const r of records) {
    const name = r.company_name?.trim();
    if (!name) continue;
    // Historic/inactive rows still tell us the company hires interns, which is
    // all we take from them. Callers can opt out.
    if (!opts.includeInactive && r.active === false) continue;

    const { atsType, atsSlug } = inferAts(r.url ?? r.company_url);
    const key = `${normalizeCompanyName(name)}::${atsType}::${atsSlug ?? ""}`;
    if (seen.has(key)) continue;

    seen.set(key, {
      name,
      normalizedName: normalizeCompanyName(name),
      atsType,
      atsSlug,
      discoveredVia: "simplify-discovery",
    });
    byAts[atsType] = (byAts[atsType] ?? 0) + 1;
  }

  return { orgs: [...seen.values()], recordsScanned: records.length, byAts };
}
