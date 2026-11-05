import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { inferAts } from "./sources/simplify";
import { oracleBoardFromUrl, taleoBoardFromUrl, isoDate } from "./sources/public-board";
import { createOracleAdapter } from "./sources/oracle";
import { rippling } from "./sources/rippling";
import { jobvite } from "./sources/jobvite";
import { createTaleoAdapter, parseTaleoTitle } from "./sources/taleo";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const oracleSlug = "acme.fa.us2.oraclecloud.com/CX_1001";
const oracleJob = (id: string, title = "Engineering Intern") => ({ Id: id, Title: title, PrimaryLocation: "Boston, MA", PostedDate: "2026-11-01", PostingEndDate: "2026-12-01", WorkplaceTypeCode: "ORA_HYBRID" });
const nextPage = (data: unknown) => new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: data } })}</script>`);

describe("public source coordinates", () => {
  it("recognizes Oracle site identity, Taleo sections and the two new careers hosts", () => {
    assert.deepEqual(inferAts("https://acme.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/123"), { atsType: "oracle", atsSlug: oracleSlug });
    assert.deepEqual(inferAts("https://acme.taleo.net/careersection/ex/jobdetail.ftl?job=123"), { atsType: "taleo", atsSlug: "acme.taleo.net/ex" });
    assert.deepEqual(inferAts("https://ats.rippling.com/en-US/acme/jobs/uuid"), { atsType: "rippling", atsSlug: "acme" });
    assert.deepEqual(inferAts("https://jobs.jobvite.com/acme/job/uuid"), { atsType: "jobvite", atsSlug: "acme" });
  });
  it("refuses deceptive hosts, credentials, ports and arbitrary internal endpoints", () => {
    for (const url of ["https://acme.fa.us2.oraclecloud.com.evil.test/hcmUI/CandidateExperience/en/sites/CX", "https://user@acme.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX", "https://acme.fa.us2.oraclecloud.com:444/hcmUI/CandidateExperience/en/sites/CX", "https://127.0.0.1/hcmUI/CandidateExperience/en/sites/CX"]) assert.equal(oracleBoardFromUrl(url), null);
    assert.equal(taleoBoardFromUrl("https://acme.taleo.net.evil.test/careersection/ex/jobdetail.ftl"), null);
    assert.equal(isoDate("Posted 3 Days Ago"), null);
  });
});

describe("Oracle careers search", () => {
  it("advances by actual returned rows and never turns a fuzzy international match into an internship", async () => {
    const offsets: number[] = [];
    globalThis.fetch = async input => {
      const u = new URL(String(input));
      if (u.pathname.endsWith("robots.txt")) return new Response("User-agent: *\nDisallow:");
      const finder = u.searchParams.get("finder")!;
      const offset = Number(finder.match(/offset=(\d+)/)?.[1]); offsets.push(offset);
      if (finder.includes("keyword=co-op")) return json({ items: [{ TotalJobsCount: 0, requisitionList: [] }] });
      return json({ items: [{ TotalJobsCount: 3, requisitionList: offset === 0 ? [oracleJob("1"), oracleJob("2", "International Tax Director")] : [oracleJob("3")] }] });
    };
    const result = await createOracleAdapter({ detailLimit: 0 }).fetchBoard(oracleSlug, { companyName: "Acme" });
    assert.deepEqual(offsets, [0, 2, 0]);
    assert.equal(result.postings.length, 2); assert.equal(result.successfulComplete, true);
    assert.equal(result.absenceAuthoritative, false);
    assert.equal(result.postings[0].sourceId, `${oracleSlug}/1`);
    assert.equal(result.postings[0].workArrangement, "hybrid");
    assert.equal(result.postings[0].deadlineAt?.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(result.postings[0].compensationMaxCents, null);
  });
  it("preserves observations after a failed page and refuses repeated pages", async () => {
    for (const repeat of [false, true]) {
      let page = 0;
      globalThis.fetch = async input => {
        if (String(input).endsWith("robots.txt")) return new Response("");
        if (page++ && !repeat) return json({}, 404);
        return json({ items: [{ TotalJobsCount: 5, requisitionList: [oracleJob("1")] }] });
      };
      const result = await createOracleAdapter({ detailLimit: 0 }).fetchBoard(oracleSlug);
      assert.equal(result.successfulComplete, false); assert.equal(result.postings.length, 1);
      assert.equal(result.completeness?.reason, repeat ? "malformed_response" : "page_failed");
    }
  });
  it("does not accept a malformed success or robots-excluded API", async () => {
    globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : json({ items: [] });
    assert.equal((await createOracleAdapter().fetchBoard(oracleSlug)).successfulComplete, false);
    globalThis.fetch = async () => new Response("User-agent: *\nDisallow: /hcmRestApi/");
    await assert.rejects(createOracleAdapter().fetchBoard(oracleSlug), /robots/);
  });
  it("reads only matching job details and leaves unavailable enrichment unknown", async () => {
    globalThis.fetch = async input => {
      const url = String(input); if (url.endsWith("robots.txt")) return new Response("");
      if (url.includes("RequisitionDetails")) return json({ items: [{ Id: "1", ExternalDescriptionStr: "<p>Build things.</p>", RequisitionType: "Internship", ExternalPostedEndDate: "2026-12-31" }] });
      return json({ items: [{ TotalJobsCount: 1, requisitionList: [oracleJob("1")] }] });
    };
    const result = await createOracleAdapter().fetchBoard(oracleSlug);
    assert.match(result.postings[0].descriptionText ?? "", /Build things/);
    assert.equal(result.postings[0].deadlineAt?.toISOString(), "2026-12-31T00:00:00.000Z");
  });
});

describe("Rippling public careers data", () => {
  it("selects job-post queries rather than unrelated hydration data and gets descriptions from public details", async () => {
    globalThis.fetch = async input => {
      const url = String(input); if (url.endsWith("robots.txt")) return new Response("");
      if (url.includes("/jobs/")) return nextPage({ apiData: { jobPost: { uuid: "123", description: { role: "<p>Build things.</p>" } } } });
      return nextPage({ apiData: { jobBoard: { companyName: "Employer Name" } }, dehydratedState: { queries: [
        { queryKey: ["board", "acme", "locations"], state: { data: { items: [{ id: "x", name: "Intern Fake" }] } } },
        { queryKey: ["board", "acme", "job-posts"], state: { data: { totalItems: 1, items: [{ id: "123", name: "Engineering Intern", locations: [{ name: "Boston", workplaceType: "REMOTE" }] }] } } },
      ] } });
    };
    const result = await rippling.fetchBoard("acme");
    assert.equal(result.postings.length, 1); assert.equal(result.postings[0].companyName, "Employer Name");
    assert.equal(result.postings[0].workArrangement, "remote"); assert.match(result.postings[0].descriptionText ?? "", /Build things/);
    assert.equal(result.absenceAuthoritative, false); assert.equal(result.postings[0].postedAt, null);
  });
  it("does not claim success for a redirect to a different careers product", async () => {
    globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : nextPage({ data: { unrelated: true } });
    assert.equal((await rippling.fetchBoard("acme")).successfulComplete, false);
  });
});

describe("Jobvite public board", () => {
  it("reads only this employer's job links and enriches from schema without executing scripts", async () => {
    globalThis.fetch = async input => {
      const url = String(input); if (url.endsWith("robots.txt")) return new Response("");
      if (url.endsWith("/jobs")) return new Response('<a href="/acme/job/1">Engineering Intern</a><a href="https://evil.test/acme/job/2">Engineering Intern</a><a href="/other/job/3">Intern</a>');
      return new Response('<script>throw Error("never execute")</script><script type="application/ld+json">' + JSON.stringify({ "@type": "JobPosting", title: "Engineering Intern", datePosted: "2026-11-01", description: "<p>Build things.</p>", jobLocation: { address: { addressLocality: "Boston", addressRegion: "MA" } } }) + '</script>');
    };
    const result = await jobvite.fetchBoard("acme");
    assert.equal(result.postings.length, 1); assert.equal(result.postings[0].sourceId, "acme/1");
    assert.deepEqual(result.postings[0].locations, ["Boston, MA"]);
    assert.equal(result.absenceAuthoritative, false);
  });
  it("a generic careers shell without job-list evidence is not an empty board", async () => {
    globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : new Response("<html>Sign in</html>");
    assert.equal((await jobvite.fetchBoard("acme")).successfulComplete, false);
  });
});

describe("Taleo discovered job pages", () => {
  it("reads both attribute orders, ignores unavailable jobs, and keeps unknown fields null", async () => {
    assert.equal(parseTaleoTitle('<meta content="Job Description - Engineering Intern (123)" property="og:title">'), "Engineering Intern");
    assert.equal(parseTaleoTitle('<meta property="og:title" content="Job Description - Children\'s Services Intern">'), "Children's Services Intern");
    assert.equal(parseTaleoTitle('<meta property="og:title" content="Job Description - Controls %26 Software Intern">'), "Controls & Software Intern");
    assert.equal(parseTaleoTitle('<meta property="og:title" content="Job is no longer available">'), null);
    const urls = ["https://acme.taleo.net/careersection/ex/jobdetail.ftl?job=123", "https://evil.test/careersection/ex/jobdetail.ftl?job=999"];
    globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : new Response('<meta property="og:title" content="Job Description - Engineering Intern">');
    const result = await createTaleoAdapter(urls).fetchBoard("acme.taleo.net/ex", { companyName: "Acme" });
    assert.equal(result.postings.length, 1); assert.equal(result.postings[0].sourceId, "acme.taleo.net/ex/123");
    assert.equal(result.postings[0].descriptionText, null); assert.equal(result.postings[0].deadlineAt, null);
    assert.equal(result.absenceAuthoritative, false);
  });
  it("has no claim of a connection without valid discovered job URLs", async () => {
    const result = await createTaleoAdapter([]).fetchBoard("acme.taleo.net/ex");
    assert.equal(result.successfulComplete, false); assert.equal(result.postings.length, 0);
  });
});
