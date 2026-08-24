/**
 * Composing and sending a deadline reminder.
 *
 * Resend over plain `fetch` rather than their SDK. Sending one transactional
 * email is a single POST, and this codebase has already declined a dependency
 * twice for less — for DOCX export and for DOM-to-image PDFs. A package that
 * wraps one HTTP call is not worth the supply chain.
 *
 * WHAT THIS EMAIL MAY SAY. Only facts already on the posting: its title, who
 * is offering it, when it closes, and the link. There is no generated prose
 * here and no model call — the same rule the cover-letter generator follows,
 * arrived at from the other direction. A reminder is useful precisely because
 * it is a fact, and the one thing that would destroy it is a misstated date.
 */

import { urgencyLabel } from "./select";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend rejects a send from an unverified domain, so this is configuration
 *  rather than a constant — a fresh install has no domain of ours. */
function fromAddress(): string {
  return process.env.REMINDER_FROM_EMAIL ?? "reminders@instela.org";
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export interface ReminderEmail {
  to: string;
  subject: string;
  text: string;
}

/** Escapes nothing and needs to escape nothing: this is a plain-text body. */
export function composeReminder(input: {
  email: string;
  displayName: string | null;
  title: string;
  company: string | null;
  url: string;
  kind: string;
  daysLeft: number;
  deadlineAt: Date;
  unsubscribeToken: string;
}): ReminderEmail {
  const urgency = urgencyLabel(input.daysLeft);
  const noun = input.kind === "scholarship" ? "scholarship" : "internship";
  const who = input.company ? ` (${input.company})` : "";

  // ISO date, not a locale format: the recipient's timezone is unknown, and a
  // reminder that renders as 09/08 to one reader and 08/09 to another is worse
  // than no date at all.
  const deadline = input.deadlineAt.toISOString().slice(0, 10);

  const greeting = input.displayName ? `Hi ${input.displayName},` : "Hi,";

  const text = [
    greeting,
    "",
    `A ${noun} you saved ${urgency}.`,
    "",
    `${input.title}${who}`,
    `Closes: ${deadline}`,
    `Apply: ${input.url}`,
    "",
    `You saved this on ${siteUrl()}. We only email about things you saved.`,
    `Stop these reminders: ${siteUrl()}/unsubscribe?token=${input.unsubscribeToken}`,
  ].join("\n");

  return {
    to: input.email,
    // The deadline leads, because that is the only reason to open it.
    subject: `${input.title} — ${urgency}`,
    text,
  };
}

export class ReminderSendError extends Error {}

/**
 * Send one email.
 *
 * Throws on a non-2xx so the caller does not record a reminder that never
 * arrived — a false receipt would suppress every future attempt at that
 * window, which is worse than the failure itself.
 */
export async function sendReminder(email: ReminderEmail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new ReminderSendError("RESEND_API_KEY is not set — see .env");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email.to],
      subject: email.subject,
      text: email.text,
      // Lets a mail client offer one-click unsubscribe, and tells the inbox
      // provider this is list mail that honours opt-out. Both improve the
      // odds the reminders a student asked for are not filed as spam.
      headers: { "List-Unsubscribe": `<${siteUrl()}/unsubscribe>` },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ReminderSendError(`Resend replied ${res.status}: ${body.slice(0, 200)}`);
  }
}
