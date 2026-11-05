export const DEFAULT_INSTELA_ORIGIN = "https://instela.org";

/** Limit authenticated requests to the product's deployed or local origins. */
export function normalizeInstelaOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return null;
    if (url.origin === "https://instela.org" || url.origin === "https://www.instela.org" || url.origin === "http://localhost:3000") return url.origin;
  } catch { /* Invalid settings are rejected rather than used as an API host. */ }
  return null;
}

export function isInstelaPage(raw: string, configuredOrigin: string): boolean {
  try {
    const origin = new URL(raw).origin;
    const production = ["https://instela.org", "https://www.instela.org"];
    return origin === configuredOrigin || (production.includes(origin) && production.includes(configuredOrigin));
  } catch { return false; }
}

export function isApplicationWorkspace(raw: string, configuredOrigin: string): boolean {
  try { return isInstelaPage(raw, configuredOrigin) && /^\/listing\/[^/]+\/apply\/?$/.test(new URL(raw).pathname); }
  catch { return false; }
}

export function applicationPageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
