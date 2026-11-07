import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { inferAts } from "./sources/simplify";
import { WORKDAY_POLL_INTERVAL_SEC, WORKDAY_QUERIES, workday, workdayRobotsAllows } from "./sources/workday";
import { parseWorkdayBoard, workdayApiFromShell, workdayBoardFromUrl } from "./sources/workday-board";

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
  it("uses the public shell tenant after 422 while preserving source identity", async () => {
    const board = "sallie-mae.wd5.myworkdayjobs.com/Careers";
    const calls: string[] = [];
    globalThis.fetch = async input => {
      const url = String(input); calls.push(url);
      if (url.endsWith("robots.txt")) return new Response("");
      if (url.endsWith("/Careers/")) return new Response('tenant: "sallie_mae", siteId: "Careers",');
      if (url.includes("/cxs/sallie-mae/")) return json({}, 422);
      if (url.endsWith("/jobs")) return json({ total: 1, jobPostings: [job(1)] });
      return json({}, 404);
    };
    const result = await workday.fetchBoard(board);
    assert.equal(result.successfulComplete, true);
    assert.equal(result.absenceAuthoritative, false);
    assert.equal(result.postings[0].sourceId, "sallie-mae/Careers/REQ1");
    assert.ok(calls.some(u => u.endsWith("/cxs/sallie_mae/Careers/jobs")));
    assert.ok(calls.some(u => u.includes("/cxs/sallie_mae/Careers/job/")));
    assert.throws(() => workdayApiFromShell(board, 'tenant: "other", siteId: "Careers"'));
    assert.throws(() => workdayApiFromShell(board, 'tenant: "sallie_mae", siteId: "Private"'));
  });

  it("checks robots for the shell-configured API before retrying", async () => {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("User-agent: *\nDisallow: /wday/cxs/sallie_mae/");
      if (url.endsWith("/Careers/")) return new Response('tenant: "sallie_mae", siteId: "Careers"');
      assert.ok(url.includes("/cxs/sallie-mae/"));
      return json({}, 422);
    };
    await assert.rejects(workday.fetchBoard("sallie-mae.wd5.myworkdayjobs.com/Careers"), /robots/);
  });

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
      assert.equal((init?.headers as Record<string, string>)["Accept-Language"], "en-US");
      if (url.endsWith("/jobs")) {
        assert.equal(init?.method, "POST");
        const body = JSON.parse(String(init.body));
        assert.ok(WORKDAY_QUERIES.some(q => q.text === body.searchText), `unexpected query ${body.searchText}`);
        if (body.searchText === WORKDAY_QUERIES[0].text) offsets.push(body.offset);
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
      const body = JSON.parse(String(init?.body)); const offset = body.offset;
      if (body.searchText === WORKDAY_QUERIES[0].text) offsets.push(offset);
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

describe("Workday cron cadence", () => {
  it("is much slower than the default, because one read is many requests", () => {
    // The cron run is budgeted at about one request per board, polled every
    // 1,200s (persist.ts DEFAULT_POLL_INTERVAL_SEC; not imported, since that
    // module opens a database connection at load).
    assert.ok(WORKDAY_POLL_INTERVAL_SEC >= 1200 * 12);
    // And far shorter than the parked manual interval, which must stay the
    // only way to switch a board off.
    assert.ok(WORKDAY_POLL_INTERVAL_SEC < 315_360_000);
  });
});

describe("Workday query passes", () => {
  /** A big board: "intern" is fuzzy and newest-first, so its first page is all noise. */
  const bigBoard = (init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const noise = Array.from({ length: 20 }, (_, i) => job(1000 + body.offset + i, `Senior Director ${body.offset + i}`));
    if (body.searchText === "internship") {
      return json({ total: 3, jobPostings: [job(1, "Marketing Intern"), job(2, "Data Internship"), noise[0]] });
    }
    return json({ total: 1206, jobPostings: noise });
  };

  it("finds internships on a board whose first page of fuzzy results holds none", async () => {
    // The shape that returned 0 rows on J&J and Northrop Grumman (2026-11-06).
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("");
      if (!url.endsWith("/jobs")) return json({}, 404);
      return bigBoard(init);
    };
    const result = await workday.fetchBoard(slug);
    assert.deepEqual(result.postings.map(p => p.sourceId).sort(), ["acme/External/REQ1", "acme/External/REQ2"]);
    assert.equal(result.successfulComplete, true);
    assert.equal(result.absenceAuthoritative, false);
  });

  it("runs every query once on a small board and de-duplicates what they share", async () => {
    const seen: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("");
      if (!url.endsWith("/jobs")) return json({}, 404);
      seen.push(JSON.parse(String(init?.body)).searchText);
      return json({ total: 2, jobPostings: [job(1), job(2)] });
    };
    const result = await workday.fetchBoard(slug);
    assert.deepEqual(seen, WORKDAY_QUERIES.map(q => q.text));
    assert.equal(result.postings.length, 2);
    assert.equal(result.completeness?.claimedTotal, 2, "the claimed total is the primary search's");
  });

  it("does not call a board incomplete because a top-up search has more pages", async () => {
    // "co-op" matches ~1,600 of J&J's jobs. Its 2-page cap is by design.
    const perQuery: Record<string, number> = {};
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("");
      if (!url.endsWith("/jobs")) return json({}, 404);
      const body = JSON.parse(String(init?.body));
      perQuery[body.searchText] = (perQuery[body.searchText] ?? 0) + 1;
      if (body.searchText === WORKDAY_QUERIES[0].text) return json({ total: 1, jobPostings: [job(1)] });
      return json({ total: 1600, jobPostings: Array.from({ length: 20 }, (_, i) => job(body.offset + i + 10)) });
    };
    const result = await workday.fetchBoard(slug);
    assert.equal(result.successfulComplete, true);
    assert.equal(perQuery["co-op"], 2);
    assert.equal(perQuery["interns"], 2);
  });

  it("reads an identical opening page from two different searches as two reads, not a repeat", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("");
      if (!url.endsWith("/jobs")) return json({}, 404);
      return json({ total: 20, jobPostings: Array.from({ length: 20 }, (_, i) => job(i)) });
    };
    const result = await workday.fetchBoard(slug);
    assert.equal(result.successfulComplete, true);
    assert.equal(result.postings.length, 20);
  });

  it("stops every remaining query once one fails", async () => {
    let searches = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("");
      if (!url.endsWith("/jobs")) return json({}, 404);
      searches++;
      return searches === 1 ? json({ total: 1, jobPostings: [job(1)] }) : json({}, 500);
    };
    const result = await workday.fetchBoard(slug);
    assert.equal(result.successfulComplete, false);
    assert.equal(result.postings.length, 1, "what was read is kept");
    assert.ok(searches <= 3, "a failing board is not hammered by the remaining queries");
  });
});
