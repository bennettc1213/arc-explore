import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { recruitee, recruiteeBoardFromUrl } from "./sources/recruitee";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const job = (extra: Record<string, unknown> = {}) => ({ id: 123, slug: "engineering-intern", title: "Engineering Intern",
  company_name: "Acme", status: "published", description: "<p>Build things.</p>", requirements: "<p>Enrolled student.</p>",
  employment_type_code: "internship", published_at: "2026-11-01 12:34:56 UTC", close_at: null,
  locations: [{ city: "Boston", state: "Massachusetts", country: "United States" }],
  remote: false, hybrid: true, on_site: false, salary: { min: "20.25", max: "25", period: "hour", currency: "USD" }, ...extra });
function serve(data: unknown, robots = "User-agent: *\nDisallow: /v/", status = 200) {
  const requests: string[] = [];
  globalThis.fetch = async input => {
    requests.push(String(input));
    return String(input).endsWith("robots.txt") ? new Response(robots) : new Response(JSON.stringify(data), { status });
  };
  return requests;
}

it("accepts only employer Recruitee HTTPS coordinates", () => {
  assert.equal(recruiteeBoardFromUrl("https://acme.recruitee.com/l/en/o/intern"), "acme");
  for (const url of ["https://acme.recruitee.com.evil.test/o/a", "https://user@acme.recruitee.com", "http://acme.recruitee.com", "https://acme.recruitee.com:444", "https://nested.acme.recruitee.com"]) assert.equal(recruiteeBoardFromUrl(url), null);
});

it("maps employer fields, UTC dates and USD pay without retaining application config", async () => {
  const requests = serve({ offers: [job({ mailbox_email: "private@test", open_questions: ["not stored"], careers_url: "https://wrong.test" })] });
  const result = await recruitee.fetchBoard("acme");
  assert.equal(result.successfulComplete, true); assert.equal(result.absenceAuthoritative, false);
  assert.equal(result.completeness?.claimedTotal, 1);
  const p = result.postings[0];
  assert.equal(p.sourceId, "acme/123"); assert.equal(p.url, "https://acme.recruitee.com/o/engineering-intern");
  assert.equal(p.postedAt?.toISOString(), "2026-11-01T12:34:56.000Z"); assert.equal(p.deadlineAt, null);
  assert.equal(p.compensationMinCents, 2025); assert.equal(p.compensationMaxCents, 2500);
  assert.equal(p.workArrangement, "hybrid"); assert.deepEqual(p.locations, ["Boston, Massachusetts, United States"]);
  assert.match(p.descriptionText!, /Build things\.[\s\S]*Enrolled student\./);
  assert.doesNotMatch(JSON.stringify(p.raw), /private@test|not stored/);
  assert.equal(requests.length, 2);
});

it("filters unpublished and unrelated jobs using title or structured employment only", async () => {
  serve({ offers: [job(), job({ id: 124, status: "draft" }), job({ id: 125, title: "International Director", employment_type_code: "fulltime_permanent", description: "Mentor interns" }), job({ id: 126, title: "Campus Program" })] });
  assert.deepEqual((await recruitee.fetchBoard("acme")).postings.map(p => p.sourceId), ["acme/123", "acme/126"]);
});

it("does not store foreign/monthly pay, zero or inverted ranges, or invent a single work model", async () => {
  for (const salary of [{ min: "2000", max: "3000", period: "month", currency: "USD" },
    { min: "20", max: "30", period: "hour", currency: "EUR" },
    { min: "30", max: "20", period: "hour", currency: "USD" },
    { min: "20", max: null, period: "hour", currency: "USD" },
    { min: null, max: "30", period: "hour", currency: "USD" },
    { min: "999999999999", max: "999999999999", period: "year", currency: "USD" },
    { min: "0", max: null, period: "hour", currency: "USD" }]) {
    serve({ offers: [job({ salary, remote: true, hybrid: true, published_at: "Yesterday" })] });
    const p = (await recruitee.fetchBoard("acme")).postings[0];
    assert.equal(p.compensationMinCents, null); assert.equal(p.compensationMaxCents, null);
    assert.equal(p.compensationInterval, null); assert.equal(p.workArrangement, null); assert.equal(p.isRemote, true);
    assert.equal(p.postedAt, null);
  }
});

it("holds malformed responses and duplicate identity while accepting explicit empty boards", async () => {
  for (const body of [{}, { offers: null }, { offers: [job(), job()] }, { offers: [job({ id: "123" })] }, { offers: [job({ slug: "../escape" })] }, { offers: [null] }]) {
    serve(body); const r = await recruitee.fetchBoard("acme");
    assert.equal(r.successfulComplete, false); assert.equal(r.postings.length, 0);
  }
  serve({ offers: [] }); assert.equal((await recruitee.fetchBoard("acme")).successfulComplete, true);
});

it("respects robots and authentication failures without attempting alternate access", async () => {
  const requests = serve({ offers: [job()] }, "User-agent: *\nDisallow: /api/");
  await assert.rejects(recruitee.fetchBoard("acme"), /robots/); assert.equal(requests.length, 1);
  serve({ offers: [job()] }, "User-agent: *\nDisallow: /o/");
  await assert.rejects(recruitee.fetchBoard("acme"), /robots/);
  const blocked = serve({ error: "Unauthorized" }, "", 401);
  await assert.rejects(recruitee.fetchBoard("acme"), /401/); assert.equal(blocked.length, 2);
});
