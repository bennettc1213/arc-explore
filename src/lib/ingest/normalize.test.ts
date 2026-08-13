import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalHash,
  canonicalUrl,
  classifyOpportunity,
  detectTerm,
  detectWorkAuth,
  isRemoteLocation,
  normalizeCompanyName,
  normalizeLocations,
  normalizeTitle,
} from "./normalize";

describe("normalizeCompanyName", () => {
  it("strips corporate suffixes and punctuation", () => {
    assert.equal(normalizeCompanyName("Goldman Sachs & Co. LLC"), "goldman sachs");
    assert.equal(normalizeCompanyName("Stripe, Inc."), "stripe");
    assert.equal(normalizeCompanyName("Two Sigma Investments, LP"), "two sigma investments");
  });

  it("collapses real-world spelling variants to one key", () => {
    assert.equal(normalizeCompanyName("Citadel Securities"), normalizeCompanyName("CITADEL SECURITIES"));
    assert.equal(normalizeCompanyName("The Boston Consulting Group"), "boston consulting");
  });

  it("strips accents so unicode variants match", () => {
    // Precomposed vs decomposed forms of the same name must agree.
    assert.equal(normalizeCompanyName("Nestlé"), "nestle");
    assert.equal(normalizeCompanyName("Nestlé"), "nestle");
    assert.equal(normalizeCompanyName("Nestlé"), normalizeCompanyName("Nestlé"));
  });

  it("is stable on empty input", () => {
    assert.equal(normalizeCompanyName(""), "");
  });
});

describe("normalizeTitle", () => {
  it("drops requisition ids and bracketed noise", () => {
    assert.equal(
      normalizeTitle("HR GENERALIST 1 - 08112026-79988"),
      normalizeTitle("HR GENERALIST 1"),
    );
    assert.equal(
      normalizeTitle("Software Engineer Intern (Summer 2027)"),
      "software engineer intern",
    );
  });
});

describe("canonicalUrl", () => {
  it("strips tracking params but KEEPS gh_jid", () => {
    // gh_jid is Greenhouse's job identifier, not tracking. Dropping it would
    // collapse every posting at a company into a single URL.
    const out = canonicalUrl("https://stripe.com/jobs/search?gh_jid=8077887&utm_source=x&gh_src=abc");
    assert.match(out, /gh_jid=8077887/);
    assert.doesNotMatch(out, /utm_source/);
    assert.doesNotMatch(out, /gh_src/);
  });

  it("normalizes host, scheme, path slash and param order to one form", () => {
    const a = canonicalUrl("http://WWW.Example.com/jobs/?b=2&a=1");
    const b = canonicalUrl("https://example.com/jobs?a=1&b=2");
    assert.equal(a, b);
  });

  it("leaves a slash inside a query value alone", () => {
    // Only the *path* trailing slash is normalized.
    assert.match(canonicalUrl("https://example.com/jobs?next=a/b"), /a(%2F|\/)b/);
  });

  it("returns the input unchanged when it is not a valid URL", () => {
    assert.equal(canonicalUrl("not a url"), "not a url");
  });
});

