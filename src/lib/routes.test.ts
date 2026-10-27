import assert from "node:assert/strict";
import { test } from "node:test";

import { FEED_PATH, feedHref, legacyFeedRedirect } from "./routes";

const redirectFor = (query: string) => legacyFeedRedirect(new URLSearchParams(query));

test("feedHref omits the ? when there is no query", () => {
  assert.equal(feedHref(), FEED_PATH);
  assert.equal(feedHref(""), FEED_PATH);
  assert.equal(feedHref("kind=internship"), `${FEED_PATH}?kind=internship`);
});

test("a bare landing visit is not redirected", () => {
  assert.equal(redirectFor(""), null);
});

test("an old feed URL on / is forwarded to the feed with its filters intact", () => {
  assert.equal(redirectFor("kind=internship&remote=1"), "/explore?kind=internship&remote=1");
  // The account-deletion banner was `/?deleted=1` before the move.
  assert.equal(redirectFor("deleted=1"), "/explore?deleted=1");
  // Repeated keys (a signed-out profile's interests) survive as repeats.
  assert.equal(
    redirectFor("targetVerticals=software&targetVerticals=data_ai"),
    "/explore?targetVerticals=software&targetVerticals=data_ai",
  );
});

test("campaign tracking stays on the landing page", () => {
  assert.equal(redirectFor("utm_source=instagram&utm_campaign=launch"), null);
  assert.equal(redirectFor("fbclid=abc"), null);
  assert.equal(redirectFor("gclid=abc&ref=club"), null);
});

test("tracking params are stripped, not carried, when a real filter forwards", () => {
  assert.equal(redirectFor("utm_source=ig&q=nursing"), "/explore?q=nursing");
});
