"use client";

import { useEffect, useRef, useState } from "react";

import { INTEREST_OPTIONS, WORK_AUTH_OPTIONS } from "@/lib/profile/types";
import { FEED_PATH } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";

/** A small sub-label for clustering related controls — quieter than `.eyebrow`,
    which is already spent at the page level. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono chrome" style={{ color: "var(--faint-readable)", marginBottom: 10 }}>
      {children}
    </div>
  );
}

/**
 * The feed's filter surface, collapsed behind a single "filters (N)" trigger.
 *
 * One GET form wraps the whole thing so a submit always carries every value —
 * the search, the refinement controls, and (signed out) the profile answers —
 * exactly as the inline form did before this became a dropdown. The panel's
 * `hidden` attribute only controls paint; the inputs inside it still serialize
 * on submit, so collapsing never drops a value the user had set.
 *
 * Accessibility follows the existing `ToolsMenu` disclosure: a labelled trigger
 * with `aria-expanded`/`aria-controls`, click-outside via `pointerdown`, and
 * Escape to close and return focus to the trigger.
 */
export interface FilterPanelProps {
  user: boolean;
  profile: {
    major: string | null;
    gradYear: number | null;
    workAuth: string | null;
    targetLocations: string[];
    targetVerticals: string[];
  };
  guestVerticals: string[];
  terms: string[];
  q: string | null;
  kind: string | null;
  deadline: string | null;
  minAmount: number | null;
  location: string | null;
  category: string | null;
  remoteOnly: boolean;
  includeClosed: boolean;
  includeInferred: boolean;
  includeUnknownAmounts: boolean;
  term: string | null;
  newSinceDays: number | null;
  hideBlocked: boolean;
  excludeMarketing: boolean;
  activeCount: number;
  /** The scholarship view (plan | list), kept across a filter submit. */
  view?: string | null;
}

