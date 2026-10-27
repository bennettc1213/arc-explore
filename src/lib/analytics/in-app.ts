/**
 * Is this request from an in-app browser (Instagram, TikTok, Facebook…)?
 *
 * Recorded as a single boolean on explore events, and that is the whole of what
 * leaves the user agent. `record.ts` promises no user agent is stored; a yes/no
 * derived from it is a low-cardinality label of the kind `props.ts` allows, and
 * the string itself is read here and dropped. The question it answers is a real
 * product one: links shared in social apps open in webviews that break sign-in
 * and file upload, and we cannot tell how often that happens without counting.
 *
 * Pure, so the patterns are tested rather than trusted.
 */
const IN_APP_RE =
  /\b(FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedInApp|Pinterest|Line\/|MicroMessenger|GSA\/)|; wv\)/i;

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  return typeof userAgent === "string" && IN_APP_RE.test(userAgent);
}
