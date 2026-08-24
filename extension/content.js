/**
 * The part that touches the employer's form.
 *
 * It holds no data of its own. The popup passes down a map of values only when
 * the student presses the button, this fills what it can identify, and it
 * reports back what it did to every field on the page.
 *
 * ── THINGS THIS FILE MUST NEVER DO ──────────────────────────────────────────
 *
 *   · It must never call `.click()` or `.submit()` on anything. There is no
 *     such call in this file and there must never be one: the student presses
 *     the employer's own submit button, having read the form. That is the line
 *     the whole design rests on.
 *   · It must never fill a field `matchFieldKey` declined. The decision lives
 *     in `src/lib/apply/autofill.ts` — tested, and compiled into `vendor/` by
 *     `npm run build:extension` rather than reimplemented here, so there is one
 *     definition of what is safe to fill.
 *   · It must never overwrite a value the student already typed.
 */

const ARC_STYLE_ID = "arc-explorer-style";

/* ------------------------------------------------------------------ *
 * Reading a field
 * ------------------------------------------------------------------ */

/**
 * The visible label for a control, tried in the order a human would read it.
 *
 * Five strategies because the five ATS platforms each pick a different one,
 * and a field whose label we cannot find is a field we decline rather than
 * guess at.
 */
function labelFor(el) {
  // 1. aria-label, the most explicit thing a form can say.
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;

  // 2. aria-labelledby → the element it points at.
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }

  // 3. <label for="id">
  if (el.id) {
    const escaped = window.CSS?.escape ? CSS.escape(el.id) : el.id;
    const byFor = document.querySelector(`label[for="${escaped}"]`);
    if (byFor?.textContent?.trim()) return byFor.textContent.trim();
  }

  // 4. A wrapping <label>.
  const wrapping = el.closest("label");
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();

  // 5. The nearest preceding label-ish sibling — Workday and some Greenhouse
  // custom questions render the text as a plain div above the input.
  let node = el.parentElement;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    const candidate = node.querySelector("label, legend, .application-label");
    if (candidate?.textContent?.trim()) return candidate.textContent.trim();
  }
  return null;
}

/** Everything `matchFieldKey` needs to identify one control. */
function signatureOf(el) {
  const tag = el.tagName.toLowerCase();
  const type = tag === "textarea" || tag === "select" ? tag : (el.type || "text").toLowerCase();
  return {
    name: el.getAttribute("name"),
    id: el.id || null,
    label: labelFor(el),
    placeholder: el.getAttribute("placeholder"),
    autocomplete: el.getAttribute("autocomplete"),
    type,
  };
}

/* ------------------------------------------------------------------ *
 * Writing a field
 * ------------------------------------------------------------------ */

/**
 * Set a value in a way React notices.
 *
 * Greenhouse, Lever and Ashby are all React apps, and React tracks the last
 * value it wrote in an internal property. Assigning `el.value = x` directly
 * updates the DOM but leaves React's copy stale, so the field looks filled and
 * then reverts — or submits empty, which is worse, because it looks like it
 * worked. Going through the prototype's native setter is what makes React's
 * change tracking see it.
 */
function setNativeValue(el, value) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;

  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Choose the matching option in a <select>, by value or visible text. */
function setSelect(el, value) {
  const wanted = value.trim().toLowerCase();
  const option = [...el.options].find(
    (o) =>
      o.value.trim().toLowerCase() === wanted ||
      o.textContent.trim().toLowerCase() === wanted,
  );
  if (!option) return false;
  setNativeValue(el, option.value);
  return true;
}

/* ------------------------------------------------------------------ *
 * Marking the fields only the student can answer
 * ------------------------------------------------------------------ */

