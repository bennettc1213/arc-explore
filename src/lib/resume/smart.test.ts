import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_BULLETS_PER_ENTRY,
  MAX_PROJECTS,
  ONE_PAGE_BULLET_BUDGET,
  buildSmartResume,
  normaliseDates,
  smartResumeGrantKey,
} from "./smart";
import { EMPTY_PARSED_RESUME, type ParsedResume } from "./types";

function resume(o: Partial<ParsedResume> = {}): ParsedResume {
  return { ...EMPTY_PARSED_RESUME, ...o };
}

function exp(role: string, dates: string | null, bullets: string[] = ["Built a thing for 40 users"]) {
  return { organization: "Acme", role, dates, location: null, bullets };
}

/** Every string a converted resume prints, for the never-invent check. */
function printed(s: ReturnType<typeof buildSmartResume>): string[] {
  return [
    ...s.experiences.flatMap((e) => e.bullets.map((b) => b.text)),
    ...s.projects.flatMap((p) => [p.name, p.description ?? ""]),
    ...s.skills,
  ];
}

describe("normaliseDates", () => {
  it("normalises the common shapes into one", () => {
    assert.equal(normaliseDates("June 2025 - August 2025")?.label, "Jun 2025 – Aug 2025");
    assert.equal(normaliseDates("06/2024 – Present")?.label, "Jun 2024 – Present");
    assert.equal(normaliseDates("Sept. 2023 to May 2024")?.label, "Sep 2023 – May 2024");
    assert.equal(normaliseDates("Summer 2025")?.label, "Summer 2025");
    assert.equal(normaliseDates("2025-06")?.label, "Jun 2025");
    assert.equal(normaliseDates("2022–2024")?.label, "2022 – 2024");
  });

  it("returns null rather than guessing", () => {
    assert.equal(normaliseDates("Marketing 2025"), null, "a prefix of a month is not a month");
    assert.equal(normaliseDates("two summers"), null);
    assert.equal(normaliseDates(null), null);
  });

  it("sorts Present after any real date", () => {
    assert.ok(normaliseDates("Jan 2020 – Present")!.end > normaliseDates("Jan 2020 – Dec 2099")!.end);
  });
});

describe("buildSmartResume — ATS standard", () => {
  it("orders experience newest first, undated entries last in their original order", () => {
    const s = buildSmartResume(
      resume({
        experiences: [
          exp("Old", "Jan 2021 – May 2021"),
          exp("Undated A", null),
          exp("Current", "Jun 2025 – Present"),
          exp("Undated B", "a while"),
          exp("Middle", "2023"),
        ],
      }),
    );
    assert.deepEqual(
      s.experiences.map((e) => e.heading.split(" — ")[0]),
      ["Current", "Middle", "Old", "Undated A", "Undated B"],
    );
    const unreadable = s.experiences.find((e) => e.heading.startsWith("Undated B"))!;
    assert.equal(unreadable.dates, "a while", "an unreadable date prints verbatim");
    assert.equal(unreadable.datesNormalised, false);
  });

  it("puts quantified, strong bullets first and flags the rest without rewriting", () => {
    const s = buildSmartResume(
      resume({ experiences: [exp("Intern", null, ["Responsible for the website", "Cut page load time by 40%"])] }),
    );
    const [first, second] = s.experiences[0].bullets;
    assert.equal(first.text, "Cut page load time by 40%");
    assert.deepEqual(first.flags, []);
    assert.equal(second.text, "Responsible for the website");
    assert.deepEqual(second.flags, ["weak_opener", "no_metric"]);
  });

  it("holds one page: per-entry cap and overall budget, with the rest returned not dropped", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `Shipped feature ${i + 1} to 200 users`);
    const s = buildSmartResume(resume({ experiences: [exp("A", "2025", ten), exp("B", "2024", ten), exp("C", "2023", ten), exp("D", "2022", ten)] }));
    const kept = s.experiences.reduce((n, e) => n + e.bullets.length, 0);
    const omitted = s.experiences.reduce((n, e) => n + e.omitted.length, 0);
    assert.ok(kept <= ONE_PAGE_BULLET_BUDGET);
    assert.ok(s.experiences.every((e) => e.bullets.length >= 1 && e.bullets.length <= MAX_BULLETS_PER_ENTRY));
    assert.equal(kept + omitted, 40, "every bullet is either printed or listed as omitted");
  });

  it("trims nothing when the whole resume already fits one page", () => {
    // From the live corpus: one parsed entry with 8 bullets lost 3 to the
    // per-entry cap although the document fit a page.
    const eight = Array.from({ length: 8 }, (_, i) => `Handled task ${i + 1}`);
    const s = buildSmartResume(resume({ experiences: [exp("Only", null, eight)] }));
    assert.equal(s.experiences[0].bullets.length, 8);
    assert.deepEqual(s.experiences[0].omitted, []);
  });

  it("caps projects and names the ones left off", () => {
    const projects = Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, description: null, link: null }));
    const s = buildSmartResume(resume({ projects }));
    assert.equal(s.projects.length, MAX_PROJECTS);
    assert.deepEqual(s.omittedProjects, ["P4", "P5"]);
  });

  it("de-duplicates skills case-insensitively, keeping the first spelling", () => {
    const s = buildSmartResume(resume({ skills: ["Python", "python ", "SQL", "PYTHON"] }));
    assert.deepEqual(s.skills, ["Python", "SQL"]);
  });

  it("reports nothing as matched or missing without a listing", () => {
    const s = buildSmartResume(resume({ skills: ["Python"] }));
    assert.equal(s.mode, "ats");
    assert.deepEqual(s.matchedSkills, []);
    assert.deepEqual(s.missingSkills, []);
  });
});