export function FilterPanel(props: FilterPanelProps) {
  const {
    user,
    profile,
    guestVerticals,
    terms,
    q,
    kind,
    deadline,
    minAmount,
    location,
    category,
    remoteOnly,
    includeClosed,
    includeInferred,
    includeUnknownAmounts,
    term,
    newSinceDays,
    hideBlocked,
    excludeMarketing,
    activeCount,
    view,
  } = props;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 1100px)").matches;
    const panel = document.getElementById("filter-panel");
    const previousOverflow = document.body.style.overflow;
    if (mobile) { document.body.style.overflow = "hidden"; panel?.querySelector<HTMLButtonElement>("button")?.focus(); }
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
      if (mobile && e.key === "Tab" && panel) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([type="hidden"]), select, a[href]')).filter(el => el.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  function closeAndRefocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <form
      ref={rootRef}
      method="GET"
      action={FEED_PATH}
      className={`relative border explore-filters ${open ? "filters-open" : ""}`}
      style={{ borderColor: "var(--line)", padding: 20, marginBottom: 32 }}
    >
      {/* Without this, filtering from the list view would drop back to plan. */}
      {view && <input type="hidden" name="view" value={view} />}
      <div className="filter-search">
        <label className="field-row"><span className="filter-section-title">Search opportunities</span><span className="filter-search-input"><Icon name="search" size={17} /><input className="field" name="q" defaultValue={q ?? ""} placeholder="Role, organization, eligibility" /></span></label>
        <button type="submit" className="btn btn-primary filter-search-submit">Search<Icon name="arrow" size={15} /></button>
        <p className="mono">Matches the title, the sponsor, or who is eligible — every word must appear.</p>
      </div>
      {!user && (
        <details className="guest-profile-fields">
          <summary>Personalize your matches</summary>
          <div className="eyebrow chrome" style={{ marginBottom: 16 }}>
            02 — your profile
          </div>

          <GroupLabel>about you</GroupLabel>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="field-row">
              <span className="mono chrome">major</span>
              <input
                className="field"
                name="major"
                defaultValue={profile.major ?? ""}
                placeholder="computer science"
              />
            </label>

            <label className="field-row">
              <span className="mono chrome">graduation year</span>
              <input
                className="field"
                name="gradYear"
                type="number"
                defaultValue={profile.gradYear ?? ""}
                placeholder="2027"
              />
            </label>

            <label className="field-row">
              <span className="mono chrome">work authorization</span>
              <select className="field" name="workAuth" defaultValue={profile.workAuth ?? ""}>
                <option value="">prefer not to say</option>
                {WORK_AUTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
            <GroupLabel>where &amp; what you want</GroupLabel>
            <label className="field-row" style={{ maxWidth: 360 }}>
              <span className="mono chrome">preferred locations</span>
              <input
                className="field"
                name="locations"
                defaultValue={(profile.targetLocations ?? []).join(", ")}
                placeholder="San Francisco, New York"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {INTEREST_OPTIONS.map((o) => (
                <label key={o.value} className="check-row mono chrome">
                  <input
                    type="checkbox"
                    name="targetVerticals"
                    value={o.value}
                    defaultChecked={guestVerticals.includes(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        </details>
      )}

      <div
        className="flex items-center justify-between"
        style={{ marginTop: user ? 0 : 20 }}
      >
        <span className="filter-static-heading"><Icon name="filter" size={16} />Filters{activeCount > 0 && <span>{activeCount}</span>}</span>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen((v) => !v)}
          className="mono chrome press flex items-center gap-2 filter-toggle"
          style={{
            color: "var(--accent)",
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            cursor: "pointer",
          }}
        >
          <Icon name="filter" size={16} /> filters
          {activeCount > 0 && (
            <span
              aria-label={`${activeCount} active`}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--on-accent)",
                background: "var(--accent)",
                padding: "1px 6px",
              }}
            >
              {activeCount}
            </span>
          )}
          <span
            aria-hidden
            style={{
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: "5px solid currentColor",
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 150ms var(--ease-inout)",
            }}
          />
        </button>

        {open && (
          <button
            type="button"
            onClick={closeAndRefocus}
            className="mono chrome press filter-close"
            style={{
              color: "var(--faint-readable)",
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              cursor: "pointer",
            }}
          >
            close
          </button>
        )}
      </div>

      <div
        id="filter-panel"
        data-open={open}
        className="filter-controls"
        role="region"
        aria-label="Refine opportunities"
        style={{
          marginTop: 12,
          zIndex: 50,
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          padding: 20,
        }}
      >
        <div className="filter-drawer-header"><strong>Refine opportunities</strong><button type="button" onClick={closeAndRefocus} aria-label="Close filters"><Icon name="close" size={20} /></button></div>
        <GroupLabel>narrow by</GroupLabel>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="field-row">
            <span className="mono chrome">kind</span>
            <select className="field" name="kind" defaultValue={kind ?? ""}>
              <option value="">internships + scholarships</option>
              <option value="internship">internships</option>
              <option value="scholarship">scholarships</option>
            </select>
          </label>

          <label className="field-row">
            <span className="mono chrome">category</span>
            <select className="field" name="category" defaultValue={category ?? ""}>
              <option value="">any</option>
              {INTEREST_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          <GroupLabel>money &amp; time</GroupLabel>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="field-row">
              <span className="mono chrome">deadline</span>
              <select className="field" name="deadline" defaultValue={deadline ?? ""}>
                <option value="">any</option>
                <option value="set">has a deadline</option>
                <option value="30">closing within 30 days</option>
                <option value="60">closing within 60 days</option>
                <option value="90">closing within 90 days</option>
              </select>
            </label>

            <label className="field-row">
              <span className="mono chrome">min award</span>
              <input
                className="field"
                name="minAmount"
                type="number"
                min={0}
                step={500}
                defaultValue={minAmount ?? ""}
                placeholder="any amount"
              />
            </label>

            <label className="check-row mono chrome">
              <input
                type="checkbox"
                name="includeUnknownAmounts"
                value="1"
                defaultChecked={includeUnknownAmounts}
              />
              include unknown amounts
            </label>

            <label className="field-row">
              <span className="mono chrome">added in last</span>
              <select className="field" name="new" defaultValue={newSinceDays ?? ""}>
                <option value="">any time</option>
                <option value="7">past 7 days</option>
                <option value="14">past 14 days</option>
                <option value="30">past 30 days</option>
              </select>
            </label>

            <label className="field-row">
              <span className="mono chrome">term</span>
              <select
                name="term"
                defaultValue={term ?? ""}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line-strong)",
                  color: "var(--text)",
                  padding: "5px 8px",
                  fontFamily: "var(--font-mono)",
                  colorScheme: "dark",
                }}
              >
                <option value="">any</option>
                {terms.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          <GroupLabel>location &amp; fit</GroupLabel>
          <label className="field-row" style={{ maxWidth: 360 }}>
            <span className="mono chrome">location</span>
            <input
              className="field"
              name="location"
              defaultValue={location ?? ""}
              placeholder="New York"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <label className="check-row mono chrome">
              {/* `remote`, matching `filtersToQuery` — one name for one filter. */}
              <input type="checkbox" name="remote" value="1" defaultChecked={remoteOnly} />
              remote only
            </label>

            <label className="check-row mono chrome">
              <input type="checkbox" name="hideBlocked" value="1" defaultChecked={hideBlocked} />
              hide ineligible
            </label>

            <label className="check-row mono chrome">
              <input
                type="checkbox"
                name="excludeMarketing"
                value="1"
                defaultChecked={excludeMarketing}
              />
              exclude sponsor / marketing awards
            </label>

            <label className="check-row mono chrome">
              <input type="checkbox" name="includeClosed" value="1" defaultChecked={includeClosed} />
              show closed
            </label>

            <label className="check-row mono chrome">
              <input
                type="checkbox"
                name="includeInferred"
                value="1"
                defaultChecked={includeInferred}
              />
              include inferred terms
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary press">
            {user ? "apply filters" : "score my feed"}
          </button>
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            {activeCount > 0
              ? `${activeCount} filter${activeCount === 1 ? "" : "s"} active`
              : "no filters applied"}
          </span>
        </div>
      </div>
    </form>
  );
}
