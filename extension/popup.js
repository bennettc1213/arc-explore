import { describeFill } from "./vendor/autofill.js";
import { originPatternForUrl } from "./vendor/apply-url.js";

const root = document.getElementById("root");
let origin = "https://instela.org";

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children.flat()) if (child != null) node.append(typeof child === "string" ? document.createTextNode(child) : child);
  return node;
}
function render(...nodes) { root.replaceChildren(...nodes.filter(Boolean)); root.setAttribute("aria-busy", "false"); }
function button(text, onclick, className = "") { return el("button", { type: "button", className, onclick }, text); }
function open(url) { return chrome.tabs.create({ url }); }
function message(title, text, action) { render(el("p", { className: "eyebrow" }, "AUTOFILL WITH INSTELA"), el("h1", {}, title), el("p", { className: "muted" }, text), action); }
function error(reason) { message("Let’s reconnect", reason, button("Try again", () => main())); }

function ready(result, tabId) {
  const { packet, target } = result;
  const { posting, alreadyApplied } = packet;
  const status = target.status ?? { state: "idle" };
  const busy = status.state === "filling";
  const action = button(busy ? "Continue answering in the form" : "Autofill with Instela", async () => {
    if (busy) { window.close(); return; }
    action.disabled = true;
    action.textContent = "Connecting to your form…";
    try {
      const response = await chrome.runtime.sendMessage({ type: "INSTELA_START_AUTOFILL", tabId, documentId: target.documentId, expectedUrl: target.pageUrl });
      if (!response?.ok) { error(response?.reason ?? "Check that you are signed in to Instela with Pro, then try again."); return; }
      window.close();
    } catch { error("The application connection was interrupted. Please try again."); }
  });
  const receipt = el("p", { className: "report", role: "status" });
  if (status.state === "complete" && status.report) receipt.textContent = Object.values(status.report).every(value => value === 0)
    ? "No compatible fields found on this page. Open the actual application form, then reopen Instela. Custom controls and forms inside another frame may need manual entry."
    : describeFill(status.report);
  else if (status.state === "error") receipt.textContent = status.error;
  else receipt.textContent = busy ? "Instela is working in the application. Answer or skip the question there." : "Instela asks for missing details. Reusable facts are saved; answers about this opportunity stay in this application.";
  const applied = button(alreadyApplied ? "Added to your tracker" : "I submitted this application", async () => {
    applied.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "INSTELA_MARK_APPLIED", postingId: posting.id, tabId });
      if (!response?.ok) throw new Error(response?.reason ?? "Could not record your application.");
      applied.textContent = "Added to your tracker";
      receipt.textContent = response.emailMessage ?? "Application recorded.";
    } catch (err) { applied.disabled = false; receipt.textContent = err.message; }
  }, "secondary");
  applied.disabled = Boolean(alreadyApplied) || busy;
  const endSession = result.applicationSession ? button("End this application session", async () => {
    await chrome.runtime.sendMessage({ type: "INSTELA_END_APPLICATION", tabId });
    window.close();
  }, "link") : null;
  if (endSession) endSession.disabled = busy;
  render(
    el("p", { className: "connection" }, target.embedded ? "● Connected inside Instela" : "● Connected to your application"),
    el("h1", {}, posting.title), el("p", { className: "company" }, posting.company ?? posting.kind),
    el("div", { className: "ready-count" }, el("strong", {}, String(packet.knownCount ?? 0)), el("span", {}, "saved details ready")),
    action, receipt,
    el("p", { className: "muted fine" }, `Filling ${new URL(target.pageUrl).hostname}. On the next page, reopen Instela to continue. Review your answers, attach any files, and submit on the application form.`),
    el("hr"), applied, endSession,
  );
}

function needsAccess(result, tabId) {
  const pageUrl = result.target.pageUrl;
  const pattern = originPatternForUrl(pageUrl);
  if (!pattern) return error("This application address is not supported.");
  const host = new URL(pageUrl).hostname;
  const grant = button(`Allow Instela on ${host}`, async () => {
    grant.disabled = true;
    let granted = false;
    try {
      // Chrome requires this to run directly in the popup's click handler.
      granted = await chrome.permissions.request({ origins: [pattern] });
    } catch { /* Cancellation leaves a usable retry button. */ }
    if (!granted) { grant.disabled = false; return; }
    const connection = await chrome.runtime.sendMessage({ type: "INSTELA_ENSURE_SCRIPT", tabId });
    if (!connection?.ok) return connectionError(connection?.reason, pageUrl);
    return main(false);
  });
  message("Connect this application", `Give Instela access to ${host} so it can fill this form. Chrome will ask about this site only.`, grant);
}

