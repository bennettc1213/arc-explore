"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Radar, GraduationCap, BriefcaseBusiness, Layers, Check, SlidersHorizontal, ExternalLink, Bookmark, RefreshCw, BookOpen, ShieldCheck, Clock3, CircleHelp } from "lucide-react";
import { runScout, type ScoutData } from "@/app/scout/actions";
import { focusPreferences, scoutCopy, type ScoutFocus } from "@/lib/scout/focus";
import { defaultScout, scoutSchema, type ScoutPreferences } from "@/lib/scout/types";
import { describeScout } from "@/lib/scout/history";
import type { RecentScout } from "@/lib/scout/history-store";
import { ScoutMap } from "./ScoutMap";

const steps = ["Your search", "Where & when", "Your background", "Ready to Scout"];
const storageKey = "instela.scout.preferences.v1";
const CUSTOM_OPTION = "__custom__";
const FIELD_OPTIONS = ["Computer science", "Software engineering", "Data science", "Business", "Finance", "Civil engineering", "Mechanical engineering", "Nursing", "Medicine", "Biology", "Education", "Environmental science", "Psychology", "Public health", "Law", "Arts and design"] as const;
const STATE_OPTIONS = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"] as const;
const GRADUATION_YEARS = Array.from({ length: 20 }, (_, i) => String(2026 + i));

function selectedChoice(value: string, choices: readonly string[]): string {
  return choices.includes(value) ? value : value ? CUSTOM_OPTION : "";
}

