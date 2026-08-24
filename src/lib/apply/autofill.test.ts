import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAutofillValues,
  describeFill,
  isBlockedField,
  isInfrastructureField,
  isYesNoQuestion,
  matchFieldKey,
  normalizeSignature,
  splitName,
  type FieldSignature,
} from "./autofill";

const sig = (o: Partial<FieldSignature>): FieldSignature => ({ type: "text", ...o });

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

test("normalizeSignature flattens the naming conventions the ATS platforms use", () => {
  assert.equal(normalizeSignature("firstName"), "first name");
  assert.equal(normalizeSignature("candidate[first_name]"), "candidate first name");
  assert.equal(normalizeSignature("First Name *"), "first name");
  assert.equal(normalizeSignature("job_application[resume_text]"), "job application resume text");
});

/* ------------------------------------------------------------------ *
 * THE BLOCKLIST — the safety-critical half of this module
 * ------------------------------------------------------------------ */

test("every legal attestation is refused, whatever the field is called", () => {
  const attestations = [
    "Are you legally authorized to work in the United States?",
    "Will you now or in the future require sponsorship?",
    "Do you require visa sponsorship?",
    "Are you a US citizen?",
    "Do you hold an active security clearance?",
    "Veteran status",
    "Protected veteran status",
    "Disability status",
    "Voluntary Self-Identification of Disability",
    "Race / Ethnicity",
    "Are you Hispanic or Latino?",
    "Gender",
    "What are your pronouns?",
    "Sexual orientation",
    "EEO questions",
  ];
  for (const label of attestations) {
    assert.equal(isBlockedField(sig({ label })), true, `should block: ${label}`);
    assert.equal(matchFieldKey(sig({ label })), null, `should not fill: ${label}`);
  }
});

test("the blocklist beats an explicit autocomplete attribute", () => {
  // The nightmare case: a form that labels a field as a demographic question
  // and *also* sets autocomplete="name". The blocklist is checked first
  // precisely so the more authoritative-looking signal cannot win.
  assert.equal(
    matchFieldKey(sig({ label: "Gender", name: "gender", autocomplete: "name" })),
    null,
  );
});

test("facts we do not hold are refused rather than guessed", () => {
  for (const label of [
    "Desired salary",
    "Expected compensation",
    "What is your notice period?",
    "Earliest start date",
    "Please provide two references",
    "How did you hear about us?",
  ]) {
    assert.equal(matchFieldKey(sig({ label })), null, `should not fill: ${label}`);
  }
});

test("credential fields are refused", () => {
  assert.equal(matchFieldKey(sig({ label: "Password", type: "password" })), null);
  assert.equal(matchFieldKey(sig({ label: "Social Security Number" })), null);
});

test("file, checkbox and radio inputs are never filled", () => {
  // We hold no original resume document, and a checkbox is a choice rather
  // than a fact — frequently an attestation wearing an unfamiliar label.
  assert.equal(matchFieldKey(sig({ label: "Resume", type: "file" })), null);
  assert.equal(matchFieldKey(sig({ label: "Full name", type: "checkbox" })), null);
  assert.equal(matchFieldKey(sig({ label: "Email", type: "radio" })), null);
});

test("a blocklist word only matches as a whole word", () => {
  // The bug class already fixed once in the field taxonomy: unbounded `race`
  // would match "Racecar Engineering", and `sex` would match "Middlesex".
  assert.equal(isBlockedField(sig({ label: "Middlesex University" })), false);
  assert.equal(matchFieldKey(sig({ label: "Middlesex University" })), "school");
});

/* ------------------------------------------------------------------ *
 * Found by running the matcher over a real Greenhouse form
 *
 * All three of these produced a confident wrong answer against
 * job-boards.greenhouse.io/tripadvisor/jobs/8043141, and none of them was
 * visible from reading the code.
 * ------------------------------------------------------------------ */

test("the reCAPTCHA response field is never filled, whatever label it inherits", () => {
  // It carries no label of its own, so the DOM label search walks up and
  // returns an unrelated "First Name*" from elsewhere on the page. Writing
  // there corrupts the token the form submits.
  assert.equal(
    matchFieldKey(
      sig({ name: "g-recaptcha-response", id: "g-recaptcha-response-100000", label: "First Name*", type: "textarea" }),
    ),
    null,
  );
  assert.equal(isInfrastructureField(sig({ name: "csrf_token" })), true);
  assert.equal(isInfrastructureField(sig({ name: "first_name" })), false);
});

test("a yes/no question is never answered with a fact", () => {
  // "Is your university able to provide an internship agreement?" contains
  // "university", and matched `school` before this rule existed — offering to
  // type the student's school into a yes/no box.
  assert.equal(
    matchFieldKey(sig({ label: "Is your university able to provide an internship agreement?" })),
    null,
  );
  assert.equal(matchFieldKey(sig({ label: "Are you able to work in a hybrid model?" })), null);
  assert.equal(matchFieldKey(sig({ label: "Have you worked with AI before?" })), null);
  assert.equal(isYesNoQuestion(sig({ label: "Do you have a portfolio?" })), true);
});

