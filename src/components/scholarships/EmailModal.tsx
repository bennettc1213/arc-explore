"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { sendMagicLink, type LoginState } from "@/app/login/actions";
import { Mascot } from "@/components/chrome/Mascot";

import { track } from "./track";

/**
 * The sign-up prompt the scholarship views open, with the trigger that opened
 * it recorded.
 *
 * There was no email modal anywhere before this, so it is deliberately thin: it
 * IS the existing magic-link sign-in (`sendMagicLink`), in a dialog, returning
 * the student to the page they were on. No second auth path, no list signup —
 * "email me" means "make me an account", which is the only thing an email here
 * can do.
 *
 * Triggers: E2 = a locked card, E3 = save / set a goal.
 *
 * PORTALED TO <body>, and that is load-bearing (HANDOFF.md §6): the header is a
 * z-index 20 stacking context that outranks `main`, so a full-viewport overlay
 * rendered inside `main` loses to the nav text whatever z-index it declares.
 */

export type ModalTrigger = "E2" | "E3";

const COPY: Record<ModalTrigger, { title: string; body: string }> = {
  E2: {
    title: "see your whole plan",
    body: "Signed out, the plan shows ten scholarships. Make a free account to see every card in it.",
  },
  E3: {
    title: "save it for later",
    body: "Make a free account to save scholarships to your tracker and set a funding goal.",
  },
};

const ModalContext = createContext<(trigger: ModalTrigger) => void>(() => {});

export function useEmailModal() {
  return useContext(ModalContext);
}

const INITIAL: LoginState = { status: "idle" };

export function EmailModalProvider({ children }: { children: React.ReactNode }) {
  const [trigger, setTrigger] = useState<ModalTrigger | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Every open is recorded here, once, so no caller can forget the event or
  // tag it with the wrong trigger.
  const open = useCallback((t: ModalTrigger) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    track("locked_card_clicked", { trigger: t });
    setTrigger(t);
  }, []);

  const close = useCallback(() => {
    setTrigger(null);
    opener.current?.focus();
  }, []);

  return (
    <ModalContext.Provider value={open}>
      {children}
      {trigger && createPortal(<Dialog trigger={trigger} onClose={close} />, document.body)}
    </ModalContext.Provider>
  );
}

function Dialog({ trigger, onClose }: { trigger: ModalTrigger; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, INITIAL);
  const input = useRef<HTMLInputElement>(null);
  // Read once, at open: where to send them back after the link is clicked.
  const [next] = useState(() => `${window.location.pathname}${window.location.search}`);
  const copy = COPY[trigger];

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="email-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="email-modal-title" className="email-modal">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Mascot size={28} />
            <h2 id="email-modal-title" className="mono-strong chrome">
              {copy.title}
            </h2>
          </div>
          <button type="button" className="btn press" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state.status === "sent" ? (
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 16 }}>
            {/* The address is the user's own input — rendered as typed. */}
            A sign-in link is on its way to {state.email}. It expires in an hour and only works once.
          </p>
        ) : (
          <form action={formAction} style={{ marginTop: 16 }}>
            <p className="t-sm" style={{ color: "var(--muted)", marginBottom: 14 }}>
              {copy.body}
            </p>
            <input type="hidden" name="next" value={next} />
            <label className="field-row">
              <span className="mono chrome">email</span>
              <input
                ref={input}
                className="field"
                type="email"
                name="email"
                autoComplete="email"
                required
                defaultValue={state.email ?? ""}
                placeholder="you@school.edu"
              />
            </label>
            <button type="submit" className="btn btn-primary press" style={{ marginTop: 14 }} disabled={pending}>
              {pending ? "sending…" : "email me a sign-in link"}
            </button>
            {state.status === "error" && (
              <p className="mono" role="alert" style={{ color: "var(--system-danger)", marginTop: 12 }}>
                {state.message}
              </p>
            )}
            <p className="mono" style={{ marginTop: 14, color: "var(--faint-readable)" }}>
              no password. free. we never sell your data.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
