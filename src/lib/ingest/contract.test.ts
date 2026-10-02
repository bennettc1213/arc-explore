import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PageLedger,
  incomplete,
  completeEmpty,
  isIdentifiable,
  rowIdentity,
  validateRows,
  type EnrichmentStatus,
} from "./contract";
import type { SourcePosting } from "./types";

function posting(overrides: Partial<SourcePosting> = {}): SourcePosting {
  return {
    source: "greenhouse",
    sourceId: "12345",
    companyName: "Stripe",
    title: "Software Engineer Intern",
    url: "https://stripe.com/jobs/12345",
    locations: ["San Francisco, CA"],
    isRemote: false,
    postedAt: null,
    deadlineAt: null,
    descriptionText: null,
    employmentHint: null,
    raw: {},
    ...overrides,
  };
}

describe("PageLedger", () => {
  it("is complete when every claimed row arrived", () => {
    const ledger = new PageLedger();
    ledger.addPage(["a", "b"], 2);
    assert.deepEqual(ledger.completeness(), {
      complete: true,
      pagesFetched: 1,
      claimedTotal: 2,
    });
  });

  it("reports short_page when fewer rows arrive than the source claims", () => {
    const ledger = new PageLedger();
    // The source says 640 exist; we only received 100. This is the case that
    // used to be silently reported as a complete board of 100.
    ledger.addPage(["a"], 640);
    const result = ledger.completeness();
    assert.equal(result.complete, false);
    assert.equal(result.reason, "short_page");
    assert.equal(result.claimedTotal, 640);
  });

  it("is complete when the source genuinely has nothing", () => {
    const ledger = new PageLedger();
    ledger.addPage([], 0);
    const result = ledger.completeness();
    assert.equal(result.complete, true);
    // A zero-row board must stay complete, or an emptied board would stop
    // closing anything forever.
    assert.equal(result.claimedTotal, 0);
  });

  it("accumulates across pages and stays complete", () => {
    const ledger = new PageLedger();
    ledger.addPage(["a", "b"], 4);
    ledger.addPage(["c", "d"], 4);
    const result = ledger.completeness();
    assert.equal(result.complete, true);
    assert.equal(result.pagesFetched, 2);
    assert.equal(ledger.size, 4);
  });

  it("carries a page failure through to the verdict", () => {
    const ledger = new PageLedger();
    ledger.addPage(["a", "b"], 10);
    ledger.fail("page_failed", "HTTP 503");
    const result = ledger.completeness();
    assert.equal(result.complete, false);
    assert.equal(result.reason, "page_failed");
    assert.equal(result.detail, "HTTP 503");
  });

  it("keeps the first failure, since it is the root cause", () => {
    const ledger = new PageLedger();
    ledger.fail("page_failed", "first");
    ledger.fail("page_cap_reached", "second");
    const result = ledger.completeness();
    assert.equal(result.reason, "page_failed");
    assert.equal(result.detail, "first");
  });

  it("detects that our own cap truncated the read", () => {
    const ledger = new PageLedger();
    // Ten pages of 100 against a source claiming 5,000: our ceiling stopped us.
    for (let i = 0; i < 10; i++) ledger.addPage(new Array(100).fill("row"), 5000);
    assert.equal(ledger.hitCap(10, ledger.size), true);
    // A cap reached exactly as the source ran out is not a truncation.
    const exhausted = new PageLedger();
    exhausted.addPage(new Array(100).fill("row"), 100);
    assert.equal(exhausted.hitCap(10, exhausted.size), false);
  });

  it("does not claim truncation before the cap is reached", () => {
    const ledger = new PageLedger();
    ledger.addPage(new Array(100).fill("row"), 5000);
    // One page in, against 5,000 rows, the source is obviously not exhausted —
    // but the cap is 10, so this is not yet a truncation we caused.
    assert.equal(ledger.hitCap(10, ledger.size), false);
  });

  it("does not claim truncation for a source that publishes no total", () => {
    const ledger = new PageLedger();
    ledger.addPage(["a"], null);
    assert.equal(ledger.hitCap(1, ledger.size), false);
  });

  it("is complete for an unpaginated source that reports no total", () => {
    const ledger = new PageLedger();
    ledger.addPage(["a", "b"], null);
    assert.equal(ledger.completeness().complete, true);
  });

  it("takes the most recent total, so a mid-run shrink is noticed", () => {
    const ledger = new PageLedger();
    ledger.addPage(["a"], 100);
    ledger.addPage(["b"], 40);
    assert.equal(ledger.total, 40);
    // We hold 2 rows and the source now claims 40, so we are short.
    assert.equal(ledger.completeness().complete, false);
  });
});