describe("classifyOpportunity", () => {
  it("detects internships", () => {
    assert.equal(classifyOpportunity("Software Engineer Intern"), "internship");
    assert.equal(classifyOpportunity("2027 Summer Analyst - Investment Banking"), "internship");
    assert.equal(classifyOpportunity("Engineering Co-op (Fall 2026)"), "internship");
  });

  it("does NOT fire on 'internal' or 'international'", () => {
    // The word-boundary behaviour these regexes depend on.
    assert.equal(classifyOpportunity("Internal Audit Associate"), "other");
    assert.equal(classifyOpportunity("International Tax Manager"), "other");
  });

  it("excludes senior roles that merely mention interns", () => {
    assert.equal(classifyOpportunity("Senior Manager, Internship Program"), "other");
    assert.equal(classifyOpportunity("Intern Program Coordinator"), "other");
  });

  it("detects new-grad roles separately", () => {
    assert.equal(classifyOpportunity("New Grad Software Engineer"), "new_grad");
    assert.equal(classifyOpportunity("Graduate Analyst Programme"), "new_grad");
  });

  it("classifies ordinary senior roles as other", () => {
    assert.equal(classifyOpportunity("Staff Backend Engineer"), "other");
  });

  it("ignores prose that merely mentions internships", () => {
    // Regression: classifying against description text on OpenAI's live board
    // produced 17 matches and all 17 were false positives — JD boilerplate
    // says "internships" constantly. Anything longer than a structured field
    // is ignored outright.
    const jdBoilerplate =
      "We support OpenAI customers and our internal teams. We also offer internships " +
      "and entry-level opportunities across the company, and our co-op partners.";
    assert.equal(classifyOpportunity("Software Engineer, Backend", jdBoilerplate), "other");
    assert.equal(classifyOpportunity("Forward Deployed Software Engineer - SF", jdBoilerplate), "other");
  });

  it("accepts a short structured hint", () => {
    // Ashby's employmentType / SmartRecruiters' experienceLevel are reliable.
    assert.equal(classifyOpportunity("Software Engineer", "Intern"), "internship");
    assert.equal(classifyOpportunity("Analyst", "internship"), "internship");
  });

  it("uses the hint to catch non-English internships", () => {
    // Measured on Bosch: 92 real roles the English title regex cannot see.
    // SmartRecruiters normalizes experienceLevel to English, so the hint works
    // regardless of the posting's language.
    assert.equal(
      classifyOpportunity("Pflichtpraktikum in der Personalabteilung (m/w/div.)", "Internship"),
      "internship",
    );
    assert.equal(classifyOpportunity("Praktikum in HR und digitales Lernen", "Internship"), "internship");
  });

  it("rejects evergreen talent-pool rows", () => {
    // Seen live on Samsung Research America's board. These sit on a board
    // permanently and are not openings.
    assert.equal(classifyOpportunity("Don't see internships you are looking for?"), "other");
    assert.equal(classifyOpportunity("General Application - Internships"), "other");
    assert.equal(classifyOpportunity("Join our talent community - Interns"), "other");
    assert.equal(classifyOpportunity("Future Internship Opportunities"), "other");
    // ...while a real posting with similar words still passes.
    assert.equal(classifyOpportunity("Software Engineer Intern, Platform"), "internship");
  });

  it("does NOT promote an 'Entry Level' hint", () => {
    // Measured on Bosch: this added 132 ordinary permanent jobs. In ATS
    // taxonomy "Entry Level" is a seniority band, not a campus program.
    assert.equal(classifyOpportunity("Customer Support Agent", "Entry Level"), "other");
    assert.equal(classifyOpportunity("Field Calibration Technician - Remote", "Entry Level"), "other");
  });
});

describe("detectTerm", () => {
  it("extracts season + 4-digit year", () => {
    assert.equal(detectTerm("Software Intern, Summer 2027"), "Summer 2027");
    assert.equal(detectTerm("Fall 2026 Co-op"), "Fall 2026");
  });

  it("normalizes autumn to fall and 2-digit years", () => {
    assert.equal(detectTerm("Autumn 2026 Placement"), "Fall 2026");
    assert.equal(detectTerm("Summer '27 Analyst"), "Summer 2027");
  });

  it("handles the reversed 'YEAR Season' form", () => {
    // Live sample: "2026 Fall Intern, Digital Health Algorithms" read as
    // unknown, which left 73% of postings without a term.
    assert.equal(detectTerm("2026 Fall Intern, Digital Health Algorithms"), "Fall 2026");
    assert.equal(detectTerm("2027 Summer Analyst Program"), "Summer 2027");
  });

  it("returns null rather than guessing when no term is stated", () => {
    assert.equal(detectTerm("Software Engineer Intern"), null);
    assert.equal(detectTerm(null, undefined), null);
  });
});

