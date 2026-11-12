import type { Metadata } from "next";
import Link from "next/link";

import { Mascot } from "@/components/chrome/Mascot";
import { FilterPanel } from "@/components/FilterPanel";
import { PostingRow } from "@/components/PostingRow";
import { HiddenMatches } from "@/components/pricing/HiddenMatches";
import { LivePulseStrip } from "@/components/live/LivePulseStrip";
import { previousFeedVisit } from "@/lib/profile/feed-visits";
import { SavedSearches } from "@/components/SavedSearches";
import { ToolsTease } from "@/components/ToolsTease";
import { recordEvent } from "@/lib/analytics/record";
import { statusesForPostings } from "@/lib/applications/store";
import { getSessionUser } from "@/lib/auth";
import { getAvailableTerms, getFeed, getFeedStats, getLotteryAwards, newSinceFromDays } from "@/lib/feed";
import { FREE_RANKED_RESULTS, reservationFor } from "@/lib/feed-trim";
import { getUserTier } from "@/lib/pricing/entitlements";
import { ALERT_CADENCE_LABEL, evaluateFeature, TIMING_PRIORITY_POINTS } from "@/lib/pricing/tiers";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { skillsFromParsedResume } from "@/lib/score/skills";
import { listSearches } from "@/lib/searches/store";
import { alertingSearchIds, freeAlertSlot, savedSearchLimit } from "@/lib/searches/alerting";
import { filtersFromParams, isEmptyFilters } from "@/lib/searches/types";
import {
  INTEREST_OPTIONS,
  WORK_AUTH_OPTIONS,
  isProfileUsable,
  missingFitFields,
  type UserProfile,
} from "@/lib/profile/types";
import { EmailModalProvider } from "@/components/scholarships/EmailModal";
import { KindSwitcher, ViewToggle } from "@/components/scholarships/ExploreSwitchers";
import { PlanView, type FundingState } from "@/components/scholarships/PlanView";
import { getFundingGoal } from "@/lib/profile/funding-goal";
import { FEED_PATH } from "@/lib/routes";
import { ActiveFilters } from "@/components/ActiveFilters";
import { DiscoveryPreferences } from "@/components/discovery/DiscoveryPreferences";
import { Icon } from "@/components/ui/Icon";
import { ExploreScoutEntry } from "@/components/scout/ExploreScoutEntry";
import { exploreEntryFocus, scoutButtonLabel, scoutHref, type ScoutFocus } from "@/lib/scout/focus";
import { toScoringProfile, withScoringPreferences, scoringQueryFrom } from "@/lib/score/v2/profile";
import { getFundingTotals, getScholarshipPlan } from "@/lib/scholarships/explore";
import { parseExploreView, type ExploreView } from "@/lib/scholarships/plan";

import { profileFromParams, profileReadyFor, viewPrefsFromParams } from "./viewer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore internships and scholarships | Instela",
};

/**
 * How many rows the feed renders before asking you to say "show more".
 *
 * Fifty, because that is roughly where a ranked list stops being read and
 * starts being scrolled past — and because the row below fifty was never the
 * reason anyone found anything, while it was costing everyone six seconds.
 * `getFeed` still scores and ranks every matched row; this trims only what is
 * turned into HTML.
 */
const FEED_PAGE_SIZE = 50;

/**
 * The feed.
 *
 * Two ways in, deliberately:
 *  - Signed out, the profile lives in the URL. The whole product works without
 *    an account, and a scored feed is a shareable link.
 *  - Signed in, the stored profile wins and the form collapses to a summary.
 *    Filters stay in the URL either way.
 */

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="mono-strong" style={{ fontSize: "1.6rem", color: "var(--text)" }}>
        {value}
      </div>
      <div className="mono">{label}</div>
    </div>
  );
}

