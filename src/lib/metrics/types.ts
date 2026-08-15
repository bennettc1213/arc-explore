/**
 * The numbers this project would actually cite, and what each one means.
 *
 * Free of database imports so every definition and every rule below is
 * unit-testable. `store.ts` fetches the raw counts; this file is what turns a
 * count into a claim.
 *
 * THE ROADMAP ASKS FOR TWO THINGS AND THEY ARE ONE THING. "Set up basic usage
 * analytics" and "define the specific metrics you want to cite and confirm you
 * are capturing them" are the same job, because a number you cannot define is
 * not captured no matter how carefully it was logged. So every metric here
 * carries the sentence that says exactly what was counted, and the sentence
 * that says what it does *not* mean — and the second one is the load-bearing
 * half. "1,200 searches run" and "1,200 feed requests that had at least one
 * filter set, some of which were the same person changing their mind" are the
 * same integer and different claims.
 */

export type MetricGroup = "reach" | "activation" | "output" | "usage" | "corpus";

export interface Metric {
  key: string;
  label: string;
  value: number;
  /** Exactly what was counted. Written so it could be checked against the SQL. */
  definition: string;
  /** What this number does not mean. Null only when there is genuinely nothing. */
  caveat: string | null;
  group: MetricGroup;
  /** Whether it is honest to put this on a resume yet. See `citable`. */
  citable: boolean;
}

/**
 * The floor below which a number is not worth citing.
 *
 * Ten, and the precedent is already in this codebase: the application tracker
 * withholds a response rate below ten submissions rather than showing a
 * flattering fraction. The same logic applies harder here. "60% of users
 * uploaded a resume" is a fine sentence and a dishonest one when it means three
 * people out of five, and the person most likely to be misled by it is the one
 * who wrote it.
 */
export const CITABLE_FLOOR = 10;

export function isCitable(value: number): boolean {
  return value >= CITABLE_FLOOR;
}

/** The raw counts `store.ts` produces. Every field is a plain integer. */
export interface MetricCounts {
  signups: number;
  confirmedSignups: number;
  usableProfiles: number;
  withResume: number;
  withTrackedApplication: number;
  applicationsTracked: number;
  applicationsSubmitted: number;
  coverLettersDrafted: number;
  savedSearches: number;
  reportsFiled: number;
  remindersSent: number;
  filteredFeedRequests: number;
  zeroResultSearches: number;
  listingViews: number;
  githubAudits: number;
  openPostings: number;
  postingsWithDeadline: number;
  companiesPolled: number;
}

export const EMPTY_COUNTS: MetricCounts = {
  signups: 0,
  confirmedSignups: 0,
  usableProfiles: 0,
  withResume: 0,
  withTrackedApplication: 0,
  applicationsTracked: 0,
  applicationsSubmitted: 0,
  coverLettersDrafted: 0,
  savedSearches: 0,
  reportsFiled: 0,
  remindersSent: 0,
  filteredFeedRequests: 0,
  zeroResultSearches: 0,
  listingViews: 0,
  githubAudits: 0,
  openPostings: 0,
  postingsWithDeadline: 0,
  companiesPolled: 0,
};

interface Spec {
  key: keyof MetricCounts;
  label: string;
  definition: string;
  caveat: string | null;
  group: MetricGroup;
}

