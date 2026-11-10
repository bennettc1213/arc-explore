import assert from "node:assert/strict";
import { test } from "node:test";

import { jazzhrBoardFromUrl, parseJazzhrBoard, parseJazzhrJob } from "./sources/jazzhr";
import { inferAts } from "./sources/simplify";

// Trimmed from stellarscience.applytojob.com/apply as served 2026-11-10.
const BOARD = `
<h2 class='page-title page-title-open'>Current Openings</h2>
<ul class='list-group'>
  <li class="list-group-item">
    <h3 class='list-group-item-heading'>
      <a href="https://stellarscience.applytojob.com/apply/tiVvt0aK9K/C-Software-Engineer-Dayton">
        C++ Software Engineer (Dayton)      </a>
    </h3>
    <ul class='list-inline list-group-item-text'>
      <li><i class='fa fa-map-marker'></i>Dayton, OH</li>
    </ul>
  </li>
  <li class="list-group-item">
    <h3 class='list-group-item-heading'>
      <a href="https://stellarscience.applytojob.com/apply/my4AC4VXHI/Scientific-Software-Developer-Paid-CoopInternship">
        Scientific Software Developer Paid Co-op/Internship      </a>
    </h3>
    <ul class='list-inline list-group-item-text'>
      <li><i class='fa fa-map-marker'></i>Albuquerque, NM</li>
    </ul>
  </li>
  <li class="list-group-item">
    <h3 class='list-group-item-heading'>
      <a href="https://evil.example.com/apply/AAAAAAAAAA/Phish">Lookalike Internship</a>
    </h3>
  </li>
</ul>`;

// Trimmed from the Co-op/Internship job page, same day.
const JOB = `
<div class='job-header'><div class='container'>
  <h2>Scientific Software Developer Paid Co-op/Internship</h2>
  <div class="job-attributes-container">
    <div title="Location"> <i class='fa fa-map-marker'></i>Albuquerque, NM </div>
    <div id='resumator-job-employment' title="Type"> <i class='fa fa-clock-o'></i>Internship </div>
    <div id='resumator-job-experience' title="Experience"> <i class='fa fa-graduation-cap'></i>Student (College) </div>
  </div>
</div></div>
<div class='page-body job-details'><div class='container'><div class='row'>
  <div class='col col-xs-7 description' id="job-description">
    <p><strong>Selected Interns</strong> will support C++ software development.</p>
    <p>Applicants must be U.S. citizens.</p>
  </div>
  <div id="job-application-form-container" class='col col-xs-5 job-application-form'>
    <input name="resumator-firstname-value" />
  </div>
</div></div></div>`;

test("board slugs come only from https applytojob.com subdomains", () => {
  assert.equal(jazzhrBoardFromUrl("https://fintools.applytojob.com/apply/o7r6gV8IMh/Computer-Programming-Internship"), "fintools");
  assert.equal(jazzhrBoardFromUrl("http://fintools.applytojob.com/apply"), null);
  assert.equal(jazzhrBoardFromUrl("https://fintools.applytojob.com.evil.com/apply"), null);
  assert.equal(jazzhrBoardFromUrl("https://app.applytojob.com/apply"), null);
  assert.equal(jazzhrBoardFromUrl("not a url"), null);
});

test("JazzHR stays out of Tier B discovery, so no board is enrolled into a poll with no adapter", () => {
  assert.equal(inferAts("https://fintools.applytojob.com/apply/o7r6gV8IMh/x").atsType, "unknown");
});

test("the board list yields id, path, title and location, and ignores off-board links", () => {
  const rows = parseJazzhrBoard(BOARD, "stellarscience");
  assert.deepEqual(rows, [
    { id: "tiVvt0aK9K", path: "/apply/tiVvt0aK9K/C-Software-Engineer-Dayton", title: "C++ Software Engineer (Dayton)", location: "Dayton, OH" },
    { id: "my4AC4VXHI", path: "/apply/my4AC4VXHI/Scientific-Software-Developer-Paid-CoopInternship", title: "Scientific Software Developer Paid Co-op/Internship", location: "Albuquerque, NM" },
  ]);
});

test("a page that is not a board is drift, not an empty board", () => {
  assert.equal(parseJazzhrBoard("<html><body>Service unavailable</body></html>", "x"), null);
  assert.deepEqual(parseJazzhrBoard("<div id='resumator-view-more-opportunities'></div>", "x"), []);
  // bsa and newventurefund, 2026-11-10: a board the employer switched off.
  assert.deepEqual(parseJazzhrBoard("<title>\n  JazzHR - Inactive Career Page</title>", "x"), []);
  // luzco, same day: the board redirected to JazzHR's marketing site.
  assert.equal(parseJazzhrBoard("<title>For Job Seekers | JazzHR</title><p>Find jobs</p>", "x"), null);
});

test("a job page yields the employer's Type and Experience and stops the description at the form", () => {
  const job = parseJazzhrJob(JOB);
  assert.equal(job.employmentType, "Internship");
  assert.equal(job.experience, "Student (College)");
  assert.equal(job.location, "Albuquerque, NM");
  assert.match(job.descriptionText ?? "", /Selected Interns will support C\+\+ software development\./);
  assert.match(job.descriptionText ?? "", /U\.S\. citizens/);
  assert.doesNotMatch(job.descriptionText ?? "", /resumator|firstname/);
});