test("a wh-question asking for a fact still fills", () => {
  // The deliberate limit of the rule above: plenty of forms phrase a genuine
  // field as a question, and declining every question mark would cost real
  // fills for nothing.
  assert.equal(matchFieldKey(sig({ label: "What is your email address?" })), "email");
  assert.equal(matchFieldKey(sig({ label: "Where did you go to school?" })), "school");
});

test("consent and agreement language is an attestation", () => {
  assert.equal(
    isBlockedField(sig({ label: 'By clicking "Yes" below, you agree to the following Application Consent:' })),
    true,
  );
  assert.equal(isBlockedField(sig({ label: "I certify the above is accurate" })), true);
  assert.equal(isBlockedField(sig({ label: "I acknowledge the privacy policy" })), true);
});

test("a link field must say what kind of link it wants", () => {
  // Found on Lever, which renders one link box per purpose. A bare `url` rule
  // claimed every one of them for the portfolio — quietly putting a personal
  // site where a transcript belongs.
  assert.equal(
    matchFieldKey(sig({ label: "Transcripts (if applying for Co-op/Internship) URL" })),
    null,
  );
  assert.equal(matchFieldKey(sig({ label: "Other URL" })), null);
  // …while the ones that do say still fill.
  assert.equal(matchFieldKey(sig({ label: "Portfolio URL" })), "portfolioUrl");
  assert.equal(matchFieldKey(sig({ label: "GitHub URL" })), "githubUrl");
  assert.equal(
    matchFieldKey(sig({ label: "LinkedIn or Personal Website URL" })),
    "linkedinUrl",
  );
});

test("the fields a real Lever form does want are still filled", () => {
  assert.equal(matchFieldKey(sig({ name: "name", label: "Full name" })), "fullName");
  assert.equal(matchFieldKey(sig({ name: "email", label: "Email", type: "email" })), "email");
  assert.equal(matchFieldKey(sig({ name: "location", label: "Current location" })), "location");
  // "Current company" is a fact we do not hold — declined rather than guessed.
  assert.equal(matchFieldKey(sig({ name: "org", label: "Current company" })), null);
});

test("the fields a real Greenhouse form does want are still filled", () => {
  // The other half of the regression: the fixes above must not have made the
  // matcher useless. These are the exact signatures from that live form.
  assert.equal(matchFieldKey(sig({ id: "first_name", label: "First Name", autocomplete: "given-name" })), "firstName");
  assert.equal(matchFieldKey(sig({ id: "last_name", label: "Last Name", autocomplete: "family-name" })), "lastName");
  assert.equal(matchFieldKey(sig({ id: "email", label: "Email", autocomplete: "email" })), "email");
  assert.equal(matchFieldKey(sig({ id: "phone", label: "Phone", type: "tel" })), "phone");
  assert.equal(matchFieldKey(sig({ id: "question_67931134", label: "LinkedIn Profile" })), "linkedinUrl");
});

/* ------------------------------------------------------------------ *
 * Ordinary matching
 * ------------------------------------------------------------------ */

test("names match across every convention, most specific first", () => {
  assert.equal(matchFieldKey(sig({ name: "first_name" })), "firstName");
  assert.equal(matchFieldKey(sig({ name: "firstName" })), "firstName");
  assert.equal(matchFieldKey(sig({ label: "Given name" })), "firstName");
  assert.equal(matchFieldKey(sig({ name: "last_name" })), "lastName");
  assert.equal(matchFieldKey(sig({ label: "Surname" })), "lastName");
  assert.equal(matchFieldKey(sig({ label: "Full name" })), "fullName");
  assert.equal(matchFieldKey(sig({ name: "name" })), "fullName");
});

test("'school name' is a school, not a name", () => {
  // The ordering bug this module is most likely to have: a general `name`
  // rule evaluated before the education rules swallows both of these.
  assert.equal(matchFieldKey(sig({ label: "School name" })), "school");
  assert.equal(matchFieldKey(sig({ label: "University name" })), "school");
  assert.equal(matchFieldKey(sig({ label: "Institution" })), "school");
});

test("education fields", () => {
  assert.equal(matchFieldKey(sig({ label: "Major" })), "major");
  assert.equal(matchFieldKey(sig({ label: "Field of study" })), "major");
  assert.equal(matchFieldKey(sig({ label: "Discipline" })), "major");
  assert.equal(matchFieldKey(sig({ label: "Degree" })), "degree");
  assert.equal(matchFieldKey(sig({ label: "GPA" })), "gpa");
  assert.equal(matchFieldKey(sig({ label: "Grade point average" })), "gpa");
  assert.equal(matchFieldKey(sig({ label: "Expected graduation" })), "gradYear");
  assert.equal(matchFieldKey(sig({ label: "Graduation year" })), "gradYear");
});

