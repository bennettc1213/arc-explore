import Link from "next/link";

import { Mascot } from "@/components/chrome/Mascot";
import { FilterPanel } from "@/components/FilterPanel";
import { PostingRow } from "@/components/PostingRow";
import { SavedSearches } from "@/components/SavedSearches";
import { ToolsTease } from "@/components/ToolsTease";
import { recordEvent } from "@/lib/analytics/record";
import { statusesForPostings } from "@/lib/applications/store";
import { getSessionUser } from "@/lib/auth";
import { getAvailableTerms, getFeed, getFeedStats, newSinceFromDays } from "@/lib/feed";
import { FEED_MIN_PER_KIND, FREE_DAILY_RESULTS } from "@/lib/feed-trim";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature, TIER_PRICE_USD, TIMING_PRIORITY_POINTS } from "@/lib/pricing/tiers";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { skillsFromParsedResume } from "@/lib/score/skills";
import { listSearches } from "@/lib/searches/store";
import { filtersFromParams, isEmptyFilters } from "@/lib/searches/types";
import {
  INTEREST_OPTIONS,
  WORK_AUTH_OPTIONS,
  isProfileUsable,
  parseLocations,
  toScoreProfile,
  type UserProfile,
} from "@/lib/profile/types";
import type { ScoreProfile } from "@/lib/score/fit";

export const dynamic = "force-dynamic";

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

