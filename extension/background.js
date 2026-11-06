// Authenticated requests and frame routing live in the service worker. Only
// the selected application document receives the values it needs to fill.
import { DEFAULT_INSTELA_ORIGIN, normalizeInstelaOrigin, isInstelaPage, isApplicationWorkspace, applicationPageUrl } from "./vendor/extension-config.js";
import { originPatternForUrl, normalizeApplyUrl } from "./vendor/apply-url.js";

async function instelaOrigin() {
  const saved = await chrome.storage.local.get("instelaOrigin");
  return normalizeInstelaOrigin(saved.instelaOrigin) ?? DEFAULT_INSTELA_ORIGIN;
}

// A student can move between local testing and production. An explicit action
// on a trusted workspace selects that environment; arbitrary form sites cannot.
async function workspaceOrigin(pageUrl) {
  const configured = await instelaOrigin();
  let origin;
  try { origin = normalizeInstelaOrigin(new URL(pageUrl).origin); } catch { return configured; }
  if (!origin || !isApplicationWorkspace(pageUrl, origin)) return configured;
  if (origin !== configured) await chrome.storage.local.set({ instelaOrigin: origin });
  return origin;
}

async function api(path, body) {
  const origin = await instelaOrigin();
  try {
    const response = await fetch(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return { state: "signed-out", origin };
    if (response.status === 403 && data.error === "upgrade_required") return { state: "upgrade", origin };
    if (!response.ok) return { state: "error", reason: typeof data.error === "string" ? data.error : `Instela replied ${response.status}.`, origin };
    return { state: "ok", data, origin };
  } catch { return { state: "unreachable", origin }; }
}

async function fetchPacket(pageUrl, postingId) {
  if (!applicationPageUrl(pageUrl)) return { state: "unsupported", origin: await instelaOrigin() };
  // POST for session lookups makes the browser attach Origin consistently;
  // GET requests can omit it. This endpoint only reads the account packet.
  const result = await api(`/api/extension/packet?url=${encodeURIComponent(pageUrl)}${postingId ? `&postingId=${encodeURIComponent(postingId)}` : ""}`, postingId ? {} : undefined);
  if (result.state !== "ok") return result;
  return result.data.posting ? { state: "ready", packet: result.data, origin: result.origin } : { state: "no-match", origin: result.origin };
}

async function hasSiteAccess(pageUrl) {
  const pattern = applicationPageUrl(pageUrl) && originPatternForUrl(pageUrl);
  return Boolean(pattern && await chrome.permissions.contains({ origins: [pattern] }));
}

const frameKey = tabId => `instela.frames.${tabId}`;
const sessionKey = tabId => `instela.application.${tabId}`;
const SESSION_MS = 4 * 60 * 60 * 1000;
let frameWrites = Promise.resolve();

async function applicationSession(tabId) {
  const key = sessionKey(tabId);
  const session = (await chrome.storage.session.get(key))[key];
  if (!session) return null;
  if (session.origin !== await instelaOrigin() || session.expiresAt <= Date.now()) {
    await chrome.storage.session.remove(key);
    return null;
  }
  return session;
}

async function workspaceContext(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const origin = await workspaceOrigin(tab.url ?? "");
  if (!isApplicationWorkspace(tab.url ?? "", origin)) return null;
  const [read] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: () => {
      const workspace = document.querySelector("[data-instela-application-url]");
      return workspace ? { url: workspace.getAttribute("data-instela-application-url"), embedded: workspace.getAttribute("data-instela-embedded") === "true", title: document.querySelector("h1")?.textContent?.trim() || "Application" } : null;
    },
  });
  const pageUrl = applicationPageUrl(read?.result?.url);
  if (!pageUrl) return null;
  return { pageUrl, embedded: Boolean(read.result.embedded), postingId: new URL(tab.url).pathname.split("/")[2], title: read.result.title || "Application", origin };
}

