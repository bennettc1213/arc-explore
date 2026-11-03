"use client";

import { useActionState } from "react";

import { startToolSessionAction, type SessionState } from "@/app/tool-session-actions";

const INITIAL: SessionState = { status: "idle" };

/**
 * The button that opens a Free session of a browser-local tool.
 *
 * Rendered only when the server has already decided the allowance is
 * available; the action re-checks, because a Server Action is a public POST.
 */
export function StartSession({
  feature,
  label,
  explanation,
}: {
  feature: "linkedin_tools" | "essay_reviewer";
  label: string;
  explanation: string;
}) {
  const [state, action, pending] = useActionState(startToolSessionAction, INITIAL);
  return (
    <section className="border" style={{ borderColor: "var(--line-strong)", padding: "16px 18px", marginBottom: 28 }}>
      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch" }}>
        {explanation}
      </p>
      <form action={action} style={{ marginTop: 12 }}>
        <input type="hidden" name="feature" value={feature} />
        <button type="submit" className="btn btn-primary press" disabled={pending}>
          {pending ? "starting…" : label}
        </button>
      </form>
      {state.status === "error" && (
        <p className="mono" style={{ color: "var(--accent)", marginTop: 8 }}>
          {state.message}
        </p>
      )}
    </section>
  );
}
