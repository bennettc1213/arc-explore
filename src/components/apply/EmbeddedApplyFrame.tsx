"use client";

import { useEffect, useRef, useState } from "react";

import { applyUrlHost } from "@/lib/apply/apply-url";

/**
 * The employer's real application form, embedded in an Instela page.
 *
 * ── WHAT THIS COMPONENT CAN AND CANNOT DO ───────────────────────────────────
 *
 * It cannot fill anything. The frame is cross-origin, so `contentDocument` is
 * null here and no amount of JavaScript on this page reaches a single field
 * inside it. All it does is host the frame, print the employer's real address
 * above it, and send a verb to the extension's content script — which runs
 * *inside* the frame via `all_frames: true` and does the filling there.
 *
 * That is also why the facts never pass through this component: it posts
 * `INSTELA_EMBED_FILL` and nothing else. The values travel the extension's own
 * path, service worker → Instela API → the frame.
 *
 * ── WHY THE ADDRESS IS PRINTED ──────────────────────────────────────────────
 *
 * Embedding removes the browser's address bar at the exact moment someone is
 * about to put their name on a legal document, and they can no longer see they
 * are on greenhouse.io. This project's rule is to name what was observed, so
 * the host is shown, unmissably, with a way out to a real tab beside it. A
 * student who would rather see the padlock themselves should be one click from
 * doing so.
 *
 * ── WHY SUBMIT IS STILL THEIRS ──────────────────────────────────────────────
 *
 * Nothing changes about that. The submit button in the frame is the
 * employer's, and the student presses it.
 *
 * Only hosts whose captcha was *observed* working in a frame reach this
 * component — today that is Greenhouse alone, whose reCAPTCHA Enterprise
 * minted a full token framed exactly as it does top-level (2382 chars,
 * 2026-08-20). Lever renders here perfectly well and is still withheld,
 * because rendering is not the thing that has to work. See `embedStatus`.
 */
