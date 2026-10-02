/**
 * The shared adapter contract (INS-013 requirement 10).
 *
 * Every `BoardAdapter` must pass this suite. It exists because the four ATS
 * adapters were written independently and drifted: three of them reported
 * "success" on a 200 that was not a board, and none reported whether they had
 * read the whole board. Those are exactly the bugs that close a live listing, so
 * the properties that matter are asserted against the real adapters rather than
 * described in a doc comment nobody re-reads.
 *
 * `fetch` is stubbed rather than mocked at the module level, so the assertions
 * exercise the adapters' own HTTP handling — status mapping, body validation,
 * pagination — which is where the failure modes live.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import type { BoardAdapter } from "./types";
import { ashby } from "./sources/ashby";
import { greenhouse } from "./sources/greenhouse";
import { lever } from "./sources/lever";
import { smartrecruiters } from "./sources/smartrecruiters";

/** One stubbed HTTP reply, keyed by a substring of the request URL. */
interface StubbedResponse {
  match: string;
  status?: number;
  body?: unknown;
  etag?: string;
}

const realFetch = globalThis.fetch;
let stubs: StubbedResponse[] = [];

/** Reply with a 200 JSON body to every request. */
function stubAll(responses: StubbedResponse[]) {
  stubs = responses;
}

/**
 * The three properties every adapter owes its caller.
 *
 * Kept as a shared function so a new adapter is one call away from the coverage,
 * and so the two headline cases — a board that answers 304, and a board that
 * answers 200 with something that is not a board — cannot be forgotten for one
 * source and remembered for another.
 */
function itBehavesLikeABoardAdapter(
  name: string,
  get: () => BoardAdapter,
  fixtures: {
    /** A well-formed full board, as that source's JSON. */
    healthy: unknown;
    /** A 200 whose body is not a board. */
    notABoard: unknown;
    /**
     * Whether this board is read with conditional requests. Defaults to true.
     *
     * SmartRecruiters is the exception: it sweeps search queries rather than
     * mirroring a board, so it issues no `If-None-Match` and publishes no ETag.
     * A 304 is therefore unreachable for it, and asserting one would be testing
     * a path the adapter never takes.
     */
    conditionalRequests?: boolean;
  },
) {
  const conditional = fixtures.conditionalRequests ?? true;
  describe(`adapter contract: ${name}`, () => {
    beforeEach(() => {
      stubs = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        const hit = stubs.find((s) => url.includes(s.match));
        if (!hit) throw new Error(`unstubbed request: ${url}`);
        const status = hit.status ?? 200;
        if (status === 304) return new Response(null, { status: 304, headers: { etag: "W/\"abc\"" } });
        return new Response(JSON.stringify(hit.body ?? null), {
          status,
          headers: { "content-type": "application/json", etag: hit.etag ?? "W/\"v1\"" },
        });
      }) as typeof fetch;
    });

    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it("returns postings that identify themselves stably", async () => {
      stubAll([{ match: "/", body: fixtures.healthy }]);
      const result = await get().fetchBoard("acme");
      assert.notEqual(result.notModified, true);
      for (const p of result.postings) {
        // Every row must carry a source id: dedup runs on (source, source_id),
        // and a row without one is a row we cannot reconcile on replay.
        assert.ok(p.sourceId, "row has no sourceId");
        assert.equal(p.source, name);
      }
    });

    it("reports complete when the whole board arrived", async () => {
      stubAll([{ match: "/", body: fixtures.healthy }]);
      const result = await get().fetchBoard("acme");
      assert.equal(result.successfulComplete, true, "a healthy board must report complete");
      assert.equal(result.completeness?.complete, true);
    });

    it(
      "treats 304 as notModified, not as an empty board",
      { skip: !conditional && "this board is read without conditional requests" },
      async () => {
        // The distinction that keeps a warm-ETag cycle from closing every listing
        // on the registry: 304 means "unchanged", not "nothing there".
        stubAll([{ match: "/", status: 304 }]);
        const result = await get().fetchBoard("acme");
        assert.equal(result.notModified, true);
        assert.deepEqual(result.postings, []);
      },
    );

    it("does not claim to support conditional requests unless it does", async () => {
      stubAll([{ match: "/", body: fixtures.healthy }]);
      const result = await get().fetchBoard("acme");
      assert.equal(result.etag !== null, conditional, "conditional boards must publish an ETag");
    });

    it("does not claim a complete read of a body that is not a board", async () => {
      stubAll([{ match: "/", body: fixtures.notABoard }]);
      const result = await get().fetchBoard("acme");
      assert.equal(
        result.successfulComplete,
        false,
        "a non-board 200 must never be reported as a complete read",
      );
    });

    it("never reports success for a body that carries no rows and no array", async () => {
      stubAll([{ match: "/", body: { ok: false } }]);
      const result = await get().fetchBoard("acme");
      // Whatever this source does with such a body, the verdict must not be
      // "complete" — that is the claim that closes listings.
      assert.notEqual(result.successfulComplete, true);
    });
  });
}

