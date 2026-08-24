/**
 * Whether a page's own response headers permit us to embed it in an Instela page.
 *
 * WHY THIS EXISTS AS AN OBSERVATION RATHER THAN A LIST. Embedding used to be a
 * four-host allowlist, and the comment on it gave the right reason: a browser
 * gives a *page* no way to ask "did that frame load, or did the browser refuse
 * it?", so a wrong guess renders an empty box with no error and no way to
 * recover. That argument rules out probing from the client. It does not rule
 * out probing from the server — which is what this does, on the response the
 * link checker was already fetching, at zero additional requests.
 *
 * The distinction matters because the corpus is ~300 distinct scholarship
 * hosts and one row per host. A hand-maintained allowlist can cover four ATS
 * families; it cannot cover three hundred law firms and university foundations,
 * and it would silently exclude every source added later.
 *
 * WHAT THIS DOES NOT TELL YOU. Permission to frame is not evidence that an
 * application *submitted from* a frame will land — that depends on the
 * captcha, which no header describes. Greenhouse's reCAPTCHA was observed
 * minting a full token in a frame; Lever's hCaptcha never was. So a host may
 * be `allow` here and still be withheld from embedding by
 * `EMBED_WITHHELD_HOSTS`, which outranks this. See `embedStatus`.
 *
 * Pure and dependency-free: it takes header values, not a Response, so the
 * whole matrix is unit-testable without a network.
 */

export type FrameVerdict = "allow" | "deny" | "unknown";

/**
 * How many consecutive `allow` observations before we will actually embed.
 *
 * Two, the same rule `linkcheck.ts` applies before believing a URL is dead —
 * and asymmetric in the same direction that file's is. A single `deny`
 * withdraws embedding immediately, because the two mistakes are not equal: a
 * wrong `deny` costs a student one extra browser tab, while a wrong `allow`
 * shows them a blank rectangle at the moment they were trying to apply.
 * Slow to trust, fast to withdraw.
 */
export const FRAME_ALLOW_OBSERVATIONS = 2;

/**
 * Read the two headers that decide it.
 *
 * `X-Frame-Options` is the older mechanism and is all-or-nothing for our
 * purposes: `DENY` and `SAMEORIGIN` both refuse us, since we are never the
 * same origin as an employer's ATS. `ALLOW-FROM` is obsolete and ignored by
 * every current browser, so a page that sends only that is treated as denying
 * — believing it would produce exactly the blank box this is meant to prevent.
 *
 * CSP `frame-ancestors` supersedes X-Frame-Options where both are present, but
 * we do not need to model that precedence: if *either* refuses us we do not
 * embed, so the strictest reading is the safe one and also the simplest.
 *
 * `frame-ancestors` is only read as permitting us when it is `*` — an explicit
 * origin list will not contain ours, and matching our own origin against their
 * list would mean this module knowing what host Arc is deployed on, which is a
 * deployment fact a pure rule should not carry.
 */
export function frameVerdictFromHeaders(headers: {
  xFrameOptions?: string | null;
  contentSecurityPolicy?: string | null;
}): FrameVerdict {
  const xfo = headers.xFrameOptions?.trim().toLowerCase();
  if (xfo) {
    // Anything stated here refuses us. DENY and SAMEORIGIN obviously; ALLOW-FROM
    // because no current browser honours it, so the effective behaviour is DENY.
    return "deny";
  }

  const csp = headers.contentSecurityPolicy ?? "";
  const directive = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(csp)?.[1]?.trim().toLowerCase();
  if (directive) {
    // `*` permits any embedder. `'none'`, `'self'` and any explicit origin list
    // do not include us.
    const tokens = directive.split(/\s+/).filter(Boolean);
    return tokens.includes("*") ? "allow" : "deny";
  }

  // No framing header at all. This is the common case and it genuinely means
  // the browser will render the frame.
  return "allow";
}

/** Pull the verdict straight off a fetch Response's headers. */
export function frameVerdictFromResponse(res: {
  headers: { get(name: string): string | null };
}): FrameVerdict {
  return frameVerdictFromHeaders({
    xFrameOptions: res.headers.get("x-frame-options"),
    contentSecurityPolicy: res.headers.get("content-security-policy"),
  });
}

export interface FrameHealth {
  /** Consecutive `allow` observations. Any `deny` resets it to 0. */
  frameAllowStrikes: number;
}

/**
 * Fold one observation into the running count.
 *
 * `unknown` — a timeout, a DNS failure, a request that never produced headers
 * — neither advances nor resets, exactly as an inconclusive answer does in
 * `linkcheck.applyCheck`. A host that is briefly unreachable has told us
 * nothing about whether it permits framing.
 */
export function applyFrameObservation(
  current: FrameHealth,
  verdict: FrameVerdict,
): FrameHealth {
  if (verdict === "unknown") return current;
  if (verdict === "deny") return { frameAllowStrikes: 0 };
  return { frameAllowStrikes: Math.min(current.frameAllowStrikes + 1, FRAME_ALLOW_OBSERVATIONS) };
}

/** Have we seen enough to embed this page? */
export function isFrameObserved(health: Pick<FrameHealth, "frameAllowStrikes">): boolean {
  return health.frameAllowStrikes >= FRAME_ALLOW_OBSERVATIONS;
}
