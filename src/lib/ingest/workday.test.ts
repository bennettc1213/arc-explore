import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { inferAts } from "./sources/simplify";
import { workday, workdayRobotsAllows } from "./sources/workday";
import { parseWorkdayBoard, workdayBoardFromUrl } from "./sources/workday-board";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const slug = "acme.wd5.myworkdayjobs.com/External";
const job = (id: number, title = `Engineering Intern ${id}`) => ({ title, externalPath: `/job/Austin/Engineering-Intern_REQ${id}`, bulletFields: [`REQ${id}`], locationsText: "2 Locations" });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("Workday coordinates", () => {
  it("retains shard and board, removes locale, and rejects lookalike/private hosts", () => {
    assert.equal(workdayBoardFromUrl("https://wd5.myworkdaysite.com/recruiting/microchiphr/External/job/CA/Intern_R1"), "microchiphr.wd5.myworkdayjobs.com/External");
    assert.equal(workdayBoardFromUrl("https://acme.wd5.myworkdayjobs.com/en-us/External/job/CA/Intern_R1"), slug);
    assert.deepEqual(inferAts("https://acme.wd12.myworkdayjobs.com/en-US/External/job/Austin/Intern_REQ1"), { atsType: "workday", atsSlug: "acme.wd12.myworkdayjobs.com/External" });
    assert.equal(workdayBoardFromUrl("https://acme.wd5.myworkdayjobs.com/job/Austin/Intern_REQ1"), null);
    for (const url of ["https://acme.wd5.myworkdayjobs.com.evil.test/External", "http://127.0.0.1/External", "https://acme.wd5.myworkdayjobs.com:444/External", "https://user@acme.wd5.myworkdayjobs.com/External"]) assert.equal(workdayBoardFromUrl(url), null);
    assert.throws(() => parseWorkdayBoard(`${slug}/other`));
  });
});

describe("Workday robots", () => {
  it("honors board exclusions, specific user agents, wildcard paths and allow precedence", () => {
    const robots = "User-agent: *\nAllow: /External/\nDisallow: /Private/\nDisallow: /refreshFacet/\nDisallow: /External/*/apply$";
    assert.equal(workdayRobotsAllows(robots, "/External/job/Austin"), true);
    assert.equal(workdayRobotsAllows(robots, "/Private/"), false);
    assert.equal(workdayRobotsAllows(robots, "/External/job/123/apply"), false);
    assert.equal(workdayRobotsAllows("User-agent: *\nDisallow: /\nAllow: /External/", "/External/"), true);
    assert.equal(workdayRobotsAllows("User-agent: *\nAllow: /\nUser-agent: instela\nDisallow: /", "/External/"), false);
  });
  it("stops before search when the employer excludes its board", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("User-agent: *\nDisallow: /External/"); };
    await assert.rejects(workday.fetchBoard(slug), /robots/);
    assert.equal(calls, 1);
  });
});