async function openApplication(tabId) {
  const context = await workspaceContext(tabId);
  if (!context) return { ok: false, reason: "Open an Instela application workspace first." };
  // Opening a public application needs no profile request. Authentication,
  // listing validity and Pro access are checked when autofill is requested.
  // Start with a blank tab so a fast redirect cannot outrun session storage.
  const tab = await chrome.tabs.create({ url: "about:blank", openerTabId: tabId });
  await chrome.storage.session.set({ [sessionKey(tab.id)]: {
    postingId: context.postingId, title: context.title,
    origin: context.origin, expiresAt: Date.now() + SESSION_MS,
  } });
  await chrome.tabs.update(tab.id, { url: context.pageUrl });
  return { ok: true };
}

/** Session storage holds URLs/document ids only, never profile or answers.
 * It survives worker suspension but is discarded when Chrome exits. */
async function rememberFrame(sender) {
  if (sender.tab?.id == null || !sender.documentId || !applicationPageUrl(sender.url)) return;
  const write = frameWrites.catch(() => {}).then(async () => {
    const key = frameKey(sender.tab.id);
    const stored = (await chrome.storage.session.get(key))[key] ?? {};
    stored[sender.frameId] = { frameId: sender.frameId, documentId: sender.documentId, pageUrl: sender.url };
    await chrome.storage.session.set({ [key]: stored });
  });
  frameWrites = write;
  await write;
}

async function probe(tabId, frame) {
  try {
    const target = frame.documentId ? { documentId: frame.documentId } : { frameId: frame.frameId ?? 0 };
    const reply = await chrome.tabs.sendMessage(tabId, { type: "INSTELA_CONTEXT" }, target);
    const pageUrl = applicationPageUrl(reply?.pageUrl);
    return pageUrl ? { ...frame, tabId, pageUrl, status: reply.status ?? { state: "idle" }, connected: true } : null;
  } catch { return null; }
}

/** Read only the explicit application marker, and only on our own workspace. */
async function applicationContext(tabId) {
  await frameWrites.catch(() => {});
  const tab = await chrome.tabs.get(tabId);
  const origin = await workspaceOrigin(tab.url ?? "");
  if (!tab.url) return { state: "unsupported", origin };
  let pageUrl = applicationPageUrl(tab.url);
  let embedded = false;
  if (isInstelaPage(tab.url, origin)) {
    if (!isApplicationWorkspace(tab.url, origin)) return { state: "instela-home", origin };
    const workspace = await workspaceContext(tabId);
    pageUrl = workspace?.pageUrl;
    embedded = Boolean(workspace?.embedded);
    if (!pageUrl) return { state: "instela-home", origin };
    if (!embedded) return { state: "open-application", origin, pageUrl };
  }
  if (!pageUrl) return { state: "unsupported", origin };
  let target = null;
  if (embedded) {
    const frames = (await chrome.storage.session.get(frameKey(tabId)))[frameKey(tabId)] ?? {};
    for (const frame of Object.values(frames)) {
      if (normalizeApplyUrl(frame.pageUrl) !== normalizeApplyUrl(pageUrl)) continue;
      const current = await probe(tabId, frame);
      if (current && normalizeApplyUrl(current.pageUrl) === normalizeApplyUrl(pageUrl)) { target = current; break; }
    }
  } else {
    const frames = (await chrome.storage.session.get(frameKey(tabId)))[frameKey(tabId)] ?? {};
    if (frames[0]?.documentId) target = await probe(tabId, frames[0]);
  }
  return { state: "context", origin, target: target ? { ...target, embedded } : { tabId, pageUrl, embedded, connected: false } };
}

