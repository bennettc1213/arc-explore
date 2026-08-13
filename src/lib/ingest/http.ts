/**
 * Polite HTTP for ingestion.
 *
 * We poll hundreds of third-party boards on a schedule, so this layer is
 * deliberately conservative: we identify ourselves, send conditional requests
 * so unchanged boards cost the host nothing, cap concurrency, back off on
 * failure, and never retry a 4xx that will not change.
 */

/** Identifies the crawler so an operator can contact us or block us cleanly. */
export const USER_AGENT =
  process.env.INGEST_USER_AGENT ??
  "internship-tracker/0.1 (+https://github.com/; contact: bennettch1213@gmail.com)";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

export interface GetJsonOptions {
  etag?: string | null;
  timeoutMs?: number;
  /** Total attempts including the first. */
  attempts?: number;
  signal?: AbortSignal;
}

export interface GetJsonResult<T> {
  /** null when the server replied 304 Not Modified. */
  data: T | null;
  etag: string | null;
  status: number;
  notModified: boolean;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * GET JSON with conditional-request support, bounded retries and exponential
 * backoff. Honors `Retry-After` when a host sends one.
 */
export async function getJson<T = unknown>(
  url: string,
  opts: GetJsonOptions = {},
): Promise<GetJsonResult<T>> {
  const { etag, timeoutMs = 30_000, attempts = 3, signal } = opts;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      };
      if (etag) headers["If-None-Match"] = etag;

      const res = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });

      if (res.status === 304) {
        return { data: null, etag: etag ?? null, status: 304, notModified: true };
      }

      if (!res.ok) {
        // A 404 board or a 401 will not fix itself; fail fast.
        if (!RETRYABLE_STATUS.has(res.status)) {
          throw new HttpError(res.status, url);
        }
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2 ** attempt * 500;
        lastErr = new HttpError(res.status, url);
        if (attempt < attempts) {
          await sleep(waitMs);
          continue;
        }
        throw lastErr;
      }

      const data = (await res.json()) as T;
      return {
        data,
        etag: res.headers.get("etag"),
        status: res.status,
        notModified: false,
      };
    } catch (err) {
      lastErr = err;
      // Do not burn retries on a definitive client error.
      if (err instanceof HttpError && !RETRYABLE_STATUS.has(err.status)) throw err;
      if (attempt >= attempts) throw err;
      await sleep(2 ** attempt * 500);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Run tasks with bounded concurrency. Keeps us from opening 650 sockets at once
 * and from hammering any single host.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Some feeds (SmartRecruiters notably) serve UTF-8 that has been double-encoded
 * upstream, producing "â€“" where an en-dash belongs. Repair it so employer
 * names and titles render as authored.
 */
export function repairMojibake(s: string): string {
  if (!s || !/[ÃÂâ€]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    // Only accept the repair if it removed replacement junk without adding any.
    return decoded.includes("�") ? s : decoded;
  } catch {
    return s;
  }
}