function connectionError(reason, pageUrl) {
  message("Site access is saved", reason ?? "Reload the application form to connect the extension.", button("Open application in a tab", () => open(pageUrl)));
}

async function main(connect = true) {
  root.setAttribute("aria-busy", "true");
  try {
    const settings = await chrome.runtime.sendMessage({ type: "INSTELA_SETTINGS" });
    if (settings?.origin) origin = settings.origin;
    document.getElementById("origin").value = origin;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return error("Open an application page, then reopen Instela.");
    const result = await chrome.runtime.sendMessage({ type: "INSTELA_TAB_PACKET", tabId: tab.id });
    if (!result) return error("Reload the Instela extension and try again.");
    if (result.origin) origin = result.origin;
    switch (result.state) {
      case "ready":
        if (!result.granted) return needsAccess(result, tab.id);
        if (!result.target.connected) {
          if (connect) {
            const connection = await chrome.runtime.sendMessage({ type: "INSTELA_ENSURE_SCRIPT", tabId: tab.id });
            if (connection?.ok) return main(false);
            return connectionError(connection?.reason, result.target.pageUrl);
          }
          return connectionError("Reload the form to reconnect the extension.", result.target.pageUrl);
        }
        return ready(result, tab.id);
      case "signed-out": return message("Sign in to Instela", "Use the same Instela account in this Chrome browser to access your saved details.", button("Sign in", () => open(`${origin}/login`)));
      case "upgrade": return message("Apply faster with Pro", "Your profile memory is ready. Instela Pro adds autofill and guided application questions.", button("Explore Pro", () => open(`${origin}/pricing?feature=extension_autofill_internships`)));
      case "instela-home": return message("Ready when you apply", "Choose an opportunity and press Apply with Instela. Your saved details will be ready at the form.", button("Explore opportunities", () => open(`${origin}/explore`)));
      case "open-application": return message("Continue to the application", "Instela keeps this opportunity connected as you move to its application form.", button("Open application with Instela", async () => {
        const response = await chrome.runtime.sendMessage({ type: "INSTELA_OPEN_APPLICATION", tabId: tab.id });
        if (response?.ok) window.close();
        else error(response?.reason ?? "Could not open the application. Try again.");
      }));
      case "no-match": return message("Start with an Instela opportunity", "This page has not been matched to an active Instela listing. Open an opportunity from your feed to use autofill.", button("Find an opportunity", () => open(`${origin}/explore`)));
      case "unsupported": return message("Open an application first", "Instela works on supported internship and scholarship forms. Open one from Instela to begin.", button("Open Instela", () => open(`${origin}/portal`)));
      case "unreachable": return error(`Could not reach Instela at ${origin}. Check your connection and the extension settings.`);
      default: return error(result.reason ?? "The application could not be checked. Please try again.");
    }
  } catch { return error("The extension could not connect. Reload it from chrome://extensions and try again."); }
}

document.getElementById("profile-link").addEventListener("click", () => open(`${origin}/profile#application-memory`));
document.getElementById("settings-toggle").addEventListener("click", () => {
  const panel = document.getElementById("settings");
  panel.hidden = !panel.hidden;
  document.getElementById("settings-toggle").setAttribute("aria-expanded", String(!panel.hidden));
});
document.getElementById("save-origin").addEventListener("click", async () => {
  const notice = document.getElementById("settings-notice");
  try {
    const result = await chrome.runtime.sendMessage({ type: "INSTELA_SET_ORIGIN", origin: document.getElementById("origin").value });
    notice.textContent = result?.ok ? "Connection saved." : result?.reason ?? "Could not save settings.";
    if (result?.ok) main();
  } catch { notice.textContent = "Could not save settings. Please try again."; }
});
main();