/** What we are scoring against, for someone who is signed in. */
function ProfileSummary({
  profile,
  resumeSkills,
}: {
  profile: UserProfile | null;
  resumeSkills: string[];
}) {
  const bits: string[] = [];
  if (profile?.major) bits.push(profile.major);
  if (profile?.gradYear) bits.push(`class of ${profile.gradYear}`);
  if (profile?.workAuth) {
    bits.push(WORK_AUTH_OPTIONS.find((o) => o.value === profile.workAuth)?.label ?? profile.workAuth);
  }
  if (profile?.targetVerticals.length) {
    bits.push(
      profile.targetVerticals
        .map((v) => INTEREST_OPTIONS.find((o) => o.value === v)?.label ?? v)
        .join(" · "),
    );
  }
  if (profile?.targetLocations.length) bits.push(profile.targetLocations.join(" / "));

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="mono chrome">scoring against</div>
        <div className="t-sm" style={{ marginTop: 4, color: "var(--text)" }}>
          {bits.length > 0 ? bits.join(" · ") : "nothing yet — your profile is empty"}
        </div>
        {resumeSkills.length > 0 ? (
          <details className="disclosure" style={{ marginTop: 6 }}>
            <summary>resume: {resumeSkills.length} skills read</summary>
            <div className="disclosure-body mono">{resumeSkills.join(" · ")}</div>
          </details>
        ) : (
          <div className="mono" style={{ marginTop: 6 }}>
            no resume yet — upload one and these get matched skill by skill
          </div>
        )}
      </div>
      <Link href="/profile" className="btn press" style={{ textDecoration: "none" }}>
        edit profile
      </Link>
    </div>
  );
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // Picking a category (sidebar, old Cards links) opens a Scout start screen, not
  // the ranked list. Returned before anything is loaded: nothing here needs the
  // session, the profile or the feed.
  const entry = exploreEntryFocus(sp);
  if (entry) return <ExploreScoutEntry focus={entry.focus} />;

  /*
   * Set by the account-deletion redirect. Worth a banner rather than a silent
   * landing: someone who just destroyed everything they had here should be told
   * it worked, and told which of the two things happened — "partial" means the
   * app data is gone but the login record survived because the service-role key
   * was unset.
   */
  const deletedParam = Array.isArray(sp.deleted) ? sp.deleted[0] : sp.deleted;
  const deleted = deletedParam === "1" || deletedParam === "partial" ? deletedParam : null;

  const user = await getSessionUser();
  /*
   * The tier is resolved through `getUserTier` on BOTH branches, deliberately.
   * Substituting a literal `"free"` for the signed-out case looks equivalent —
   * that is exactly what the function returns for a missing user id — but it
   * makes a second definition of how a tier is decided, and the first thing
   * that definition missed was the DEV_TIER override, which lives inside the
   * function. The signed-out feed stayed capped and bucketed while the nav
   * beside it correctly read "dev · apply". One definition per rule.
   */
  const [stored, resume, savedSearches, tier] = await Promise.all([
    user ? getProfile(user.id) : null,
    user ? getLatestResume(user.id) : null,
    user ? listSearches(user.id) : [],
    // Kept inside the same Promise.all rather than awaited after it: the feed
    // was just brought from 6.1s to 0.92s and a serial round trip here would
    // give some of that back for nothing.
    getUserTier(user?.id),
  ]);

  // Read from the same params the feed filters on, so "save this search" saves
  // exactly what is on screen.
  const currentFilters = filtersFromParams(sp);

  // Derived on read, not stored: improving the extractor improves everyone's
  // scores without a migration or a re-upload.
  const resumeSkills = resume ? skillsFromParsedResume(resume.parsed) : [];

  // Signed in, the saved profile is the source of truth — otherwise a stale
  // link would silently score someone against answers they had since changed.
  const profile = user ? withScoringPreferences(toScoringProfile(stored, resumeSkills, resume?.parsed), sp) : profileFromParams(sp);
  const hasProfile = user
    ? isProfileUsable(stored)
    : Boolean(
        profile.major ||
          profile.gradYear ||
          profile.workAuth ||
          (profile.targetVerticals?.length ?? 0) > 0 ||
          (profile.targetLocations?.length ?? 0) > 0,
      );
  const profileReady = profileReadyFor(user, stored, profile);

  /*
   * ONE PARSER, NOT TWO. This page used to re-read every filter out of
   * `searchParams` itself, beside the `filtersFromParams` call above that feeds
   * "save this search" — and the two disagreed. The feed's own checkbox posts
   * `remoteOnly=1` while `filtersToQuery` wrote `remote=1`, so **remote-only
   * never survived a round trip in either direction**: saving from a remote
   * filtered feed stored `remoteOnly: false`, and clicking a saved remote
   * search produced a URL this page ignored. Alerts for those searches were
   * therefore matching non-remote roles too.
   *
   * Found by instrumenting searches, of all things — the event log recorded
   * `filters: ["kind"]` for a request that plainly also had `remote=1` on it.
   * The fix is not to rename a key: it is that a filter must have exactly one
   * definition of how it is read from a URL, so the saved copy and the live
   * copy cannot drift again.
   */
  const { term, remoteOnly, kind, deadline, minAmount, location, q, category } = currentFilters;

  // Not saveable, so not part of the shared shape — see savedFiltersSchema.
  // View preferences: read here, never stored on a saved search. `new` is
  // time-relative (so saving it would mean nothing), and `hideBlocked` depends
  // on the profile the search is scored against. Read through the same helper
  // the scholarship Plan endpoint uses, so the two cannot disagree.
  const { includeClosed, includeInferred, includeUnknownAmounts, hideBlocked, excludeMarketing } =
    viewPrefsFromParams(sp);

  /*
   * THE SCHOLARSHIP VIEWS. Only when the feed is scoped to scholarships; the
   * combined feed and the internship feed render exactly as before. Plan is
   * the default there, List is the existing ranked feed below.
   */
  const scholarshipViews = kind === "scholarship";
  const view: ExploreView = parseExploreView(sp.view);
  const planView = scholarshipViews && view === "plan";
  // Which Scout the header button opens: the tool being looked at, or a plain one.
  const scoutFocus: ScoutFocus | null = currentFilters.meritOnly
    ? "merit"
    : kind === "scholarship" ? "scholarships" : kind === "internship" ? "internships" : null;
  const newDaysRaw = Number(Array.isArray(sp.new) ? sp.new[0] : sp.new);
  const newSinceDays = Number.isFinite(newDaysRaw) && newDaysRaw > 0 ? Math.round(newDaysRaw) : null;

  // How many rows to RENDER. Not how many to score — `getFeed` still ranks the
  // whole matched set before trimming, so this cannot change what comes first.
  //
  // WHY THIS EXISTS. The feed used to render every row it was given, which was
  // 500, which was **4.16MB of HTML and ~6 seconds** per request — measured.
  // That cost was not mainly the query (~300ms) but the rendering, and it was
  // paid again on every mutation, because nine Server Actions call
  // `revalidatePath` on the feed. So saving one posting rebuilt four megabytes before
  // the button could stop saying "saving…". A page size is the fix for all
  // nine at once.
  //
  // A view preference, like `limit` and `includeClosed`, so it is deliberately
  // not saveable into a saved search — see `filtersFromParams`.
  const showRaw = Number(Array.isArray(sp.show) ? sp.show[0] : sp.show);
  const requested =
    Number.isFinite(showRaw) && showRaw > 0 ? Math.min(Math.round(showRaw), 500) : FEED_PAGE_SIZE;

  /*
   * THE FREE PLAN'S RANKED DEPTH.
   *
   * Free sees the top `FREE_RANKED_RESULTS` ranked matches for this exact
   * search and filter combination; Pro sees the whole list, a page at a time.
   * A **depth** cap rather than a per-listing view counter: a counter needs a
   * row written on every listing open, punishes exploring, and would be the
   * first behavioural log of what a named student looked at — exactly what
   * `events` was designed not to be. Changing the filters ranks a different
   * set; opening listings is never counted.
   *
   * The set moves as ingestion adds rows and timing changes. The UI says that,
   * and never promises a midnight reset or a number of new rows per day.
   */
  const dailyCapped = !evaluateFeature(tier, "feed_full_depth").usable;
  const show = dailyCapped ? FREE_RANKED_RESULTS : requested;

  // "Since you last looked": records this visit and returns the previous one.
  // Before the Promise.all because the feed counts new rows against it.
  const prevVisit = user ? await previousFeedVisit(user.id) : null;

  const [listFeed, stats, terms, lotteryAwards, plan, funding] = await Promise.all([
    // The Plan view ranks through getFeed itself (inside getScholarshipPlan),
    // so the list query is skipped rather than run twice.
    planView ? null : getFeed(profile, {
      ...currentFilters,
      includeClosed,
      includeInferred,
      includeUnknownAmounts,
      hideBlocked,
      excludeMarketing,
      newSince: newSinceDays ? newSinceFromDays(newSinceDays) : null,
      countNewSince: prevVisit?.at ?? null,
      limit: show,
      /*
       * EVERY capped window, not just the free one. This used to read
       * `dailyCapped ? FEED_MIN_PER_KIND : 0`, which meant a paying subscriber
       * got the raw ranking and therefore the full force of the cross-kind
       * bias the reservation exists to answer — measured at 46 scholarships /
       * 4 internships on paid against 15 / 5 on free. The tier that pays was
       * worse mixed than the one that does not.
       *
       * Proportional (`reservationFor`) rather than a flat five, because a
       * constant means a different promise at every window size and that is how
       * the two tiers drifted apart in the first place. A window showing
       * everything still reserves nothing: `trimWithReservation` returns a
       * plain slice once the list is shorter than the limit, so nothing can be
       * crowded out of a complete feed.
       */
      reservePerKind: reservationFor(show),
      // The paid entitlement: how much of the ranking comes from timing rather
      // than fit. 0 on free, which is the ranking that existed before this.
      timingPoints: TIMING_PRIORITY_POINTS[tier],
    }),
    getFeedStats(kind),
    getAvailableTerms(includeClosed),
    getLotteryAwards(profile),
    planView
      ? getScholarshipPlan({
          profile,
          // includeClosed is deliberately not passed: the plan holds open
          // listings only, whatever the "show closed" box says.
          filters: {
            ...currentFilters,
            includeInferred,
            includeUnknownAmounts,
            hideBlocked,
            excludeMarketing,
            newSince: newSinceDays ? newSinceFromDays(newSinceDays) : null,
            timingPoints: TIMING_PRIORITY_POINTS[tier],
          },
          tier,
          profileReady,
          userId: user?.id ?? null,
        })
      : null,
    planView && user
      ? Promise.all([getFundingGoal(user.id), getFundingTotals(user.id)])
      : null,
  ]);
  const { items, categoryUnclassified, total, hidden, newSinceVisit } = listFeed ?? {
    items: [],
    categoryUnclassified: 0,
    total: 0,
    hidden: null,
    newSinceVisit: null,
  };
  const fundingState: FundingState = {
    signedIn: Boolean(user),
    goalAvailable: funding?.[0].available ?? false,
    goal: funding?.[0].goal ?? null,
    totals: funding?.[1] ?? null,
  };

  /** This page's URL with some params changed — for the switchers. */
  const hrefWith = (changes: Record<string, string | null>): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v === undefined || k === "show" || k in changes) continue;
      for (const one of Array.isArray(v) ? v : [v]) params.append(k, one);
    }
    for (const [k, v] of Object.entries(changes)) if (v !== null) params.set(k, v);
    const qs = params.toString();
    return qs ? `${FEED_PATH}?${qs}` : FEED_PATH;
  };
  const kindHrefs = {
    all: hrefWith({ kind: null, view: null, focus: null, college: null }),
    scholarship: hrefWith({ kind: "scholarship", focus: null, college: null }),
    internship: hrefWith({ kind: "internship", view: null, focus: null, college: null }),
  };
  const viewHrefs = {
    plan: hrefWith({ view: "plan" }),
    list: hrefWith({ view: "list" }),
  };

  // A search, not a page view: a bare `/` is browsing and is not counted. What
  // is recorded is which filter *keys* were used and whether the result was
  // empty — never the query text, and never who ran it. See analytics/record.ts
  // for why that boundary is enforced there rather than trusted here.
  const activeFilters = Object.entries({
    q,
    kind,
    deadline,
    minAmount,
    location,
    term,
    category,
    remote: remoteOnly ? "1" : null,
    new: newSinceDays ? "1" : null,
    hideBlocked: hideBlocked ? "1" : null,
    excludeMarketing: excludeMarketing ? "1" : null,
    focus: currentFilters.meritOnly ? "merit" : null,
    college: currentFilters.college,
  })
    .filter(([, v]) => v !== null)
    .map(([k]) => k);

  // How many refinements are live — drives the count chip on the trigger, so a
  // collapsed panel still tells you it is filtering. `includeClosed` widens
  // rather than narrows, so it is not counted.
  const activeCount =
    (q ? 1 : 0) +
    (kind ? 1 : 0) +
    (deadline ? 1 : 0) +
    (minAmount !== null ? 1 : 0) +
    (location ? 1 : 0) +
    (category ? 1 : 0) +
    (remoteOnly ? 1 : 0) +
    (term ? 1 : 0) +
    (newSinceDays ? 1 : 0) +
    (hideBlocked ? 1 : 0) +
    (excludeMarketing ? 1 : 0) + (currentFilters.meritOnly ? 1 : 0) + (currentFilters.college ? 1 : 0);

  if (activeFilters.length > 0) {
    // In the Plan view the matched set is the plan's listings, not a list page.
    const resultCount = plan ? plan.counts.listings : items.length;
    await recordEvent("search_run", {
      filters: activeFilters,
      empty: resultCount === 0,
      // Bucketed rather than exact: the useful question is "did this return
      // nothing / a little / a lot", and a raw count is a finer fingerprint of
      // one request than the answer needs.
      results: resultCount === 0 ? "none" : resultCount < 10 ? "few" : "many",
    });
  }

  // The Free ranked-depth prompts about to render: counted by feature and the
  // surface that showed it, never by who saw it.
  if (dailyCapped && total > items.length) {
    void recordEvent("upgrade_prompt_viewed", { feature: "feed_full_depth", surface: "hidden_matches" });
  }
  if (dailyCapped && newSinceVisit && newSinceVisit.beyondShown > 0) {
    void recordEvent("upgrade_prompt_viewed", { feature: "feed_full_depth", surface: "since_visit" });
  }

  const guestVerticals = new Set(profile.targetVerticals ?? []);

  // One query for the whole page rather than one per row.
  const tracked = user
    ? await statusesForPostings(user.id, [...items, ...lotteryAwards].map((i) => i.id))
    : new Map();
  const discoveryKey = new URLSearchParams(Object.entries(sp).flatMap(([key, value]) => value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(v => [key, v]))).toString();

  return (
    <main className="wrap explore-page" style={{ paddingBlock: "48px 96px" }}>
      {deleted && (
        <div
          className="border"
          style={{ borderColor: "var(--accent)", padding: "14px 18px", marginBottom: 28 }}
        >
          <div className="mono-strong" style={{ color: "var(--accent)" }}>
            {deleted === "partial" ? "your data is deleted" : "your account is deleted"}
          </div>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "62ch" }}>
            {deleted === "partial"
              ? "Your profile, resumes, cover letters, applications and reminder history are gone. The sign-in record itself could not be removed automatically — email us and it will be."
              : "Your profile, resumes, cover letters, applications, reminder history and sign-in record are gone. Nothing was kept, so there is nothing to restore."}{" "}
            The feed below still works signed out.
          </p>
        </div>
      )}

      <header className="workspace-page-heading" style={{ marginBottom: 40 }}>
        <div className="eyebrow chrome">01 — internships + scholarships</div>
        <h1 className="section-title" style={{ marginTop: 12 }}>
          Everything open right now,{" "}
          <span style={{ color: "var(--accent)" }}>ranked for you.</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "58ch", marginTop: 14 }}>
          Every listing is checked at the source. Your data is never sold.{" "}
          <Link href="/how-we-verify" style={{ color: "var(--accent)" }}>
            How we verify
          </Link>
        </p>
        {/* A guided way in for anyone who would rather answer a few questions
            than read a ranked list. Tailored to the tool they are looking at. */}
        <Link href={scoutHref(scoutFocus)} className="btn btn-primary" style={{ marginTop: 20 }}>
          {scoutButtonLabel(scoutFocus)}
          <Icon name="arrow" size={16} />
        </Link>
      </header>

      <LivePulseStrip />
      <section
        className="border-y overview-stats"
        style={{ borderColor: "var(--line)", padding: "22px 0", marginBottom: 32 }}
      >
        <div className="flex flex-wrap gap-x-12 gap-y-6">
          <Stat value={stats.open} label="open now" />
          <Stat value={stats.newToday} label="found today" />
          <Stat value={stats.total} label="tracked total" />
          <Stat value={stats.withUnknownTerm} label="term not stated" />
        </div>
        {user && <ProfileSummary profile={stored} resumeSkills={resumeSkills} />}
      </section>

      {/* Signed-out visitors land here with nothing but the filter form ahead —
          and the three profile tools are now parked in the nav's "tools" menu,
          which is only any good if you already know the word. Tease them here,
          before the profile form, so a first visitor has something to try with
          no account. */}

      {/* What the feed is scoped to. Was reachable only through a select
          inside the collapsed filter panel, which is why scholarships felt
          missing. Writes the same `kind` param that select does. */}
      <div className="explore-page-toolbar">
        <div className="explore-view-options">
        <KindSwitcher
          current={kind === "scholarship" ? "scholarship" : kind === "internship" ? "internship" : "all"}
          hrefs={kindHrefs}
        />
        {scholarshipViews && (
          <ViewToggle current={view} explicit={sp.view !== undefined} hrefs={viewHrefs} />
        )}
      </div>

      {/* GET so filter state lives in the URL and is shareable. The whole
          surface is now a dropdown behind the "filters" trigger; its inputs
          still serialize on submit even while collapsed. Signed out, the
          profile answers ride along inside the same form. */}
      <DiscoveryPreferences key={`preferences:${discoveryKey}`} activeCount={activeCount}><FilterPanel
        key={discoveryKey}
        compact
        scoring={{ school: profile.school, gpa: profile.gpa, gpaScale: profile.gpaScale, enrollmentStatus: profile.enrollmentStatus, educationLevel: profile.educationLevel, residency: profile.residency, priority: profile.priority }}
        meritOnly={currentFilters.meritOnly}
        college={currentFilters.college}
        user={Boolean(user)}
        profile={{
          major: profile.major ?? null,
          gradYear: profile.gradYear ?? null,
          workAuth: profile.workAuth ?? null,
          targetLocations: profile.targetLocations ?? [],
          targetVerticals: profile.targetVerticals ?? [],
        }}
        guestVerticals={[...guestVerticals]}
        terms={terms}
        q={q}
        kind={kind}
        deadline={deadline}
        minAmount={minAmount}
        location={location}
        category={category}
        remoteOnly={remoteOnly}
        includeClosed={includeClosed}
        includeInferred={includeInferred}
        includeUnknownAmounts={includeUnknownAmounts}
        term={term}
        newSinceDays={newSinceDays}
        hideBlocked={hideBlocked}
        excludeMarketing={excludeMarketing}
        activeCount={activeCount}
        view={scholarshipViews ? view : "list"}
      /></DiscoveryPreferences>
      </div>

      <div className="explore-layout explore-single-column">
      <div className="explore-results" id="opportunity-results">
      <ActiveFilters params={sp} />

      {user && !profileReady && (
        <div className="slot" style={{ marginBottom: 24, padding: "14px 16px" }}>
          <Mascot size={26} />
          <span className="flex-1">
            <Link
              href={`/profile?next=${encodeURIComponent(FEED_PATH)}`}
              style={{ color: "var(--accent)" }}
            >
              Add {missingFitFields(stored).length} details to score your feed
            </Link>
            {stored && missingFitFields(stored).length < 4 && (
              <span className="mono" style={{ color: "var(--faint-readable)", marginLeft: 8 }}>
                missing: {missingFitFields(stored).map((m) => m.label).join(", ")}
              </span>
            )}
          </span>
        </div>
      )}

      {!user && !hasProfile && (
        <div className="slot" style={{ marginBottom: 24, padding: "14px 16px" }}>
          <span>
            personalize your matches to score these — or{" "}
            <Link href="/login" style={{ color: "var(--accent)" }}>sign in</Link> to save them
          </span>
        </div>
      )}

      {/* "Since you last looked": counted over this search's own ranked set,
          so it never promises a row the list would not return. */}
      {!plan && prevVisit && newSinceVisit && newSinceVisit.total > 0 && (
        <div className="since-visit" role="status">
          <strong>
            {newSinceVisit.total.toLocaleString("en-US")} new to Instela {prevVisit.label}
          </strong>
          {profileReady && newSinceVisit.strongFit > 0 && (
            <span> · {newSinceVisit.strongFit.toLocaleString("en-US")} Strong Fit</span>
          )}
          {dailyCapped && newSinceVisit.beyondShown > 0 && (
            <span>
              {" "}· {newSinceVisit.beyondShown.toLocaleString("en-US")} of them are past your free top {items.length}.{" "}
              <Link href="/pricing?feature=feed_full_depth" style={{ color: "var(--accent-lite)" }}>
                see them with Pro
              </Link>
            </span>
          )}
          {!dailyCapped && (
            <span>
              {" "}·{" "}
              <Link href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (v === undefined || k === "new" ? [] : [[k, Array.isArray(v) ? v[0] : v]]))), new: String(prevVisit.days) }).toString()}`} style={{ color: "var(--accent-lite)" }}>
                show listings from the last {prevVisit.days} day{prevVisit.days === 1 ? "" : "s"}
              </Link>
            </span>
          )}
        </div>
      )}

      <div className="eyebrow chrome" style={{ marginBottom: 8 }}>
        {plan
          ? `03 — your plan, from ${plan.counts.listings.toLocaleString("en-US")} open scholarships`
          : `03 — ${items.length} results`}
      </div>

      {/* A category can only be read off what the source actually wrote. Most
          scholarships name no field at all, so without this line picking a
          category looks like the corpus is nearly empty rather than mostly
          unlabelled. */}
      {category && categoryUnclassified > 0 && (
        <div className="mono" style={{ marginBottom: 12, color: "var(--faint-readable)" }}>
          {categoryUnclassified.toLocaleString("en-US")} more state no field we can read, so we
          cannot place them in a category — hidden here, not necessarily off-topic
        </div>
      )}

      {/* Signed-in only: a saved search needs somewhere to belong and something
          to alert. Signed out the feed still works, filters and all. */}
      {user && (
        <SavedSearches
          current={currentFilters}
          currentIsEmpty={isEmptyFilters(currentFilters)}
          limit={savedSearchLimit(tier)}
          cadence={ALERT_CADENCE_LABEL[tier]}
          onFree={tier === "free"}
          searches={(() => {
            const alerting = alertingSearchIds(savedSearches, tier);
            const slot = tier === "free" ? freeAlertSlot(savedSearches) : null;
            return savedSearches.map((s) => ({
              id: s.id,
              name: s.name,
              filters: s.filters,
              notify: s.notify,
              alerting: alerting.has(s.id),
              holdsFreeSlot: slot === s.id,
            }));
          })()}
        />
      )}

      {plan ? (
        <EmailModalProvider>
          <PlanView
            plan={plan}
            funding={fundingState}
            signedIn={Boolean(user)}
            listHref={viewHrefs.list}
          />
        </EmailModalProvider>
      ) : items.length === 0 ? (
        <div className="slot" style={{ padding: "20px", gap: 16 }}>
          <Mascot size={32} />
          {q
            ? `nothing matches “${q}” with these filters — every word has to appear in the title, organization, or eligibility`
            : "no postings match these filters yet"}
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <PostingRow
              key={item.id}
              item={item}
              tracked={tracked.get(item.id) ?? null}
              signedIn={Boolean(user)}
              hasResume={resumeSkills.length > 0}
              tier={tier}
              profileReady={profileReady}
              scoringQuery={scoringQueryFrom(sp)}
            />
          ))}

          {/*
            The page marker. Says what is on screen AND what matched, because
            "50 results" read alone is the page size masquerading as the corpus.
            Only rendered when there is actually more — a list showing
            everything it found should not imply something is being withheld.
          */}
          {total > items.length && dailyCapped && hidden && (
            <HiddenMatches
              hidden={hidden}
              shownCount={items.length}
              total={total}
              freeDepth={FREE_RANKED_RESULTS}
              profileReady={profileReady}
            />
          )}

          {total > items.length && !dailyCapped && (
            <div
              className="mono"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                padding: "18px 0 4px",
                color: "var(--faint-readable)",
              }}
            >
              <span>
                showing {items.length.toLocaleString()} of {total.toLocaleString()} ranked matches
              </span>
              <Link
                href={`?${new URLSearchParams({
                  ...Object.fromEntries(
                    Object.entries(sp).flatMap(([k, v]) =>
                      v === undefined || k === "show"
                        ? []
                        : [[k, Array.isArray(v) ? v[0] : v] as [string, string]],
                    ),
                  ),
                  show: String(Math.min(items.length + FEED_PAGE_SIZE * 2, 500)),
                }).toString()}`}
                className="mono press"
                style={{ color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}
                scroll={false}
              >
                show more →
              </Link>
            </div>
          )}
        </div>
      )}

      {kind !== "internship" && !currentFilters.meritOnly && !currentFilters.college && lotteryAwards.length > 0 && (
        <details className="discovery-lottery" style={{ marginTop: 56 }}><summary>Lottery-style awards · separate from judged scholarships</summary><section>
          <div className="eyebrow chrome" style={{ marginBottom: 8 }}>
            lottery-style awards
          </div>
          <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "62ch", marginBottom: 16 }}>
            Random drawings and sweepstakes. They are not judged scholarships, so we keep them on
            their own shelf rather than ranking them with institutional awards.
          </p>
          {lotteryAwards.map((item) => (
            <PostingRow
              key={item.id}
              item={item}
              tracked={tracked.get(item.id) ?? null}
              signedIn={Boolean(user)}
              hasResume={resumeSkills.length > 0}
              tier={tier}
              profileReady={profileReady}
            />
          ))}
        </section></details>
      )}

      <footer className="mono" style={{ marginTop: 48, color: "var(--faint-readable)" }}>
        fit and timing are explainable heuristics, not win probabilities. we do not have
        outcome data yet, so we do not pretend to predict odds.
      </footer>
      </div>
      </div>
      {!user && <details className="explore-toolkit-disclosure"><summary>Explore your application toolkit</summary><ToolsTease /></details>}
    </main>
  );
}
