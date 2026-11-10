import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogCycleYear, finalDeadline, hiddenFields, pageTarget, parseCatalogPage } from "./osac";

// Trimmed from osacapps.hecc.oregon.gov/Catalog/Default.aspx as served 2026-11-10.
const PAGE = `
<h1>2027-28 OSAC Scholarship Catalog</h1>
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc&amp;def" />
<input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="x&#39;y" />
<a id="ctl00_MainContent_SearchPage_PageNumbers_ctrl0_PageNumberButton" class="aspNetDisabled">1</a>
<a id="ctl00_MainContent_SearchPage_PageNumbers_ctrl1_PageNumberButton" href="javascript:__doPostBack(&#39;ctl00$MainContent$SearchPage$PageNumbers$ctrl1$PageNumberButton&#39;,&#39;&#39;)">2</a>
<div class="search-results public">
  <fieldset>
    <legend>270:  Betty Campbell & Jeanette M. Crawley  Scholarship</legend>
    <div class="notes-panel requirement-list info-panel"><h3>Requirements</h3><ul>
      <li class='RQMNT '><span id="a">Requirement: </span> Attended Boise-Eliot/Humboldt Elementary School 3+ years </li>
      <li class='GPA '><span id="b">GPA: </span> GPA 2.0+ </li>
      <li class='CLG '><span id="c">Colleges: </span> <p>Oregon title IV institutions&nbsp;or HBCU Institutions</p></li>
    </ul></div>
    <div class="notes-panel info-panel"><h3>Documents &amp; Additional Requirements</h3><ul>
      <li> Essay: Describe at least one positive experience at Boise-Eliot/Humboldt.
        <span id="d" style="color:Gray;"> Length: 150 words or less</span></li>
    </ul></div>
  </fieldset>
  <fieldset>
    <legend>332: Fletcher Memorial Scholarship</legend>
    <ul><li class='RQMNT '> Graduating seniors of Grant High School, Portland </li></ul>
  </fieldset>
</div>`;

const APPLICATION =
  "What are the timelines and/or deadlines? November - March 1*: Start your OSAC scholarship application " +
  "February 15*: Early Bird deadline March 1*: Final deadline for all materials to be submitted to OSAC";

test("the cycle year comes from the catalogue heading and the deadline from the application page", () => {
  assert.equal(catalogCycleYear(PAGE), 2027);
  assert.equal(finalDeadline(APPLICATION, 2027)?.toISOString(), "2027-03-01T00:00:00.000Z");
  // Neither the early-bird date nor the "start" range is the final deadline.
  assert.equal(finalDeadline("February 15*: Early Bird deadline", 2027), null);
  assert.equal(finalDeadline(APPLICATION, null), null);
});

test("each fieldset is one award, with typed requirements and essays kept verbatim", () => {
  const deadline = new Date(Date.UTC(2027, 2, 1));
  const rows = parseCatalogPage(PAGE, deadline);
  assert.equal(rows.length, 2);
  const [betty, fletcher] = rows;
  assert.equal(betty.sourceId, "270");
  assert.equal(betty.title, "Betty Campbell & Jeanette M. Crawley Scholarship");
  assert.deepEqual(betty.eligibility.slice(0, 3), [
    "Requirement: Attended Boise-Eliot/Humboldt Elementary School 3+ years",
    "GPA: GPA 2.0+",
    "Colleges: Oregon title IV institutions or HBCU Institutions",
  ]);
  assert.match(betty.eligibility[3], /^Essay: .* Length: 150 words or less$/);
  // No dollar figure is stated, so nothing is invented.
  assert.equal(betty.amountMin, null);
  assert.equal(betty.amountMax, null);
  assert.equal(betty.deadlineAt, deadline);
  assert.equal(fletcher.sourceId, "332");
  assert.deepEqual(fletcher.eligibility, ["Graduating seniors of Grant High School, Portland"]);
});

test("paging replays decoded hidden fields and finds the next page button", () => {
  const form = hiddenFields(PAGE);
  assert.equal(form.get("__VIEWSTATE"), "abc&def");
  assert.equal(form.get("__EVENTVALIDATION"), "x'y");
  assert.equal(pageTarget(PAGE, 2), "ctl00$MainContent$SearchPage$PageNumbers$ctrl1$PageNumberButton");
  // The current page's own button is disabled, and there is no page 3 here.
  assert.equal(pageTarget(PAGE, 1), null);
  assert.equal(pageTarget(PAGE, 3), null);
});

test("awards the title normaliser would merge keep distinct identities", async () => {
  const { canonicalHash } = await import("../ingest/normalize");
  const page = (id: string, name: string) => `<fieldset><legend>${id}: ${name}</legend><ul><li>x</li></ul></fieldset>`;
  const rows = parseCatalogPage(
    page("369", "Roseburg High School Class of 1949 Scholarship") + page("367", "Roseburg High School Class of 1955 Scholarship") +
    page("518", "Harold Alfred Wyatt #3 Scholarship") + page("131", "Harold Alfred Wyatt Scholarship") + page("1955", "Year Shaped Id"),
    null,
  );
  const hash = (r: (typeof rows)[number]) => canonicalHash({ companyName: r.sponsorName, title: r.identityKey ?? r.title, locations: [], term: null });
  assert.equal(new Set(rows.map(hash)).size, rows.length);
  // The same ids still collide by title alone, which is why identityKey exists.
  assert.equal(new Set(rows.map((r) => canonicalHash({ companyName: r.sponsorName, title: r.title, locations: [], term: null }))).size, 3);
});

test("residency is read only from unambiguous typed residence lines", async () => {
  const { statedResidency } = await import("./osac");
  const r = (line: string) => statedResidency([line])?.states ?? null;
  // Real values from the 2027-28 catalogue.
  assert.deepEqual(r("Residence (state): Oregon residents"), ["Oregon"]);
  assert.deepEqual(r("Residence (state): Oregon Resident"), ["Oregon"]);
  assert.deepEqual(r("Residence (state): Oregon or Washington"), ["Oregon", "Washington"]);
  assert.deepEqual(r("Residence (state): Open to residents of Oregon, Washington, Idaho, Nevada, Utah and Montana"), ["Oregon", "Washington", "Idaho", "Nevada", "Utah", "Montana"]);
  assert.deepEqual(r("Residence (county): Polk County"), ["Oregon"]);
  assert.deepEqual(r("Residence (county): Clackamas, Lane, Multnomah, or Washington County"), ["Oregon"]);
  // Each of these says something other than "only these states", so nothing is claimed.
  for (const line of [
    "Residence (state): Oregon residency not required",
    "Residence (state): Preference: Oregon",
    "Residence (state): Must have been an Oregon resident for at least 16 years",
    "Residence (state): Oregon or Clark County, Washington",
    "Residence (county): Malheur County (Oregon), and Payette County (Idaho)",
    "Residence (other): Residence of Santiam Canyon",
    "Residence (city): Portland",
  ]) assert.equal(r(line), null, line);
  assert.equal(statedResidency(["Residence (county): Polk County"])?.quote, "Residence (county): Polk County");
});