describe("buildSmartResume — tailored", () => {
  const parsed = resume({
    experiences: [
      exp("Barista", "Jun 2025 – Present", ["Served 300 customers a day"]),
      exp("Research assistant", "2024", ["Cleaned survey data", "Wrote Python scripts to analyze 10k rows of SQL data"]),
    ],
    projects: [
      { name: "Recipe site", description: "A React app", link: null },
      { name: "Grade tracker", description: "Python and SQL", link: null },
    ],
    skills: ["Excel", "Python", "SQL"],
  });
  const target = { title: "Data Analyst Intern", company: "Initech", skills: ["Python", "SQL", "Tableau"] };

  it("moves the entries, bullets, projects and skills that show the listing's skills first", () => {
    const s = buildSmartResume(parsed, target);
    assert.equal(s.mode, "tailored");
    assert.ok(s.experiences[0].heading.startsWith("Research assistant"));
    assert.ok(s.experiences[0].bullets[0].text.startsWith("Wrote Python"));
    assert.equal(s.projects[0].name, "Grade tracker");
    assert.deepEqual(s.skills.slice(0, 2), ["Python", "SQL"]);
  });

  it("reports a missing listing skill and never adds it to the resume", () => {
    const s = buildSmartResume(parsed, target);
    assert.deepEqual(s.matchedSkills, ["Python", "SQL"]);
    assert.deepEqual(s.missingSkills, ["Tableau"]);
    assert.ok(!printed(s).some((line) => /tableau/i.test(line)), "Tableau must not appear anywhere on the sheet");
  });

  it("prints only strings that were on the resume", () => {
    const source = new Set([
      ...parsed.experiences.flatMap((e) => e.bullets),
      ...parsed.projects.flatMap((p) => [p.name ?? "", p.description ?? ""]),
      ...parsed.skills,
    ]);
    for (const line of printed(buildSmartResume(parsed, target))) {
      if (line) assert.ok(source.has(line), `"${line}" was not on the resume`);
    }
  });

  it("falls back to the standard layout, and says so, when the listing names no readable skills", () => {
    const s = buildSmartResume(parsed, { title: "Summer Associate", company: "Globex", skills: [] });
    assert.equal(s.mode, "ats");
    assert.ok(s.notes.some((n) => n.includes("nothing to tailor against")));
    assert.deepEqual(s.missingSkills, []);
  });
});

describe("smartResumeGrantKey", () => {
  it("separates the standard conversion from each tailored one", () => {
    assert.notEqual(smartResumeGrantKey("rev:a", null), smartResumeGrantKey("rev:a", "listing-1"));
    assert.notEqual(smartResumeGrantKey("rev:a", "listing-1"), smartResumeGrantKey("rev:b", "listing-1"));
  });
});