describe("Workday search", () => {
  it("drops a hidden job's identifier-only placeholder without losing visible jobs", async () => {
    globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : String(input).endsWith("/jobs")
      ? json({ total: 2, jobPostings: [{ bulletFields: ["HIDDEN"] }, job(1)] }) : json({}, 404);
    const result = await workday.fetchBoard(slug);
    assert.equal(result.postings.length, 1); assert.equal(result.rejected, 1); assert.equal(result.successfulComplete, true);
    assert.equal(result.absenceAuthoritative, false);
  });
  it("pages with a JSON POST, excludes international roles, and reads employer facts without guessing", async () => {
    const offsets: number[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("User-agent: *\nDisallow: /refreshFacet/");
      if (url.endsWith("/jobs")) {
        assert.equal(init?.method, "POST");
        const body = JSON.parse(String(init.body)); offsets.push(body.offset);
        assert.equal(body.searchText, "intern");
        return json({ total: 21, jobPostings: body.offset === 0 ? Array.from({ length: 20 }, (_, i) => job(i)) : [job(99, "International Tax Director")] });
      }
      return json({ jobPostingInfo: { title: "Engineering Intern", jobReqId: url.split("_").pop(), location: "Austin, TX", additionalLocations: ["Boston, MA"], jobDescription: "<p>Build <b>things</b>.</p>", startDate: "2026-10-13", canApply: true } });
    };
    const result = await workday.fetchBoard(slug, { companyName: "Acme Inc." });
    assert.deepEqual(offsets, [0, 20]);
    assert.equal(result.postings.length, 20);
    assert.equal(result.absenceAuthoritative, false);
    assert.equal(result.successfulComplete, true);
    const p = result.postings[0];
    assert.equal(p.sourceId, "acme/External/REQ0");
    assert.equal(p.companyName, "Acme Inc.");
    assert.match(p.descriptionText ?? "", /Build things/);
    assert.deepEqual(p.locations, ["Austin, TX", "Boston, MA"]);
    assert.equal(p.postedAt?.toISOString(), "2026-10-13T00:00:00.000Z");
    assert.equal(p.deadlineAt, null);
    assert.equal(p.compensationMinCents, null);
    assert.equal(p.workArrangement, null);
  });

  it("keeps successful search observations when enrichment fails, without turning relative postedOn into a date", async () => {
    globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : String(input).endsWith("/jobs") ? json({ total: 1, jobPostings: [job(1)] }) : json({}, 404);
    const result = await workday.fetchBoard(slug);
    assert.equal(result.successfulComplete, true);
    assert.equal(result.postings.length, 1);
    assert.equal(result.postings[0].descriptionText, null);
    assert.equal(result.postings[0].postedAt, null);
    assert.deepEqual(result.postings[0].locations, []);
  });

  it("does not mistake Workday's zero total on later nonempty pages for the end", async () => {
    const offsets: number[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("");
      if (!url.endsWith("/jobs")) return json({}, 404);
      const offset = JSON.parse(String(init?.body)).offset; offsets.push(offset);
      return json({ total: offset === 0 ? 45 : 0, jobPostings: Array.from({ length: offset === 40 ? 5 : 20 }, (_, i) => job(offset + i)) });
    };
    const result = await workday.fetchBoard(slug);
    assert.deepEqual(offsets, [0, 20, 40]);
    assert.equal(result.postings.length, 45);
    assert.equal(result.completeness?.claimedTotal, 45);
    assert.equal(result.successfulComplete, true);
  });

  it("never reports a malformed 200 or a short page as a successful search", async () => {
    for (const body of [{ ok: false }, { total: 25, jobPostings: [job(1)] }, { total: 1, jobPostings: [null] }]) {
      globalThis.fetch = async input => String(input).endsWith("robots.txt") ? new Response("") : String(input).endsWith("/jobs") ? json(body) : json({}, 404);
      const result = await workday.fetchBoard(slug);
      assert.equal(result.successfulComplete, false);
      assert.equal(result.absenceAuthoritative, false);
    }
  });

  it("preserves earlier pages on later failure and detects repeated pages", async () => {
    for (const repeat of [false, true]) {
      let page = 0;
      globalThis.fetch = async input => {
        const url = String(input);
        if (url.endsWith("robots.txt")) return new Response("");
        if (!url.endsWith("/jobs")) return json({}, 404);
        if (page++ > 0 && !repeat) return json({}, 404);
        return json({ total: 60, jobPostings: Array.from({ length: 20 }, (_, i) => job(i)) });
      };
      const result = await workday.fetchBoard(slug);
      assert.equal(result.successfulComplete, false);
      assert.equal(result.postings.length, 20);
      assert.equal(result.completeness?.reason, repeat ? "malformed_response" : "page_failed");
    }
  });

  it("reports its page cap and bounds per-job enrichment", async () => {
    let details = 0;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("");
      if (!url.endsWith("/jobs")) { details++; return json({}, 404); }
      const offset = JSON.parse(String(init?.body)).offset;
      return json({ total: 1000, jobPostings: Array.from({ length: 20 }, (_, i) => job(offset + i)) });
    };
    const result = await workday.fetchBoard(slug);
    assert.equal(result.completeness?.reason, "page_cap_reached");
    assert.equal(result.postings.length, 200);
    assert.equal(details, 40);
  });
});
