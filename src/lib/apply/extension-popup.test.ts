import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { describeFill } from "./autofill";
import { originPatternForUrl } from "./apply-url";

class Node {
  children: (Node | string)[] = [];
  textContent = "";
  value = "";
  disabled = false;
  hidden = false;
  className = "";
  onclick?: () => Promise<void>;
  constructor(public tagName = "div") {}
  append(...children: (Node | string)[]) { this.children.push(...children); }
  replaceChildren(...children: (Node | string)[]) { this.children = children; }
  setAttribute() {}
  addEventListener() {}
}

function popup(status = { state: "idle" }, granted = true) {
  const nodes = new Map<string, Node>();
  const created: Node[] = [];
  const commands: Record<string, unknown>[] = [];
  const permissions: unknown[] = [];
  let closed = false;
  const chrome = {
    runtime: { sendMessage: async (message: Record<string, unknown>) => {
      commands.push(message);
      if (message.type === "INSTELA_SETTINGS") return { origin: "https://instela.org" };
      if (message.type === "INSTELA_TAB_PACKET") return { state: "ready", origin: "https://instela.org", granted, target: { documentId: "form-document", embedded: true, connected: true, pageUrl: "https://scholarship.example/form", status }, packet: { posting: { id: "posting", title: "Research scholarship" }, knownCount: 7 } };
      if (message.type === "INSTELA_START_AUTOFILL") return { ok: true };
      return { ok: false, reason: "Connection failed" };
    } },
    tabs: { query: async () => [{ id: 10 }], create: async () => {} },
    permissions: { request: async (input: unknown) => { permissions.push(input); return false; } },
  };
  const context = {
    __describeFill: describeFill, __originPatternForUrl: originPatternForUrl,
    chrome, URL, window: { close: () => { closed = true; } },
    document: {
      createElement: (tag: string) => { const node = new Node(tag); created.push(node); return node; },
      createTextNode: (text: string) => text,
      getElementById: (id: string) => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); },
    },
  };
  const source = readFileSync("extension/popup.js", "utf8")
    .replace('import { describeFill } from "./vendor/autofill.js";', "const describeFill = __describeFill;")
    .replace('import { originPatternForUrl } from "./vendor/apply-url.js";', "const originPatternForUrl = __originPatternForUrl;")
    .replace(/\nmain\(\);\s*$/, "");
  runInNewContext(source, context);
  return { ...(context as unknown as { main: () => Promise<void> }), commands, permissions,
    button: (text: string) => created.find(node => node.tagName === "button" && node.children.includes(text))!,
    isClosed: () => closed,
  };
}

test("the popup hands off to the exact document, then closes before human questions", async () => {
  const app = popup();
  await app.main();
  await app.button("Autofill with Instela").onclick!();
  const start = app.commands.find(command => command.type === "INSTELA_START_AUTOFILL");
  assert.deepEqual(JSON.parse(JSON.stringify(start)), { type: "INSTELA_START_AUTOFILL", tabId: 10, documentId: "form-document", expectedUrl: "https://scholarship.example/form" });
  assert.equal(app.isClosed(), true);
});

test("reopening the popup during a prompt does not start a second autofill", async () => {
  const app = popup({ state: "filling" });
  await app.main();
  await app.button("Continue answering in the form").onclick!();
  assert.equal(app.commands.some(command => command.type === "INSTELA_START_AUTOFILL"), false);
  assert.equal(app.isClosed(), true);
});

test("declining optional site access leaves a retry and requests only that origin", async () => {
  const app = popup({ state: "idle" }, false);
  await app.main();
  const grant = app.button("Allow Instela on scholarship.example");
  await grant.onclick!();
  assert.deepEqual(JSON.parse(JSON.stringify(app.permissions)), [{ origins: ["https://scholarship.example/*"] }]);
  assert.equal(grant.disabled, false);
  assert.equal(app.commands.some(command => command.type === "INSTELA_START_AUTOFILL"), false);
});