itBehavesLikeABoardAdapter("greenhouse", () => greenhouse, {
  healthy: {
    jobs: [
      {
        id: 101,
        title: "Software Engineer Intern",
        absolute_url: "https://job-boards.greenhouse.io/acme/jobs/101",
        company_name: "Acme",
        location: { name: "San Francisco, CA" },
        first_published: "2026-01-05T00:00:00Z",
      },
    ],
    meta: { total: 1 },
  },
  notABoard: { error: "not found" },
});

itBehavesLikeABoardAdapter("lever", () => lever, {
  healthy: [
    {
      id: "abc-1",
      text: "Software Engineer Intern",
      hostedUrl: "https://jobs.lever.co/acme/abc-1",
      categories: { location: "New York, NY", commitment: "Internship" },
      createdAt: 1767225600000,
      descriptionPlain: "Build things.",
    },
  ],
  // Lever's documented behaviour for an unknown board: a 200 with ok:false.
  notABoard: { ok: false },
});

itBehavesLikeABoardAdapter("ashby", () => ashby, {
  healthy: {
    jobs: [
      {
        id: "job-1",
        title: "Software Engineer Intern",
        jobUrl: "https://jobs.ashbyhq.com/acme/job-1",
        location: "Remote",
        isRemote: true,
        employmentType: "Internship",
        publishedAt: "2026-01-05T00:00:00Z",
        descriptionPlain: "Build things.",
        isListed: true,
      },
    ],
  },
  notABoard: { message: "job board not found" },
});

itBehavesLikeABoardAdapter("smartrecruiters", () => smartrecruiters, {
  // SmartRecruiters sweeps many queries, so a healthy stub answers every one of
  // them. `totalFound` matching what the page returns is what makes the sweep
  // stop after a single page per query.
  healthy: {
    content: [
      {
        id: "SR-1",
        name: "Software Engineer Intern",
        company: { identifier: "Acme", name: "Acme" },
        location: { city: "Austin", region: "TX", country: "US" },
        releasedDate: "2026-01-05T00:00:00Z",
        experienceLevel: { id: "3", label: "Internship" },
      },
    ],
    totalFound: 1,
    limit: 100,
    offset: 0,
  },
  notABoard: { message: "company not found" },
  conditionalRequests: false,
});

describe("adapter contract: pagination", () => {
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
      // Every query page answers "there are 1,200 rows" and then hands back a
      // full page. The adapter must notice that its own ceiling, not the source,
      // is what ended the sweep.
      const rows = Array.from({ length: 100 }, (_, i) => ({
        id: `SR-${offset + i}`,
        name: `Software Engineer Intern ${offset + i}`,
        company: { identifier: "Acme", name: "Acme" },
        location: { city: "Austin", region: "TX", country: "US" },
        experienceLevel: { label: "Internship" },
      }));
      return new Response(JSON.stringify({ content: rows, totalFound: 1200, limit: 100, offset }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("reports an over-cap sweep as incomplete rather than as a whole board", async () => {
    const result = await smartrecruiters.fetchBoard("acme");
    assert.equal(
      result.successfulComplete,
      false,
      "a sweep stopped by our own page cap must not claim to be the whole board",
    );
    assert.equal(result.completeness?.reason, "page_cap_reached");
  });

  it("still returns the rows it did read", async () => {
    // Incompleteness suppresses closing, not ingestion. Discarding the rows we
    // managed to fetch would cost freshness for no benefit.
    const result = await smartrecruiters.fetchBoard("acme");
    assert.ok(result.postings.length > 0, "partial read must not be discarded");
    assert.ok(result.postings.length < 1200, "and must not be presented as complete");
  });
});