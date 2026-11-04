/** Rippling's own migrated careers UI uses a public Algolia search index. */
import { incomplete } from "../contract";
import { getJson, getText } from "../http";
import { checkPublicRobots, robotsAllows } from "../robots";
import { parseNextData } from "./public-board";

interface Job {
  jobId?: string; name?: string; url?: string;
  locations?: Array<{ name?: string; workplaceType?: string }>;
}
interface Search { hits?: Job[]; nbHits?: number; nbPages?: number; page?: number }

export async function fetchRipplingCorporate() {
  const origin = "https://www.rippling.com";
  const path = "/careers/open-roles";
  const robots = await checkPublicRobots(origin, [path]);
  const html = await getText(origin + path, { attempts: 1, timeoutMs: 20_000 });
  const data = parseNextData(html) as { props?: { pageProps?: { data?: { algoliaIndexName?: string } } } };
  const index = data.props?.pageProps?.data?.algoliaIndexName;
  const script = html.match(/\bsrc="(\/_next\/static\/chunks\/pages\/_app-[a-zA-Z0-9-]+\.js)"/)?.[1];
  if (index !== "careers_en-US_production" || !script) throw new Error("Unrecognized Rippling corporate careers configuration");
  if (!robotsAllows(robots, script)) throw new Error("Rippling robots excludes public configuration");
  const js = await getText(origin + script, { attempts: 1, timeoutMs: 20_000 });
  // These are the exact public search-client constants shipped to visitors.
  // Never evaluate JavaScript, use an admin operation, or log the client key.
  const config = js.match(/\.env\.ALGOLIA_ENV;let \w+="([A-Z0-9]{10})";\w+\.env\.ALGOLIA_ADMIN_API_KEY;let \w+="([a-f0-9]{32})"/);
  if (!config) throw new Error("Rippling public search client configuration changed");
  const searchOrigin = `https://${config[1]}-dsn.algolia.net`;
  const searchPath = `/1/indexes/${index}/query`;
  await checkPublicRobots(searchOrigin, [searchPath]);
  const jobs = new Map<string, { id: string; name: string; locations: NonNullable<Job["locations"]> }>();
  const signatures = new Set<string>();
  let pages = 0, total: number | null = null;
  let failure: ReturnType<typeof incomplete> | undefined;
  for (let page = 0; page < 10; page++) {
    let d: Search | null;
    try {
      d = (await getJson<Search>(searchOrigin + searchPath, {
        headers: { "x-algolia-application-id": config[1], "x-algolia-api-key": config[2] },
        jsonBody: { query: "intern", hitsPerPage: 100, page }, attempts: 1, timeoutMs: 20_000,
      })).data;
    } catch (e) { if (!pages) throw e; failure = incomplete("page_failed", pages, total); break; }
    if (!d || !Array.isArray(d.hits) || !Number.isSafeInteger(d.nbHits) || d.nbHits! < 0 || !Number.isSafeInteger(d.nbPages) || d.nbPages! < 0 || d.page !== page ||
      (d.nbHits! > 0 && (!d.hits.length || !d.nbPages)) ||
      d.hits.some(j => !j || typeof j.jobId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(j.jobId) || typeof j.name !== "string" || j.url !== `https://ats.rippling.com/rippling/jobs/${j.jobId}` || !Array.isArray(j.locations) || j.locations.some(l => !l || typeof l.name !== "string"))) {
      failure = incomplete("malformed_response", pages, total); break;
    }
    pages++; total = d.nbHits!;
    const signature = JSON.stringify(d.hits);
    if (d.hits.length && signatures.has(signature)) { failure = incomplete("malformed_response", pages, total, "Repeated corporate careers page"); break; }
    signatures.add(signature);
    for (const j of d.hits) {
      const old = jobs.get(j.jobId!);
      const locations = [...(old?.locations ?? []), ...j.locations!];
      jobs.set(j.jobId!, { id: j.jobId!, name: j.name!, locations: [...new Map(locations.map(l => [JSON.stringify(l), l])).values()] });
    }
    if (page + 1 >= d.nbPages!) break;
    if (d.hits.length < 100) { failure = incomplete("short_page", pages, total); break; }
    if (page === 9) failure = incomplete("page_cap_reached", pages, total);
  }
  return { jobs: [...jobs.values()], pages, total, failure };
}
