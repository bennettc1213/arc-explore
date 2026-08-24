import { isFrameObserved, type FrameHealth } from "./frame-headers";

/**
 * Reducing an ATS URL to the identity of the posting behind it.
 *
 * Free of database imports so it is unit-testable without a connection — the
 * same split every other pure rule in this codebase follows.
 *
 * WHY AN EXACT MATCH FAILS. We store the URL the employer's feed gave us, which
 * is the *posting* page. The student autofills on the *application* page, and
 * every ATS derives one from the other differently:
 *
 *   Greenhouse       …/jobs/8043141               → same page, form inline
 *   Lever            …/waabi/<uuid>               → …/waabi/<uuid>/apply
 *   Ashby            …/cohere/<uuid>              → …/cohere/<uuid>/application
 *   SmartRecruiters  …/BoschGroup/744000143069809 → same page
 *
 * …and all of them accumulate `?gh_src=`, `?utm_campaign=` and `#app` on the
 * way. So both sides are reduced to a canonical form before comparison, rather
 * than maintaining a per-ATS table of URL rewrites that breaks the first time
 * one of them ships a redesign.
 */

/**
 * Suffixes an ATS adds when it moves the candidate from the advert to the form.
 *
 * The longest is tried first — matching `/apply` before `/application` would
 * leave a stray `ation` on the end of the path.
 */
const FORM_SUFFIXES = ["/application/submit", "/apply/submit", "/application", "/apply"];

/**
 * Canonical form: host without `www.`, path without an apply suffix, no query,
 * no fragment, no trailing slash.
 *
 * The host is lowercased; the path is NOT. Lever and Ashby use case-sensitive
 * UUIDs and SmartRecruiters uses a case-sensitive company identifier
 * (`BoschGroup`), so lowercasing the whole string would stop a correct match
 * from ever being found.
 *
 * Returns null for anything that is not a parseable http(s) URL, so a student
 * sitting on `about:blank` or a `chrome://` page produces no lookup at all.
 */
export function normalizeApplyUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let path = u.pathname;

  for (const suffix of FORM_SUFFIXES) {
    if (path.toLowerCase().endsWith(suffix)) {
      path = path.slice(0, -suffix.length);
      break;
    }
  }
  path = path.replace(/\/+$/, "");

  return `${host}${path}`;
}

/**
 * Hosts the extension is allowed to act on.
 *
 * An allowlist rather than "any page", for two reasons. It keeps the
 * extension's host permissions narrow enough that a reviewer — and a student
 * reading the install prompt — can see exactly where it runs. And it means the
 * content script is never injected into a bank, an inbox or a medical portal
 * merely because the student had a tab open.
 *
 * linkedin.com is deliberately absent and must stay absent. CLAUDE.md's rule is
 * "never a live fetch against linkedin.com in any form" — a content script
 * reading their DOM is that rule's spirit broken by a different mechanism.
 */
export const SUPPORTED_ATS_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "jobs.smartrecruiters.com",
] as const;

/** Is this a page the extension knows how to help with? */
export function isSupportedAtsUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  return (SUPPORTED_ATS_HOSTS as readonly string[]).includes(host);
}

/**
 * The hosts we actually embed in an Instela page.
 *
 * TWO CONDITIONS, BOTH MEASURED — 2026-08-20, four employers sampled per host
 * against the live corpus. A host must allow framing *and* have been observed
 * completing a captcha inside a frame, because rendering is not the thing that
 * has to work:
 *
 *                             framing allowed?           captcha in frame?
 *   job-boards.greenhouse.io  yes, no XFO/ancestors      yes, token 2382 chars
 *   boards.greenhouse.io      yes, redirects to above    yes, same
 *   jobs.lever.co             yes, no XFO/ancestors      NOT OBSERVED → withheld
 *   jobs.ashbyhq.com          no,  XFO: DENY             —
 *   jobs.smartrecruiters.com  no,  XFO: SAMEORIGIN       —
 *
 * The first column is a claim about *someone else's* response headers, which is
 * exactly the kind of fact that changes without telling us. It is deliberately
 * a short allowlist rather than a runtime probe: a browser gives a page no way
 * to ask "did that frame load or did it get refused", so a wrong guess would
 * render an empty box with no error. If an employer's ATS starts refusing, the
 * honest failure is to move the host out of this list, not to detect it in the
 * client.
 *
 * The eu.* Greenhouse hosts are included on the strength of being the same
 * product behind the same edge, and are the least-verified entries here — only
 * 32 rows, and the check was run against the US hosts.
 */
export const FRAMEABLE_ATS_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
] as const;

/**
 * Hosts whose headers permit embedding but which we deliberately do not embed.
 *
 * PERMISSION IS NOT EVIDENCE. Lever sends no `X-Frame-Options` and its form
 * renders inside an Instela page perfectly well — but the thing that has to work
 * for an embedded application to be worth anything is the *captcha*, and
 * Lever's was never proven. Greenhouse's reCAPTCHA minted a full token in a
 * frame, identical to top-level (2382 chars, measured 2026-08-20). Lever's
 * invisible hCaptcha only executes on a genuine submit gesture, so it could
 * only be measured at the initialisation layer — where it matched top-level
 * exactly, which is suggestive and is not the same as a token.
 *
 * The failure this guards against is the worst-shaped one available: it would
 * fail at submit, after the student had filled the whole form, on an
 * application they cared about. So Lever waits here until one real submission
 * through an embedded form is observed to land, and then moves up into
 * `FRAMEABLE_ATS_HOSTS`. Moving it is a one-line change *and* a claim that
 * someone watched it work.
 *
 * A withheld host is not a broken one — it applies through its own tab exactly
 * as it did before any of this was built.
 */
