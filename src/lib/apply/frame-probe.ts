import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { applicationPageUrl } from "./extension-config";
import { frameVerdictFromResponse, FRAME_ALLOW_OBSERVATIONS } from "./frame-headers";

export type FrameProbeResult = "allow" | "deny" | "unknown";
type Dependencies = {
  fetch: typeof fetch;
  lookup: (host: string) => Promise<{ address: string; family: number }[]>;
};

/** Only public destinations, including after redirects, may be probed. */
export function isPublicFrameAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  // Global unicast only; exclude documentation, transition and local ranges.
  return isIP(address) === 6 && /^[23]/i.test(address)
    && !/^(?:2002:|2001:(?:db8|0|10|20):)/i.test(address);
}

/**
 * Used only for a persisted posting, after authentication and plan checks.
 * Two fresh GET responses establish permission for this render without treating
 * a missing background check as a refusal. No cookies or profile facts are sent.
 */
export async function probeApplicationFrame(raw: string, overrides: Partial<Dependencies> = {}): Promise<FrameProbeResult> {
  const deps: Dependencies = { fetch, lookup: host => lookup(host, { all: true }), ...overrides };
  const signal = AbortSignal.timeout(6000);
  try {
    for (let observation = 0; observation < FRAME_ALLOW_OBSERVATIONS; observation++) {
      let destination = raw;
      let allowed = false;
      for (let redirects = 0; redirects <= 4; redirects++) {
        signal.throwIfAborted();
        const safe = applicationPageUrl(destination);
        if (!safe) return "unknown";
        const url = new URL(safe);
        const host = url.hostname.replace(/^\[|\]$/g, "");
        const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
          deps.lookup(host),
          new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
        ]);
        if (!addresses.length || addresses.some(item => !isPublicFrameAddress(item.address))) return "unknown";
        const response = await deps.fetch(url, {
          method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", signal,
          headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Instela application compatibility check (+https://instela.org)" },
        });
        // Inspect headers only; do not download or retain application contents.
        await response.body?.cancel();
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) return "unknown";
          const redirected = new URL(location, url);
          // The frame bridge authenticates this origin. A cross-site redirect
          // needs a separately connected application session, not a false allow.
          if (redirected.origin !== new URL(raw).origin) return "unknown";
          destination = redirected.href;
          continue;
        }
        if (!response.ok) return "unknown";
        const verdict = frameVerdictFromResponse(response);
        if (verdict !== "allow") return verdict;
        allowed = true;
        break;
      }
      if (!allowed) return "unknown";
    }
    return "allow";
  } catch { return "unknown"; }
}
