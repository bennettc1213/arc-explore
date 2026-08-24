import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { detectSubmission, hasSubmissionRule, normalizePageText } from "./submitted";

const GH = "https://job-boards.greenhouse.io/tripadvisor/jobs/8043141";

function at(url: string, text: string) {
  return { url, text: normalizePageText(text) };
}

describe("detectSubmission", () => {
  test("recognises Greenhouse's own confirmation copy", () => {
    for (const phrase of [
      "Your application has been submitted.",
      "Thank you for applying to TripAdvisor",
      "Application submitted",
    ]) {
      assert.equal(detectSubmission(at(GH, phrase)), "submitted", phrase);
    }
  });

  test("does NOT fire on the unsubmitted posting page", () => {
    /*
     * THE FAILURE THAT MATTERS. Reporting a submission that did not happen
     * makes the student stop tracking the role and miss the deadline — strictly
     * worse than reporting nothing. Both strings below appear on a live
     * Greenhouse posting before anyone has submitted: the boilerplate under the
     * form, and ordinary advert copy.
     */
    for (const page of [
      "Thank you for your interest in working with us. Apply for this job.",
      "Your application and the information in it will be processed per our privacy notice.",
      "Submit application",
    ]) {
      assert.equal(detectSubmission(at(GH, page)), "unknown", page);
    }
  });

  test("whitespace and case in the real DOM do not defeat it", () => {
    const messy = "\n  Your   Application\tHas Been\n SUBMITTED  \n";
    assert.equal(detectSubmission(at(GH, messy)), "submitted");
  });

  test("a platform with no rule is unknown, never a guess", () => {
    // A scholarship site saying "submitted" in its own words is not evidence we
    // have earned. Unknown means the student marks it themselves, which is
    // exactly what happens today — no regression, no invention.
    assert.equal(
      detectSubmission(at("https://buckfirelaw.com/scholarship", "your application has been submitted")),
      "unknown",
    );
    assert.equal(detectSubmission(at("https://jobs.lever.co/waabi/x", "thank you for applying")), "unknown");
  });

  test("an unparseable url is unknown rather than throwing", () => {
    assert.equal(detectSubmission(at("not a url", "application submitted")), "unknown");
  });

  test("hasSubmissionRule says whether we will be watching at all", () => {
    // So the UI can promise detection only where it exists, instead of quietly
    // not watching and leaving the student wondering why nothing happened.
    assert.equal(hasSubmissionRule(GH), true);
    assert.equal(hasSubmissionRule("https://boards.greenhouse.io/x/jobs/1"), true);
    assert.equal(hasSubmissionRule("https://jobs.smartrecruiters.com/x/1"), false);
    assert.equal(hasSubmissionRule("https://buckfirelaw.com/s"), false);
  });
});
