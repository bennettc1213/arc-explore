import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import * as config from "./extension-config";
import * as urls from "./apply-url";

const application = "https://job-boards.greenhouse.io/team/jobs/123";
const popupSender = { url: "chrome-extension://test/popup.html" };
type Frame = { frameId: number; documentId: string; pageUrl: string; status?: { state: string } };

function worker(tabUrl: string, embedded = true, stored: Record<string, unknown> = {}, workspaceUrl = application) {
  const frames = new Map<string, Frame>();
  const sent: { message: Record<string, unknown>; options: { documentId: string } }[] = [];
  const requests: { url: string; body?: string }[] = [];
  let listener: (message: object, sender: object, response: (value: unknown) => void) => boolean;
  let phone = "old phone";
  let granted = true;
  let offline = false;
  let openerTabId: number | undefined;
  const created: object[] = [];
  const scripts: { id: string; matches: string[] }[] = [];
  const session = {
    get: async (key: string) => structuredClone({ [key]: stored[key] }),
    set: async (input: Record<string, unknown>) => { Object.assign(stored, structuredClone(input)); },
    remove: async (key: string) => { delete stored[key]; },
  };
  const chrome = {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}`, onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    storage: { local: session, session },
    permissions: { contains: async () => granted },
    tabs: {
      get: async () => ({ id: 10, url: tabUrl, openerTabId }), onRemoved: { addListener() {} },
      create: async (input: object) => { created.push(input); return { id: 20 }; },
      update: async (_id: number, input: object) => { created.push(input); },
      sendMessage: async (_tabId: number, message: Record<string, unknown>, options: { documentId: string }) => {
        const frame = frames.get(options.documentId);
        if (!frame) throw new Error("document is gone");
        if (message.type === "INSTELA_CONTEXT") return { pageUrl: frame.pageUrl, status: frame.status };
        sent.push({ message, options });
        return { ok: true };
      },
    },
    scripting: {
      executeScript: async (input: { files?: string[] }) => input.files
        ? [...frames.values()].map(frame => ({ frameId: frame.frameId, documentId: frame.documentId }))
        : [{ frameId: 0, result: { url: workspaceUrl, embedded } }],
      getRegisteredContentScripts: async () => scripts,
      registerContentScripts: async (input: typeof scripts) => { scripts.push(...input); },
    },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  };
  const context = {
    __config: config, __urls: urls, chrome, URL, AbortSignal,
    fetch: async (url: string, init: { body?: string }) => {
      requests.push({ url, body: init.body });
      if (offline) throw new Error("network offline");
      return { ok: true, status: 200, json: async () => url.includes("/packet?") ? { posting: { id: "posting-123", title: "Research intern", kind: "internship" }, values: { phone }, attestations: [], alreadyApplied: false } : { ok: true } };
    },
  };
  const source = readFileSync("extension/background.js", "utf8")
    .replace(/import \{([^}]+)\} from "\.\/vendor\/extension-config.js";/, "const {$1} = __config;")
    .replace(/import \{([^}]+)\} from "\.\/vendor\/apply-url.js";/, "const {$1} = __urls;");
  runInNewContext(source, context);
  const api = context as unknown as {
    rememberFrame: (sender: object) => Promise<void>;
    tabPacket: (tabId: number) => Promise<{ state: string; packet: { values?: object; knownCount: number }; target: Frame; }>;
    startAutofill: (tabId: number, documentId: string) => Promise<{ ok: boolean }>;
  };
  return {
    ...api, frames, sent, requests, stored, created, scripts,
    navigate(url: string) { tabUrl = url; },
    setGranted(value: boolean) { granted = value; },
    setOffline(value: boolean) { offline = value; },
    setOpener(id: number) { openerTabId = id; },
    setPhone(value: string) { phone = value; },
    async add(frame: Frame) { frames.set(frame.documentId, frame); await api.rememberFrame({ tab: { id: 10 }, frameId: frame.frameId, documentId: frame.documentId, url: frame.pageUrl }); },
    message(message: object, sender: object = popupSender): Promise<unknown> {
      return new Promise(resolve => { if (!listener(message, sender, resolve)) resolve(undefined); });
    },
  };
}

test("the toolbar finds the application inside Instela and keeps values out of its preview", async () => {
  const app = worker("https://instela.org/listing/posting-123/apply");
  await app.add({ frameId: 7, documentId: "application-document", pageUrl: application });
  await app.add({ frameId: 9, documentId: "unrelated-frame", pageUrl: "https://jobs.lever.co/other/job" });
  const result = await app.tabPacket(10);
  assert.equal(result.state, "ready");
  assert.equal(result.target.documentId, "application-document");
  assert.equal(result.packet.values, undefined);
  assert.equal(result.packet.knownCount, 1);
});

test("autofill fetches fresh facts and routes them to exactly the chosen document", async () => {
  const app = worker(application);
  await app.add({ frameId: 0, documentId: "current-document", pageUrl: application });
  await app.tabPacket(10);
  app.setPhone("updated phone");
  assert.equal((await app.startAutofill(10, "current-document")).ok, true);
  assert.equal(app.sent.length, 1);
  assert.equal(app.sent[0].options.documentId, "current-document");
  assert.deepEqual(JSON.parse(JSON.stringify(app.sent[0].message.values)), { phone: "updated phone" });
  assert.equal(app.sent[0].message.expectedUrl, application);
});

test("a stale popup document cannot fill a different application after navigation", async () => {
  const app = worker(application);
  await app.add({ frameId: 0, documentId: "new-document", pageUrl: application });
  assert.equal((await app.startAutofill(10, "old-document")).ok, false);
  assert.equal(app.sent.length, 0);
});

test("worker restarts retain only frame routing metadata and discard stale documents", async () => {
  const app = worker("https://instela.org/listing/posting-123/apply");
  await app.add({ frameId: 7, documentId: "old-document", pageUrl: application });
  const resumed = worker("https://instela.org/listing/posting-123/apply", true, app.stored);
  const result = await resumed.tabPacket(10);
  assert.equal("connected" in result.target && result.target.connected, false);
  assert.doesNotMatch(JSON.stringify(app.stored), /old phone|values|answer/);
  resumed.frames.set("old-document", { frameId: 7, documentId: "old-document", pageUrl: application });
  assert.equal((await resumed.tabPacket(10)).target.documentId, "old-document");
});

test("content scripts cannot invoke settings or control other tabs", async () => {
  const app = worker(application);
  const sender = { tab: { id: 10 }, url: application, frameId: 0, documentId: "doc" };
  assert.equal(await app.message({ type: "INSTELA_SET_ORIGIN", origin: "https://evil.example" }, sender), undefined);
  assert.equal(await app.message({ type: "INSTELA_START_AUTOFILL", tabId: 55, documentId: "other" }, sender), undefined);
  assert.equal(app.requests.length, 0);
});

test("memory writes use Chrome sender metadata, ignoring a caller-supplied page URL", async () => {
  const app = worker(application);
  await app.message({ type: "INSTELA_SAVE_MEMORY", key: "phone", value: "555", pageUrl: "https://evil.example" }, { tab: { id: 10 }, url: application });
  assert.equal(JSON.parse(app.requests[0].body!).pageUrl, application);
});

test("concurrent frame announcements retain both documents", async () => {
  const app = worker(application);
  await Promise.all([app.add({ frameId: 1, documentId: "one", pageUrl: application }), app.add({ frameId: 2, documentId: "two", pageUrl: "https://jobs.lever.co/other/job" })]);
  assert.equal(Object.keys(app.stored["instela.frames.10"] as object).length, 2);
});

test("opening from a trusted workspace creates a tab session before navigation", async () => {
  const app = worker("https://instela.org/listing/posting-123/apply", false);
  assert.equal((await app.message({ type: "INSTELA_OPEN_APPLICATION", tabId: 10 }) as { ok: boolean }).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(app.created)), [{ url: "about:blank", openerTabId: 10 }, { url: application }]);
  const session = app.stored["instela.application.20"] as { postingId: string };
  assert.equal(session.postingId, "posting-123");
  assert.equal(app.requests.length, 0, "opening a public application does not request profile facts");
  assert.doesNotMatch(JSON.stringify(app.stored), /old phone|values/);
});

function applicationSession() {
  return { postingId: "posting-123", title: "Scholarship", origin: "https://instela.org", expiresAt: Date.now() + 60_000 };
}

test("a live workspace repairs a stale localhost setting before launching", async () => {
  const workspace = "https://instela.org/listing/posting-123/apply";
  const app = worker(workspace, false, { instelaOrigin: "http://localhost:3000" });
  const result = await app.message({ type: "INSTELA_OPEN_APPLICATION" }, { tab: { id: 10 }, frameId: 0, url: workspace }) as { ok: boolean };
  assert.equal(result.ok, true);
  assert.equal(app.stored.instelaOrigin, "https://instela.org");
  assert.equal((app.stored["instela.application.20"] as { origin: string }).origin, "https://instela.org");
});

test("an unavailable profile API does not prevent opening the application", async () => {
  const app = worker("https://instela.org/listing/posting-123/apply", false);
  app.setOffline(true);
  assert.equal((await app.message({ type: "INSTELA_OPEN_APPLICATION", tabId: 10 }) as { ok: boolean }).ok, true);
  assert.equal(app.requests.length, 0);
  app.navigate(application);
  assert.equal((await app.tabPacket(10)).state, "unreachable", "autofill still requires a successful authenticated API request");
});

test("the reported Kanoski scholarship opens before optional site access is requested", async () => {
  const url = "https://www.kanoski.com/community-involvement/distracted-driving-scholarship";
  const app = worker("https://instela.org/listing/posting-123/apply", false, {}, url);
  app.setGranted(false);
  assert.equal((await app.message({ type: "INSTELA_OPEN_APPLICATION", tabId: 10 }) as { ok: boolean }).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(app.created.at(-1))), { url });
  assert.equal(app.requests.length, 0);
});

test("untrusted form pages cannot change the configured Instela environment", async () => {
  const app = worker(application, false, { instelaOrigin: "http://localhost:3000" });
  const result = await app.message({ type: "INSTELA_OPEN_APPLICATION" }, { tab: { id: 10 }, frameId: 0, url: application }) as { ok: boolean; reason: string };
  assert.equal(result.ok, false);
  assert.equal(typeof result.reason, "string");
  assert.equal(app.stored.instelaOrigin, "http://localhost:3000");
  assert.equal(app.created.length, 0);
});

test("redirected forms retain listing identity, but content cannot receive session facts before explicit start", async () => {
  const redirected = "https://awards.example/forms/step-2?application=123";
  const app = worker(redirected, false, { "instela.application.10": applicationSession() });
  await app.add({ frameId: 0, documentId: "redirected", pageUrl: redirected });
  const sender = { tab: { id: 10 }, frameId: 0, documentId: "redirected", url: redirected };
  const early = await app.message({ type: "INSTELA_GET_PACKET", postingId: "untrusted-id" }, sender) as { state: string };
  assert.equal(early.state, "error");
  assert.equal(app.requests.length, 0);
  await app.tabPacket(10);
  assert.match(app.requests[0].url, /postingId=posting-123/);
  assert.equal((await app.startAutofill(10, "redirected")).ok, true);
  await app.message({ type: "INSTELA_SAVE_MEMORY", key: "phone", value: "555", postingId: "untrusted-id" }, sender);
  const saved = JSON.parse(app.requests.at(-1)!.body!);
  assert.equal(saved.postingId, "posting-123");
  assert.equal(saved.pageUrl, redirected);
  app.navigate("https://awards.example/forms/step-3");
  const stale = await app.message({ type: "INSTELA_SAVE_MEMORY", key: "phone", value: "555" }, { ...sender, url: "https://awards.example/forms/step-3" }) as { ok: boolean };
  assert.equal(stale.ok, false);
});

test("revoked site access and same-document navigation both prevent an old popup from filling", async () => {
  const app = worker(application, false, { "instela.application.10": applicationSession() });
  await app.add({ frameId: 0, documentId: "doc", pageUrl: application });
  app.setGranted(false);
  assert.equal((await app.startAutofill(10, "doc")).ok, false);
  app.setGranted(true);
  const result = await app.message({ type: "INSTELA_START_AUTOFILL", tabId: 10, documentId: "doc", expectedUrl: `${application}/old-step` }) as { ok: boolean };
  assert.equal(result.ok, false);
  assert.equal(app.sent.length, 0);
});

test("sessions survive worker restarts, expire, and cannot cross configured Instela environments", async () => {
  const stored = { "instela.application.10": applicationSession() };
  const resumed = worker("https://forms.example/apply", false, stored);
  await resumed.tabPacket(10);
  assert.match(resumed.requests[0].url, /postingId=posting-123/);
  const expired = worker(application, false, { "instela.application.10": { ...applicationSession(), expiresAt: 0 } });
  await expired.tabPacket(10);
  assert.doesNotMatch(expired.requests[0].url, /postingId=/);
  assert.equal(expired.stored["instela.application.10"], undefined);
  const local = worker(application, false, { ...stored, instelaOrigin: "http://localhost:3000" });
  await local.tabPacket(10);
  assert.doesNotMatch(local.requests[0].url, /postingId=/);
});

test("a child application tab inherits identity without inheriting document authorization", async () => {
  const app = worker("https://forms.example/apply", false, { "instela.application.8": { ...applicationSession(), documentId: "parent", pageUrl: application } });
  app.setOpener(8);
  await app.tabPacket(10);
  assert.match(app.requests[0].url, /postingId=posting-123/);
  assert.equal((app.stored["instela.application.10"] as { documentId?: string }).documentId, undefined);
});

test("untrusted pages cannot open a session or supply its listing identity", async () => {
  const app = worker(application);
  const result = await app.message({ type: "INSTELA_OPEN_APPLICATION", postingId: "fake", tabId: 10 }, { tab: { id: 10 }, frameId: 0, url: application }) as { ok: boolean };
  assert.equal(result.ok, false);
  assert.equal(app.created.length, 0);
});

test("an arbitrary scholarship site connects only after permission and targets its current document", async () => {
  const pageUrl = "https://scholarship.example/application/step-1";
  const app = worker(pageUrl, false, { "instela.application.10": applicationSession() });
  app.frames.set("form", { frameId: 0, documentId: "form", pageUrl });
  app.setGranted(false);
  const denied = await app.message({ type: "INSTELA_ENSURE_SCRIPT", tabId: 10 }) as { ok: boolean };
  assert.equal(denied.ok, false);
  assert.equal(app.scripts.length, 0);
  app.setGranted(true);
  const connected = await app.message({ type: "INSTELA_ENSURE_SCRIPT", tabId: 10 }) as { ok: boolean };
  assert.equal(connected.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(app.scripts[0].matches)), ["https://scholarship.example/*"]);
  assert.equal((await app.tabPacket(10)).target.documentId, "form");
  assert.equal((await app.startAutofill(10, "form")).ok, true);
  assert.equal(app.sent[0].options.documentId, "form");
});
