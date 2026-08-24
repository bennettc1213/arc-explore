"use client";

import { useActionState } from "react";

import { TIER_IDS, TIER_LABELS, TIER_PRICE_USD } from "@/lib/pricing/tiers";

import { unlockAction, type DevFormState } from "./actions";

const INITIAL: DevFormState = { error: null };

export function DevUnlockForm() {
  const [state, formAction, pending] = useActionState(unlockAction, INITIAL);

  return (
    <form action={formAction} style={{ border: "1px solid var(--line-strong)", padding: 24 }}>
      <label className="field-row">
        <span className="mono chrome">dev password</span>
        <input
          className="field"
          type="password"
          name="password"
          /* `current-password` would offer to save this into a password
             manager beside real credentials. It is a shared build-time
             secret, not an account. */
          autoComplete="off"
          required
          autoFocus
        />
      </label>

      <fieldset style={{ border: 0, padding: 0, marginTop: 18 }}>
        <legend className="mono chrome" style={{ padding: 0 }}>
          unlock as
        </legend>
        <div className="flex flex-wrap items-center gap-4" style={{ marginTop: 8 }}>
          {TIER_IDS.map((t) => (
            <label key={t} className="flex items-center gap-2" style={{ cursor: "pointer" }}>
              <input type="radio" name="tier" value={t} defaultChecked={t === "apply"} />
              <span className="t-sm">
                {TIER_LABELS[t]}
                <span className="mono" style={{ color: "var(--faint-readable)", marginLeft: 6 }}>
                  {TIER_PRICE_USD[t] === 0 ? "free" : `$${TIER_PRICE_USD[t].toFixed(2)}/mo`}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="btn btn-primary press"
        style={{ marginTop: 20 }}
        disabled={pending}
      >
        {pending ? "checking…" : "unlock dev mode"}
      </button>

      {/* Hidden while a new attempt is in flight. `useActionState` keeps the
          previous state until the next one resolves, so a stale "that password
          is not right" otherwise sits under a button reading "checking…" —
          which reads as the retry having already failed. */}
      {state.error && !pending && (
        <p className="mono" role="alert" style={{ color: "var(--system-danger)", marginTop: 14 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
