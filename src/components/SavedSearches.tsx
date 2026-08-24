"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  deleteSearchAction,
  saveSearchAction,
  toggleNotifyAction,
  type SaveSearchState,
} from "@/app/searches-actions";
import { describeFilters, filtersToQuery, type SavedFilters } from "@/lib/searches/types";

import { PendingButton } from "./PendingButton";
import { TIER_LABELS } from "@/lib/pricing/tiers";

const INITIAL: SaveSearchState = { status: "idle" };

export interface SavedSearchView {
  id: string;
  name: string;
  filters: SavedFilters;
  notify: boolean;
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
  canSave = true,
}: {
  current: SavedFilters;
  currentIsEmpty: boolean;
  searches: SavedSearchView[];
  /** Whether this viewer's tier includes saved-search alerts. Decided
   *  server-side (see app/page.tsx); `saveSearchAction` re-checks it anyway,
   *  because a Server Action is a public POST endpoint and a hidden button
   *  is not a check. */
  canSave?: boolean;
}) {
  const [state, action, pending] = useActionState(saveSearchAction, INITIAL);
  const [naming, setNaming] = useState(false);

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
        {!canSave && (
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            🔒{" "}
            <Link href="/pricing" style={{ color: "var(--accent)" }}>
              {TIER_LABELS.apply}
            </Link>{" "}
            — a saved search exists to alert you, and alerts are a paid feature
          </span>
        )}
        {canSave && !currentIsEmpty && !alreadySaved && !naming && (
          <button type="button" className="btn press" onClick={() => setNaming(true)}>
            save this search
          </button>
        )}
        {canSave && alreadySaved && (
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            this one is already saved
          </span>
        )}
        {canSave && currentIsEmpty && (
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
                  href={`/?${filtersToQuery(s.filters)}`}
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
                    {s.notify ? "alerts on" : "alerts off"}
                  </PendingButton>
                </form>

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
          an alert fires only for postings we first saw since the last one — never a re-send of
          what you have already been shown.
        </p>
      )}
    </section>
  );
}
