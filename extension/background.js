/**
 * The only part of the extension that talks to Instela.
 *
 * WHY THE FETCHES LIVE HERE AND NOT IN THE CONTENT SCRIPT. A content script
 * runs in the employer's page, so its requests carry the employer's origin and
 * are subject to their CORS policy — and, more importantly, anything it holds
 * is reachable from a page we do not control. The service worker runs in the
 * extension's own context with its own host permissions, so the student's
 * facts never exist inside greenhouse.io's document at all. Only the values
 * being typed into a specific field are ever passed down, and only when the
 * student presses the button.
 *
 * The session is the student's ordinary Instela cookie: they are signed in to the
 * site in the same browser, and `credentials: "include"` reuses that. The
 * extension stores no token, no password and no personal data of its own —
 * `chrome.storage` holds one thing, the Instela origin to talk to, so a developer
 * can point it at localhost.
 */

const DEFAULT_ORIGIN = "http://localhost:3000";

async function instelaOrigin() {
  const { instelaOrigin } = await chrome.storage.local.get("instelaOrigin");
  return (instelaOrigin || DEFAULT_ORIGIN).replace(/\/+$/, "");
}

/** GET the packet for a tab's URL. Never throws — the popup renders the reason. */
async function fetchPacket(pageUrl) {
  const origin = await instelaOrigin();
  try {
    const res = await fetch(
      `${origin}/api/extension/packet?url=${encodeURIComponent(pageUrl)}`,
      { credentials: "include" },
    );
    if (res.status === 401) return { state: "signed-out", origin };
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body?.error === "upgrade_required") return { state: "upgrade", origin };
      return { state: "error", reason: `Instela replied ${res.status}`, origin };
    }
    if (!res.ok) return { state: "error", reason: `Instela replied ${res.status}`, origin };

    const body = await res.json();
    if (!body.posting) return { state: "no-match", origin };
    return { state: "ready", packet: body, origin };
  } catch {
    // Instela not running, or no network. Named precisely: "cannot reach" is a
    // different problem from "not signed in", and telling them apart is the
    // difference between starting the dev server and signing in.
    return { state: "unreachable", origin };
  }
}

/** Tell Instela the student submitted it. */
async function markApplied(postingId) {
  const origin = await instelaOrigin();
  try {
    const res = await fetch(`${origin}/api/extension/applied`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postingId }),
    });
    if (!res.ok) return { ok: false, reason: `Instela replied ${res.status}` };
    return await res.json();
  } catch {
    return { ok: false, reason: "could not reach Instela" };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "INSTELA_GET_PACKET") {
    fetchPacket(msg.pageUrl).then(sendResponse);
    return true; // async
  }
  if (msg?.type === "INSTELA_MARK_APPLIED") {
    markApplied(msg.postingId).then(sendResponse);
    return true;
  }
  // Per-site access. Split into ask/check/inject rather than one call, because
  // `permissions.request` must happen inside the popup's own user gesture and
  // the other two must not prompt at all.
  if (msg?.type === "INSTELA_HAS_SITE_ACCESS") {
    hasSiteAccess(msg.pageUrl).then((granted) => sendResponse({ granted }));
    return true;
  }
  if (msg?.type === "INSTELA_ENSURE_SCRIPT") {
    ensureContentScript(msg.tabId).then((ok) => sendResponse({ ok }));
    return true;
  }
  if (msg?.type === "INSTELA_PAGE_READY") {
    handlePageReady(msg.pageUrl, _sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

/* ------------------------------------------------------------------ *
 * Per-site access, for everything that is not one of the four ATS families
 * ------------------------------------------------------------------ */

/**
 * WHY THIS EXISTS. The manifest declares seven hosts, which covers every ATS
 * family in the corpus — and 0 of the ~300 distinct scholarship hosts, which
 * are roughly one site per scholarship and will never fit in a list. The
 * alternative that a lot of extensions take is `<all_urls>`: an install prompt
 * reading "read and change all your data on all websites", which is both
 * untrue of what this does and the reason people uninstall things.
 *
 * `optional_host_permissions` is the honest middle. Nothing broad is granted at
 * install; Chrome prompts for ONE origin at the moment the student applies on
 * that site, and remembers it. So the four ATS families stay zero-friction, and
 * a scholarship site costs one click, once, ever.
 *
 * The origin pattern is always built from a real URL, never the broad wildcard
 * the manifest makes available. Requesting that would grant in one click
 * exactly the blanket access the manifest is written to avoid, and an
 * invariant test asserts this file never does.
 */
async function hasSiteAccess(pageUrl) {
  const { originPatternForUrl } = await import(chrome.runtime.getURL("vendor/apply-url.js"));
  const origins = originPatternForUrl(pageUrl);
  if (!origins) return false;
  try {
    return await chrome.permissions.contains({ origins: [origins] });
  } catch {
    return false;
  }
}

/**
 * Put the content script into a tab whose host is not in `content_scripts`.
 *
 * A freshly granted origin does not retroactively inject anything, and the
 * student is already looking at the page — so without this the first apply on
 * a new site would require a reload they have no reason to expect.
 */
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * A supported ATS page just loaded. If Instela has this posting, open the
 * toolbar panel and put a companion on the page so the student does not have
 * to hunt for the icon.
 *
 * `action.openPopup` is best-effort: Chrome still refuses it without a user
 * gesture on some versions. The in-page companion is the path that actually
 * appears on its own.
 */
async function handlePageReady(pageUrl, tabId) {
  const res = await fetchPacket(pageUrl);
  if (tabId != null) {
    if (res.state === "ready") {
      await chrome.action.setBadgeText({ tabId, text: "in" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2f81f7" });
    } else {
      await chrome.action.setBadgeText({ tabId, text: "" });
    }
  }
  if (res.state !== "ready") return;

  try {
    await chrome.action.openPopup();
  } catch {
    // No user gesture, or this Chrome build does not allow it.
  }

  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "INSTELA_SHOW_COMPANION",
      title: res.packet.posting?.title ?? "this application",
      company: res.packet.posting?.company ?? res.packet.posting?.kind ?? "",
      origin: res.origin,
    });
  } catch {
    // Content script not listening yet — the next idle pass will retry.
  }
}