function ensureStyle() {
  if (document.getElementById(ARC_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ARC_STYLE_ID;
  style.textContent = `
    .arc-filled { outline: 2px solid #2f81f7 !important; outline-offset: 1px; }
    .arc-yours  { outline: 2px dashed #d29922 !important; outline-offset: 1px; }
  `;
  document.head.appendChild(style);
}

function clearMarks() {
  for (const el of document.querySelectorAll(".arc-filled, .arc-yours")) {
    el.classList.remove("arc-filled", "arc-yours");
  }
}

/* ------------------------------------------------------------------ *
 * The pass
 * ------------------------------------------------------------------ */

async function fill(values) {
  // Imported at call time rather than at the top, because a content script is
  // a classic script and cannot use static `import`. The module is the
  // compiled output of the tested TypeScript, exposed via
  // web_accessible_resources.
  const { matchFieldKey, isBlockedField } = await import(
    chrome.runtime.getURL("vendor/autofill.js")
  );

  ensureStyle();
  clearMarks();

  const report = { filled: 0, known: 0, blocked: 0, unknown: 0, skippedNonEmpty: 0 };
  const blockedLabels = [];

  const controls = document.querySelectorAll("input, textarea, select");
  for (const el of controls) {
    const tag = el.tagName.toLowerCase();
    const type = (el.type || "").toLowerCase();

    // Never in scope: hidden plumbing, buttons, and the file input we could
    // not fill anyway (Instela stores the parsed structure of a resume, not the
    // original document — see /privacy).
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
    if (el.disabled || el.readOnly) continue;

    const sig = signatureOf(el);

    if (isBlockedField(sig)) {
      report.blocked++;
      el.classList.add("arc-yours");
      if (sig.label) blockedLabels.push(sig.label.replace(/\s+/g, " ").slice(0, 80));
      continue;
    }

    const key = matchFieldKey(sig);
    if (!key) {
      report.unknown++;
      continue;
    }

    const value = values[key];
    if (!value) {
      report.known++;
      continue;
    }

    // A value we did not put there is a value the student chose. Overwriting
    // it is data loss, and silent data loss at that.
    if (el.value && el.value.trim() !== "") {
      report.skippedNonEmpty++;
      continue;
    }

    const ok = tag === "select" ? setSelect(el, value) : (setNativeValue(el, value), true);
    if (ok) {
      report.filled++;
      el.classList.add("arc-filled");
    } else {
      report.known++;
    }
  }

  return { report, blockedLabels };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ARC_FILL") {
    fill(msg.values).then(sendResponse).catch((err) =>
      sendResponse({ error: err?.message ?? "fill failed" }),
    );
    return true; // async
  }
  return false;
});

/* ------------------------------------------------------------------ *
 * The embedded path — filling a form Instela has framed in its own page
 *
 * `all_frames: true` puts this script inside the employer's form even when
 * that form is a child frame of an Instela page, which is what lets a student
 * apply without leaving the site. The parent cannot reach in — the frame is
 * cross-origin, so `iframe.contentDocument` is null there — and `postMessage`
 * is the one channel that crosses. This is the receiving end of it.
 *
 * ── WHY THE ORIGIN CHECK IS NOT OPTIONAL ────────────────────────────────────
 *
 * Without it, *any* website could frame this same Greenhouse form and shout
 * "fill" at it, and this script would obligingly fetch the signed-in student's
 * real name, school and contact details into a document that site controls.
 * Three conditions must all hold: the sender is our immediate parent, that
 * parent is the top-level document, and its origin is an Instela origin the
 * student configured. `event.origin` is set by the browser and cannot be
 * forged by the sender, which is what makes it worth checking.
 *
 * Note what is NOT sent across this channel: the parent never passes values
 * down. It sends a verb. The facts travel the existing path — service worker
 * to Instela's API with the student's own cookie — so an Instela page embedding a form
 * still never holds the packet in its own JavaScript.
 */

const DEFAULT_ARC_ORIGIN = "http://localhost:3000";

async function allowedParentOrigins() {
  const { arcOrigin } = await chrome.storage.local.get("arcOrigin");
  const configured = (arcOrigin || "").replace(/\/+$/, "");
  const list = [DEFAULT_ARC_ORIGIN];
  if (configured) list.push(configured);
  return list;
}

async function isTrustedEmbedder(event) {
  // 1. We must actually be embedded, and by the top document itself.
  if (window === window.top) return false;
  if (event.source !== window.parent) return false;
  if (window.parent !== window.top) return false;
  // 2. …and that document must be Instela.
  const allowed = await allowedParentOrigins();
  return allowed.includes(event.origin);
}