describe("detectWorkAuth", () => {
  it("reads the three stated cases", () => {
    assert.equal(detectWorkAuth("Must be a U.S. citizen"), "citizenship_required");
    assert.equal(detectWorkAuth("We are unable to sponsor visas"), "no_sponsorship");
    assert.equal(detectWorkAuth("Visa sponsorship is available"), "sponsorship_offered");
  });

  it("returns null when the posting says nothing", () => {
    // Simplify's own sponsorship field is 98% "Other" — guessing here would
    // put a fabricated constraint in front of the user.
    assert.equal(detectWorkAuth("Great internship, apply now"), null);
  });

  it("does NOT treat export-control language as visa sponsorship", () => {
    // Regression, verbatim from Cloudflare's live board. This wrongly marked
    // all 12 of their internships "no_sponsorship" — which would tell an
    // international student the company won't sponsor them when the posting
    // never says that.
    const cloudflare =
      "This position may require access to information protected under U.S. export " +
      "control laws. Your engagement is conditioned on your authorization to receive " +
      "software or technology controlled under these U.S. export laws without " +
      "sponsorship for an export license. Cloudflare is proud to be an equal " +
      "opportunity employer.";
    assert.equal(detectWorkAuth(cloudflare), null);
  });

  it("still reads genuine visa language in the same document", () => {
    const mixed =
      "Your engagement is conditioned on authorization to receive technology " +
      "controlled under U.S. export laws without sponsorship for an export license. " +
      "We are unable to provide visa sponsorship for this role.";
    assert.equal(detectWorkAuth(mixed), "no_sponsorship");
  });

  it("requires immigration context before claiming anything", () => {
    // "sponsor" alone (charity sponsorship, event sponsors) proves nothing.
    assert.equal(detectWorkAuth("We sponsor local STEM outreach programs."), null);
    assert.equal(detectWorkAuth("Our team sponsors an annual hackathon."), null);
  });

  /*
   * Phrasings taken verbatim from live boards. The original pattern read only
   * 87 of the 341 postings in our corpus that stated a requirement — three in
   * four employers who told us were recorded as "not stated", which quietly
   * dropped a 25-weight scoring dimension.
   */
  it("reads the ways employers actually decline to sponsor", () => {
    const real = [
      "Work authorization in the United States without the need for sponsorship",
      "Must be authorized to work in the United States without requiring sponsorship now or in the future.",
      "Indefinite U.S. work authorized individuals only. Future sponsorship for work authorization unavailable.",
      "Sponsorship for US employment authorization is not available for this position now or in the future.",
      "You must be legally authorized to work in the US. Visa sponsorship is not available for our new grad positions.",
      "Must be presently authorized to work for any employer in the United States and must not require work visa sponsorship from NBCUniversal now or in the future.",
      "Future sponsorship for work authorization (including those under CPT/OPT) is not available.",
    ];
    for (const text of real) {
      assert.equal(detectWorkAuth(text), "no_sponsorship", `missed: ${text}`);
    }
  });

  /*
   * The other half of the same change. A false "will not sponsor" tells an
   * international student to skip a role they could actually get, so these
   * near-misses matter more than the coverage above.
   */
  it("does not read sponsorship into text that never claimed it", () => {
    const innocent = [
      // "sponsor" as a business noun
      "Assist with partner and sponsor coordination where relevant.",
      "All interns are assigned a Sr. HR Executive Sponsor, as well as rotation leaders.",
      "Interns are supported by AbbVie-sponsored relocation and travel benefits.",
      // export-control licence, not immigration
      "Your engagement is conditioned on your authorization to receive technology controlled under these U.S. export laws without sponsorship for an export license.",
      // an offer, not a refusal
      "Relocation assistance is provided for those willing to relocate including visa sponsorship where applicable.",
      // someone on OPT is legally authorized — this sentence does not say
      // what it looks like it says
      "This position is open to candidates who are legally authorized to work in the United States.",
    ];
    for (const text of innocent) {
      assert.notEqual(detectWorkAuth(text), "no_sponsorship", `false positive: ${text}`);
    }
  });

  /*
   * Regression for a dead regex branch. The immigration-context gate listed
   * `work authoriz` inside a group closed by `\b`, which cannot match
   * "authorization" — so the branch never fired and any posting that discussed
   * work authorization without using the literal word "visa" was skipped.
   */
  it("recognises work-authorization wording that never says 'visa'", () => {
    assert.equal(
      detectWorkAuth("Work authorization in the United States without the need for sponsorship"),
      "no_sponsorship",
    );
    assert.equal(
      detectWorkAuth("Work authorisation in the United Kingdom without the need for sponsorship"),
      "no_sponsorship",
    );
  });

  it("reads ITAR citizenship requirements as a real restriction", () => {
    // Unlike export-licence sponsorship wording, this genuinely restricts who
    // can be hired, so it must survive.
    assert.equal(
      detectWorkAuth("Due to ITAR requirements, U.S. citizenship is required."),
      "citizenship_required",
    );
  });
});

describe("normalizeLocations / isRemoteLocation", () => {
  it("dedupes case-insensitively and sorts for hash stability", () => {
    assert.deepEqual(normalizeLocations(["NYC", "nyc", " SF ", null]), ["NYC", "SF"]);
  });

  it("detects remote", () => {
    assert.equal(isRemoteLocation(["Remote (US)"]), true);
    assert.equal(isRemoteLocation(["New York, NY"]), false);
  });
});

describe("canonicalHash", () => {
  const base = {
    companyName: "Stripe, Inc.",
    title: "Software Engineer Intern (Summer 2027)",
    locations: ["San Francisco, CA"],
    term: "Summer 2027",
  };

  it("collapses the same role seen from two different feeds", () => {
    // This is the dedup guarantee: Simplify and Greenhouse describe the same
    // job differently, and must produce one posting.
    const fromGreenhouse = canonicalHash(base);
    const fromSimplify = canonicalHash({
      companyName: "Stripe",
      title: "Software Engineer Intern - Summer 2027",
      locations: ["San Francisco, CA"],
      term: "Summer 2027",
    });
    assert.equal(fromGreenhouse, fromSimplify);
  });

  it("is order-insensitive across locations", () => {
    assert.equal(
      canonicalHash({ ...base, locations: ["NYC", "SF"] }),
      canonicalHash({ ...base, locations: ["SF", "NYC"] }),
    );
  });

  it("separates different terms of the same role", () => {
    assert.notEqual(canonicalHash(base), canonicalHash({ ...base, term: "Summer 2026" }));
  });

  it("separates different cities of the same role", () => {
    assert.notEqual(canonicalHash(base), canonicalHash({ ...base, locations: ["Seattle, WA"] }));
  });
});