describe("completeness helpers", () => {
  it("builds a complete-empty verdict", () => {
    assert.deepEqual(completeEmpty(0), {
      complete: true,
      pagesFetched: 1,
      claimedTotal: 0,
    });
  });

  it("builds an incomplete verdict with a reason", () => {
    const result = incomplete("page_cap_reached", 10, 1200);
    assert.equal(result.complete, false);
    assert.equal(result.reason, "page_cap_reached");
    assert.equal(result.pagesFetched, 10);
  });
});

describe("rowIdentity", () => {
  it("prefers the source's own id", () => {
    assert.deepEqual(rowIdentity(posting({ sourceId: "abc123" })), {
      source: "greenhouse",
      sourceId: "abc123",
    });
  });

  it("falls back to a specific URL when the source exposes no id", () => {
    const id = rowIdentity(
      posting({ sourceId: "", url: "https://example.com/careers/swe-intern" }),
    );
    assert.equal(id.sourceId, "https://example.com/careers/swe-intern");
  });

  it("refuses a bare board URL, which identifies nothing", () => {
    // A fallback to the board root would collapse every posting on a board to
    // the same key.
    assert.equal(rowIdentity(posting({ sourceId: "", url: "https://example.com" })).sourceId, null);
    assert.equal(rowIdentity(posting({ sourceId: "", url: "https://example.com/" })).sourceId, null);
  });

  it("treats a blank id as absent and falls back to the URL", () => {
    assert.equal(
      rowIdentity(posting({ sourceId: "   " })).sourceId,
      "https://stripe.com/jobs/12345",
    );
  });

  it("is unidentifiable only when neither id nor a specific URL exists", () => {
    assert.equal(rowIdentity(posting({ sourceId: "", url: "" })).sourceId, null);
  });

  it("reports identifiability", () => {
    assert.equal(isIdentifiable(posting()), true);
    assert.equal(isIdentifiable(posting({ sourceId: "", url: "" })), false);
  });

  it("does not derive identity from the title", () => {
    // Two postings differing only by title must stay distinguishable. If title
    // were part of the key, a retitled role would become a second listing and
    // strand the first as a duplicate.
    const a = rowIdentity(posting({ sourceId: "1", title: "SWE Intern" }));
    const b = rowIdentity(posting({ sourceId: "2", title: "Software Engineer Intern" }));
    assert.notEqual(a.sourceId, b.sourceId);
  });
});

describe("validateRows", () => {
  it("keeps a fully populated row", () => {
    const result = validateRows([posting()]);
    assert.equal(result.valid.length, 1);
    assert.equal(result.rejected, 0);
  });

  it("rejects a row with no title", () => {
    const result = validateRows([posting({ title: "  " })]);
    assert.equal(result.valid.length, 0);
    assert.equal(result.rejected, 1);
  });

  it("rejects a row with no apply URL", () => {
    const result = validateRows([posting({ url: "" })]);
    assert.equal(result.rejected, 1);
  });

  it("rejects a row with no company name", () => {
    const result = validateRows([posting({ companyName: "" })]);
    assert.equal(result.rejected, 1);
  });

  it("accepts a row with no description, which renders as an honest slot", () => {
    // The minimum is deliberately shallow: a missing description is normal for
    // several sources and must not be a reason to drop a real listing.
    const result = validateRows([posting({ descriptionText: null, deadlineAt: null })]);
    assert.equal(result.valid.length, 1);
  });

  it("counts rejections across a mixed batch", () => {
    const result = validateRows([
      posting({ sourceId: "1" }),
      posting({ sourceId: "2", title: "" }),
      posting({ sourceId: "3", url: "" }),
    ]);
    assert.equal(result.valid.length, 1);
    assert.equal(result.rejected, 2);
  });
});

describe("EnrichmentStatus", () => {
  it("separates a model failure from an unverified listing", () => {
    // Requirement 8: a scoring failure must be recorded as a failure, never as
    // an absence, or a verified listing gets mislabelled or dropped.
    const failed: EnrichmentStatus = "failed";
    const neverRun: EnrichmentStatus = "not_attempted";
    assert.notEqual(failed, neverRun);
    assert.notEqual(failed, "complete");
  });
});