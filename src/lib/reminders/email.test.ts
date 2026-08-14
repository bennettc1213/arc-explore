import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeReminder } from "./email";

const base = {
  email: "student@example.edu",
  displayName: "Jordan",
  title: "Reno Rodeo Foundation Scholarship",
  company: "Reno Rodeo Foundation",
  url: "https://renorodeofoundation.org/scholarships/",
  kind: "scholarship",
  daysLeft: 7,
  deadlineAt: new Date("2027-03-22T00:00:00Z"),
  unsubscribeToken: "tok-123",
};

describe("composeReminder", () => {
  it("leads the subject with the deadline, which is the only reason to open it", () => {
    const mail = composeReminder(base);
    assert.equal(mail.to, "student@example.edu");
    assert.match(mail.subject, /Reno Rodeo Foundation Scholarship/);
    assert.match(mail.subject, /closes in 7 days/);
  });

  it("states the facts the posting carries and nothing more", () => {
    const mail = composeReminder(base);
    assert.match(mail.text, /Hi Jordan,/);
    assert.match(mail.text, /A scholarship you saved closes in 7 days\./);
    assert.match(mail.text, /Reno Rodeo Foundation Scholarship \(Reno Rodeo Foundation\)/);
    assert.match(mail.text, /Closes: 2027-03-22/);
    assert.match(mail.text, /Apply: https:\/\/renorodeofoundation\.org/);
  });

  /**
   * The recipient's timezone is unknown, and a date that reads as 09/08 to one
   * person and 08/09 to another is worse than no date.
   */
  it("writes the deadline as an unambiguous ISO date", () => {
    const mail = composeReminder({ ...base, deadlineAt: new Date("2027-09-08T23:59:00Z") });
    assert.match(mail.text, /Closes: 2027-09-08/);
    assert.ok(!mail.text.includes("9/8/"), "must not use a locale-ambiguous format");
  });

  it("reads naturally at the urgent edges", () => {
    assert.match(composeReminder({ ...base, daysLeft: 0 }).subject, /closes today/);
    assert.match(composeReminder({ ...base, daysLeft: 1 }).subject, /closes tomorrow/);
  });

  it("greets without a name rather than with a blank", () => {
    const mail = composeReminder({ ...base, displayName: null });
    assert.match(mail.text, /^Hi,/);
    assert.ok(!mail.text.includes("Hi ,"));
  });

  it("calls an internship an internship", () => {
    const mail = composeReminder({ ...base, kind: "internship" });
    assert.match(mail.text, /An? internship you saved/);
  });

  // A sponsor we have no name for must not produce an empty bracket.
  it("omits the sponsor when the posting names none", () => {
    const mail = composeReminder({ ...base, company: null });
    assert.match(mail.text, /Reno Rodeo Foundation Scholarship\nCloses:/);
    assert.ok(!mail.text.includes("()"));
  });

  // Every send has to carry a working way out, or we have built a spam cannon.
  it("always carries an unsubscribe link with the recipient's token", () => {
    const mail = composeReminder(base);
    assert.match(mail.text, /\/unsubscribe\?token=tok-123/);
  });

  it("says plainly why the recipient is getting it", () => {
    assert.match(composeReminder(base).text, /We only email about things you saved\./);
  });
});