export function EmbeddedApplyFrame({
  url,
  onFilled,
  onSubmitted,
}: {
  url: string;
  onFilled?: (postingId: string | null) => void;
  /**
   * Fired when the employer's own confirmation appears inside the frame.
   *
   * Only ever fires on a platform with a submission rule (today: Greenhouse).
   * Everywhere else it stays silent and the student confirms by hand — the
   * behaviour that existed before this, and the honest one, since inventing a
   * confirmation is the mistake that makes someone stop tracking a live
   * application.
   */
  onSubmitted?: (postingId: string | null) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const presentRef = useRef(false);
  const busyRef = useRef(false);
  const [extension, setExtension] = useState<"unknown" | "present" | "absent">("unknown");
  const [status, setStatus] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const host = applyUrlHost(url);
  const origin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  })();

  /* One listener for both the ping reply and the fill result. */
  useEffect(() => {
    if (!origin) return;
    const onMessage = (event: MessageEvent) => {
      // The browser sets `event.origin`; the sender cannot forge it. Anything
      // not from the exact form we embedded is not ours to read.
      if (event.origin !== origin) return;
      const data = event.data as
        | { type: "INSTELA_EMBED_PONG" }
        | { type: "INSTELA_EMBED_SUBMITTED"; postingId: string | null }
        | {
            type: "INSTELA_EMBED_RESULT";
            state: string;
            report?: { filled: number; blocked: number; skippedNonEmpty: number };
            blockedLabels?: string[];
            postingId?: string | null;
          };
      if (data?.type === "INSTELA_EMBED_PONG") {
        presentRef.current = true;
        setExtension("present");
        return;
      }
      /*
       * The employer's form confirmed the submission, seen from inside the
       * frame by the content script — the parent page cannot read a
       * cross-origin document, so this message is the only way Arc learns it.
       *
       * Arc never inferred this and still does not: the signal is the
       * employer's own confirmation text, matched by a per-platform rule in
       * `lib/apply/submitted.ts`. Where no rule exists, this message simply
       * never arrives and the student marks it applied themselves.
       */
      if (data?.type === "INSTELA_EMBED_SUBMITTED") {
        setStatus("submitted — the employer's confirmation is on screen");
        onSubmitted?.(data.postingId ?? null);
        return;
      }
      if (data?.type !== "INSTELA_EMBED_RESULT") return;

      busyRef.current = false;
      setBusy(false);
      if (data.state === "filled") {
        const r = data.report ?? { filled: 0, blocked: 0, skippedNonEmpty: 0 };
        // Named after what happened to each field, not a single success count:
        // "filled 9" beside "4 are yours to answer" is the honest summary, and
        // the amber ones are the whole point of the design.
        setStatus(
          `filled ${r.filled} field${r.filled === 1 ? "" : "s"}` +
            (r.skippedNonEmpty ? ` · left ${r.skippedNonEmpty} you had already typed` : "") +
            (r.blocked ? ` · ${r.blocked} are yours to answer` : ""),
        );
        setBlocked(data.blockedLabels ?? []);
        onFilled?.(data.postingId ?? null);
      } else if (data.state === "signed-out") {
        setStatus("sign in to Arc in this browser, then press fill again");
      } else if (data.state === "no-match") {
        setStatus("the extension could not match this page to a posting");
      } else {
        setStatus("the extension could not reach Arc — is it running?");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, onFilled, onSubmitted]);

  /*
   * Ask the frame whether the extension is in there at all.
   *
   * POLLED, NOT PINGED ONCE, and both reasons were found by running it. The
   * frame often finishes loading before this component hydrates, so an
   * `onLoad` handler attached during hydration never fires at all — the first
   * live run had the button enabled and the "install the extension" note
   * hidden in a browser with no extension, which is the exact wrong way round.
   * And the content script is injected at `document_idle`, so even a correctly
   * timed single ping can arrive before there is anything listening.
   *
   * So: ask repeatedly for a few seconds, and only then conclude it is absent.
   * Concluding too early is the expensive direction — it tells a student with a
   * working extension to go and install the extension.
   */
  useEffect(() => {
    if (!origin) return;
    let tries = 0;
    const send = () => {
      frameRef.current?.contentWindow?.postMessage({ type: "INSTELA_EMBED_PING" }, origin);
    };
    send();
    const timer = window.setInterval(() => {
      // Read through a ref, never a state updater: an updater that also sends
      // a message or clears a timer is a side effect in the render phase.
      if (presentRef.current) {
        window.clearInterval(timer);
        return;
      }
      tries += 1;
      if (tries > 10) {
        // ~4s of silence. Concluding too early is the expensive direction — it
        // tells a student whose extension works to go and install it.
        window.clearInterval(timer);
        setExtension("absent");
        return;
      }
      send();
    }, 400);
    return () => window.clearInterval(timer);
  }, [origin]);

  const doFill = () => {
    if (!origin) return;
    busyRef.current = true;
    setBusy(true);
    setStatus(null);
    setBlocked([]);
    frameRef.current?.contentWindow?.postMessage({ type: "INSTELA_EMBED_FILL" }, origin);
    // A dead-man's switch, so the button can never sit on "filling…" forever.
    window.setTimeout(() => {
      if (!busyRef.current) return;
      busyRef.current = false;
      setBusy(false);
      setStatus("no response from the form — reload it and try again");
    }, 15000);
  };

  if (!host || !origin) return null;

  return (
    <div>
      {/* The address bar we took away, given back. */}
      <div
        className="flex flex-wrap items-center gap-2"
        style={{
          border: "1px solid var(--line-strong)",
          borderBottom: "none",
          padding: "8px 10px",
          background: "var(--surface-2, transparent)",
        }}
      >
        <span className="mono chrome">you are filling in</span>
        <span className="mono-strong" style={{ color: "var(--text)" }}>
          {host}
        </span>
        <span className="mono" style={{ color: "var(--muted)" }}>
          · the employer&rsquo;s own form
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mono press"
          style={{ marginLeft: "auto", color: "var(--accent)" }}
        >
          open in a tab ↗
        </a>
      </div>

      <iframe
        ref={frameRef}
        src={url}
        title={`Application form on ${host}`}
        style={{
          width: "100%",
          height: "70vh",
          minHeight: 420,
          border: "1px solid var(--line-strong)",
          background: "#fff",
          display: "block",
        }}
      />

      <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary press"
          onClick={doFill}
          disabled={busy || extension === "absent"}
          // A primary button that is disabled in the DOM and full-strength on
          // screen invites the click it will not answer.
          style={{ opacity: busy || extension === "absent" ? 0.5 : 1 }}
        >
          {busy ? "filling…" : "fill this form"}
        </button>
        <span className="mono" style={{ color: "var(--muted)" }}>
          then read it, attach your resume, and press the employer&rsquo;s submit button
        </span>
      </div>

      {extension === "absent" && (
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 10, maxWidth: "60ch" }}>
          Filling needs the Arc browser extension, which does the typing inside the form above —
          this page genuinely cannot reach into it. See <a href="/extension">the extension page</a>.
          You can still fill the form by hand right here, or open it in a tab.
        </p>
      )}

      {status && (
        <p className="mono" style={{ marginTop: 10, color: "var(--accent)" }}>
          {status}
        </p>
      )}

      {blocked.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="mono chrome">left for you — we never answer these</div>
          <ul className="t-sm" style={{ color: "var(--muted)", marginTop: 4 }}>
            {blocked.slice(0, 8).map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
