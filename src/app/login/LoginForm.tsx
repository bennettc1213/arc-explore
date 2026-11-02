"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Mascot } from "@/components/chrome/Mascot";

import { sendMagicLink, signInWithGoogle, type LoginState } from "./actions";

const INITIAL: LoginState = { status: "idle" };

/** Google's four-colour "G". Its brand colours are fixed, not theme tokens. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function GoogleButton() {
  // Must be a child of the <form> it reports on; useFormStatus reads the
  // nearest ancestor form's pending state.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn press"
      disabled={pending}
      style={{ width: "100%", justifyContent: "center", gap: 10 }}
    >
      <GoogleMark />
      {pending ? "opening google…" : "continue with google"}
    </button>
  );
}

export function LoginForm({ next, google }: { next: string; google: boolean }) {
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
              only works once. Nothing there? Check spam.
            </div>
          </div>
        </div>
        <p className="mono" style={{ marginTop: 18, lineHeight: 1.6 }}>
          wrong address?{" "}
          <a href={`/login?next=${encodeURIComponent(next)}`} style={{ color: "var(--accent)" }}>
            start over
          </a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--line-strong)", padding: 24 }}>
      {google && (
        <>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <GoogleButton />
          </form>
          <div
            className="mono"
            aria-hidden="true"
            style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0", color: "var(--muted)" }}
          >
            <span style={{ flex: 1, borderTop: "1px solid var(--line)" }} />
            or
            <span style={{ flex: 1, borderTop: "1px solid var(--line)" }} />
          </div>
        </>
      )}

      <form action={formAction}>
        <input type="hidden" name="next" value={next} />

        <label className="field-row">
          <span className="mono chrome">email</span>
          <input
            className="field"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            // Nothing else on this page asks for input, and with Google off the
            // email box is the page.
            autoFocus={!google}
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
    </div>
  );
}