function sourceAge(checkedAt: string, observedAt: string) {
  const seconds = Math.max(0, Math.floor((Date.parse(checkedAt) - Date.parse(observedAt)) / 1000));
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} ${Math.floor(seconds / 60) === 1 ? "minute" : "minutes"}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ${Math.floor(seconds / 3600) === 1 ? "hour" : "hours"}`;
  return `${Math.floor(seconds / 86400)} ${Math.floor(seconds / 86400) === 1 ? "day" : "days"}`;
}

export function ScoutWorkspace({ focus = null, recentScouts = [] }: { focus?: ScoutFocus | null; recentScouts?: RecentScout[] }) {
  const copy = scoutCopy(focus);
  const [prefs, setPrefs] = useState<ScoutPreferences>(focus ? { ...defaultScout, ...focusPreferences(focus) } : defaultScout);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"setup" | "running" | "results">("setup");
  const [data, setData] = useState<ScoutData | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState("all");
  const [saved, setSaved] = useState<string[]>([]);
  const [customFieldMode, setCustomFieldMode] = useState(false);
  const [customLocationMode, setCustomLocationMode] = useState(false);
  const [customResidencyMode, setCustomResidencyMode] = useState(false);
  const runId = useRef(0);
  const fieldChoice = customFieldMode ? CUSTOM_OPTION : selectedChoice(prefs.field, FIELD_OPTIONS);
  const locationChoice = customLocationMode ? CUSTOM_OPTION : selectedChoice(prefs.location, STATE_OPTIONS);
  const residencyChoice = customResidencyMode ? CUSTOM_OPTION : selectedChoice(prefs.residency, STATE_OPTIONS);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = scoutSchema.safeParse(JSON.parse(raw));
          // The tool the student came from decides the kind and the merit filter.
          // With no tool, a merit setting left over from an earlier Scout is dropped,
          // since a plain Scout has nowhere to show or undo it.
          // A merit Scout also starts without the remembered field: the open merit
          // awards are few enough that a field from an earlier Scout empties them.
          if (parsed.success) setPrefs(focus ? { ...parsed.data, ...focusPreferences(focus), ...(focus === "merit" ? { field: "" } : {}) } : { ...parsed.data, merit: false, college: "" });
        }
        const bookmarks: unknown = JSON.parse(localStorage.getItem("instela.scout.bookmarks.v1") || "[]");
        if (Array.isArray(bookmarks)) setSaved(bookmarks.filter((id): id is string => typeof id === "string"));
      } catch { /* Storage may be disabled. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [focus]);
  function toggleBookmark(id: string) {
    const next = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id];
    try { localStorage.setItem("instela.scout.bookmarks.v1", JSON.stringify(next)); setSaved(next); }
    catch { setError("Your browser could not save this bookmark."); }
  }
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => setProgress(p => Math.min(96, p + 2)), 220);
    return () => clearInterval(timer);
  }, [phase]);
  function update<K extends keyof ScoutPreferences>(key: K, value: ScoutPreferences[K]) { setPrefs(p => ({ ...p, [key]: value })); }
  function reuseScout(preferences: ScoutPreferences) {
    setPrefs(preferences);
    setCustomFieldMode(!FIELD_OPTIONS.includes(preferences.field as typeof FIELD_OPTIONS[number]) && Boolean(preferences.field));
    setCustomLocationMode(!STATE_OPTIONS.includes(preferences.location as typeof STATE_OPTIONS[number]) && Boolean(preferences.location));
    setCustomResidencyMode(!STATE_OPTIONS.includes(preferences.residency as typeof STATE_OPTIONS[number]) && Boolean(preferences.residency));
    setStep(3);
    setError("");
  }
  async function launch() {
    const valid = scoutSchema.safeParse(prefs);
    if (!valid.success) { setError(valid.error.issues[0].message); setStep(0); return; }
    try { localStorage.setItem(storageKey, JSON.stringify(valid.data)); } catch { /* Running does not depend on storage. */ }
    setError(""); setProgress(0); setData(null); setPhase("running");
    const current = ++runId.current;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 700 : 11000;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let result: Awaited<ReturnType<typeof runScout>>;
    try {
      [result] = await Promise.all([
        Promise.race([runScout(valid.data).then(response => { if (response.data && current === runId.current) setData(response.data); return response; }), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("timeout")), 30000); })]),
        new Promise(resolve => setTimeout(resolve, duration)),
      ]);
    } catch {
      if (current === runId.current) { setError("The search took too long or the connection was interrupted. Your preferences are saved. Please try again."); setPhase("setup"); }
      return;
    } finally { clearTimeout(timeout); }
    if (current !== runId.current) return;
    if (result.error || !result.data) { setError(result.error || "Please try again."); setPhase("setup"); return; }
    setData(result.data); setProgress(100); setFilter("all"); setPhase("results");
  }
  function showResults() {
    if (!data) return;
    runId.current++;
    setProgress(100);
    setFilter("all");
    setPhase("results");
  }
  const allCount = data?.sections.reduce((n, section) => n + section.items.length, 0) ?? 0;
  const resultTabs = [
    { id: "all", label: "For you", count: allCount },
    { id: "new", label: "Just found", count: data?.sections.find(section => section.id === "new")?.items.length ?? 0 },
    { id: "scholarship", label: "Scholarship finds", count: data?.sections.flatMap(s => s.items).filter(item => item.kind === "scholarship").length ?? 0 },
    { id: "internship", label: "Internship openings", count: data?.sections.flatMap(s => s.items).filter(item => item.kind === "internship").length ?? 0 },
  ];
  const visibleSections = data?.sections
    .filter(section => filter !== "new" || section.id === "new")
    .map(section => ({ ...section, items: section.items.filter(item => filter === "scholarship" || filter === "internship" ? item.kind === filter : true) }))
    .filter(section => section.items.length > 0) ?? [];
  return <main className="wrap scout-page">
    <nav className="scout-topline"><Link href="/portal"><ArrowLeft size={15} /> Portal</Link><Link href="/memory"><BookOpen size={15} /> Application Memory</Link></nav>
    <header className="scout-heading"><div className="scout-kicker"><Radar size={16} /> {copy.kicker} <span>SEARCH WORKSPACE</span></div><h1>{phase === "results" ? "Look what turned up." : phase === "running" ? "Following your interests." : copy.heading}</h1><p>{phase === "results" ? `${prefs.field ? `${prefs.field} / ` : ""}${prefs.location ? `${prefs.location} / ` : ""}${prefs.merit && prefs.college ? `${prefs.college} / ` : ""}${prefs.merit ? "College merit awards" : prefs.kind === "both" ? "Internships + scholarships" : prefs.kind === "internship" ? "Internships" : "Scholarships"}` : phase === "running" ? "Matching your preferences with source-backed opportunities in the Instela index." : copy.intro}</p></header>

    {phase === "setup" && <div className="scout-setup-grid"><section className="scout-form-surface">
      {!focus && recentScouts.length > 0 && <section className="recent-scouts" aria-label="Recent Scouts"><div><span className="scout-step-label">RECENT SCOUTS</span><p>Pick up a previous search without rebuilding its filters.</p></div><div className="recent-scout-list">{recentScouts.map(scout => <button type="button" key={scout.id} onClick={() => reuseScout(scout.preferences)}><strong>{describeScout(scout.preferences)}</strong><span>Use this Scout <ArrowRight size={12} /></span></button>)}</div></section>}
      <ol className="scout-steps">{steps.map((label, index) => <li key={label} className={index === step ? "current" : index < step ? "complete" : ""}><span>{index < step ? <Check size={12} /> : index + 1}</span><small>{label}</small></li>)}</ol>
      <form onSubmit={event => { event.preventDefault(); setError(""); if (step < 3) setStep(step + 1); else void launch(); }}>
        <div className="scout-step-content">
        {step === 0 && <><span className="scout-step-label">01 / THE DIRECTION</span><h2>{focus ? "What are you studying or drawn to?" : "What are you looking for?"}</h2>{focus ? <p className="scout-storage-note" style={{ marginBottom: 14 }}>Scouting {copy.noun}. <Link href="/scout" style={{ color: "var(--accent)" }}>Search something else</Link></p> : <div className="scout-kind-options">{([{ value: "both", label: "A bit of both", icon: Layers }, { value: "internship", label: "Internships", icon: BriefcaseBusiness }, { value: "scholarship", label: "Scholarships", icon: GraduationCap }] as const).map(option => <button key={option.value} type="button" aria-pressed={prefs.kind === option.value} onClick={() => update("kind", option.value)}><option.icon size={22} /><span>{option.label}</span>{prefs.kind === option.value && <Check size={14} />}</button>)}</div>}<label className="scout-field">Academic or career interest (optional)<select autoFocus value={fieldChoice} onChange={e => { if (e.target.value === CUSTOM_OPTION) { setCustomFieldMode(true); update("field", ""); } else { setCustomFieldMode(false); update("field", e.target.value); } }}><option value="">Explore broadly</option>{FIELD_OPTIONS.map(field => <option key={field} value={field}>{field}</option>)}<option value={CUSTOM_OPTION}>Another field or interest</option></select></label>{fieldChoice === CUSTOM_OPTION && <label className="scout-field">Your field or interest<input maxLength={100} value={prefs.field} onChange={e => update("field", e.target.value)} placeholder="e.g. Urban planning" /></label>}<p className="scout-storage-note">Your interest ranks results first. It does not remove opportunities that use different wording.</p>{prefs.merit && <label className="scout-field" style={{ marginTop: 18 }}>College or university (optional)<input maxLength={160} value={prefs.college} onChange={e => update("college", e.target.value)} placeholder="e.g. University of Nevada" /></label>}</>}
        {step === 1 && <><span className="scout-step-label">02 / THE SEARCH AREA</span><h2>Where could you see yourself?</h2><label className="scout-field">Location preference (optional)<select value={locationChoice} onChange={e => { if (e.target.value === CUSTOM_OPTION) { setCustomLocationMode(true); update("location", ""); } else { setCustomLocationMode(false); update("location", e.target.value); } }}><option value="">Anywhere</option>{STATE_OPTIONS.map(state => <option key={state} value={state}>{state}</option>)}<option value={CUSTOM_OPTION}>Another city, state, or region</option></select></label>{locationChoice === CUSTOM_OPTION && <label className="scout-field">City, state, or region<input autoFocus maxLength={100} value={prefs.location} onChange={e => update("location", e.target.value)} placeholder="e.g. Denver or Pacific Northwest" /></label>}<label className="scout-field">Work setting<select value={prefs.remote ? "remote" : "flexible"} onChange={e => update("remote", e.target.value === "remote")}><option value="flexible">Flexible — show all work settings</option><option value="remote">Remote opportunities only</option></select></label><label className="scout-field">What should come first?<select value={prefs.priority} onChange={e => update("priority", e.target.value as ScoutPreferences["priority"])}><option value="fit">Personal relevance</option><option value="deadline">Upcoming deadlines</option><option value="award">Scholarship value</option></select></label><label className="scout-field">Graduation year (optional)<select value={prefs.gradYear === "" ? "" : String(prefs.gradYear)} onChange={e => update("gradYear", e.target.value ? Number(e.target.value) : "")}><option value="">Not specified</option>{GRADUATION_YEARS.map(year => <option key={year} value={year}>{year}</option>)}</select></label><p className="scout-storage-note">Location ranks flexible results higher. “Remote opportunities only” is the one work-setting filter that narrows your results.</p></>}
        {step === 2 && <><span className="scout-step-label">03 / YOUR CONTEXT</span><h2>A few details go a long way.</h2><label className="scout-field">School (optional)<input maxLength={160} value={prefs.school} onChange={e => update("school", e.target.value)} placeholder="Your college or university" /></label>{prefs.kind !== "scholarship" && <label className="scout-field">Work authorization<select value={prefs.workAuth} onChange={e => update("workAuth", e.target.value as ScoutPreferences["workAuth"])}><option value="">Prefer not to say</option><option value="us_citizen">U.S. citizen</option><option value="permanent_resident">Permanent resident</option><option value="needs_sponsorship">Need sponsorship</option></select></label>}{prefs.kind !== "internship" && <><div className="scout-field-pair"><label className="scout-field">GPA (optional)<input type="number" step="0.01" min={0} max={Number(prefs.gpaScale)} value={prefs.gpa} onChange={e => update("gpa", e.target.value ? Number(e.target.value) : "")} /></label><label className="scout-field">GPA scale<select value={prefs.gpaScale} onChange={e => update("gpaScale", e.target.value as ScoutPreferences["gpaScale"])}>{["4", "4.3", "4.5", "5"].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div><label className="scout-field">State of residence (optional)<select value={residencyChoice} onChange={e => { if (e.target.value === CUSTOM_OPTION) { setCustomResidencyMode(true); update("residency", ""); } else { setCustomResidencyMode(false); update("residency", e.target.value); } }}><option value="">Not specified</option>{STATE_OPTIONS.map(state => <option key={state} value={state}>{state}</option>)}<option value={CUSTOM_OPTION}>Another country or region</option></select></label>{residencyChoice === CUSTOM_OPTION && <label className="scout-field">Country or region<input autoFocus maxLength={100} value={prefs.residency} onChange={e => update("residency", e.target.value)} placeholder="e.g. Ontario or Canada" /></label>}</>}</>}
        {step === 3 && <><span className="scout-step-label">04 / YOUR SCOUT</span><h2>Let&apos;s see what&apos;s out there.</h2><dl className="scout-review"><div><dt>Looking for</dt><dd>{prefs.merit ? "College merit awards" : prefs.kind === "both" ? "Internships + scholarships" : prefs.kind}</dd></div><div><dt>Following</dt><dd>{prefs.field || "Any field"}</dd></div>{prefs.merit && <div><dt>College</dt><dd>{prefs.college || "Any"}</dd></div>}<div><dt>Location</dt><dd>{prefs.remote ? "Remote only" : prefs.location || "Anywhere"}</dd></div><div><dt>Priority</dt><dd>{prefs.priority === "fit" ? "Personal relevance" : prefs.priority === "award" ? "Scholarship value" : "Upcoming deadlines"}</dd></div><div><dt>School</dt><dd>{prefs.school || "Not specified"}</dd></div></dl><p className="scout-storage-note">Your last few Scouts are saved to your account. Results come from the current Instela index.</p></>}
        </div>{error && <p role="alert" className="scout-error">{error}</p>}
        <div className="scout-form-footer">{step > 0 ? <button type="button" className="scout-text-button" onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Back</button> : <span className="scout-storage-note">{step + 1} of 4</span>}<button className="btn btn-primary" type="submit">{step === 3 ? "Go. Start my Scout" : "Continue"}{step === 3 ? <Radar size={18} /> : <ArrowRight size={18} />}</button></div>
      </form></section><aside className="scout-visual-side"><ScoutMap field={prefs.field} /><div className="scout-side-note"><ShieldCheck size={18} /><div><strong>A clearer starting point.</strong><p>Source checks, stated requirements, and real dates travel with your results.</p></div></div></aside></div>}

    {phase === "running" && <section className="scout-run"><ScoutMap active field={prefs.field} /><div className="scout-run-status" role="status"><span>{progress < 30 ? "Following your field, school, and location" : progress < 60 ? "Finding source-backed opportunities" : progress < 85 ? "Reading eligibility and source timestamps" : "Putting your best starting points together"}</span><span>{progress}%</span></div><progress max={100} value={progress} /><div className="scout-run-reassurance">{data ? <><strong><Check size={15} /> {data.total.toLocaleString()} matches located in the index</strong><span>{data.sourceSummary.scholarships} scholarships + {data.sourceSummary.internships} internships in this result set</span><span>{data.sourceSummary.recentlyChecked} listings checked within the last 24 hours</span><span>{data.sourceSummary.latestSourceCheck ? `Latest source observation: ${sourceAge(data.checkedAt, data.sourceSummary.latestSourceCheck)} before this search` : "Source timestamps travel with your results"}</span></> : <><strong><ShieldCheck size={15} /> Every result keeps its source.</strong><span>Matching your interests, checking stated requirements, and carrying source dates into your results.</span></>}</div><div className="scout-run-controls"><button className="scout-text-button" onClick={() => { runId.current++; setPhase("setup"); }}>Cancel search</button>{data && <button className="btn btn-primary" onClick={showResults}>Show results <ArrowRight size={15} /></button>}</div></section>}

    {phase === "results" && data && <section className="scout-results">{error && <p role="alert" className="scout-error">{error}</p>}<div className="scout-result-toolbar"><div><strong>{allCount} opportunities</strong><span>{data.total} match your search</span></div><div><button className="btn" onClick={() => setPhase("setup")}><SlidersHorizontal size={15} /> Edit Scout</button><button className="btn" onClick={() => void launch()} title="Run Scout again" aria-label="Run Scout again"><RefreshCw size={16} /></button></div></div><nav className="scout-result-tabs" aria-label="Result categories">{resultTabs.map(tab => <button key={tab.id} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</nav>{allCount > 0 && visibleSections.length === 0 && <div className="scout-empty"><Radar size={32} /><h2>{filter === "new" ? "Nothing newly discovered in this set." : "No matches in this category yet."}</h2><p>Try another category, or adjust your Scout to widen the search.</p><button className="btn" onClick={() => setFilter("all")}>See all my matches <ArrowRight size={16} /></button></div>}
      {!allCount && <div className="scout-empty"><Radar size={40} /><h2>No current opportunities fit those must-have filters.</h2><p>{prefs.merit ? "Merit awards and a named college are strict filters. Try clearing the college to see all available merit awards." : prefs.remote ? "No remote-only opportunities are in the current index. Switch Work setting to Flexible to include every work setting." : "Your field and location only rank results; they do not exclude them. Try another opportunity type or check back as sources refresh."}</p><button className="btn btn-primary" onClick={() => { setStep(0); setPhase("setup"); }}>Adjust my Scout <ArrowRight size={16} /></button></div>}
      {visibleSections.map(section => <section key={section.id} className="scout-result-section"><header><h2>{section.title}</h2><p>{section.description}</p></header>{section.items.map(card => <article key={card.id} className="scout-result-row"><div className={`scout-result-symbol ${card.kind}`} >{card.kind === "scholarship" ? <GraduationCap size={23} /> : <BriefcaseBusiness size={23} />}</div><div className="scout-result-main"><div className="scout-result-meta"><span>{card.company}</span><span>{card.kind === "scholarship" ? "Scholarship" : "Internship"}</span></div><Link className="scout-result-title" href={`/listing/${card.id}`}>{card.title}</Link><div className="scout-result-facts"><span>{card.locations.join(" / ") || "Location not stated"}</span><span>{card.award || card.compensation}</span>{card.deadline && <span>Apply by {card.deadline}</span>}</div><div className={`scout-freshness freshness-${card.freshness.state}`}>{card.freshness.state === "recent" ? <Check size={13} /> : card.freshness.state === "older" ? <Clock3 size={13} /> : <CircleHelp size={13} />}<span>{card.verified}</span>{card.freshness.foundLabel && <span className="scout-found-label">{card.freshness.foundLabel}</span>}{card.bucketLabel && <span className="scout-fit-label">{card.bucketLabel}</span>}</div>{card.warnings.length > 0 && <p className="scout-warning">{card.warnings[0]}</p>}</div><div className="scout-result-actions"><Link className="btn" href={`/listing/${card.id}/apply`}>Prepare <ArrowRight size={14} /></Link><a href={card.url} target="_blank" rel="noopener noreferrer" title="Open listing source" aria-label={`Open source for ${card.title}`}><ExternalLink size={16} /></a><button title={saved.includes(card.id) ? "Remove browser bookmark" : "Bookmark on this browser"} aria-label={saved.includes(card.id) ? "Remove browser bookmark" : "Bookmark on this browser"} aria-pressed={saved.includes(card.id)} onClick={() => toggleBookmark(card.id)}><Bookmark size={16} fill={saved.includes(card.id) ? "currentColor" : "none"} /></button></div></article>)}</section>)}
      {!data.full && data.total > allCount && <div className="scout-upgrade"><p>Your free Scout shows up to 10 matches. Pro unlocks the full result set.</p><Link className="btn" href="/pricing">See Pro <ArrowRight size={15} /></Link></div>}<p className="scout-storage-note">Fit describes alignment with available evidence. It does not predict selection or scholarship awards.</p>
    </section>}
  </main>;
}
