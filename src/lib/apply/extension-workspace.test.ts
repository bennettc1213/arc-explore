import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

function workspace(reply: () => Promise<unknown>) {
  let click!: (event: object) => Promise<void>;
  let prevented = false;
  const notice = { textContent: "" };
  runInNewContext(readFileSync("extension/workspace.js", "utf8"), {
    location: { pathname: "/listing/posting-123/apply" }, setTimeout, clearTimeout,
    document: { addEventListener: (_: string, fn: typeof click) => { click = fn; }, querySelector: () => notice },
    chrome: { runtime: { sendMessage: reply } },
  });
  return {
    notice,
    async click(bridge = true) {
      await click({ isTrusted: true, button: 0, target: { closest: () => bridge ? {} : null }, preventDefault: () => { prevented = true; } });
      return prevented;
    },
  };
}

test("a missing worker response explains the direct-link recovery", async () => {
  const app = workspace(async () => undefined);
  assert.equal(await app.click(), true);
  assert.match(app.notice.textContent, /Open application directly/);
});

test("an invalidated extension context offers recovery without claiming a connection", async () => {
  const app = workspace(async () => { throw new Error("Extension context invalidated"); });
  await app.click();
  assert.match(app.notice.textContent, /chrome:\/\/extensions/);
  assert.doesNotMatch(app.notice.textContent, /Application connected/);
});

test("the direct application link is never intercepted by the extension", async () => {
  let messages = 0;
  const app = workspace(async () => { messages++; return { ok: true }; });
  assert.equal(await app.click(false), false);
  assert.equal(messages, 0);
});

test("a successful launch confirms the application handoff", async () => {
  const app = workspace(async () => ({ ok: true }));
  await app.click();
  assert.match(app.notice.textContent, /Application connected/);
});