window.addEventListener("message", async (event) => {
  const type = event.data?.type;
  if (type !== "ARC_EMBED_PING" && type !== "ARC_EMBED_FILL") return;
  if (!(await isTrustedEmbedder(event))) return;

  const reply = (payload) => event.source.postMessage({ ...payload, id: event.data.id }, event.origin);

  // A ping so the page can tell "extension not installed" apart from "fill
  // silently did nothing". Those need different sentences on screen.
  if (type === "ARC_EMBED_PING") {
    reply({ type: "ARC_EMBED_PONG" });
    return;
  }

  try {
    const packet = await chrome.runtime.sendMessage({
      type: "ARC_GET_PACKET",
      pageUrl: location.href,
    });
    if (packet?.state !== "ready") {
      reply({ type: "ARC_EMBED_RESULT", state: packet?.state ?? "error" });
      return;
    }
    // `values` is built server-side by the same `buildAutofillValues` the
    // popup path uses, so both routes fill from one definition.
    const { report, blockedLabels } = await fill(packet.packet.values);
    const postingId = packet.packet.posting?.id ?? null;

    /*
     * Start watching only once a fill has happened, and only on a platform we
     * have a confirmation rule for. Watching from page load would mean a
     * MutationObserver running on every ATS page the student merely browses.
     *
     * `watching` is reported back so the wizard can say the true sentence:
     * "we will mark this applied automatically" where that is true, and ask
     * the student to confirm where it is not.
     */
    const watching = await watchForSubmission(() =>
      event.source.postMessage(
        { type: "ARC_EMBED_SUBMITTED", postingId },
        event.origin,
      ),
    );

    reply({
      type: "ARC_EMBED_RESULT",
      state: "filled",
      report,
      blockedLabels,
      postingId,
      watching,
    });
  } catch (err) {
    reply({ type: "ARC_EMBED_RESULT", state: "error", reason: err?.message ?? "fill failed" });
  }
});

/* ------------------------------------------------------------------ *
 * Watching for the confirmation, from inside the frame
 * ------------------------------------------------------------------ */

/**
 * WHY THIS RUNS HERE. Instela's own JavaScript cannot read a cross-origin frame —
 * `contentDocument` is null — so the parent page has no way to see that the
 * employer's form was replaced by a thank-you panel. The content script is
 * already inside that document, which makes it the only thing that can.
 *
 * IT NEVER SUBMITS ANYTHING. It observes. The student presses the employer's
 * own button; this notices afterwards and tells Instela, which stamps the tracker
 * and sends the confirmation email. The invariant that there is no `.click()`
 * anywhere in this extension is unaffected and still asserted by test.
 *
 * The rule per platform lives in `vendor/submitted.js`, compiled from
 * `lib/apply/submitted.ts` — one definition, unit-tested against the real
 * confirmation copy, rather than a regex written twice.
 */
let submissionWatcher = null;

async function watchForSubmission(notify) {
  const { detectSubmission, normalizePageText, hasSubmissionRule } = await import(
    chrome.runtime.getURL("vendor/submitted.js")
  );

  // Nothing to watch for on a platform whose confirmation nobody has read.
  // Saying so lets the UI promise detection only where it exists.
  if (!hasSubmissionRule(location.href)) return false;
  if (submissionWatcher) return true;

  const look = () => {
    const verdict = detectSubmission({
      url: location.href,
      // `innerText`, not `textContent`: a confirmation is what a person can
      // see, and textContent would also return hidden templates and the
      // contents of <script> tags.
      text: normalizePageText(document.body?.innerText ?? ""),
    });
    if (verdict === "submitted") {
      submissionWatcher?.disconnect();
      submissionWatcher = null;
      notify();
      return true;
    }
    return false;
  };

  if (look()) return true;

  submissionWatcher = new MutationObserver(() => look());
  submissionWatcher.observe(document.body, { childList: true, subtree: true, characterData: true });
  return true;
}
