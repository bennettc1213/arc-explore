/**
 * Constrains a post-auth redirect target to somewhere on this site.
 *
 * Without this, `?next=https://evil.example` turns our sign-in into an open
 * redirect that borrows this domain's credibility — the classic phishing setup,
 * since the link a victim sees really is ours. Protocol-relative `//host` is
 * rejected too: browsers resolve it as absolute, so it escapes just as easily.
 *
 * Kept in its own module so it can be tested without pulling in the Next.js
 * runtime, and so there is exactly one implementation to audit.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  // A backslash is normalised to "/" by browsers, so "/\evil.example" escapes.
  if (next.includes("\\")) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
