import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveRunStatus, RUN_STATUSES } from "@/db/schema";

/**
 * Requirement 2's four states, and the rule that makes them worth having.
 *
 * The distinction that matters is `successful_no_changes` against both of the
 * failure states. A steady-state run — every board answered 304, or every row
 * matched what we already had — is the system doing its job. Reporting that as
 * `failed` pages someone every 20 minutes; reporting it as `successful_complete`
 * hides the fact that ingestion is alive but not moving, which is a different
 * problem with a different fix.
 */
describe("deriveRunStatus", () => {
  it("exposes exactly the four documented states", () => {
    assert.deepEqual([...RUN_STATUSES], [
      "successful_complete",
      "successful_no_changes",
      "partial",
      "failed",
    ]);
  });

  it("is successful_complete when boards succeeded and something changed", () => {
    assert.equal(
      deriveRunStatus({ attempted: 10, succeeded: 10, changed: 42 }),
      "successful_complete",
    );
  });

  it("is successful_no_changes when every board succeeded and nothing moved", () => {
    // The steady state. Reporting this as failed would be the single loudest
    // false alarm this pipeline could produce.
    assert.equal(
      deriveRunStatus({ attempted: 10, succeeded: 10, changed: 0 }),
      "successful_no_changes",
    );
  });

  it("counts only missing-1 as a change, not a close", () => {
    // A missing-1 is a decision recorded, so the run did something. If this
    // returned successful_no_changes, a board quietly emptying itself would look
    // identical to a board that never changed.
    assert.equal(
      deriveRunStatus({ attempted: 1, succeeded: 1, changed: 1 }),
      "successful_complete",
    );
  });

  it("is failed when every board failed", () => {
    assert.equal(deriveRunStatus({ attempted: 8, succeeded: 0, changed: 0 }), "failed");
  });

  it("is partial when some boards failed and others did not", () => {
    // Not failed: most of the registry was still refreshed.
    assert.equal(
      deriveRunStatus({ attempted: 8, succeeded: 5, changed: 3 }),
      "partial",
    );
  });

  it("is partial even when a partial run changed plenty", () => {
    // Volume of work does not repair a hole in coverage. Reporting this as
    // successful_complete is how "a third of our boards were unreadable last
    // night" stops being visible.
    assert.equal(
      deriveRunStatus({ attempted: 8, succeeded: 5, changed: 5000 }),
      "partial",
    );
  });

  it("is successful_no_changes when there was nothing due to poll", () => {
    // Not failed. A cron tick on an empty queue did exactly its job.
    assert.equal(deriveRunStatus({ attempted: 0, succeeded: 0, changed: 0 }), "successful_no_changes");
  });

  it("never reports successful_complete for a run that did not complete", () => {
    for (const succeeded of [0, 1, 3]) {
      for (const changed of [0, 1, 100]) {
        const status = deriveRunStatus({ attempted: 10, succeeded, changed });
        assert.notEqual(
          status,
          "successful_complete",
          `succeeded=${succeeded} changed=${changed} must not be successful_complete`,
        );
      }
    }
  });

  it("treats a zero-attempt run with a change count as impossible", () => {
    // Guards against a caller that forgot to count its boards: changing rows
    // without attempting anything means the counts are wrong, and the honest
    // verdict is the quiet one rather than a fabricated success.
    assert.equal(deriveRunStatus({ attempted: 0, succeeded: 0, changed: 5 }), "successful_no_changes");
  });
});