const SPECS: Spec[] = [
  /* ------------------------------------------------------------ reach */
  {
    key: "signups",
    label: "signups",
    definition: "rows in `profiles`, one per account that has ever signed in.",
    caveat:
      "includes accounts that never confirmed their email, and the handful of test accounts this was built against. `confirmed signups` is the number to cite.",
    group: "reach",
  },
  {
    key: "confirmedSignups",
    label: "confirmed signups",
    definition:
      "accounts whose `auth.users` row has a confirmed email — the only ones we are willing to email.",
    caveat: null,
    group: "reach",
  },

  /* ------------------------------------------------------- activation */
  {
    key: "usableProfiles",
    label: "profiles with something in them",
    definition:
      "profiles passing `isProfileUsable` — a major, graduation year, work authorization, an interest or a target location. The same function the feed uses to decide whether it can score for you.",
    caveat: "a profile with one field set counts here. It is a floor on engagement, not a measure of completeness.",
    group: "activation",
  },
  {
    key: "withResume",
    label: "students who uploaded a resume",
    definition: "distinct `resumes.user_id`.",
    caveat: null,
    group: "activation",
  },
  {
    key: "withTrackedApplication",
    label: "students tracking at least one thing",
    definition: "distinct `applications.user_id`, any status.",
    caveat: null,
    group: "activation",
  },

  /* ----------------------------------------------------------- output */
  {
    key: "applicationsTracked",
    label: "applications tracked",
    definition: "rows in `applications`, every status including saved.",
    caveat:
      "saving something is not applying to it. `applications submitted` is the stricter number.",
    group: "output",
  },
  {
    key: "applicationsSubmitted",
    label: "applications submitted",
    definition:
      "applications with an `applied_at` stamp, which is set once when a student marks it submitted and never moved.",
    caveat: "self-reported by the student. We never see an employer confirm anything.",
    group: "output",
  },
  {
    key: "coverLettersDrafted",
    label: "cover letters drafted",
    definition: "rows in `cover_letters` — one per (student, listing).",
    caveat: "a draft, not a sent letter. We have no way to know whether one was used.",
    group: "output",
  },
  {
    key: "savedSearches",
    label: "saved searches",
    definition: "rows in `saved_searches`, whether or not alerts are on.",
    caveat: null,
    group: "output",
  },
  {
    key: "reportsFiled",
    label: "listings reported by students",
    definition: "rows in `listing_reports`.",
    caveat: null,
    group: "output",
  },
  {
    key: "remindersSent",
    label: "deadline reminders sent",
    definition: "rows in `deadline_reminders`, one per email actually delivered to Resend.",
    caveat: "zero until RESEND_API_KEY is set — the job runs dry by default.",
    group: "output",
  },

  /* ------------------------------------------------------------ usage */
  {
    key: "filteredFeedRequests",
    label: "filtered feed requests",
    definition:
      "feed renders where at least one filter or search term was set. Deliberately not called “searches run”: it counts requests, and one person narrowing a search three times is three of these.",
    caveat:
      "also counts a revalidation after saving a search, and a back-navigation. Treat it as an upper bound on searches, not a count of them.",
    group: "usage",
  },
  {
    key: "zeroResultSearches",
    label: "of those, returning nothing",
    definition: "the same requests, where the feed came back empty.",
    caveat: "the most useful product number here: a rising share means the filters promise more than the corpus holds.",
    group: "usage",
  },
  {
    key: "listingViews",
    label: "listing pages opened",
    definition: "renders of `/listing/[id]`.",
    caveat: null,
    group: "usage",
  },
  {
    key: "githubAudits",
    label: "github audits run",
    definition: "renders of `/github` that actually fetched an account.",
    caveat:
      "the LinkedIn checker and the essay reviewer are NOT counted anywhere. Both run entirely in the browser and both pages promise exactly that, so instrumenting them would put a network call on a page that makes none. Their usage is a known blind spot rather than an estimate.",
    group: "usage",
  },

  /* ----------------------------------------------------------- corpus */
  {
    key: "openPostings",
    label: "open opportunities",
    definition: "postings with no `closed_at` and not hidden by an operator.",
    caveat: null,
    group: "corpus",
  },
  {
    key: "postingsWithDeadline",
    label: "carrying a real deadline",
    definition: "open postings with a future employer-stated `deadline_at`.",
    caveat: "almost entirely scholarships. ATS internships rarely publish one.",
    group: "corpus",
  },
  {
    key: "companiesPolled",
    label: "employer boards polled",
    definition: "organizations with a known ATS type and slug, i.e. ones we poll directly.",
    caveat: null,
    group: "corpus",
  },
];

/** Attach every definition and caveat to the raw counts. Pure. */
export function buildMetrics(counts: MetricCounts): Metric[] {
  return SPECS.map((spec) => ({
    key: spec.key,
    label: spec.label,
    value: counts[spec.key],
    definition: spec.definition,
    caveat: spec.caveat,
    group: spec.group,
    citable: isCitable(counts[spec.key]),
  }));
}

export const GROUP_LABELS: Record<MetricGroup, string> = {
  reach: "reach",
  activation: "activation",
  output: "what students produced",
  usage: "usage",
  corpus: "the corpus itself",
};

/**
 * A percentage, or null when the denominator is too small to state one.
 *
 * Same rule as `CITABLE_FLOOR` and the tracker's response rate: a fraction over
 * a tiny base reads as a rate and is not one. Returning null makes the caller
 * print "not enough data yet", which is the honest rendering.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (denominator < CITABLE_FLOOR) return null;
  return Math.round((numerator / denominator) * 100);
}
