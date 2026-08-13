import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { critiqueResume, isQuantified, weakOpener } from "./critique";
import { EMPTY_PARSED_RESUME, type ParsedResume } from "./types";

function resume(o: Partial<ParsedResume> = {}): ParsedResume {
  return { ...EMPTY_PARSED_RESUME, ...o };
}

function withBullets(bullets: string[]): ParsedResume {
  return resume({
    experiences: [
      { organization: "Acme", role: "Intern", dates: "Jun 2025 – Aug 2025", location: null, bullets },
    ],
  });
}

/** A resume with nothing wrong with it, to isolate one fault at a time. */
const GOOD = resume({
  name: "Alex Rivera",
  email: "alex@example.com",
  phone: "555-0100",
  school: "State University",
  major: "B.S. Computer Science",
  gradYear: 2027,
  gpa: 3.7,
  skills: ["Python", "SQL", "React", "AWS", "Docker", "TypeScript"],
  links: ["github.com/arivera"],
  experiences: [
    {
      organization: "Acme",
      role: "Software Engineering Intern",
      dates: "Jun 2025 – Aug 2025",
      location: "Austin, TX",
      bullets: [
        "Built an ingestion service that cut sync latency from 90s to 4s across 12 regions",
        "Automated a release check that caught 30 regressions before production",
      ],
    },
    {
      organization: "Campus Lab",
      role: "Research Assistant",
      dates: "Jan 2025 – May 2025",
      location: "Austin, TX",
      bullets: [
        "Trained a classifier reaching 94% accuracy on 40,000 labelled samples",
        "Shipped a dashboard used weekly by 3 research groups",
      ],
    },
  ],
  projects: [{ name: "Feedreader", description: "A thing", link: "github.com/arivera/feedreader" }],
});

describe("isQuantified", () => {
  it("accepts the shapes a real achievement takes", () => {
    const yes = [
      "Reduced p95 latency by 40%",
      "Cut cloud spend by $12,000 a year",
      "Served 2.5M requests a day",
      "Onboarded 1,200 users in the first week",
      "Led a team of 5 engineers",
      "Doubled the throughput of the parser",
      "Selected as 1 of 30 fellows nationally",
      "Handled hundreds of concurrent connections",
    ];
    for (const b of yes) assert.ok(isQuantified(b), `should count as quantified: ${b}`);
  });

  /*
   * The false-positive suite. Telling a student a bullet already has a number
   * when the only digits in it are a date or a version number teaches them the
   * wrong lesson about their own writing, and it is the exact error a naive
   * /\d/ test makes.
   */
  it("does not count dates as quantification", () => {
    const no = [
      "Built the data pipeline in Summer 2025",
      "Interned on the platform team in 2024",
      "Member of the robotics club from 2023 to 2025",
      "Worked at the campus lab, Jan 2025 – May 2025",
      "Studied abroad during 2024",
    ];
    for (const b of no) assert.equal(isQuantified(b), false, `should NOT be quantified: ${b}`);
  });

  it("does not count version and product numbers as quantification", () => {
    const no = [
      "Migrated the app to React 18",
      "Wrote services in Python 3.11",
      "Used ES6 modules throughout",
      "Stored assets in S3 and ran jobs on EC2",
      "Upgraded the fleet to HTTP/2",
      "Supported remote work during COVID-19",
    ];
    for (const b of no) assert.equal(isQuantified(b), false, `should NOT be quantified: ${b}`);
  });

  it("keeps a bare number that happens to look like a year", () => {
    // Stripping every 4-digit number would silently discredit real metrics.
    assert.ok(isQuantified("Grew the mailing list to 2,500 subscribers"));
    assert.ok(isQuantified("Processed 1998 support tickets in one quarter"));
  });

  it("still finds the number in a bullet that also carries a date", () => {
    assert.ok(isQuantified("In 2024, cut build times by 60%"));
  });
});

describe("weakOpener", () => {
  it("flags the phrases that describe a job rather than work", () => {
    assert.equal(weakOpener("Responsible for the nightly build"), "Responsible for");
    assert.equal(weakOpener("Helped with QA on the mobile app"), "Helped");
    assert.equal(weakOpener("Assisted with data entry"), "Assisted with");
    assert.equal(weakOpener("Worked on the checkout flow"), "Worked on");
    assert.equal(weakOpener("Participated in code reviews"), "Participated in");
  });

  it("leaves strong bullets alone", () => {
    // A critique that flags good writing gets ignored wholesale, so this is
    // the more important half of the check.
    const strong = [
      "Built a caching layer that removed 80% of duplicate queries",
      "Led the migration off the legacy scheduler",
      "Shipped the onboarding redesign to 40,000 users",
      "Reduced flake rate from 12% to under 1%",
      "Worked through a backlog of 200 tickets", // "Worked through" is not "Worked on"
      "Helpdesk rotation for the research cluster", // "Helpdesk" is not "Helped"
    ];
    for (const b of strong) assert.equal(weakOpener(b), null, `should not be flagged: ${b}`);
  });

  it("only looks at the opening, not the whole line", () => {
    assert.equal(weakOpener("Rebuilt the API that the billing team was responsible for"), null);
  });
});

