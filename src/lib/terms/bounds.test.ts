import assert from "node:assert";
import { describe, it } from "node:test";
import { isTermEnded, isTermCurrent, termBounds } from "./bounds";

describe("termBounds", () => {
  it("places Summer 2027 from June through August", () => {
    const b = termBounds("summer", 2027);
    assert.equal(b.start.toISOString(), "2027-06-01T00:00:00.000Z");
    assert.equal(b.end.toISOString(), "2027-08-31T23:59:59.999Z");
  });

  it("places Fall 2027 from September through December", () => {
    const b = termBounds("fall", 2027);
    assert.equal(b.start.toISOString(), "2027-09-01T00:00:00.000Z");
    assert.equal(b.end.toISOString(), "2027-12-31T23:59:59.999Z");
  });

  it("places Spring 2027 from January through May", () => {
    const b = termBounds("spring", 2027);
    assert.equal(b.start.toISOString(), "2027-01-01T00:00:00.000Z");
    assert.equal(b.end.toISOString(), "2027-05-31T23:59:59.999Z");
  });

  it("treats Winter 2027 as Dec 2026 – Feb 2027", () => {
    const b = termBounds("winter", 2027);
    assert.equal(b.start.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(b.end.toISOString(), "2027-02-28T23:59:59.999Z");
  });

  it("handles leap-day winter ends", () => {
    const b = termBounds("winter", 2028);
    assert.equal(b.end.toISOString(), "2028-02-29T23:59:59.999Z");
  });

  it("treats Co-op as year-long", () => {
    const b = termBounds("co-op", 2027);
    assert.equal(b.start.toISOString(), "2027-01-01T00:00:00.000Z");
    assert.equal(b.end.toISOString(), "2027-12-31T23:59:59.999Z");
  });
});

describe("isTermEnded", () => {
  it("is false for a future term", () => {
    assert.equal(isTermEnded("summer", 2027, new Date("2026-09-01")), false);
  });

  it("is false for a currently active term", () => {
    assert.equal(isTermEnded("summer", 2027, new Date("2027-07-01")), false);
  });

  it("is true the day after the term ends", () => {
    assert.equal(isTermEnded("summer", 2027, new Date("2027-09-01")), true);
  });

  it("is false for unknown terms", () => {
    assert.equal(isTermEnded(null, null, new Date("2030-01-01")), false);
  });
});

describe("isTermCurrent", () => {
  it("is true inside the term window", () => {
    assert.equal(isTermCurrent("fall", 2027, new Date("2027-10-15")), true);
  });

  it("is false outside the term window", () => {
    assert.equal(isTermCurrent("fall", 2027, new Date("2027-08-31")), false);
  });
});
