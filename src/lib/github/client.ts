/**
 * The GitHub fetch layer.
 *
 * THE CONSTRAINT THAT SHAPES THIS FILE: unauthenticated requests are limited to
 * **60 per hour per IP address**, and on a hosted deployment that IP is shared
 * by every visitor. One audit costs up to nine requests, so a naive
 * implementation gives roughly six audits an hour for the entire site. Three
 * things follow, and each is deliberate:
 *
 *  1. `GITHUB_TOKEN` is read if present and raises the ceiling to 5,000/hour.
 *     CLAUDE.md says no auth is *required* for public data, which is permission
 *     rather than prohibition — the audit works without one and works better
 *     with one. Any token will do; it needs no scopes, because everything we
 *     read is public.
 *  2. Responses are cached by URL for fifteen minutes through Next's fetch
 *     cache, so re-opening the page does not re-spend the budget. Only 200s are
 *     cached by the framework, which is what we want: a rate-limit refusal must
 *     never get stuck in front of a profile that would now succeed.
 *  3. The optional per-repo README checks watch the remaining budget as it
 *     drops and stop before exhausting it. An audit should never be the request
 *     that leaves the next visitor with nothing.
 */

import {
  GitHubFetchError,
  rankShowcaseRepos,
  type GhEvent,
  type GhRepo,
  type GhSnapshot,
  type GhUser,
} from "./types";

const API = "https://api.github.com";

/** Fifteen minutes. Long enough that a reload is free, short enough that a
 *  student who just pushed a fix sees it reflected while they are still here. */
const REVALIDATE_SECONDS = 900;

/** Showcase repos whose README we check, budget permitting. */
const README_CHECK_LIMIT = 5;

/** Never spend the budget below this. Leaves room for the next visitor. */
const RATE_LIMIT_RESERVE = 8;

const MAX_REPOS = 100;

interface Fetched<T> {
  status: number;
  body: T | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: Date | null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    // GitHub asks for an explicit API version and a User-Agent; without the
    // latter it refuses the request outright.
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "internship-scholarship-platform",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function get<T>(path: string): Promise<Fetched<T>> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: headers(),
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch (err) {
    throw new GitHubFetchError(
      { kind: "network", detail: err instanceof Error ? err.message : "request failed" },
      "could not reach github",
    );
  }

  const remainingRaw = res.headers.get("x-ratelimit-remaining");
  const resetRaw = res.headers.get("x-ratelimit-reset");
  const rateLimitRemaining = remainingRaw === null ? null : Number(remainingRaw);
  const rateLimitResetAt = resetRaw ? new Date(Number(resetRaw) * 1000) : null;

  // 403 and 429 both carry a rate-limit refusal. Distinguished from an ordinary
  // 403 by the remaining count, which GitHub sets to 0 when it is the reason.
  if ((res.status === 403 || res.status === 429) && rateLimitRemaining === 0) {
    throw new GitHubFetchError(
      { kind: "rate_limited", resetAt: rateLimitResetAt },
      "github rate limit reached",
    );
  }

  let body: T | null = null;
  if (res.ok) {
    try {
      body = (await res.json()) as T;
    } catch {
      body = null;
    }
  }

  return {
    status: res.status,
    body,
    rateLimitRemaining: Number.isFinite(rateLimitRemaining) ? rateLimitRemaining : null,
    rateLimitResetAt,
  };
}

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

interface RawUser {
  login: string;
  name: string | null;
  bio: string | null;
  blog: string | null;
  location: string | null;
  company: string | null;
  public_repos: number;
  followers: number;
  html_url: string;
  created_at: string | null;
  type?: string;
}

interface RawRepo {
  name: string;
  description: string | null;
  html_url: string;
  fork: boolean;
  archived: boolean;
  size: number;
  language: string | null;
  topics?: string[];
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
  created_at: string | null;
}

interface RawEvent {
  type: string;
  repo?: { name?: string } | null;
  created_at: string;
}

