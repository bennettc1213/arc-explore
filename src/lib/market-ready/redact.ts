/**
 * Redaction helpers for test fixtures and source payloads.
 *
 * Keeps anonymized fixtures from accidentally carrying real student data,
 * secrets, or contact information into committed artifacts.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const PHONE_RE = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const TOKEN_RE = /\b(?:sk-|pk-|re_|pmx_|eyJ)[A-Za-z0-9._-]{10,}/g;
const URL_PASSWORD_RE = /:\/\/[^:\s]+:[^@\s]+@/g;

function redactString(value: string): string {
  return value
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]')
    .replace(TOKEN_RE, '[REDACTED_TOKEN]')
    .replace(URL_PASSWORD_RE, '://[REDACTED_CREDENTIALS]@');
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') return redactObject(value as Record<string, unknown>);
  return value;
}

function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    const sensitive =
      lower.includes('password') ||
      lower.includes('secret') ||
      lower.includes('token') ||
      lower.includes('apikey') ||
      lower.includes('api_key') ||
      lower.includes('key') ||
      lower.includes('credential') ||
      lower.includes('auth') ||
      lower.includes('linkedinurl') ||
      lower.includes('portfolio_url') ||
      lower.includes('displayname') ||
      lower.includes('school') ||
      lower.includes('githubusername') ||
      lower.includes('raw') ||
      lower.includes('notes');
    if (sensitive && typeof value === 'string') {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactValue(value);
    }
  }
  return out;
}

/** Redact a source payload before writing it to a fixture or log. */
export function redactSourcePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return redactObject(payload);
}

/** Redact a profile fixture. */
export function redactProfileFixture(profile: Record<string, unknown>): Record<string, unknown> {
  return redactObject(profile);
}

/** Redact an application fixture. */
export function redactApplicationFixture(app: Record<string, unknown>): Record<string, unknown> {
  return redactObject(app);
}

/** Redact any free-form text. */
export function redactText(text: string): string {
  return redactString(text);
}
