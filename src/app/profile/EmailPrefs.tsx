"use client";

import { useActionState } from "react";

import { saveEmailPrefsAction, type EmailPrefsState } from "./actions";
import type { EmailPrefs as Prefs } from "@/lib/profile/store";

const INITIAL: EmailPrefsState = { status: "idle" };

/**
 * The two things we will email about, and what each one actually is.
 *
 * This panel exists because the unsubscribe page already promised it: "you can
 * turn reminders back on from your profile whenever you want" shipped with the
 * reminders, and there was no control anywhere to turn them back on with. A
 * one-way door out of an email is not a preference.
 *
 * Each toggle says **what triggers the send**, not just its name. "Weekly
 * digest" tells a student nothing about whether they want it; "Sunday, only
 * when something new scores well against your profile" is a decision they can
 * make. Saved-search alerts are deliberately absent — they belong to individual
 * searches and are switched per search on the feed, and duplicating them here
 * would create a second control that can disagree with the first.
 */
export function EmailPrefs({ prefs }: { prefs: Prefs }) {
  const [state, action, pending] = useActionState(saveEmailPrefsAction, INITIAL);

  return (
    <section style={{ border: "1px solid var(--line)", padding: 22, marginTop: 28 }}>
      <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
        email
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "62ch", marginBottom: 18 }}>
        Two subscriptions, both off-able here and from a link in every message we send. We
        never email about anything else.
      </p>

      <form action={action}>
        <label
          className="flex items-start gap-3"
          style={{ marginBottom: 16, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            name="deadlineReminders"
            value="1"
            defaultChecked={prefs.deadlineReminders}
            style={{ marginTop: 4 }}
          />
          <span>
            <span className="t-sm" style={{ color: "var(--text)" }}>
              deadline reminders
            </span>
            <span className="mono" style={{ display: "block", color: "var(--faint-readable)" }}>
              14, 7 and 1 days before — only for things you saved, have not applied to, and
              that publish a deadline. Most internships do not.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3" style={{ marginBottom: 20, cursor: "pointer" }}>
          <input
            type="checkbox"
            name="weeklyDigest"
            value="1"
            defaultChecked={prefs.weeklyDigest}
            style={{ marginTop: 4 }}
          />
          <span>
            <span className="t-sm" style={{ color: "var(--text)" }}>
              weekly digest
            </span>
            <span className="mono" style={{ display: "block", color: "var(--faint-readable)" }}>
              Sunday, at most six, ranked against this profile — and only when something new
              actually scores well. A quiet week gets no email.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-4">
          <button type="submit" className="btn press" disabled={pending}>
            {pending ? "saving…" : "save email settings"}
          </button>
          {state.status === "saved" && (
            <span className="mono" style={{ color: "var(--accent)" }}>
              saved
            </span>
          )}
          {state.status === "error" && (
            <span className="mono" style={{ color: "var(--accent)" }}>
              {state.message}
            </span>
          )}
        </div>
      </form>

      <p className="mono" style={{ marginTop: 16, color: "var(--faint-readable)" }}>
        alerts for a saved search are switched on the search itself, in the feed.
      </p>
    </section>
  );
}
