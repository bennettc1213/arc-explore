import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import * as autofill from "./autofill";

class Input {
  tagName = "INPUT";
  type = "text";
  disabled = false;
  readOnly = false;
  isConnected = true;
  id = "";
  name = "";
  checked = false;
  form = null;
  _value = "";
  classList = { add() {}, remove() {} };
  constructor(public label: string, value = "") { this._value = value; }
  get value() { return this._value; }
  set value(value: string) { this._value = value; }
  getAttribute(key: string) { return key === "aria-label" ? this.label : key === "name" ? this.name : null; }
  getClientRects() { return [1]; }
  dispatchEvent() {}
  closest(): { querySelector: () => { textContent: string } } | null { return null; }
}
class Textarea extends Input { tagName = "TEXTAREA"; type = "textarea"; }
class Select extends Input { tagName = "SELECT"; type = "select"; options: { value: string; textContent: string }[] = []; }

function workflow(controls: Input[], answer: (question: { key: string | null; label: string }) => Promise<string | null>) {
  const code = readFileSync("extension/content.js", "utf8")
    .replace("if (!globalThis.__instelaContentReady) {", "")
    .replace(/\n}\s*$/, "")
    .replace(/await import\(\s*chrome.runtime.getURL\("vendor\/autofill.js"\)\s*\)/, "__autofill");
  const window = { top: {}, addEventListener() {} };
  const context = {
    __autofill: autofill, HTMLInputElement: Input, HTMLTextAreaElement: Textarea, HTMLSelectElement: Select,
    Event: class { constructor(public type: string) {} }, window,
    location: { href: "https://job-boards.greenhouse.io/test/jobs/123" },
    document: { getElementById: () => ({}), querySelectorAll: (selector: string) => selector === "input, textarea, select" ? controls : [] },
    chrome: { runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({}) } },
    requestAnimationFrame: (fn: () => void) => fn(),
  };
  runInNewContext(code, context);
  Object.assign(context, { askQuestion: answer });
  return (context as unknown as {
    fill: (values: Record<string, string>) => Promise<{ report: { filled: number; skippedNonEmpty: number; known: number; unknown: number; blocked: number } }>;
    shouldUseQuickChoices: (choices: { text: string }[] | null) => boolean;
  });
}

test("autofill reuses facts, prompts for missing facts, and isolates one-time answers", async () => {
  const fields = [new Input("Full name"), new Input("Phone number"), new Textarea("Why do you want to work at our school?"), new Input("Email", "already@example.test"), new Input("Work authorization")];
  const asked: (string | null)[] = [];
  const session = workflow(fields, async question => { asked.push(question.key); return question.key === "phone" ? "555-1234" : "I enjoy research."; });
  const result = await session.fill({ fullName: "Alex Rivera", email: "other@example.test" });
  assert.deepEqual(asked, ["phone", null]);
  assert.deepEqual(fields.map(f => f.value), ["Alex Rivera", "555-1234", "I enjoy research.", "already@example.test", ""]);
  assert.equal(result.report.filled, 3);
  assert.equal(result.report.skippedNonEmpty, 1);
  assert.equal(result.report.blocked, 1);
});

test("conditional questions appearing after an answer are discovered", async () => {
  const fields: Input[] = [new Input("Phone")];
  fields[0].dispatchEvent = () => { if (fields.length === 1) fields.push(new Textarea("Why this scholarship?")); };
  const asked: string[] = [];
  const result = await workflow(fields, async question => { asked.push(question.label); return "My answer"; }).fill({});
  assert.deepEqual(asked, ["Phone", "Why this scholarship?"]);
  assert.equal(result.report.filled, 2);
});

test("finish in form stops prompting without claiming unresolved answers were filled", async () => {
  const fields = [new Input("Phone"), new Textarea("Why this role?")];
  let prompts = 0;
  const result = await workflow(fields, async () => { prompts++; return null; }).fill({});
  assert.equal(prompts, 1);
  assert.equal(result.report.filled, 0);
  assert.equal(result.report.known, 1);
  assert.equal(result.report.unknown, 1);
});

test("a value entered while a prompt is open is never overwritten", async () => {
  const input = new Input("Phone");
  const result = await workflow([input], async () => { input.value = "typed in the form"; return "prompt answer"; }).fill({});
  assert.equal(input.value, "typed in the form");
  assert.equal(result.report.filled, 0);
});

test("native multiple-choice questions use the selected option without saving contextual answers", async () => {
  const select = new Select("Do you have friends or family who received this scholarship?");
  select.options = [{ value: "", textContent: "Choose" }, { value: "yes", textContent: "Yes" }, { value: "no", textContent: "No" }];
  const result = await workflow([select], async question => { assert.equal(question.key, null); return "no"; }).fill({});
  assert.equal(select.value, "no");
  assert.equal(result.report.filled, 1);
});

test("a fieldset radio group asks one contextual question and fills the chosen radio", async () => {
  const fields = [new Input("Yes", "yes"), new Input("No", "no")];
  for (const input of fields) {
    input.type = "radio";
    input.name = "family";
    input.closest = () => ({ querySelector: () => ({ textContent: "Has a family member received this scholarship?" }) });
  }
  let prompts = 0;
  const result = await workflow(fields, async question => { prompts++; assert.equal(question.key, null); return "no"; }).fill({});
  assert.equal(prompts, 1);
  assert.equal(fields[1].checked, true);
  assert.equal(fields[0].checked, false);
  assert.equal(result.report.filled, 1);
});

test("small choice sets use buttons while country-sized lists stay dropdowns", () => {
  const session = workflow([], async () => null);
  assert.equal(session.shouldUseQuickChoices([{ text: "Yes" }, { text: "No" }]), true);
  assert.equal(session.shouldUseQuickChoices([{ text: "California" }, { text: "Colorado" }, { text: "Oregon" }, { text: "Washington" }]), true);
  assert.equal(session.shouldUseQuickChoices(Array.from({ length: 195 }, (_, index) => ({ text: `Country ${index}` }))), false);
  assert.equal(session.shouldUseQuickChoices([{ text: "A choice whose label is long enough that a button would be hard to scan" }]), false);
});
