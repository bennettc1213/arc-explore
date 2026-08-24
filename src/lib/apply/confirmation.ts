/**
 * Sending the "you applied" confirmation.
 *
 * `wizard.ts` composes the text; this delivers it. Split that way because the
 * composer is pure and unit-tested against its exact wording, and the sender
 * is the part that touches the network and the one that can go wrong in
 * someone else's inbox.
 *
 * RESEND OVER PLAIN `fetch`, not their SDK — the same call this codebase has
 * already made twice, for the reminder and the digest. One transactional email
 * is a single POST.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE OTHER THREE EMAIL JOBS. Reminders, alerts
 * and the digest are batch jobs that mail many people on a schedule, so they
 * are dry-run by default and `--send` is asked for by name — a mistake there
 * goes out hundreds of times. This is a single transactional email, sent to
 * one person, in direct response to that person clicking a button one second
 * earlier. The dry-run guard would be protecting them from a message they just
 * asked for. So it sends when it is configured to, and is silently inert when
 * it is not.
 *
 * FAILURE IS NEVER FATAL TO THE APPLICATION. The tracker stamp is the fact
 * that matters, and it has already happened by the time this is called. An
 * email that cannot be sent — no key configured, Resend having a bad minute —
 * must not turn a successful application into an error the student sees. The
 * result is reported back so the UI can say "we could not email you" rather
 * than "something went wrong".
 */

import type { ConfirmationDraft } from "./wizard";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function fromAddress(): string {
  return process.env.REMINDER_FROM_EMAIL ?? "reminders@instela.org";
}

export type ConfirmationResult =
  | { status: "sent" }
  /** No RESEND_API_KEY. The expected state on this project today, and not an error. */
  | { status: "not-configured" }
  /** We hold no address to send to — an account with no email should be impossible,
   *  but a null here must not throw on a page the student is looking at. */
  | { status: "no-address" }
  | { status: "failed"; reason: string };

/**
 * Send one confirmation. Never throws.
 *
 * Every failure path returns a value instead, because the caller has already
 * recorded the application and the email is the lesser of the two facts.
 */
export async function sendConfirmation(
  to: string | null,
  draft: ConfirmationDraft,
): Promise<ConfirmationResult> {
  if (!to) return { status: "no-address" };

  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "not-configured" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: draft.subject,
        text: draft.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { status: "failed", reason: `Resend replied ${res.status}: ${body.slice(0, 200)}` };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", reason: err instanceof Error ? err.message : "network error" };
  }
}

/**
 * What to tell the student about the email, in their terms.
 *
 * "not configured" is deliberately not phrased as a failure on their part or
 * ours — it is a state this deployment is in, and saying "email is not switched
 * on yet" is both true and not alarming beside an application that did work.
 */
export function describeConfirmation(r: ConfirmationResult): string {
  switch (r.status) {
    case "sent":
      return "confirmation emailed to you";
    case "not-configured":
      return "email is not switched on yet — your application is still recorded";
    case "no-address":
      return "we hold no email address for you — your application is still recorded";
    case "failed":
      return "we could not send the confirmation email — your application is still recorded";
  }
}