describe("critiqueResume", () => {
  it("scores a well-formed resume highly and finds little to say", () => {
    const c = critiqueResume(GOOD);
    assert.ok(c.score !== null && c.score >= 85, `expected >=85, got ${c.score}`);
    assert.equal(c.knownDimensions, 4);
    assert.equal(c.totalDimensions, 4);
    assert.equal(c.bulletCount, 4);
    assert.ok(c.findings.length <= 1, `expected few findings, got ${c.findings.length}`);
  });

  it("every finding carries an instruction, not just a diagnosis", () => {
    // The roadmap line is "actionable fixes per section, not just one score".
    const c = critiqueResume(resume({ experiences: GOOD.experiences }));
    assert.ok(c.findings.length > 0);
    for (const f of c.findings) {
      assert.ok(f.fix.length > 20, `finding has no usable fix: ${f.title}`);
      assert.ok(f.section, "finding must name a section");
    }
  });

  it("reports an unreadable document as unreadable rather than as a bad resume", () => {
    const c = critiqueResume(EMPTY_PARSED_RESUME);

    // Nothing to read means the bullet dimensions have nothing to assess, and
    // dropping them is the same honesty rule the fit scorer follows.
    const quantified = c.dimensions.find((d) => d.key === "quantified");
    const language = c.dimensions.find((d) => d.key === "bullet_language");
    assert.equal(quantified?.score, null);
    assert.equal(language?.score, null);
    assert.equal(c.knownDimensions, 2);
    assert.equal(c.totalDimensions, 4);

    // But we still say something true and useful about the document.
    assert.ok(c.score !== null && c.score < 25, `expected a low score, got ${c.score}`);
    assert.ok(c.findings.some((f) => /could not find your name/i.test(f.title)));
    assert.ok(c.findings.some((f) => /could not find an email/i.test(f.title)));
    assert.ok(c.findings.some((f) => /could not find any work history/i.test(f.title)));
  });

  it("names two-column layout as the likely cause when work history vanishes", () => {
    // We cannot see the document by this point, so the finding has to name a
    // cause without asserting it.
    const c = critiqueResume(resume({ name: "A", email: "a@b.co", school: "X" }));
    // By dimension, not by title: the projects finding also says "work
    // history" and would satisfy a looser match.
    const f = c.findings.find(
      (x) => x.dimension === "machine_readable" && x.section === "experience",
    );
    assert.ok(f, "expected a work-history finding");
    assert.match(f.fix, /two-column/i);
  });

  it("does not ask for projects when there is real work history", () => {
    const c = critiqueResume({ ...GOOD, projects: [] });
    assert.ok(
      !c.findings.some((f) => f.section === "projects"),
      "two roles is enough to stand on without projects",
    );
  });

  it("asks for projects when work history is thin", () => {
    const thin = { ...GOOD, projects: [], experiences: GOOD.experiences.slice(0, 1) };
    const c = critiqueResume(thin);
    const f = c.findings.find((x) => x.section === "projects");
    assert.ok(f, "one role and no projects should raise a gap");
    assert.equal(f.severity, "high");
  });

  it("counts quantified bullets and quotes one that is not", () => {
    const c = critiqueResume(
      withBullets([
        "Improved the performance of the search page",
        "Refactored the settings module",
        "Cut render time by 45%",
      ]),
    );
    const dim = c.dimensions.find((d) => d.key === "quantified");
    assert.ok(dim);
    assert.match(dim.detail, /1 of 3/);

    const f = c.findings.find((x) => x.dimension === "quantified");
    assert.ok(f, "expected a quantification finding");
    assert.equal(f.evidence, "Improved the performance of the search page");
  });

  it("quotes a different bullet than the language finding does", () => {
    // Both findings picking bullet one prints the same sentence twice, which
    // reads as a bug rather than as two separate problems.
    const c = critiqueResume(
      withBullets([
        "Responsible for the nightly build",
        "Refactored the settings module",
        "Reviewed pull requests from the platform team",
      ]),
    );
    const quantified = c.findings.find((x) => x.dimension === "quantified");
    const language = c.findings.find((x) => x.dimension === "bullet_language");
    assert.ok(quantified?.evidence && language?.evidence);
    assert.notEqual(quantified.evidence, language.evidence);
    // And the one it chose is the instructive kind: fine except for the number.
    assert.equal(quantified.evidence, "Refactored the settings module");
  });

  it("still quotes two different bullets when every bullet is weak", () => {
    const c = critiqueResume(
      withBullets([
        "Responsible for the nightly build",
        "Helped with QA on the mobile app",
        "Worked on the reporting process",
      ]),
    );
    const quantified = c.findings.find((x) => x.dimension === "quantified");
    const language = c.findings.find((x) => x.dimension === "bullet_language");
    assert.ok(quantified?.evidence && language?.evidence);
    assert.notEqual(quantified.evidence, language.evidence);
  });

  it("quotes the only bullet there is rather than nothing", () => {
    // The step-around must not become a reason to show no evidence at all.
    const c = critiqueResume(withBullets(["Responsible for the nightly build"]));
    const quantified = c.findings.find((x) => x.dimension === "quantified");
    assert.equal(quantified?.evidence, "Responsible for the nightly build");
  });

  it("gives full credit once half the bullets carry a number", () => {
    // Not scaled past the target: every line carrying a metric reads as padded,
    // not as better.
    const c = critiqueResume(
      withBullets(["Cut latency by 40%", "Refactored the settings module"]),
    );
    assert.equal(c.dimensions.find((d) => d.key === "quantified")?.score, 100);
    assert.ok(!c.findings.some((f) => f.dimension === "quantified"));
  });

  it("orders findings by how much fixing them moves the score", () => {
    // A resume that parses perfectly but says nothing measurable: the
    // quantified dimension is at zero and should lead, ahead of the smaller
    // completeness gap.
    const r = {
      ...GOOD,
      links: [],
      experiences: [
        {
          organization: "Acme",
          role: "Intern",
          dates: "Jun 2025 – Aug 2025",
          location: null,
          bullets: ["Improved the build", "Refactored the parser", "Reviewed pull requests"],
        },
      ],
    };
    const c = critiqueResume(r);
    assert.ok(c.findings.length >= 2);
    assert.equal(
      c.findings[0].dimension,
      "quantified",
      `expected the zero-scoring dimension first, got ${c.findings[0].dimension}`,
    );
  });

  it("flags weak openers with the offending line attached", () => {
    const c = critiqueResume(
      withBullets([
        "Responsible for maintaining the CI pipeline",
        "Shipped a fix that cut retries by 30%",
      ]),
    );
    const f = c.findings.find((x) => x.dimension === "bullet_language");
    assert.ok(f);
    assert.match(f.title, /open with a phrase/);
    assert.equal(f.evidence, "Responsible for maintaining the CI pipeline");
    assert.match(f.fix, /Responsible for/);
  });

  it("truncates a long bullet when quoting it back", () => {
    const long = `Built ${"a very long description ".repeat(20)}end`;
    const c = critiqueResume(withBullets([long]));
    const f = c.findings.find((x) => /runs long/.test(x.title));
    assert.ok(f?.evidence);
    assert.ok(f.evidence.length <= 111, `evidence not truncated: ${f.evidence.length}`);
    assert.match(f.evidence, /…$/);
  });

  it("does not double-count one bullet that is both weak and long", () => {
    const bullet = `Responsible for ${"coordinating across many teams ".repeat(15)}`;
    const c = critiqueResume(withBullets([bullet]));
    const dim = c.dimensions.find((d) => d.key === "bullet_language");
    assert.ok(dim);
    // One bad bullet out of one is 0 clean, not -1.
    assert.equal(dim.score, 0);
    assert.match(dim.detail, /0 of 1/);
  });

  it("survives a resume where every field is empty or malformed", () => {
    const messy = resume({
      experiences: [
        { organization: null, role: null, dates: null, location: null, bullets: [] },
        { organization: "  ", role: null, dates: null, location: null, bullets: ["x"] },
      ],
      skills: [],
      links: [],
    });
    const c = critiqueResume(messy);
    assert.ok(c.score !== null);
    assert.ok(c.findings.length > 0);
    for (const d of c.dimensions) {
      assert.ok(d.score === null || (d.score >= 0 && d.score <= 100), `${d.key} out of range`);
    }
  });

  it("keeps every dimension score inside 0–100 for a perfect and an empty resume", () => {
    for (const r of [GOOD, EMPTY_PARSED_RESUME]) {
      const c = critiqueResume(r);
      assert.ok(c.score === null || (c.score >= 0 && c.score <= 100));
    }
  });
});
