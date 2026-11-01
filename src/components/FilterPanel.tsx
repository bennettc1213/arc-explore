"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import { INTEREST_OPTIONS, WORK_AUTH_OPTIONS } from "@/lib/profile/types";
import { FEED_PATH } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";
import { MatchingScreen } from "@/components/discovery/MatchingScreen";
import type { ScoreProfile } from "@/lib/score/fit";

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
  discovery?: boolean;
  meritOnly?: boolean;
  college?: string | null;
  compact?: boolean;
  scoring?: Pick<ScoreProfile, "school" | "gpa" | "gpaScale" | "educationLevel" | "enrollmentStatus" | "residency" | "priority">;
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
    discovery = false,
    meritOnly = false,
    college = null,
    compact = false,
    scoring = {},
  } = props;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lane, setLane] = useState(meritOnly ? "merit" : kind ?? "all");
  const [mobilePreferences, setMobilePreferences] = useState(false);
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

  function submitPreferences(event: FormEvent<HTMLFormElement>) {
    if (!discovery) return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of data) if (typeof value === "string" && value.trim()) params.append(key, value.trim());
    params.set("view", "deck");
    params.delete("discoveryLane");
    params.set("includeInferred", data.has("includeInferred") ? "1" : "0");
    setOpen(false);
    setMobilePreferences(false);
    startTransition(() => router.push(`${FEED_PATH}?${params}`, { scroll: false }));
  }

  return (
    <form
      ref={rootRef}
      method="GET"
      action={FEED_PATH}
      onSubmit={submitPreferences}
      className={`relative border explore-filters ${open ? "filters-open" : ""} ${discovery ? "discovery-filters" : ""} ${mobilePreferences ? "preferences-open" : ""} ${compact ? "toolbar-filters" : ""}`}
      style={{ borderColor: "var(--line)", padding: 20, marginBottom: 32 }}
    >
      {/* Without this, filtering from the list view would drop back to plan. */}
      {view && <input type="hidden" name="view" value={view} />}
      {discovery && <button type="button" className="discovery-mobile-toggle" aria-expanded={mobilePreferences} onClick={() => setMobilePreferences(v => !v)}><Icon name="filter" size={18} /><span><strong>Your preferences</strong><small>{lane === "all" ? "All opportunities" : lane === "merit" ? "College merit awards" : lane === "internship" ? "Internships" : "Scholarships"}{activeCount > 0 ? ` · ${activeCount} filters` : " · Make it yours"}</small></span><span>{mobilePreferences ? "Close" : "Edit"}</span><Icon name="chevron" size={15} /></button>}
      {!discovery && meritOnly && <input type="hidden" name="focus" value="merit" />}
      {!discovery && college && <input type="hidden" name="college" value={college} />}
      {pending && createPortal(<MatchingScreen overlay kind={lane === "internship" ? "internships" : lane === "all" ? "opportunities" : "scholarships"} />, document.body)}
      {compact && discovery && <><input type="hidden" name="kind" value={kind ?? ""} />{meritOnly && <input type="hidden" name="focus" value="merit" />}{meritOnly && <label className="field-row discovery-college"><span>College or university</span><input className="field" name="college" defaultValue={college ?? ""} placeholder="e.g. University of Nevada" /><small>Matches merit mentioned by the source. College coverage varies.</small></label>}</>}
      {discovery && !compact && <div className="discovery-lanes">
        <div className="discovery-sidebar-title"><Icon name="filter" size={17} /><span>Make it yours</span></div>
        <p>What are you looking for?</p>
        <div className="discovery-lane-options">{([
          ["all", "A little of everything", "Keep your options open", "explore"],
          ["internship", "Internships", "Build your experience", "resume"],
          ["scholarship", "Scholarships", "Fund your next chapter", "essay"],
          ["merit", "College merit awards", "Explore awards by institution", "shield"],
        ] as const).map(([value, title, subtitle, icon]) => <label key={value} className={lane === value ? "is-selected" : ""}>
          <input type="radio" name="discoveryLane" value={value} checked={lane === value} onChange={() => setLane(value)} aria-label={title} />
          <Icon name={icon} size={19} /><span><strong>{title}</strong><small>{subtitle}</small></span><i aria-hidden="true" />
        </label>)}</div>
        <input type="hidden" name="kind" value={lane === "all" ? "" : lane === "merit" ? "scholarship" : lane} />
        {lane === "merit" && <><input type="hidden" name="focus" value="merit" /><label className="field-row discovery-college"><span>College or university</span><input className="field" name="college" defaultValue={college ?? ""} placeholder="e.g. University of Nevada" /><small>Matches merit mentioned by the source. College coverage varies.</small></label></>}
      </div>}
      <div className="filter-search">
        <label className="field-row"><span className="filter-section-title">Search opportunities</span><span className="filter-search-input"><Icon name="search" size={17} /><input className="field" name="q" defaultValue={q ?? ""} placeholder="Role, organization, eligibility" /></span></label>
        <button type="submit" className="btn btn-primary filter-search-submit" disabled={pending}>{discovery ? "Find my matches" : "Search"}<Icon name="arrow" size={15} /></button>
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

      <details className="scoring-preferences">
        <summary>Academic & scoring details</summary>
        <p className="mono">Only facts relevant to a source requirement affect eligibility. Missing answers stay unknown.</p>
        {!user ? <><label className="field-row"><span>Your college or university</span><input className="field" name="school" defaultValue={scoring.school ?? ""} placeholder="Full institution name" /></label><label className="field-row"><span>Your GPA</span><input className="field" type="number" min="0" max="5" step="0.01" name="gpa" defaultValue={scoring.gpa ?? ""} placeholder="e.g. 3.7" /></label></> : <p className="mono">School and GPA come from <a href="/profile">your profile</a>. The context below applies to this search.</p>}
        <label className="field-row"><span>Your GPA scale</span><select className="field" name="gpaScale" defaultValue={scoring.gpaScale ?? ""}><option value="">Not specified</option><option value="4">4.0</option><option value="4.3">4.3</option><option value="4.5">4.5</option><option value="5">5.0</option></select></label>
        <label className="field-row"><span>Education level</span><select className="field" name="educationLevel" defaultValue={scoring.educationLevel ?? ""}><option value="">Not specified</option><option value="high_school">High school</option><option value="undergraduate">Undergraduate</option><option value="graduate">Graduate</option></select></label>
        <label className="field-row"><span>College enrollment / admission</span><select className="field" name="enrollmentStatus" defaultValue={scoring.enrollmentStatus ?? ""}><option value="">Not specified</option><option value="enrolled">Currently enrolled</option><option value="admitted">Admitted</option><option value="incoming">Incoming student</option><option value="transfer">Transfer applicant</option></select></label>
        <label className="field-row"><span>Your state of residence</span><input className="field" name="residency" defaultValue={scoring.residency ?? ""} placeholder="Full state name, e.g. Nevada" /></label>
      </details>
      <label className="field-row scoring-priority"><span>Application priority</span><select className="field" name="priority" defaultValue={scoring.priority ?? "fit"}><option value="fit">Best supported fit</option><option value="deadline">Nearer deadlines</option><option value="award">Award value</option><option value="effort">Lower estimated workload</option></select><small>Changes ordering, not personal fit. Unknown workload is never assumed to be easy.</small></label>

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
          {!discovery && <label className="field-row">
            <span className="mono chrome">kind</span>
            <select className="field" name="kind" defaultValue={kind ?? ""}>
              <option value="">internships + scholarships</option>
              <option value="internship">internships</option>
              <option value="scholarship">scholarships</option>
            </select>
          </label>}

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
            {discovery ? "Find my matches" : user ? "apply filters" : "score my feed"}
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
