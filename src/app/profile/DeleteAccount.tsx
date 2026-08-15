"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { deleteAccountAction, type DeleteAccountState } from "./actions";

const INITIAL: DeleteAccountState = { status: "idle" };

/**
 * Delete everything.
 *
 * Two-step and typed rather than a confirm dialog. This is the only
 * irreversible action in the product, and a dialog is the kind of thing people
 * dismiss by reflex — typing the word is a deliberate act. The list of what
 * goes is shown *before* the button, because "are you sure?" is not informed
 * consent when the person does not know what we are holding.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteAccountAction, INITIAL);

  return (
    <section style={{ border: "1px solid var(--line)", padding: 22, marginTop: 28 }}>
      <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
        delete your account
      </div>

      {!open ? (
        <>
          <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "62ch", marginBottom: 14 }}>
            Removes your profile, your resume and everything read out of it, your cover letters,
            your saved and tracked applications, and your reminder history. Immediate, and there
            is no undo — we keep no backup copy to restore you from. See{" "}
            <Link href="/privacy" style={{ color: "var(--accent)" }}>
              what we hold
            </Link>
            .
          </p>
          <button type="button" className="btn press" onClick={() => setOpen(true)}>
            delete my account
          </button>
        </>
      ) : (
        <form action={action}>
          <p className="t-sm" style={{ color: "var(--text)", maxWidth: "62ch", marginBottom: 14 }}>
            This deletes, right now and permanently:
          </p>
          <ul
            className="t-sm"
            style={{ color: "var(--muted)", paddingLeft: 18, marginBottom: 16, maxWidth: "62ch" }}
          >
            <li>your profile — school, major, graduation year, GPA, work authorization, targets</li>
            <li>every resume you uploaded and the structure we parsed out of it</li>
            <li>every cover letter draft</li>
            <li>every saved, applied and tracked application, with its notes</li>
            <li>your reminder history and your email address</li>
          </ul>

          <label style={{ display: "block", marginBottom: 14 }}>
            <span className="mono chrome" style={{ display: "block", marginBottom: 6 }}>
              type <span style={{ color: "var(--accent)" }}>delete</span> to confirm
            </span>
            <input
              name="confirm"
              autoComplete="off"
              spellCheck={false}
              style={{
                background: "transparent",
                border: "1px solid var(--line-strong)",
                color: "var(--text)",
                padding: "10px 12px",
                font: "inherit",
                maxWidth: 220,
              }}
            />
          </label>

          {state.status === "error" && (
            <p className="mono" style={{ color: "var(--accent)", marginBottom: 12 }}>
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary press" disabled={pending}>
              {pending ? "deleting…" : "delete everything"}
            </button>
            <button type="button" className="btn press" onClick={() => setOpen(false)}>
              keep my account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
