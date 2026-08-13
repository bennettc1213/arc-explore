"use client";

import { useActionState } from "react";

import { Mascot } from "@/components/chrome/Mascot";

import { sendMagicLink, type LoginState } from "./actions";

const INITIAL: LoginState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, INITIAL);

  if (state.status === "sent") {
    return (
      <div style={{ border: "1px solid var(--line-strong)", padding: 24 }}>
        <div className="flex items-center gap-3">
          <Mascot size={32} />
          <div>
            <div className="mono-strong chrome">check your email</div>
            <div className="t-sm" style={{ color: "var(--muted)", marginTop: 4 }}>
              {/* The address is the user's own input — rendered as typed. */}
              A sign-in link is on its way to {state.email}. It expires in an hour and
              only works once.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} style={{ border: "1px solid var(--line-strong)", padding: 24 }}>
      <input type="hidden" name="next" value={next} />

      <label className="field-row">
        <span className="mono chrome">email</span>
        <input
          className="field"
          type="email"
          name="email"
          autoComplete="email"
          required
          defaultValue={state.email ?? ""}
          placeholder="you@school.edu"
        />
      </label>

      <button type="submit" className="btn btn-primary press" style={{ marginTop: 16 }} disabled={pending}>
        {pending ? "sending…" : "email me a sign-in link"}
      </button>

      {state.status === "error" && (
        <p
          className="mono"
          role="alert"
          style={{ color: "var(--system-danger)", marginTop: 14 }}
        >
          {state.message}
        </p>
      )}

      <p className="mono" style={{ marginTop: 18, lineHeight: 1.6 }}>
        no password. we store your email, your profile answers, and your resume if you
        upload one — nothing else.
      </p>
    </form>
  );
}
