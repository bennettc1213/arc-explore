import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { rippling } from "./sources/rippling";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const json = (d: unknown) => new Response(JSON.stringify(d));
const next = (d: unknown) => new Response(`<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: d } })}</script>`);
const hit = (id: string, name = "Software Engineering Intern", city = "New York") => ({
  jobId: id, name, url: `https://ats.rippling.com/rippling/jobs/${id}`, locations: [{ name: city, workplaceType: "ON_SITE" }],
});
function mockSearch(search: (page: number) => Response, robots = "") {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("robots.txt")) return new Response(robots);
    if (url.endsWith("/careers/open-roles")) return new Response('<script src="/_next/static/chunks/pages/_app-123.js"></script><script id="__NEXT_DATA__">{"props":{"pageProps":{"data":{"algoliaIndexName":"careers_en-US_production"}}}}</script>');
    if (url.endsWith("_app-123.js")) return new Response('d.env.ALGOLIA_ENV;let l="TESTAPP123";d.env.ALGOLIA_ADMIN_API_KEY;let c="00000000000000000000000000000000"');
    if (url.endsWith("/query")) {
      assert.equal(url, "https://TESTAPP123-dsn.algolia.net/1/indexes/careers_en-US_production/query");
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.query, "intern");
      return search(body.page);
    }
    return next({ apiData: { jobPost: { uuid: url.split("/").pop(), description: { role: "<p>Build software.</p>" } } } });
  };
}

it("connects migrated Rippling careers, merges locations and enriches the stable ATS job", async () => {
  mockSearch(() => json({ hits: [hit("one"), hit("one", undefined, "San Francisco"), hit("two", "International Tax Director")], nbHits: 3, nbPages: 1, page: 0 }));
  const r = await rippling.fetchBoard("rippling");
  assert.equal(r.successfulComplete, true);
  assert.equal(r.absenceAuthoritative, false);
  assert.equal(r.postings.length, 1);
  assert.equal(r.postings[0].sourceId, "rippling/one");
  assert.equal(r.postings[0].companyName, "Rippling");
  assert.deepEqual(r.postings[0].locations, ["New York", "San Francisco"]);
  assert.equal(r.postings[0].descriptionText, "Build software.");
  assert.equal(r.postings[0].postedAt, null);
});

it("retains observations but reports partial corporate searches on repeated pages", async () => {
  mockSearch(page => json({ hits: Array.from({ length: 100 }, (_, i) => hit(String(i))), nbHits: 200, nbPages: 2, page }));
  const r = await rippling.fetchBoard("rippling");
  assert.equal(r.successfulComplete, false);
  assert.equal(r.completeness?.reason, "malformed_response");
  assert.equal(r.postings.length, 100);
});

it("rejects unexpected corporate job links and honors the destination robots rules", async () => {
  mockSearch(() => json({ hits: [{ ...hit("one"), url: "https://other.test/job" }], nbHits: 1, nbPages: 1, page: 0 }));
  assert.equal((await rippling.fetchBoard("rippling")).successfulComplete, false);
  mockSearch(() => { throw new Error("search must not run"); }, "User-agent: *\nDisallow: /careers/");
  await assert.rejects(rippling.fetchBoard("rippling"), /robots/);
});
