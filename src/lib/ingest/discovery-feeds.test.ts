import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { fetchDiscoveryFeed } from "./sources/discovery-feeds";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const json = (value: unknown) => new Response(JSON.stringify(value));

it("Arbeitnow creates employer hints with source links, not copied verified jobs", async () => {
  let calls = 0;
  globalThis.fetch = async input => {
    const url = String(input); if (url.endsWith("robots.txt")) return new Response(""); calls++;
    return json({ data: [
      { slug: "1", company_name: "Acme Inc.", title: "Engineering Intern", description: "Do not retain this in an employer hint", url: "https://www.arbeitnow.com/jobs/1" },
      { slug: "2", company_name: "Acme Inc.", title: "Analyst", url: "https://www.arbeitnow.com/jobs/2" },
      { slug: "3", company_name: "Spoofed", title: "Intern", url: "https://evil.test/jobs/3" },
    ], links: { next: null } });
  };
  const result = await fetchDiscoveryFeed("arbeitnow");
  assert.equal(calls, 1); assert.equal(result.employers.length, 1); assert.equal(result.earlyCareerMatches, 1);
  assert.deepEqual(Object.keys(result.employers[0]).sort(), ["company", "key", "sourceUrl"]);
  assert.match(result.attribution, /link back/);
});

it("Remote OK requires its API terms header and preserves the required attribution", async () => {
  globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : json([{ legal: "Required attribution" }, { id: 123, company: "Acme", position: "Intern", url: "https://remoteok.com/remote-jobs/123" }]);
  const result = await fetchDiscoveryFeed("remoteok");
  assert.equal(result.read, 1); assert.equal(result.employers.length, 1); assert.match(result.attribution, /follow link/);
  globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : json([{ id: 123 }]);
  await assert.rejects(fetchDiscoveryFeed("remoteok"), /terms header/);
});

it("Muse without registration is limited to one test page and does not claim registration satisfied", async () => {
  await assert.rejects(fetchDiscoveryFeed("themuse", { maxPages: 2 }), /test-only/);
  globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : json({ page: 0, page_count: 2, results: [{ id: 1, name: "Engineering Intern", company: { name: "Acme" }, refs: { landing_page: "https://www.themuse.com/jobs/acme/intern" } }] });
  const result = await fetchDiscoveryFeed("themuse", { maxPages: 1 });
  assert.equal(result.registrationSatisfied, false); assert.equal(result.pages, 1);
});

it("API request failures do not expose credentials embedded in provider URLs", async () => {
  globalThis.fetch = async input => { if (String(input).endsWith("robots.txt")) return new Response(""); throw new Error(String(input)); };
  await assert.rejects(fetchDiscoveryFeed("themuse", { maxPages: 1, museKey: "test-secret-sentinel" }), e => {
    assert.doesNotMatch(String(e), /test-secret-sentinel|api_key=/); return true;
  });
});
