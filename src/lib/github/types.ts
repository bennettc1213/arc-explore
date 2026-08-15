/**
 * GitHub shapes, username parsing, and the snapshot the audit reads.
 *
 * Free of network imports so every rule here is unit-testable without spending
 * a request against a rate limit measured in dozens per hour.
 *
 * WHY THIS SOURCE IS DIFFERENT FROM EVERY OTHER PROFILE TOOL WE BUILD. The
 * LinkedIn side of Phase 04 can only score text a student pastes in, because
 * fetching a LinkedIn profile is the one thing that could end this project.
 * GitHub publishes the same data through a documented public API with no auth
 * and a published rate limit, so this audit reports what a machine actually
 * fetched from github.com rather than what a student typed into a box. Every
 * number below was counted off a real response.
 *
 * WHAT WE CANNOT SEE, AND THEREFORE NEVER SCORE. Pinned repositories and the
 * contribution graph are GraphQL-only, and GitHub's GraphQL API requires
 * authentication for every request. An unauthenticated audit that claimed to
 * grade either would be inventing the number. So this file models pinned repos
 * as a *recommendation* built from the public repo list, and models activity
 * from push timestamps and the public events feed — both of which we can
 * actually read — while saying plainly what window those cover.
 */

/* ------------------------------------------------------------------ *
 * Username
 * ------------------------------------------------------------------ */

export const MAX_USERNAME_LENGTH = 39;

/**
 * GitHub's own rule: alphanumerics and single hyphens, no leading or trailing
 * hyphen, 39 characters maximum. Validating locally means a typo costs nothing
 * against a budget of sixty requests an hour.
 */
const USERNAME_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

/**
 * Pull a username out of whatever the student pasted.
 *
 * They will paste the URL — it is what is in their address bar and what they
 * put on their resume. Rejecting it as "invalid" when we can plainly read the
 * username out of it would be a made-up failure.
 */
export function parseGitHubUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  // A full or partial URL: github.com/user, https://github.com/user/repo, with
  // or without a trailing slash or query.
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i);
  if (url) s = url[1];

  s = s.replace(/^@/, "").replace(/\/+$/, "");
  if (!USERNAME_RE.test(s)) return null;
  return s;
}

/* ------------------------------------------------------------------ *
 * Normalized API shapes
 * ------------------------------------------------------------------ */

export interface GhUser {
  login: string;
  name: string | null;
  bio: string | null;
  /** GitHub returns "" rather than null for an unset website. */
  blog: string | null;
  location: string | null;
  company: string | null;
  publicRepos: number;
  followers: number;
  htmlUrl: string;
  createdAt: Date | null;
}

export interface GhRepo {
  name: string;
  description: string | null;
  htmlUrl: string;
  isFork: boolean;
  isArchived: boolean;
  /** GitHub reports size 0 for a repository with no committed content. */
  isEmpty: boolean;
  language: string | null;
  topics: string[];
  homepage: string | null;
  stars: number;
  forks: number;
  pushedAt: Date | null;
  createdAt: Date | null;
}

/** One entry from the public events feed, reduced to what we actually use. */
export interface GhEvent {
  type: string;
  repo: string | null;
  createdAt: Date;
}

/**
 * Everything one audit fetched, plus an explicit record of what it could not.
 *
 * `skipped` is not an error list — it is the reason a dimension will come back
 * null instead of scored. The rule from the resume critique holds here: a check
 * we could not run is dropped from the average, never counted as a failure.
 */
export interface GhSnapshot {
  user: GhUser;
  repos: GhRepo[];
  /** Markdown of the {user}/{user} profile README, null when there is none. */
  profileReadme: string | null;
  /** True when the {user}/{user} repository exists at all. */
  hasProfileRepo: boolean;
  /** README presence, by repo name, for the repos we had budget to check. */
  readmePresence: Record<string, boolean>;
  /** Null when the events feed could not be read. */
  events: GhEvent[] | null;
  /**
   * How many days back the events we received actually reach.
   *
   * GitHub caps this feed at 300 events and 90 days, so a busy account's
   * hundred most recent events may only span a week. Reporting "active 4 days
   * out of 90" off a window that is really 7 days long would be a fabricated
   * number, so the audit states the window it could observe.
   */
  eventsWindowDays: number | null;
  skipped: string[];
  fetchedAt: Date;
  /** Requests left in the hour, as GitHub reported them on the last response. */
  rateLimitRemaining: number | null;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type GhFetchFailure =
  | { kind: "invalid_username" }
  | { kind: "not_found"; username: string }
  | { kind: "rate_limited"; resetAt: Date | null }
  | { kind: "network"; detail: string };

export class GitHubFetchError extends Error {
  readonly failure: GhFetchFailure;
  constructor(failure: GhFetchFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

/* ------------------------------------------------------------------ *
 * Showcase ranking — shared by the audit and the pinned-repo advice
 * ------------------------------------------------------------------ */

/**
 * Repos a recruiter would plausibly open, best first.
 *
 * Forks, archives and empty repositories are excluded rather than ranked low:
 * none of them is a candidate for a pinned slot, and including them would let
 * a profile of twelve forks look like a profile with twelve projects.
 *
 * Ordering is stars, then recency of the last push, then how much is in it.
 * Stars first because it is the only third-party signal on the page — everything
 * else is the student's own assertion about their own work.
 */
export function rankShowcaseRepos(repos: GhRepo[]): GhRepo[] {
  return repos
    .filter((r) => !r.isFork && !r.isArchived && !r.isEmpty)
    .slice()
    .sort(
      (a, b) =>
        b.stars - a.stars ||
        (b.pushedAt?.getTime() ?? 0) - (a.pushedAt?.getTime() ?? 0) ||
        a.name.localeCompare(b.name),
    );
}

/** Repos that are the student's own work, whatever state they are in. */
export function originalRepos(repos: GhRepo[]): GhRepo[] {
  return repos.filter((r) => !r.isFork);
}