export const EMBED_WITHHELD_HOSTS = ["jobs.lever.co"] as const;

/**
 * Why this application is, or is not, embedded — so the page can say the true
 * sentence rather than a convenient one.
 *
 *   embedded    we host the form and the extension fills it in place
 *   withheld    the host allows framing; we are not yet satisfied it works
 *   refused     the host sends X-Frame-Options and the browser would blank it
 *   unsupported not an ATS the extension knows at all
 *
 * `withheld` and `refused` both fall back to a new tab, and it would be easier
 * to collapse them into one flag. They are kept apart because the student-
 * facing sentence differs: "this employer's board refuses to be embedded" is
 * true of SmartRecruiters and a lie about Lever, whose board permits it and
 * whose absence is our own caution.
 */
export type EmbedStatus = "embedded" | "withheld" | "refused" | "unsupported";

/**
 * What the link checker observed about this row's framing headers.
 *
 * Optional throughout: a caller with no observation gets exactly the behaviour
 * that existed when embedding was a four-host allowlist, so nothing regresses
 * on a row that has not been checked yet.
 */
export type EmbedObservation = Pick<FrameHealth, "frameAllowStrikes">;

export function embedStatus(raw: string, observed?: EmbedObservation): EmbedStatus {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "unsupported";
  }
  // http:// is excluded deliberately. Framing a plaintext page inside an https
  // document is mixed content, which the browser blocks anyway.
  if (u.protocol !== "https:") return "unsupported";
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  /*
   * WITHHOLDING OUTRANKS EVERYTHING, including a clean set of headers.
   * `EMBED_WITHHELD_HOSTS` records hosts whose *captcha* is unproven in a
   * frame, which no response header describes — Lever renders perfectly and
   * would fail at submit, after the student had filled the whole form. That is
   * a judgement about evidence and it is not for the observation to overturn.
   */
  if ((EMBED_WITHHELD_HOSTS as readonly string[]).includes(host)) return "withheld";

  // The proven ATS families, kept as an allowlist because their framing AND
  // their captcha were both observed — a stronger claim than headers alone.
  if ((FRAMEABLE_ATS_HOSTS as readonly string[]).includes(host)) return "embedded";

  /*
   * Everything else is decided by what we actually observed on this row's own
   * response headers, which is what lets the ~300 distinct scholarship hosts —
   * and every source added later — be embedded without anyone maintaining a
   * list. Two consecutive `allow` readings are required; see
   * `lib/apply/frame-headers.ts` for why a single refusal withdraws it.
   *
   * Absent an observation we fall back to the old answer rather than guessing:
   * a known ATS is `refused`, anything else `unsupported`. Both send the
   * student to their own tab, which is the behaviour that existed before any
   * of this and loses them nothing.
   */
  if (observed && isFrameObserved(observed)) return "embedded";

  if ((SUPPORTED_ATS_HOSTS as readonly string[]).includes(host)) return "refused";
  return observed ? "refused" : "unsupported";
}

/**
 * Can this application be filled in without the student leaving Arc?
 *
 * Frameable is no longer a subset of `SUPPORTED_ATS_HOSTS`: a scholarship site
 * observed to permit framing is embedded even though it is not an ATS the
 * extension ships host permissions for. What it still requires there is the
 * student granting the extension access to that one site — see
 * `optional_host_permissions` in the manifest.
 *
 * SmartRecruiters and Ashby refuse to be embedded and Lever is withheld, but
 * all three are fully supported in their own tab, so a caller must fall back
 * rather than treat false as "cannot help".
 */
export function isFrameableApplyUrl(raw: string, observed?: EmbedObservation): boolean {
  return embedStatus(raw, observed) === "embedded";
}

/**
 * The address to show the student above an embedded form, and to point the
 * "open in a new tab" escape hatch at.
 *
 * Embedding hides the browser's own address bar at the exact moment someone is
 * putting their name on a legal document, so the host is printed back in our
 * own chrome. Returns null rather than a placeholder for an unparseable URL —
 * a banner that says "unknown" over a real form is worse than no banner.
 */
export function applyUrlHost(raw: string): string | null {
  try {
    return new URL(raw.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The Chrome host-permission pattern for one page's origin.
 *
 * `https://scholarships.example.org/page` → `https://scholarships.example.org/*`
 *
 * ONE ORIGIN, NEVER A WILDCARD. The manifest declares a broad
 * `optional_host_permissions` entry, which makes it *possible* to
 * request blanket access to every site in a single prompt — which would hand
 * over in one click exactly what declaring narrow install-time hosts was for.
 * Every request is built from a real URL through this function instead, so the
 * student is asked about the one site they are actually applying on, and
 * `extension-invariants.test.ts` asserts the extension source never passes the
 * wildcard.
 *
 * Returns null for anything not https — http cannot be framed inside an https
 * page anyway (mixed content), and a `chrome://` or `about:` page has no
 * origin worth asking for.
 *
 * Shared rather than reimplemented: the popup must call
 * `chrome.permissions.request` inside its own user gesture, while the service
 * worker does the checking, so two separate extension surfaces need this
 * answer and a second copy would be a second definition of what we ask for.
 */
export function originPatternForUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  return `https://${u.hostname}/*`;
}
