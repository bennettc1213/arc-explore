/** Manual public careers API connection. Per-employer tokens become mandatory
 * on 2027-02-10: https://docs.recruitee.com/reference/authentication-1
 * No account endpoints, candidate data, or application submissions are used. */
import { incomplete } from "../contract";
import { getJson } from "../http";
import { classifyOpportunity } from "../normalize";
import { checkPublicRobots, robotsAllows } from "../robots";
import type { BoardAdapter, SourcePosting } from "../types";
import { isoDate, sourcePosting, text } from "./public-board";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const JOB_SLUG = /^[a-zA-Z0-9_-]+$/;

export function recruiteeBoardFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const slug = u.hostname.slice(0, -".recruitee.com".length);
    return u.protocol === "https:" && !u.username && !u.password && !u.port &&
      u.hostname.endsWith(".recruitee.com") && SLUG.test(slug) ? slug : null;
  } catch { return null; }
}

type Row = Record<string, unknown>;
const record = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);

/** Recruitee publishes explicit UTC timestamps, not locale-relative dates. */
function date(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(value)
    ? value.replace(" ", "T").replace(" UTC", "Z") : value;
  return isoDate(normalized);
}

function cents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const n = Math.round(Number(value) * 100);
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

export const recruitee: BoardAdapter = {
  name: "recruitee",
  async fetchBoard(slug, opts) {
    if (!SLUG.test(slug)) throw new Error("Invalid Recruitee board slug");
    const origin = `https://${slug}.recruitee.com`;
    const robots = await checkPublicRobots(origin, ["/api/offers"]);
    const response = await getJson<unknown>(`${origin}/api/offers`, { attempts: 1, timeoutMs: 30_000 });
    const data = response.data;
    const malformed = () => ({ postings: [], etag: null, notModified: false,
      absenceAuthoritative: false, successfulComplete: false,
      completeness: incomplete("malformed_response", 1) });
    // The documented endpoint returns the full published collection, without
    // pagination. Any shape/identity drift holds the whole manual import.
    if (!record(data) || !Array.isArray(data.offers) || data.offers.length > 20_000) return malformed();
    const seen = new Set<number>();
    const postings: SourcePosting[] = [];
    for (const row of data.offers) {
      if (!record(row) || typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id <= 0 ||
          typeof row.title !== "string" || !row.title.trim() ||
          typeof row.slug !== "string" || !JOB_SLUG.test(row.slug) ||
          typeof row.status !== "string" || seen.has(row.id)) return malformed();
      seen.add(row.id);
      if (row.status !== "published") continue;
      const hint = typeof row.employment_type_code === "string" ? row.employment_type_code : null;
      if (classifyOpportunity(row.title, hint) === "other") continue;
      const path = `/o/${row.slug}`;
      if (!robotsAllows(robots, path)) throw new Error("Public Recruitee job path excluded by robots.txt");
      // Some feeds return a custom careers_url that resolves to the employer's
      // homepage. The board-hosted public job route preserves a usable identity.
      const company = text(row.company_name) || opts?.companyName;
      if (!company) return malformed();
      const p = sourcePosting("recruitee", `${slug}/${row.id}`, company, text(row.title)!, `${origin}${path}`);
      const locations = Array.isArray(row.locations) ? row.locations : [];
      p.locations = [...new Set(locations.filter(record).map(l =>
        [text(l.city), text(l.state), text(l.country)].filter(Boolean).join(", ") || text(l.name) || "").filter(Boolean))];
      if (!p.locations.length && text(row.location)) p.locations = [text(row.location)!];
      p.isRemote = row.remote === true;
      const models = [row.remote === true ? "remote" : null, row.hybrid === true ? "hybrid" : null,
        row.on_site === true ? "in_person" : null].filter(Boolean);
      p.workArrangement = models.length === 1 ? models[0] as SourcePosting["workArrangement"] : null;
      p.employmentHint = hint;
      p.postedAt = date(row.published_at);
      p.deadlineAt = date(row.close_at);
      p.descriptionText = [text(row.description), text(row.requirements)].filter(Boolean).join("\n\n") || null;
      // The shared compensation columns are USD; other currencies must not be
      // silently presented as dollars. Monthly salaries are unsupported too.
      if (record(row.salary) && row.salary.currency === "USD" && ["hour", "year"].includes(String(row.salary.period))) {
        const min = cents(row.salary.min), max = cents(row.salary.max);
        // The database requires both bounds. A lone minimum is not proof of
        // a fixed rate or a maximum; retain the source value only in raw data.
        if (min !== null && max !== null && min <= max) {
          p.compensationMinCents = min; p.compensationMaxCents = max;
          p.compensationInterval = row.salary.period as "hour" | "year";
        }
      }
      // Deliberately omit mailbox addresses, screening questions and form config.
      p.raw = { id: row.id, slug: row.slug, title: row.title, status: row.status,
        published_at: row.published_at, close_at: row.close_at, salary: row.salary,
        employment_type_code: hint };
      postings.push(p);
    }
    return { postings, etag: null, notModified: false, absenceAuthoritative: false, successfulComplete: true,
      completeness: { complete: true, pagesFetched: 1, claimedTotal: data.offers.length, scope: "board" } };
  },
};