async function tabPacket(tabId, includeValues = false) {
  const context = await applicationContext(tabId);
  if (context.state !== "context") return context;
  let session = await applicationSession(tabId);
  if (!session && !context.target.embedded) {
    const tab = await chrome.tabs.get(tabId);
    const parent = tab.openerTabId == null ? null : await applicationSession(tab.openerTabId);
    if (parent) {
      // Portals sometimes open the actual form in a child tab. Inherit only
      // identity/expiry; access and document authorization never transfer.
      session = { postingId: parent.postingId, title: parent.title, origin: parent.origin, expiresAt: parent.expiresAt };
      await chrome.storage.session.set({ [sessionKey(tabId)]: session });
    }
  }
  const result = await fetchPacket(context.target.pageUrl, session?.postingId);
  if (result.state === "ready" && !includeValues) {
    const { values, ...packet } = result.packet;
    result.packet = { ...packet, knownCount: Object.keys(values).length };
  }
  return { ...result, target: context.target, applicationSession: Boolean(session), granted: await hasSiteAccess(context.target.pageUrl) };
}

async function ensureContentScript(tabId) {
  const context = await applicationContext(tabId);
  if (context.state !== "context" || !await hasSiteAccess(context.target.pageUrl)) return { ok: false, reason: "Allow Instela access to this application site first." };
  const pattern = originPatternForUrl(context.target.pageUrl);
  const id = `instela-site-${new URL(context.target.pageUrl).hostname.replace(/[^a-z0-9]/gi, "-")}`;
  if (!(await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length) {
    await chrome.scripting.registerContentScripts([{ id, matches: [pattern], js: ["content.js"], runAt: "document_idle", allFrames: true, persistAcrossSessions: true }]);
  }
  try {
    const results = await chrome.scripting.executeScript({ target: context.target.embedded ? { tabId, allFrames: true } : { tabId, frameIds: [0] }, files: ["content.js"] });
    for (const frame of results) {
      const current = await probe(tabId, frame);
      if (!current || normalizeApplyUrl(current.pageUrl) !== normalizeApplyUrl(context.target.pageUrl)) continue;
      await rememberFrame({ tab: { id: tabId }, frameId: frame.frameId, documentId: frame.documentId, url: current.pageUrl });
      return { ok: true };
    }
  } catch { /* The page may include another frame we cannot access. */ }
  return { ok: false, reason: "Access is saved. Reload the application form to connect, or open it in a separate tab." };
}

async function startAutofill(tabId, documentId, expectedUrl) {
  const result = await tabPacket(tabId, true);
  if (result.state !== "ready") return { ok: false, ...result };
  const { target } = result;
  if (!target.connected || !documentId || documentId !== target.documentId) return { ok: false, reason: "The application changed. Reopen Instela and try again." };
  if (expectedUrl && expectedUrl !== target.pageUrl) return { ok: false, reason: "The page changed. Reopen Instela to check the current form." };
  if (!await hasSiteAccess(target.pageUrl)) return { ok: false, reason: "Allow Instela access to this application site first." };
  const session = await applicationSession(tabId);
  if (session) await chrome.storage.session.set({ [sessionKey(tabId)]: { ...session, documentId, pageUrl: target.pageUrl } });
  return chrome.tabs.sendMessage(tabId, { type: "INSTELA_START_FILL", expectedUrl: target.pageUrl, values: result.packet.values }, { documentId });
}

async function senderSession(sender) {
  if (sender.tab?.id == null) return null;
  const session = await applicationSession(sender.tab.id);
  // Session facts may go only to the document explicitly chosen for autofill.
  return session && session.documentId === sender.documentId && session.pageUrl === sender.url ? session : null;
}

async function contentPacket(sender) {
  const session = await applicationSession(sender.tab.id);
  const approved = session ? await senderSession(sender) : null;
  if (session && !approved) return { state: "error", reason: "Open the Instela extension to connect this form." };
  return fetchPacket(sender.url, approved?.postingId);
}

async function saveMemory(key, value, sender) {
  const pageUrl = applicationPageUrl(sender.url);
  if (!sender.tab || !pageUrl) return { ok: false, error: "This is not an application page." };
  const session = await applicationSession(sender.tab.id);
  const approved = session ? await senderSession(sender) : null;
  if (session && !approved) return { ok: false, error: "The form changed. Reopen Instela to connect it." };
  const result = await api("/api/extension/memory", { key, value, pageUrl, ...(approved ? { postingId: approved.postingId } : {}) });
  return result.state === "ok" ? { ok: true } : { ok: false, error: result.reason ?? (result.state === "signed-out" ? "Sign in to Instela, then try again." : "Could not save your answer. Check your connection and Pro access.") };
}

async function pageReady(sender) {
  await rememberFrame(sender);
  if (sender.frameId !== 0 || sender.tab?.id == null) return { ok: true };
  // A redirect keeps the listing identity but never automatically fills or
  // releases its packet to the next document. The student starts each page.
  if (await applicationSession(sender.tab.id)) {
    await chrome.action.setBadgeText({ tabId: sender.tab.id, text: "in" });
    return { ok: true };
  }
  const result = await fetchPacket(sender.url);
  const tabId = sender.tab.id;
  await chrome.action.setBadgeText({ tabId, text: result.state === "ready" ? "in" : "" });
  if (result.state === "ready") {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#ed8544" });
    await chrome.tabs.sendMessage(tabId, { type: "INSTELA_SHOW_COMPANION", title: result.packet.posting.title, company: result.packet.posting.company, origin: result.origin }, { documentId: sender.documentId }).catch(() => {});
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Privileged tab/settings operations are accepted only from our own popup.
  const popup = !sender.tab && sender.url?.startsWith(chrome.runtime.getURL(""));
  let task;
  if (msg?.type === "INSTELA_OPEN_APPLICATION" && sender.tab && sender.frameId === 0) {
    task = workspaceOrigin(sender.url ?? "").then(origin => isApplicationWorkspace(sender.url ?? "", origin) ? openApplication(sender.tab.id) : { ok: false, reason: "Open this opportunity's Apply with Instela page first." });
  }
  else if (msg?.type === "INSTELA_GET_PACKET" && sender.tab) task = contentPacket(sender);
  else if (msg?.type === "INSTELA_SAVE_MEMORY") task = saveMemory(msg.key, msg.value, sender);
  else if (msg?.type === "INSTELA_PAGE_READY") task = pageReady(sender);
  else if (popup && msg?.type === "INSTELA_TAB_PACKET") task = tabPacket(msg.tabId);
  else if (popup && msg?.type === "INSTELA_ENSURE_SCRIPT") task = ensureContentScript(msg.tabId);
  else if (popup && msg?.type === "INSTELA_START_AUTOFILL") task = startAutofill(msg.tabId, msg.documentId, msg.expectedUrl);
  else if (popup && msg?.type === "INSTELA_OPEN_APPLICATION") task = openApplication(msg.tabId);
  else if (popup && msg?.type === "INSTELA_END_APPLICATION") task = chrome.storage.session.remove(sessionKey(msg.tabId)).then(() => ({ ok: true }));
  else if (popup && msg?.type === "INSTELA_SETTINGS") task = instelaOrigin().then(origin => ({ origin }));
  else if (popup && msg?.type === "INSTELA_SET_ORIGIN") {
    const origin = normalizeInstelaOrigin(msg.origin);
    task = origin ? chrome.storage.local.set({ instelaOrigin: origin }).then(() => ({ ok: true, origin })) : Promise.resolve({ ok: false, reason: "Use https://instela.org or http://localhost:3000." });
  } else if (popup && msg?.type === "INSTELA_MARK_APPLIED") {
    task = tabPacket(msg.tabId).then(async result => {
      if (result.state !== "ready" || result.packet.posting.id !== msg.postingId) return { ok: false, reason: "Reopen the application before recording it." };
      const saved = await api("/api/extension/applied", { postingId: msg.postingId });
      return saved.state === "ok" ? saved.data : { ok: false, reason: saved.reason ?? "Could not record this application." };
    });
  }
  if (!task) return false;
  Promise.resolve(task).then(sendResponse).catch(() => sendResponse({ ok: false, state: "error", reason: "Instela could not connect to this application. Reload the page and try again." }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => { frameWrites.catch(() => {}).then(() => chrome.storage.session.remove([frameKey(tabId), sessionKey(tabId)])).catch(() => {}); });