test("gpa does not match a word merely containing it", () => {
  assert.equal(matchFieldKey(sig({ label: "gpay handle" })), null);
});

test("contact fields", () => {
  assert.equal(matchFieldKey(sig({ name: "email", type: "email" })), "email");
  assert.equal(matchFieldKey(sig({ label: "Phone" })), "phone");
  assert.equal(matchFieldKey(sig({ label: "Mobile number" })), "phone");
});

test("links are told apart by host, not by a shared 'url' word", () => {
  assert.equal(matchFieldKey(sig({ label: "LinkedIn Profile" })), "linkedinUrl");
  assert.equal(matchFieldKey(sig({ label: "GitHub URL" })), "githubUrl");
  assert.equal(matchFieldKey(sig({ label: "Portfolio" })), "portfolioUrl");
  assert.equal(matchFieldKey(sig({ label: "Website" })), "portfolioUrl");
});

test("the cover letter textarea is recognised", () => {
  assert.equal(matchFieldKey(sig({ label: "Cover Letter", type: "textarea" })), "coverLetter");
});

test("autocomplete is honoured where a form sets it", () => {
  assert.equal(matchFieldKey(sig({ autocomplete: "given-name", name: "x1" })), "firstName");
  assert.equal(matchFieldKey(sig({ autocomplete: "family-name", name: "x2" })), "lastName");
  assert.equal(matchFieldKey(sig({ autocomplete: "tel", name: "x3" })), "phone");
});

test("an unrecognisable field returns null rather than a guess", () => {
  // The common and correct answer. A field we cannot identify is one we leave
  // for the student, and the report says how many those were.
  assert.equal(matchFieldKey(sig({ name: "input-42" })), null);
  assert.equal(matchFieldKey(sig({ label: "Please describe your ideal team" })), null);
  assert.equal(matchFieldKey(sig({})), null);
});

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

test("splitName takes the first token as given name and the rest as family", () => {
  assert.deepEqual(splitName("Ben Chu"), { firstName: "Ben", lastName: "Chu" });
  assert.deepEqual(splitName("Maria del Carmen Rivera"), {
    firstName: "Maria",
    lastName: "del Carmen Rivera",
  });
  assert.deepEqual(splitName("Prince"), { firstName: "Prince", lastName: null });
  assert.deepEqual(splitName("   "), { firstName: null, lastName: null });
});

test("buildAutofillValues derives first/last from the full name", () => {
  const v = buildAutofillValues({
    fields: [{ key: "name", value: "Ben Chu" }],
    links: [],
  });
  assert.equal(v.fullName, "Ben Chu");
  assert.equal(v.firstName, "Ben");
  assert.equal(v.lastName, "Chu");
});

test("buildAutofillValues sorts links by host", () => {
  const v = buildAutofillValues({
    fields: [],
    links: ["https://github.com/bennettc1213", "https://benchu.dev", "https://linkedin.com/in/ben"],
  });
  assert.equal(v.githubUrl, "https://github.com/bennettc1213");
  assert.equal(v.linkedinUrl, "https://linkedin.com/in/ben");
  assert.equal(v.portfolioUrl, "https://benchu.dev");
});

test("a missing fact produces no key at all, never an empty string", () => {
  // Same rule the resume editor follows: null and "" must stay distinguishable,
  // or an absent fact starts looking like a stated blank one.
  const v = buildAutofillValues({
    fields: [
      { key: "name", value: null },
      { key: "gpa", value: "" },
    ],
    links: [],
  });
  assert.equal("fullName" in v, false);
  assert.equal("gpa" in v, false);
});

test("preferred locations collapse to the first, which the student ranked highest", () => {
  const v = buildAutofillValues({
    fields: [{ key: "locations", value: "Austin, Remote, New York" }],
    links: [],
  });
  assert.equal(v.location, "Austin");
});

test("no attestation value can enter the autofill map", () => {
  // Even if a caller hands over workAuth — which the API deliberately does not
  // send — there is no AutofillKey for it, so it cannot reach a form.
  const v = buildAutofillValues({
    fields: [
      { key: "workAuth", value: "US citizen" },
      { key: "sponsorship", value: "no" },
    ],
    links: [],
  });
  assert.deepEqual(v, {});
});

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

test("describeFill reports every category, not just the flattering one", () => {
  const s = describeFill({ filled: 9, known: 2, blocked: 3, unknown: 1, skippedNonEmpty: 1 });
  assert.match(s, /filled 9 fields/);
  assert.match(s, /2 we hold nothing for/);
  assert.match(s, /1 you had already answered/);
  assert.match(s, /3 only you can answer/);
  assert.match(s, /1 we did not recognise/);
});

test("describeFill stays singular for one field", () => {
  assert.equal(
    describeFill({ filled: 1, known: 0, blocked: 0, unknown: 0, skippedNonEmpty: 0 }),
    "filled 1 field",
  );
});