function profileFromParams(sp: Record<string, string | string[] | undefined>): ScoreProfile {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const all = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const gradYear = Number(one("gradYear"));

  return {
    major: one("major") ?? null,
    gradYear: Number.isFinite(gradYear) && gradYear > 0 ? gradYear : null,
    workAuth: one("workAuth") ?? null,
    targetLocations: parseLocations(one("locations") ?? ""),
    targetVerticals: all("targetVerticals"),
    openToRemote: one("remote") !== "0",
  };
}

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
  const profile = user ? toScoreProfile(stored, resumeSkills) : profileFromParams(sp);
  const hasProfile = user
    ? isProfileUsable(stored)
    : Boolean(
        profile.major ||
          profile.gradYear ||
          profile.workAuth ||
          (profile.targetVerticals?.length ?? 0) > 0 ||
          (profile.targetLocations?.length ?? 0) > 0,
      );

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
  const includeClosed = sp.includeClosed === "1";
  // View preferences, like includeClosed: read here, never stored on a saved
  // search. `new` is time-relative (so saving it would mean nothing), and
  // `hideBlocked` depends on the profile the search is scored against.
  const hideBlocked = sp.hideBlocked === "1";
  const excludeMarketing = sp.excludeMarketing === "1";
  const newDaysRaw = Number(Array.isArray(sp.new) ? sp.new[0] : sp.new);
  const newSinceDays = Number.isFinite(newDaysRaw) && newDaysRaw > 0 ? Math.round(newDaysRaw) : null;

  // How many rows to RENDER. Not how many to score — `getFeed` still ranks the
  // whole matched set before trimming, so this cannot change what comes first.
  //
  // WHY THIS EXISTS. The feed used to render every row it was given, which was
  // 500, which was **4.16MB of HTML and ~6 seconds** per request — measured.
  // That cost was not mainly the query (~300ms) but the rendering, and it was
  // paid again on every mutation, because nine Server Actions call
  // `revalidatePath("/")`. So saving one posting rebuilt four megabytes before
  // the button could stop saying "saving…". A page size is the fix for all
  // nine at once.
  //
  // A view preference, like `limit` and `includeClosed`, so it is deliberately
  // not saveable into a saved search — see `filtersFromParams`.
  const showRaw = Number(Array.isArray(sp.show) ? sp.show[0] : sp.show);
  const requested =
    Number.isFinite(showRaw) && showRaw > 0 ? Math.min(Math.round(showRaw), 500) : FEED_PAGE_SIZE;

  /*
   * THE FREE PLAN'S DAILY SET.
   *
   * Free sees the top `FREE_DAILY_RESULTS` ranked matches; paid sees the whole
   * list, a page at a time. Deliberately a **depth** cap rather than a
   * per-listing view counter: a counter needs a row written on every listing
   * open, punishes exploring, resets awkwardly, and would be the first
   * behavioural log of what a named student looked at — which is exactly what
   * `events` was designed not to be (see its schema comment). This needs no
   * new table and cannot be gamed by refreshing.
   *
   * It is genuinely a *daily* set without any date arithmetic: the ranking
   * reads timing, timing now moves every day (deadlines approach, postings
   * age), and `ingest-fast` adds rows every 20 minutes. So the twenty change
   * on their own. The UI says that rather than claiming a midnight reset,
   * which would be a schedule we do not actually run.
   */
  const dailyCapped = !evaluateFeature(tier, "feed_full_depth").usable;
  const show = dailyCapped ? FREE_DAILY_RESULTS : requested;

  const [feed, stats, terms] = await Promise.all([
    getFeed(profile, {
      ...currentFilters,
      includeClosed,
      hideBlocked,
      excludeMarketing,
      newSince: newSinceDays ? newSinceFromDays(newSinceDays) : null,
      limit: show,
      // Only on the capped list — see FEED_MIN_PER_KIND. The full feed shows
      // everything, so nothing can be crowded out of it.
      reservePerKind: dailyCapped ? FEED_MIN_PER_KIND : 0,
      // The paid entitlement: how much of the ranking comes from timing rather
      // than fit. 0 on free, which is the ranking that existed before this.
      timingPoints: TIMING_PRIORITY_POINTS[tier],
    }),
    getFeedStats(kind),
    getAvailableTerms(),
  ]);
  const { items, categoryUnclassified, total } = feed;

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
    (excludeMarketing ? 1 : 0);

  if (activeFilters.length > 0) {
    await recordEvent("search_run", {
      filters: activeFilters,
      empty: items.length === 0,
      // Bucketed rather than exact: the useful question is "did this return
      // nothing / a little / a lot", and a raw count is a finer fingerprint of
      // one request than the answer needs.
      results: items.length === 0 ? "none" : items.length < 10 ? "few" : "many",
    });
  }

  const guestVerticals = new Set(profile.targetVerticals ?? []);

  // One query for the whole page rather than one per row.
  const tracked = user
    ? await statusesForPostings(user.id, items.map((i) => i.id))
    : new Map();

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
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

      <header style={{ marginBottom: 40 }}>
        <div className="eyebrow chrome">01 — internships + scholarships</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          every opportunity we can <span style={{ color: "var(--accent)" }}>verify is live</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "58ch", marginTop: 14 }}>
          Internships by polling each employer&apos;s own applicant-tracking system, scholarships
          by weekly scrapes of the sources we trust. Every row says when we last confirmed it.
        </p>
      </header>

      <section
        className="border-y"
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
      {!user && <ToolsTease />}

      {/* GET so filter state lives in the URL and is shareable. The whole
          surface is now a dropdown behind the "filters" trigger; its inputs
          still serialize on submit even while collapsed. Signed out, the
          profile answers ride along inside the same form. */}
      <FilterPanel
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
        term={term}
        newSinceDays={newSinceDays}
        hideBlocked={hideBlocked}
        excludeMarketing={excludeMarketing}
        activeCount={activeCount}
      />

      {!hasProfile && (
        <div className="slot" style={{ marginBottom: 24, padding: "14px 16px" }}>
          {user ? (
            <>
              <Mascot size={26} />
              <span>
                your profile is empty — <Link href="/profile" style={{ color: "var(--accent)" }}>fill it in</Link>{" "}
                and these get scored. until then we only rank by freshness
              </span>
            </>
          ) : (
            <span>
              add your details above to score these — or{" "}
              <Link href="/login" style={{ color: "var(--accent)" }}>sign in</Link> to save them
            </span>
          )}
        </div>
      )}

      <div className="eyebrow chrome" style={{ marginBottom: 8 }}>
        03 — {items.length} results
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
          canSave={evaluateFeature(tier, "saved_search_alerts").usable}
          searches={savedSearches.map((s) => ({
            id: s.id,
            name: s.name,
            filters: s.filters,
            notify: s.notify,
          }))}
        />
      )}

      {items.length === 0 ? (
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
            />
          ))}

          {/*
            The page marker. Says what is on screen AND what matched, because
            "50 results" read alone is the page size masquerading as the corpus.
            Only rendered when there is actually more — a list showing
            everything it found should not imply something is being withheld.
          */}
          {total > items.length && dailyCapped && (
            <div
              className="border"
              style={{ borderColor: "var(--accent)", padding: "16px 18px", marginTop: 18 }}
            >
              <div className="mono-strong" style={{ color: "var(--accent)" }}>
                your top {items.length} of {total.toLocaleString()} matches
              </div>
              <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "64ch" }}>
                {/* Says what actually changes the set, rather than promising a
                    midnight reset we do not run. Ingest is every 20 minutes and
                    timing moves daily, so these twenty genuinely turn over. */}
                The free plan shows your twenty highest-ranked matches. They re-rank as we poll
                each employer&rsquo;s board and as deadlines approach, so this set changes day to
                day{stats.newToday > 0 ? ` — ${stats.newToday.toLocaleString()} of the corpus was found in the last day` : ""}.
                Searching, filtering and opening any listing are never limited.
              </p>
              <Link
                href="/pricing?feature=feed_full_depth"
                className="btn btn-primary press"
                style={{ textDecoration: "none", display: "inline-block", marginTop: 12 }}
              >
                see all {total.toLocaleString()} — from ${TIER_PRICE_USD.edge}/mo
              </Link>
            </div>
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

      <footer className="mono" style={{ marginTop: 48, color: "var(--faint-readable)" }}>
        fit and timing are explainable heuristics, not win probabilities. we do not have
        outcome data yet, so we do not pretend to predict odds.
      </footer>
    </main>
  );
}
