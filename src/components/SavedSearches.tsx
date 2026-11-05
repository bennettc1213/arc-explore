"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  deleteSearchAction,
  pickFreeAlertAction,
  saveSearchAction,
  toggleNotifyAction,
  type SaveSearchState,
} from "@/app/searches-actions";
import { feedHref } from "@/lib/routes";
import { describeFilters, filtersToQuery, type SavedFilters } from "@/lib/searches/types";

import { PendingButton } from "./PendingButton";
import { TIER_LABELS } from "@/lib/pricing/tiers";

const INITIAL: SaveSearchState = { status: "idle" };

export interface SavedSearchView {
  id: string;
  name: string;
  filters: SavedFilters;
  notify: boolean;
  /** Whether this search's alerts are active on the viewer's plan. */
  alerting: boolean;
  /** On Free: whether this search holds the single alert slot. */
  holdsFreeSlot: boolean;
}

/**
 * Save the current search, and manage the saved ones.
 *
 * Lives on the feed rather than behind its own nav item — partly because the
 * nav is already over-full, but mostly because this is where the filters are.
 * A saved search is "keep what I just did", and asking someone to go somewhere
 * else to do that loses the thing they were keeping.
 */
export function SavedSearches({
  current,
  currentIsEmpty,
  searches,
  limit,
  cadence,
  onFree,
}: {
  current: SavedFilters;
  currentIsEmpty: boolean;
  searches: SavedSearchView[];
  /** How many this plan may hold — decided server-side; `saveSearchAction`
   *  re-checks it, because a Server Action is a public POST endpoint. */
  limit: number;
  /** "weekly" or "daily" — the plan's alert cadence. */
  cadence: string;
  onFree: boolean;
}) {
  const [state, action, pending] = useActionState(saveSearchAction, INITIAL);
  const [naming, setNaming] = useState(false);

  const atLimit = searches.length >= limit;
  const alreadySaved = searches.some(
    (s) => filtersToQuery(s.filters) === filtersToQuery(current),
  );

  return (
    <section
      className="border"
      style={{ borderColor: "var(--line)", padding: "14px 18px", marginBottom: 28 }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="mono chrome">saved searches</span>
        {!currentIsEmpty && !alreadySaved && !naming && !atLimit && (
          <button type="button" className="btn press" onClick={() => setNaming(true)}>
            save this search
          </button>
        )}
        {!currentIsEmpty && !alreadySaved && atLimit && (
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            {onFree ? (
              <>
                {TIER_LABELS.free} keeps {limit} saved search — delete it to save this one, or{" "}
                <Link href="/pricing?feature=saved_search_alerts" style={{ color: "var(--accent)" }}>
                  {TIER_LABELS.apply} saves several, with daily alerts
                </Link>
              </>
            ) : (
              <>you have {limit} saved — delete one to save another</>
            )}
          </span>
        )}
        {alreadySaved && (
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            this one is already saved
          </span>
        )}
        {currentIsEmpty && (
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            filter the feed first — an empty search matches everything
          </span>
        )}
      </div>

      {naming && (
        <form action={action} style={{ marginTop: 14 }}>
          <input type="hidden" name="filters" value={JSON.stringify(current)} />
          <div className="mono" style={{ color: "var(--faint-readable)", marginBottom: 8 }}>
            {describeFilters(current)}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              name="name"
              placeholder="call it something — or leave blank"
              maxLength={80}
              style={{
                background: "transparent",
                border: "1px solid var(--line-strong)",
                color: "var(--text)",
                padding: "8px 10px",
                font: "inherit",
                minWidth: 260,
              }}
            />
            <button type="submit" className="btn btn-primary press" disabled={pending}>
              {pending ? "saving…" : "save"}
            </button>
            <button type="button" className="btn press" onClick={() => setNaming(false)}>
              cancel
            </button>
          </div>
          {state.status === "error" && (
            <p className="mono" style={{ color: "var(--accent)", marginTop: 8 }}>
              {state.message}
            </p>
          )}
        </form>
      )}

      {searches.length > 0 && (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {searches.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-3">
              <div style={{ minWidth: 0 }}>
                <Link
                  href={feedHref(filtersToQuery(s.filters))}
                  className="t-sm press"
                  style={{ color: "var(--accent)" }}
                >
                  {s.name}
                </Link>
                <span className="mono" style={{ display: "block", color: "var(--faint-readable)" }}>
                  {describeFilters(s.filters)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <form action={toggleNotifyAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="notify" value={s.notify ? "0" : "1"} />
                  <PendingButton
                    type="submit"
                    pendingLabel={s.notify ? "turning off…" : "turning on…"}
                    className="mono press"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: s.notify ? "var(--accent)" : "var(--faint-readable)",
                    }}
                    title={
                      s.notify
                        ? "we will email you when something new matches"
                        : "alerts off — the search still works in the feed"
                    }
                  >
                    {s.notify ? (s.alerting ? `alerts on · ${cadence}` : `alerts paused on ${TIER_LABELS.free}`) : "alerts off"}
                  </PendingButton>
                </form>

                {onFree && !s.holdsFreeSlot && (
                  <form action={pickFreeAlertAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <PendingButton
                      type="submit"
                      pendingLabel="switching…"
                      className="mono press"
                      style={{ background: "none", border: "none", padding: 0, color: "var(--accent)" }}
                      title="Free alerts on one saved search; this makes it this one"
                    >
                      alert on this one instead
                    </PendingButton>
                  </form>
                )}

                <form action={deleteSearchAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <PendingButton
                    type="submit"
                    pendingLabel="deleting…"
                    className="mono press"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: "var(--faint-readable)",
                    }}
                  >
                    delete
                  </PendingButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {searches.length > 0 && (
        <p className="mono" style={{ marginTop: 12, color: "var(--faint-readable)" }}>
          alerts email {cadence}, and only for postings we first saw since the last one — never a
          re-send of what you have already been shown, and never before we have found and
          checked a listing ourselves. Saved searches reopen from here whether or not email is on.
          {onFree && searches.length > 1 && (
            <> {TIER_LABELS.free} alerts on one search; the others are kept, paused, and resume on {TIER_LABELS.apply}.</>
          )}
        </p>
      )}
    </section>
  );
}