/** Empty strings are how GitHub says "unset" for several fields. */
function text(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function date(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeUser(raw: RawUser): GhUser {
  return {
    login: raw.login,
    name: text(raw.name),
    bio: text(raw.bio),
    blog: text(raw.blog),
    location: text(raw.location),
    company: text(raw.company),
    publicRepos: raw.public_repos ?? 0,
    followers: raw.followers ?? 0,
    htmlUrl: raw.html_url,
    createdAt: date(raw.created_at),
  };
}

export function normalizeRepo(raw: RawRepo): GhRepo {
  return {
    name: raw.name,
    description: text(raw.description),
    htmlUrl: raw.html_url,
    isFork: Boolean(raw.fork),
    isArchived: Boolean(raw.archived),
    isEmpty: (raw.size ?? 0) === 0,
    language: text(raw.language),
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    homepage: text(raw.homepage),
    stars: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    pushedAt: date(raw.pushed_at),
    createdAt: date(raw.created_at),
  };
}

export function normalizeEvents(raw: RawEvent[]): GhEvent[] {
  const out: GhEvent[] = [];
  for (const e of raw) {
    const createdAt = date(e.created_at);
    if (!createdAt) continue;
    out.push({ type: e.type, repo: text(e.repo?.name), createdAt });
  }
  return out;
}

/**
 * How far back the events we received actually reach, in whole days.
 *
 * Null when there are none. This is the honest denominator for anything said
 * about consistency: the feed is capped, so the window is whatever arrived, not
 * the 90 days GitHub retains.
 */
export function observedWindowDays(events: GhEvent[], now: Date): number | null {
  if (events.length === 0) return null;
  const oldest = events.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), events[0].createdAt);
  const days = Math.floor((now.getTime() - oldest.getTime()) / 86_400_000);
  return Math.max(1, days);
}

/* ------------------------------------------------------------------ *
 * The snapshot
 * ------------------------------------------------------------------ */

function decodeBase64(content: string): string | null {
  try {
    return Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Fetch everything one audit needs.
 *
 * Ordered by how much each request is worth. The user and the repo list are
 * mandatory — without them there is no audit. The profile README and the events
 * feed are each one request and each unlock a whole dimension. The per-repo
 * README checks come last precisely because they are the ones worth dropping
 * when the budget runs thin.
 */
export async function fetchGitHubSnapshot(
  username: string,
  now: Date = new Date(),
): Promise<GhSnapshot> {
  const skipped: string[] = [];

  const userRes = await get<RawUser>(`/users/${username}`);
  if (userRes.status === 404 || !userRes.body) {
    throw new GitHubFetchError({ kind: "not_found", username }, "no such github user");
  }
  const user = normalizeUser(userRes.body);

  const reposRes = await get<RawRepo[]>(
    `/users/${username}/repos?per_page=${MAX_REPOS}&sort=pushed&type=owner`,
  );
  const repos = Array.isArray(reposRes.body) ? reposRes.body.map(normalizeRepo) : [];
  if (!Array.isArray(reposRes.body)) {
    skipped.push("we could not read your repository list");
  }

  // The profile README lives in a repo named exactly after the user. A 404 here
  // is the finding, not an error — it is the single most common gap on a
  // student's profile.
  const profileRes = await get<{ content?: string; encoding?: string }>(
    `/repos/${username}/${username}/readme`,
  );
  const hasProfileRepo = profileRes.status !== 404;
  const profileReadme =
    profileRes.body?.content && profileRes.body.encoding === "base64"
      ? decodeBase64(profileRes.body.content)
      : null;

  const eventsRes = await get<RawEvent[]>(`/users/${username}/events/public?per_page=100`);
  const events = Array.isArray(eventsRes.body) ? normalizeEvents(eventsRes.body) : null;
  if (!Array.isArray(eventsRes.body)) {
    skipped.push("we could not read your public activity feed");
  }

  /*
   * Optional per-repo README checks, spent only out of surplus budget.
   *
   * `remaining` is whatever GitHub reported on the most recent response, so it
   * accounts for every other visitor sharing this IP, not just this audit.
   */
  const readmePresence: Record<string, boolean> = {};
  let remaining = eventsRes.rateLimitRemaining ?? profileRes.rateLimitRemaining ?? null;

  const showcase = rankShowcaseRepos(repos).slice(0, README_CHECK_LIMIT);
  let checkedAll = true;

  for (const repo of showcase) {
    if (remaining !== null && remaining <= RATE_LIMIT_RESERVE) {
      checkedAll = false;
      break;
    }
    const res = await get<unknown>(`/repos/${username}/${repo.name}/readme`);
    readmePresence[repo.name] = res.status === 200;
    if (res.rateLimitRemaining !== null) remaining = res.rateLimitRemaining;
  }

  if (!checkedAll) {
    skipped.push(
      "we stopped short of checking every project README so the hourly github budget is not exhausted",
    );
  }

  return {
    user,
    repos,
    profileReadme,
    hasProfileRepo,
    readmePresence,
    events,
    eventsWindowDays: events ? observedWindowDays(events, now) : null,
    skipped,
    fetchedAt: now,
    rateLimitRemaining: remaining,
  };
}
