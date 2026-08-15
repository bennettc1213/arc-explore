/**
 * Who may see the admin queue.
 *
 * FAIL CLOSED, ALWAYS. If `ADMIN_EMAILS` is unset, empty, or entirely
 * unparseable, **nobody** is an admin. That is the most important rule here:
 * the tempting shortcut — "no admins configured, so let anyone in during
 * development" — is how an admin panel ships open, and this one can take
 * listings down and read every report a student has filed.
 *
 * An env var rather than a `profiles.is_admin` column, on purpose. A column is
 * a row someone could come to write; a deploy-time env var cannot be escalated
 * into from inside the application, whatever else goes wrong. There is one
 * operator today, and a roles table can arrive when there is a second.
 *
 * Kept free of every other import so it is unit-testable without a database
 * connection or a Supabase key — the same rule `profile/types.ts` follows.
 */

export function adminEmails(raw = process.env.ADMIN_EMAILS): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isAdminEmail(
  email: string | null | undefined,
  raw = process.env.ADMIN_EMAILS,
): boolean {
  const allowed = adminEmails(raw);
  // Both halves matter: no configured admins means no admins, and a session
  // with no email address (which Supabase permits) is never one.
  if (allowed.length === 0 || !email) return false;
  return allowed.includes(email.trim().toLowerCase());
}
