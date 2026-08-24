/**
 * The panel.
 *
 * Renders one of six states, and names each one precisely. "Not signed in",
 * "cannot reach Arc" and "we do not have this posting" are three different
 * problems with three different fixes, and collapsing them into one "something
 * went wrong" would leave the student with no idea which.
 */

const root = document.getElementById("root");

const { describeFill } = await import(chrome.runtime.getURL("vendor/autofill.js"));
const { originPatternForUrl } = await import(chrome.runtime.getURL("vendor/apply-url.js"));

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function render(...nodes) {
  root.replaceChildren(...nodes.flat().filter(Boolean));
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

function signedOut(origin) {
  render(
    el("p", { className: "muted" }, "You are not signed in to Arc Explorer."),
    el("hr"),
    el(
      "button",
      {
        onclick: () => chrome.tabs.create({ url: `${origin}/login` }),
      },
      "sign in",
    ),
  );
}

function unreachable(origin) {
  render(
    el("p", { className: "muted" }, `Could not reach Arc Explorer at ${origin}.`),
    el(
      "p",
      { className: "muted" },
      "If you are running it locally, start it with npm run dev — or set the address below.",
    ),
  );
}

function noMatch() {
  render(
    el("p", { className: "muted" }, "Arc Explorer does not have this posting."),
    el(
      "p",
      { className: "muted" },
      "It only fills applications for listings in your feed, so nothing here is autofillable.",
    ),
  );
}

function errorState(reason) {
  render(el("p", { className: "muted" }, reason));
}

/**
 * The working state.
 *
 * The button says "fill this form", not "apply" — the extension fills, the
 * student submits, and the label should not blur that.
 */
function ready(packet, tabId) {
  const { posting, values, attestations, hasCoverLetter, alreadyApplied } = packet;
  const count = Object.keys(values).length;

  const status = el("div", { className: "stack" });

  const fillButton = el(
    "button",
    {
      onclick: async () => {
        fillButton.disabled = true;
        fillButton.textContent = "filling…";
        let res;
        try {
          res = await chrome.tabs.sendMessage(tabId, { type: "ARC_FILL", values });
        } catch {
          res = { error: "could not reach the page — try reloading it" };
        }
        fillButton.disabled = false;
        fillButton.textContent = "fill this form again";

        if (!res || res.error) {
          status.replaceChildren(el("p", { className: "report" }, res?.error ?? "fill failed"));
          return;
        }

        const parts = [el("p", { className: "report" }, describeFill(res.report))];
        if (res.blockedLabels?.length) {
          parts.push(
            el(
              "div",
              { className: "yours" },
              el("strong", {}, "yours to answer"),
              el(
                "ul",
                {},
                res.blockedLabels.map((l) => el("li", {}, l)),
              ),
            ),
          );
        }
        status.replaceChildren(...parts);
      },
    },
    "fill this form",
  );

  const appliedButton = el(
    "button",
    {
      className: "secondary",
      onclick: async () => {
        appliedButton.disabled = true;
        const res = await chrome.runtime.sendMessage({
          type: "ARC_MARK_APPLIED",
          postingId: posting.id,
        });
        appliedButton.textContent = res?.ok ? "recorded ✓" : "could not record";
        if (res?.emailMessage) {
          status.replaceChildren(el("p", { className: "report" }, res.emailMessage));
        }
      },
    },
    alreadyApplied ? "already marked applied" : "I submitted this",
  );
  appliedButton.disabled = Boolean(alreadyApplied);

  render(
    el("h1", {}, posting.title),
    el("p", { className: "company" }, posting.company ?? posting.kind),
    fillButton,
    el(
      "p",
      { className: "muted", style: "margin-top:8px" },
      `${count} fact${count === 1 ? "" : "s"} ready${hasCoverLetter ? " · cover letter included" : ""}`,
    ),
    attestations.length
      ? el(
          "div",
          { className: "yours" },
          el("strong", {}, "we will never fill these"),
          el(
            "ul",
            {},
            attestations.map((a) => el("li", {}, a)),
          ),
        )
      : null,
    status,
    el("hr"),
    el(
      "p",
      { className: "muted", style: "margin-bottom:8px" },
      "Read the form, attach your resume, then submit it yourself.",
    ),
    appliedButton,
  );
}

/**
 * The one-click-per-site grant, for anything outside the four ATS families.
 *
 * WHY THE BUTTON IS HERE AND NOT ON THE ARC PAGE. `chrome.permissions.request`
 * must run inside a user gesture in an extension surface — a content script
 * cannot call it at all, and forwarding a click from a web page through the
 * service worker loses the gesture, so Chrome refuses. This popup is the only
 * place the prompt can legitimately come from.
 *
 * The trade is small and it is once, ever, per site: Greenhouse, Lever, Ashby
 * and SmartRecruiters are declared in the manifest and never reach this path,
 * which is 1,885 of 1,909 open internships. It is the ~300 one-row scholarship
 * hosts that land here, and the alternative — `<all_urls>` at install — is a
 * prompt saying we can read every page the student ever visits.
 */
function needsSiteAccess(tab, packet) {
  const pattern = originPatternForUrl(tab.url);
  const host = (() => {
    try {
      return new URL(tab.url).hostname;
    } catch {
      return tab.url;
    }
  })();

  const button = el(
    "button",
    {
      onclick: async () => {
        button.disabled = true;
        button.textContent = "waiting for Chrome…";
        // Directly, not via the service worker: the gesture is what Chrome
        // checks and it does not survive a message hop.
        let granted = false;
        try {
          granted = await chrome.permissions.request({ origins: [pattern] });
        } catch {
          granted = false;
        }
        if (!granted) {
          button.disabled = false;
          button.textContent = `allow Arc on ${host}`;
          return;
        }
        // A freshly granted origin injects nothing into the tab already open,
        // and the student is looking at it — so put the script in by hand
        // rather than making them reload a page they have no reason to suspect.
        await chrome.runtime.sendMessage({ type: "ARC_ENSURE_SCRIPT", tabId: tab.id });
        ready(packet, tab.id);
      },
    },
    `allow Arc on ${host}`,
  );

  render(
    el("p", {}, el("strong", {}, packet.posting?.title ?? "this application")),
    el(
      "p",
      { className: "muted", style: "margin-top:8px" },
      `Arc has your facts ready, but it has never been allowed to touch ${host}.`,
    ),
    el(
      "p",
      { className: "muted" },
      "Chrome will ask about this one site. Once you allow it, it is remembered and you will not be asked for this site again.",
    ),
    el("hr"),
    button,
  );
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function main() {
  const tab = await activeTab();
  if (!tab?.url) return errorState("no active tab");

  const res = await chrome.runtime.sendMessage({ type: "ARC_GET_PACKET", pageUrl: tab.url });

  document.getElementById("origin").value = res.origin ?? "";

  switch (res.state) {
    case "ready": {
      // Declared hosts answer true without prompting; everything else needs
      // the one-time per-site grant below.
      const { granted } = await chrome.runtime.sendMessage({
        type: "ARC_HAS_SITE_ACCESS",
        pageUrl: tab.url,
      });
      if (!granted && originPatternForUrl(tab.url)) return needsSiteAccess(tab, res.packet);
      return ready(res.packet, tab.id);
    }
    case "signed-out":
      return signedOut(res.origin);
    case "unreachable":
      return unreachable(res.origin);
    case "no-match":
      return noMatch();
    default:
      return errorState(res.reason ?? "something went wrong");
  }
}

/* Settings — one field, the Arc address, so this works against localhost. */
document.getElementById("settings-toggle").addEventListener("click", () => {
  const panel = document.getElementById("settings");
  panel.hidden = !panel.hidden;
});
document.getElementById("save-origin").addEventListener("click", async () => {
  const value = document.getElementById("origin").value.trim();
  await chrome.storage.local.set({ arcOrigin: value });
  main();
});

main();
