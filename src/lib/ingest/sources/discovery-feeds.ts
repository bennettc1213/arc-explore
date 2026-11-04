/** Licensed public APIs supply employer hints, never verified employer listings. */
import { getJson } from "../http";
import { normalizeCompanyName, classifyOpportunity } from "../normalize";
import { checkPublicRobots } from "../robots";

export type DiscoveryFeed = "arbeitnow" | "arbeitnow-uk" | "remoteok" | "themuse";
export interface EmployerHint { key: string; company: string; sourceUrl: string }
export interface FeedResult { provider: DiscoveryFeed; read: number; pages: number; earlyCareerMatches: number; employers: EmployerHint[]; attribution: string; registrationSatisfied: boolean }

const CONFIG = {
  arbeitnow: { origin: "https://www.arbeitnow.com", path: "/api/job-board-api", attribution: "Arbeitnow: link back to the source URL before displaying its data." },
  "arbeitnow-uk": { origin: "https://www.arbeitnow.co.uk", path: "/api/job-board-api", attribution: "Arbeitnow UK: link back to the source URL before displaying its data." },
  remoteok: { origin: "https://remoteok.com", path: "/api", attribution: "Remote OK: display the source name and a follow link to the Remote OK job URL; do not use the logo without permission." },
  themuse: { origin: "https://www.themuse.com", path: "/api/public/jobs", attribution: "The Muse: registered app required beyond testing; content must link back to The Muse." },
} as const;
export const discoveryFeedConfig = (provider: DiscoveryFeed) => CONFIG[provider];

export async function fetchDiscoveryFeed(provider: DiscoveryFeed, options: { maxPages?: number; museKey?: string } = {}): Promise<FeedResult> {
  const config = CONFIG[provider];
  if (!config) throw new Error("Unknown discovery feed");
  const maxPages = options.maxPages ?? 2;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) throw new Error("Discovery API connection limit is 1–5 pages");
  if (provider === "themuse" && !options.museKey && maxPages > 1) throw new Error("Unregistered Muse API access is test-only (one page)");
  await checkPublicRobots(config.origin, [config.path]);
  const employers = new Map<string, EmployerHint>();
  let read = 0, pages = 0, earlyCareerMatches = 0;
  const seenPages = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(config.path, config.origin);
    if (provider === "themuse") {
      url.searchParams.set("page", String(page)); url.searchParams.set("level", "Internship");
      if (options.museKey) url.searchParams.set("api_key", options.museKey);
    } else if (provider !== "remoteok") url.searchParams.set("page", String(page + 1));
    // Never surface a provider URL containing an API credential in an error.
    let data: unknown;
    try { data = (await getJson(url.href, { attempts: 1, timeoutMs: 20_000 })).data; }
    catch { throw new Error(`${provider}: public API request failed; credentials and request URLs withheld`); }
    let rows: Record<string, unknown>[];
    let more = false;
    if (provider === "remoteok") {
      if (!Array.isArray(data) || !data.some(r => r && typeof r === "object" && "legal" in r)) throw new Error("Remote OK API did not publish its expected terms header");
      rows = data.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && "id" in r);
    } else if (provider === "themuse") {
      const response = data as { results?: Record<string, unknown>[]; page?: number; page_count?: number; timed_out?: boolean };
      if (!response || !Array.isArray(response.results) || response.page !== page || response.timed_out) throw new Error("Muse API response was malformed or incomplete");
      rows = response.results; more = page + 1 < (response.page_count ?? 0);
    } else {
      const response = data as { data?: Record<string, unknown>[]; links?: { next?: string } };
      if (!response || !Array.isArray(response.data)) throw new Error("Arbeitnow API response was malformed");
      rows = response.data; more = !!response.links?.next;
    }
    const signature = JSON.stringify(rows.map(r => r.id ?? r.slug));
    if (rows.length && seenPages.has(signature)) throw new Error(`${provider}: repeated API page`);
    seenPages.add(signature); pages++; read += rows.length;
    for (const row of rows) {
      const museCompany = row.company as { name?: string } | undefined;
      const company = provider === "themuse" ? museCompany?.name : provider === "remoteok" ? row.company : row.company_name;
      const refs = row.refs as { landing_page?: string } | undefined;
      const sourceUrl = provider === "themuse" ? refs?.landing_page : row.url;
      const title = provider === "themuse" ? row.name : provider === "remoteok" ? row.position : row.title;
      if (typeof company !== "string" || !company.trim() || typeof sourceUrl !== "string" || typeof title !== "string") continue;
      let parsed: URL;
      try { parsed = new URL(sourceUrl); } catch { continue; }
      if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== new URL(config.origin).hostname.toLowerCase()) continue;
      if (classifyOpportunity(title) !== "other") earlyCareerMatches++;
      const key = `company:${normalizeCompanyName(company)}`;
      if (!employers.has(key)) employers.set(key, { key, company: company.trim(), sourceUrl: parsed.href });
    }
    if (!more || !rows.length) break;
  }
  return { provider, read, pages, earlyCareerMatches, employers: [...employers.values()], attribution: config.attribution, registrationSatisfied: provider !== "themuse" || !!options.museKey };
}
