import assert from "node:assert/strict";
import { it } from "node:test";
import { parseBrowardScholarships } from "./cfbroward";

it("Broward's explicit closed status wins over a leftover apply button", () => {
  const rows = parseBrowardScholarships('<h2>Alpha Scholarship</h2><p>For enrolled students. APPLICATIONS ARE CLOSED.</p><a href="https://form.jotform.com/123">CLICK HERE TO APPLY</a><h2>Beta Scholarship</h2><p>For returning students. ACCEPTING APPLICATIONS.</p><a href="https://form.jotform.com/456">APPLY</a><div class="newsletter"><h2>Footer Scholarship links</h2><p>$50,000</p></div>');
  assert.equal(rows.length, 2); assert.equal(rows[0].isOpen, false); assert.equal(rows[1].isOpen, true);
  assert.equal(rows[0].sourceId, "123"); assert.equal(rows[0].url, "https://form.jotform.com/123");
  for (const row of rows) { assert.equal(row.amountMax, null); assert.equal(row.deadlineAt, null); }
});
it("Broward fails visibly when its explicit status disappears", () => {
  assert.throws(() => parseBrowardScholarships('<h2>Alpha Scholarship</h2><p>Program information without application status.</p>'), /no explicit application status/);
});
it("Broward keeps a closed program without an application link as a source detail link", () => {
  const [row] = parseBrowardScholarships('<h2>Gamma Fund for Education</h2><p>APPLICATIONS CLOSED.</p><div class="newsletter"><p>do not include footer</p>');
  assert.ok(row); assert.equal(row.isOpen, false); assert.match(row.url, /#:~:text=/);
  assert.doesNotMatch(row.eligibility.join(" "), /footer/);
});
