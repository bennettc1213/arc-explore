"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Radar, GraduationCap, BriefcaseBusiness, Layers, Check, SlidersHorizontal, ExternalLink, Bookmark, RefreshCw, BookOpen, ShieldCheck, Clock3, CircleHelp } from "lucide-react";
import { runScout, type ScoutData } from "@/app/scout/actions";
import { focusPreferences, scoutCopy, scoutHref, type ScoutFocus } from "@/lib/scout/focus";
import { defaultScout, scoutSchema, type ScoutPreferences } from "@/lib/scout/types";
import { describeScout, scoutFingerprint } from "@/lib/scout/history";
import type { RecentScout } from "@/lib/scout/history-store";
import { ScoutMap } from "./ScoutMap";
import { INTERESTS, INTEREST_GROUPS, findInterest } from "@/lib/scout/interests";
import { STATE_OPTIONS } from "@/lib/scout/places";
import { parseScoutText } from "@/lib/scout/query";

const steps = ["Your search", "Where & when", "Your background", "Ready to Scout"];
const storageKey = "instela.scout.preferences.v1";
const CUSTOM_OPTION = "__custom__";
const FIELD_OPTIONS = INTERESTS.map(interest => interest.label);
const GRADUATION_YEARS = Array.from({ length: 20 }, (_, i) => String(2026 + i));
const DEADLINE_LABELS: Record<ScoutPreferences["deadline"], string> = { any: "Any deadline", "14": "Within 2 weeks", "30": "Within 30 days", "90": "Within 90 days" };
const AWARD_LABELS: Record<ScoutPreferences["minAward"], string> = { "0": "Any amount", "1000": "$1,000 or more", "5000": "$5,000 or more", "10000": "$10,000 or more" };

/** What the interest box will be read as, shown before the Scout runs. */
function interestPreview(field: string) {
  const parsed = parseScoutText(field);
  const found = findInterest(parsed.interest);
  const terms = found ? found.interest.terms.slice(0, 6).map(term => term.replace(/!$/, "")) : [];
  return { parsed, label: found && found.how !== "contains" ? found.interest.label : parsed.interest, terms };
}

function selectedChoice(value: string, choices: readonly string[]): string {
  return choices.includes(value) ? value : value ? CUSTOM_OPTION : "";
}

/** One line saying how exact the result set is and what was relaxed to fill it. */
function scoutSummary(shown: number, bestShown: number, bestTotal: number, interest: string, relaxed: string[]): string {
  if (shown === 0) return "None passed your must-have filters";
  const softened = relaxed.filter(name => name !== "interest");
  const rest = softened.length ? `outside ${softened.join(", ")}` : "related and broader listings";
  if (bestTotal === 0) return `No exact matches${interest ? ` for ${interest}` : ""} right now, so these are the closest`;
  const exact = `${bestTotal.toLocaleString()} exact ${bestTotal === 1 ? "match" : "matches"}`;
  return shown > bestShown ? `${exact}, then ${rest}` : exact;
}

function sourceAge(checkedAt: string, observedAt: string) {
  const seconds = Math.max(0, Math.floor((Date.parse(checkedAt) - Date.parse(observedAt)) / 1000));
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} ${Math.floor(seconds / 60) === 1 ? "minute" : "minutes"}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ${Math.floor(seconds / 3600) === 1 ? "hour" : "hours"}`;
  return `${Math.floor(seconds / 86400)} ${Math.floor(seconds / 86400) === 1 ? "day" : "days"}`;
}

export function ScoutWorkspace({ focus = null, recentScouts = [], memoryOwner = "guest" }: { focus?: ScoutFocus | null; recentScouts?: RecentScout[]; memoryOwner?: string }) {
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
  const [memories, setMemories] = useState(recentScouts);
  const [resultPath, setResultPath] = useState(scoutHref(focus));
  const snapshotId = useRef<string | null>(null);
  const snapshotKey = `instela.scout.results.v1:${memoryOwner}:`;
  const memoryKey = `${storageKey}:${memoryOwner}`;
  const recentKey = `instela.scout.history.v1:${memoryOwner}`;
  function rememberLocally(preferences: ScoutPreferences) {
    const entry = { id: scoutFingerprint(preferences), preferences, updatedAt: new Date().toISOString() };
    setMemories(previous => {
      const next = [entry, ...previous.filter(item => scoutFingerprint(item.preferences) !== entry.id)].slice(0, 5);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* Optional browser memory. */ }
      return next;
    });
  }
  const fieldChoice = customFieldMode ? CUSTOM_OPTION : selectedChoice(prefs.field, FIELD_OPTIONS);
  const locationChoice = customLocationMode ? CUSTOM_OPTION : selectedChoice(prefs.location, STATE_OPTIONS);
  const residencyChoice = customResidencyMode ? CUSTOM_OPTION : selectedChoice(prefs.residency, STATE_OPTIONS);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const localHistory: unknown = JSON.parse(localStorage.getItem(recentKey) || "[]");
        const entries = [...recentScouts];
        if (Array.isArray(localHistory)) for (const entry of localHistory) {
          const parsed = scoutSchema.safeParse(entry?.preferences);
          if (parsed.success && !entries.some(item => scoutFingerprint(item.preferences) === scoutFingerprint(parsed.data))) entries.push({ id: scoutFingerprint(parsed.data), preferences: parsed.data, updatedAt: String(entry.updatedAt) });
        }
        entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        setMemories(entries.slice(0, 5));
        const latest = entries.find(item => !focus || (item.preferences.kind === focusPreferences(focus).kind && item.preferences.merit === focusPreferences(focus).merit));
        const raw = localStorage.getItem(memoryKey);
        if (raw) {
          const parsed = scoutSchema.safeParse(JSON.parse(raw));
          // The selected tool fixes the opportunity type; other preferences persist.
          if (parsed.success) { setPrefs(focus ? { ...parsed.data, ...focusPreferences(focus) } : parsed.data); setStep(3); }
        }
        if (latest) { setPrefs(latest.preferences); setStep(3); }
        const bookmarks: unknown = JSON.parse(localStorage.getItem("instela.scout.bookmarks.v1") || "[]");
        if (Array.isArray(bookmarks)) setSaved(bookmarks.filter((id): id is string => typeof id === "string"));
      } catch { /* Storage may be disabled. */ }
      // Restore the exact result set represented by this browser history entry.
      try {
        const id = new URL(window.location.href).searchParams.get("run");
        if (id) {
          const snapshot = JSON.parse(sessionStorage.getItem(snapshotKey + id) || "null");
          const parsed = scoutSchema.safeParse(snapshot?.preferences);
          // `emptyBecause` marks the tiered shape (2026-11-10); an older snapshot is rerun instead.
          if (parsed.success && Array.isArray(snapshot?.data?.sections) && Array.isArray(snapshot?.data?.emptyBecause)) {
            snapshotId.current = id;
            setPrefs(parsed.data); setData(snapshot.data); setFilter(snapshot.filter || "all"); setPhase("results");
            setResultPath(window.location.pathname + window.location.search);
            requestAnimationFrame(() => window.scrollTo(0, snapshot.scrollY || 0));
          }
        }
      } catch { /* An expired or unavailable result snapshot can be rerun from memory. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, memoryKey, recentKey, recentScouts, snapshotKey]);
  useEffect(() => {
    if (phase !== "results" || !data || !snapshotId.current) return;
    const key = snapshotKey + snapshotId.current;
    const persist = () => {
      try { sessionStorage.setItem(key, JSON.stringify({ preferences: prefs, data, filter, scrollY: window.scrollY })); }
      catch { /* Returning still works when the browser disallows storage. */ }
    };
    persist();
    window.addEventListener("scroll", persist, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => { window.removeEventListener("scroll", persist); window.removeEventListener("pagehide", persist); };
  }, [data, filter, phase, prefs, snapshotKey]);
  function enterResults() {
    const id = crypto.randomUUID();
    snapshotId.current = id;
    const url = new URL(scoutHref(focus), window.location.origin);
    url.searchParams.set("run", id);
    const path = url.pathname + url.search;
    window.history.replaceState(null, "", path);
    setResultPath(path);
    setProgress(100); setFilter("all"); setPhase("results");
  }
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
  async function launch(preferences: ScoutPreferences = prefs) {
    const valid = scoutSchema.safeParse(preferences);
    if (!valid.success) { setError(valid.error.issues[0].message); setStep(0); return; }
    setPrefs(valid.data);
    try { localStorage.setItem(memoryKey, JSON.stringify(valid.data)); } catch { /* Running does not depend on storage. */ }
    rememberLocally(valid.data);
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
    setData(result.data); enterResults();
  }
  function showResults() {
    if (!data) return;
    runId.current++;
    enterResults();
  }
  const allCount = data?.sections.reduce((n, section) => n + section.items.length, 0) ?? 0;
  const resultTabs = [
    { id: "all", label: "For you", count: allCount },
    { id: "new", label: "Just found", count: data?.sections.flatMap(s => s.items).filter(item => item.isNew).length ?? 0 },
    { id: "scholarship", label: "Scholarship finds", count: data?.sections.flatMap(s => s.items).filter(item => item.kind === "scholarship").length ?? 0 },
    { id: "internship", label: "Internship openings", count: data?.sections.flatMap(s => s.items).filter(item => item.kind === "internship").length ?? 0 },
  ];
  // Tabs filter across every tier; a tier keeps its own heading either way.
  const visibleSections = data?.sections
    .map(section => ({ ...section, items: section.items.filter(item => filter === "new" ? item.isNew : filter === "scholarship" || filter === "internship" ? item.kind === filter : true) }))
    .filter(section => section.items.length > 0) ?? [];
  const bestShown = data?.sections.find(section => section.id === "best")?.items.length ?? 0;
  const relaxedNames = [...new Set(data?.sections.flatMap(section => section.relaxed ?? []) ?? [])];
  return <main className="wrap scout-page">
    <nav className="scout-topline"><Link href="/portal"><ArrowLeft size={15} /> Portal</Link><Link href="/memory"><BookOpen size={15} /> Application Memory</Link></nav>
    <header className="scout-heading"><div className="scout-kicker"><Radar size={16} /> {copy.kicker} <span>SEARCH WORKSPACE</span></div><h1>{phase === "results" ? "Look what turned up." : phase === "running" ? "Following your interests." : copy.heading}</h1><p>{phase === "results" ? `${prefs.field ? `${prefs.field} / ` : ""}${prefs.location ? `${prefs.location} / ` : ""}${prefs.merit && prefs.college ? `${prefs.college} / ` : ""}${prefs.merit ? "College merit awards" : prefs.kind === "both" ? "Internships + scholarships" : prefs.kind === "internship" ? "Internships" : "Scholarships"}` : phase === "running" ? "Matching your preferences with source-backed opportunities in the Instela index." : copy.intro}</p></header>

    {phase === "setup" && <div className="scout-setup-grid"><section className="scout-form-surface">
      {memories.length > 0 && <section className="recent-scouts" aria-label="Scout memory"><div><span className="scout-step-label">SCOUT MEMORY</span><p>{memoryOwner === "guest" ? "Remembered on this browser." : "Your recent Scouts are saved to your account."} Run the same search again or edit its preferences.</p></div><div className="recent-scout-list">{memories.map(scout => <div key={scout.id}><button type="button" onClick={() => void launch(scout.preferences)}><strong>{describeScout(scout.preferences)}</strong><span>Run this Scout <ArrowRight size={12} /></span></button><button type="button" onClick={() => reuseScout(scout.preferences)}>Edit preferences</button></div>)}</div></section>}
      <ol className="scout-steps">{steps.map((label, index) => <li key={label} className={index === step ? "current" : index < step ? "complete" : ""}><span>{index < step ? <Check size={12} /> : index + 1}</span><small>{label}</small></li>)}</ol>
      <form onSubmit={event => { event.preventDefault(); setError(""); if (step < 3) setStep(step + 1); else void launch(); }}>
        <div className="scout-step-content">
        {step === 0 && <><span className="scout-step-label">01 / THE DIRECTION</span><h2>{focus ? "What are you studying or drawn to?" : "What are you looking for?"}</h2>{focus ? <p className="scout-storage-note" style={{ marginBottom: 14 }}>Scouting {copy.noun}. <Link href="/scout" style={{ color: "var(--accent)" }}>Search something else</Link></p> : <div className="scout-kind-options">{([{ value: "both", label: "A bit of both", icon: Layers }, { value: "internship", label: "Internships", icon: BriefcaseBusiness }, { value: "scholarship", label: "Scholarships", icon: GraduationCap }] as const).map(option => <button key={option.value} type="button" aria-pressed={prefs.kind === option.value} onClick={() => update("kind", option.value)}><option.icon size={22} /><span>{option.label}</span>{prefs.kind === option.value && <Check size={14} />}</button>)}</div>}<label className="scout-field">Academic or career interest (optional)<select autoFocus value={fieldChoice} onChange={e => { if (e.target.value === CUSTOM_OPTION) { setCustomFieldMode(true); update("field", ""); } else { setCustomFieldMode(false); update("field", e.target.value); } }}><option value="">Explore broadly</option>{INTEREST_GROUPS.map(group => <optgroup key={group} label={group}>{INTERESTS.filter(interest => interest.group === group).map(interest => <option key={interest.label} value={interest.label}>{interest.label}</option>)}</optgroup>)}<option value={CUSTOM_OPTION}>Something else (type it)</option></select></label>{fieldChoice === CUSTOM_OPTION && <label className="scout-field">Your field or interest<input maxLength={100} value={prefs.field} onChange={e => update("field", e.target.value)} placeholder="e.g. Marine biology, class of 2028" /></label>}{prefs.field && (() => { const preview = interestPreview(prefs.field); return <p className="scout-storage-note">{fieldChoice === CUSTOM_OPTION && <>Reading this as <strong>{preview.label || "any field"}</strong>{preview.parsed.gradYear ? <> · class of {preview.parsed.gradYear}</> : null}{preview.parsed.location ? <> · {preview.parsed.location}</> : null}{preview.parsed.remote ? <> · remote preferred</> : null}. </>}{preview.terms.length > 0 && <>Also looking for: {preview.terms.join(", ")}.</>}</p>; })()}<p className="scout-storage-note">Exact matches come first, then related ones. Nothing is hidden for using different wording.</p>{prefs.merit && <label className="scout-field" style={{ marginTop: 18 }}>College or university (optional)<input maxLength={160} value={prefs.college} onChange={e => update("college", e.target.value)} placeholder="e.g. University of Nevada" /></label>}</>}
        {step === 1 && <><span className="scout-step-label">02 / THE SEARCH AREA</span><h2>Where could you see yourself?</h2><label className="scout-field">Location preference (optional)<select value={locationChoice} onChange={e => { if (e.target.value === CUSTOM_OPTION) { setCustomLocationMode(true); update("location", ""); } else { setCustomLocationMode(false); update("location", e.target.value); } }}><option value="">Anywhere</option>{STATE_OPTIONS.map(state => <option key={state} value={state}>{state}</option>)}<option value={CUSTOM_OPTION}>Another city, state, or region</option></select></label>{locationChoice === CUSTOM_OPTION && <label className="scout-field">City, state, or region<input autoFocus maxLength={100} value={prefs.location} onChange={e => update("location", e.target.value)} placeholder="e.g. Denver or Pacific Northwest" /></label>}{prefs.location && <label className="scout-field">How strict is the location?<select value={prefs.locationStrict ? "strict" : "prefer"} onChange={e => update("locationStrict", e.target.value === "strict")}><option value="prefer">Prefer it — show other places after</option><option value="strict">Only this area</option></select></label>}<label className="scout-field">Work setting<select value={prefs.remote ? "remote" : "flexible"} onChange={e => update("remote", e.target.value === "remote")}><option value="flexible">Flexible — show all work settings</option><option value="remote">Remote opportunities only</option></select></label><label className="scout-field">What should come first?<select value={prefs.priority} onChange={e => update("priority", e.target.value as ScoutPreferences["priority"])}><option value="fit">Personal relevance</option><option value="deadline">Upcoming deadlines</option><option value="award">Scholarship value</option></select></label><label className="scout-field">Graduation year (optional)<select value={prefs.gradYear === "" ? "" : String(prefs.gradYear)} onChange={e => update("gradYear", e.target.value ? Number(e.target.value) : "")}><option value="">Not specified</option>{GRADUATION_YEARS.map(year => <option key={year} value={year}>{year}</option>)}</select></label><label className="scout-field">Deadline<select value={prefs.deadline} onChange={e => update("deadline", e.target.value as ScoutPreferences["deadline"])}>{(Object.keys(DEADLINE_LABELS) as ScoutPreferences["deadline"][]).map(value => <option key={value} value={value}>{DEADLINE_LABELS[value]}</option>)}</select></label>{prefs.kind !== "internship" && <label className="scout-field">Scholarship amount<select value={prefs.minAward} onChange={e => update("minAward", e.target.value as ScoutPreferences["minAward"])}>{(Object.keys(AWARD_LABELS) as ScoutPreferences["minAward"][]).map(value => <option key={value} value={value}>{AWARD_LABELS[value]}</option>)}</select></label>}<p className="scout-storage-note">Location, deadline and amount are preferences: listings that meet them come first, and close matches still show after. “Remote opportunities only” and “Only this area” are the filters that narrow your results.</p></>}
        {step === 2 && <><span className="scout-step-label">03 / YOUR CONTEXT</span><h2>A few details go a long way.</h2><label className="scout-field">School (optional)<input maxLength={160} value={prefs.school} onChange={e => update("school", e.target.value)} placeholder="Your college or university" /></label>{prefs.kind !== "scholarship" && <label className="scout-field">Work authorization<select value={prefs.workAuth} onChange={e => update("workAuth", e.target.value as ScoutPreferences["workAuth"])}><option value="">Prefer not to say</option><option value="us_citizen">U.S. citizen</option><option value="permanent_resident">Permanent resident</option><option value="needs_sponsorship">Need sponsorship</option></select></label>}{prefs.kind !== "internship" && <><div className="scout-field-pair"><label className="scout-field">GPA (optional)<input type="number" step="0.01" min={0} max={Number(prefs.gpaScale)} value={prefs.gpa} onChange={e => update("gpa", e.target.value ? Number(e.target.value) : "")} /></label><label className="scout-field">GPA scale<select value={prefs.gpaScale} onChange={e => update("gpaScale", e.target.value as ScoutPreferences["gpaScale"])}>{["4", "4.3", "4.5", "5"].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div><label className="scout-field">State of residence (optional)<select value={residencyChoice} onChange={e => { if (e.target.value === CUSTOM_OPTION) { setCustomResidencyMode(true); update("residency", ""); } else { setCustomResidencyMode(false); update("residency", e.target.value); } }}><option value="">Not specified</option>{STATE_OPTIONS.map(state => <option key={state} value={state}>{state}</option>)}<option value={CUSTOM_OPTION}>Another country or region</option></select></label>{residencyChoice === CUSTOM_OPTION && <label className="scout-field">Country or region<input autoFocus maxLength={100} value={prefs.residency} onChange={e => update("residency", e.target.value)} placeholder="e.g. Ontario or Canada" /></label>}</>}</>}
        {step === 3 && <><span className="scout-step-label">04 / YOUR SCOUT</span><h2>Let&apos;s see what&apos;s out there.</h2><dl className="scout-review"><div><dt>Looking for</dt><dd>{prefs.merit ? "College merit awards" : prefs.kind === "both" ? "Internships + scholarships" : prefs.kind}</dd></div><div><dt>Following</dt><dd>{prefs.field || "Any field"}</dd></div>{prefs.merit && <div><dt>College</dt><dd>{prefs.college || "Any"}</dd></div>}<div><dt>Location</dt><dd>{prefs.remote ? "Remote only" : prefs.location ? `${prefs.location}${prefs.locationStrict ? " only" : " preferred"}` : "Anywhere"}</dd></div>{prefs.gradYear !== "" && <div><dt>Graduating</dt><dd>{prefs.gradYear}</dd></div>}{prefs.deadline !== "any" && <div><dt>Deadline</dt><dd>{DEADLINE_LABELS[prefs.deadline]}</dd></div>}{prefs.minAward !== "0" && prefs.kind !== "internship" && <div><dt>Amount</dt><dd>{AWARD_LABELS[prefs.minAward]}</dd></div>}<div><dt>Priority</dt><dd>{prefs.priority === "fit" ? "Personal relevance" : prefs.priority === "award" ? "Scholarship value" : "Upcoming deadlines"}</dd></div><div><dt>School</dt><dd>{prefs.school || "Not specified"}</dd></div></dl><p className="scout-storage-note">Your last few Scouts are saved to your account. Results come from the current Instela index.</p></>}
        </div>{error && <p role="alert" className="scout-error">{error}</p>}
        <div className="scout-form-footer">{step > 0 ? <button type="button" className="scout-text-button" onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Back</button> : <span className="scout-storage-note">{step + 1} of 4</span>}<button className="btn btn-primary" type="submit">{step === 3 ? "Go. Start my Scout" : "Continue"}{step === 3 ? <Radar size={18} /> : <ArrowRight size={18} />}</button></div>
      </form></section></div>}

    {phase === "running" && <section className="scout-run"><ScoutMap active field={prefs.field} /><div className="scout-run-status" role="status"><span>{progress < 30 ? "Following your field, school, and location" : progress < 60 ? "Finding source-backed opportunities" : progress < 85 ? "Reading eligibility and source timestamps" : "Putting your best starting points together"}</span><span>{progress}%</span></div><progress max={100} value={progress} /><div className="scout-run-reassurance">{data ? <><strong><Check size={15} /> {data.total.toLocaleString()} matches located in the index</strong><span>{data.sourceSummary.scholarships} scholarships + {data.sourceSummary.internships} internships in this result set</span><span>{data.sourceSummary.recentlyChecked} listings checked within the last 24 hours</span><span>{data.sourceSummary.latestSourceCheck ? `Latest source observation: ${sourceAge(data.checkedAt, data.sourceSummary.latestSourceCheck)} before this search` : "Source timestamps travel with your results"}</span></> : <><strong><ShieldCheck size={15} /> Every result keeps its source.</strong><span>Matching your interests, checking stated requirements, and carrying source dates into your results.</span></>}</div><div className="scout-run-controls"><button className="scout-text-button" onClick={() => { runId.current++; setPhase("setup"); }}>Cancel search</button>{data && <button className="btn btn-primary" onClick={showResults}>Show results <ArrowRight size={15} /></button>}</div></section>}

    {phase === "results" && data && <section className="scout-results">{error && <p role="alert" className="scout-error">{error}</p>}<div className="scout-result-toolbar"><div><strong>{allCount} opportunities</strong><span>{scoutSummary(allCount, bestShown, data.bestTotal, data.interest, relaxedNames)}</span></div><div><button className="btn" onClick={() => setPhase("setup")}><SlidersHorizontal size={15} /> Edit Scout</button><button className="btn" onClick={() => void launch()} title="Run Scout again" aria-label="Run Scout again"><RefreshCw size={16} /></button></div></div><nav className="scout-result-tabs" aria-label="Result categories">{resultTabs.map(tab => <button key={tab.id} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</nav>{allCount > 0 && visibleSections.length === 0 && <div className="scout-empty"><Radar size={32} /><h2>{filter === "new" ? "Nothing newly discovered in this set." : "No matches in this category yet."}</h2><p>Try another category, or adjust your Scout to widen the search.</p><button className="btn" onClick={() => setFilter("all")}>See all my matches <ArrowRight size={16} /></button></div>}
      {!allCount && <div className="scout-empty"><Radar size={40} /><h2>No current opportunities fit those must-have filters.</h2><p>{data.emptyBecause?.length ? `Nothing in the index passes all of: ${data.emptyBecause.join(", ")}. Your interest, deadline and amount never remove results; only these do.` : "Nothing in the current index passes your filters. Check back as sources refresh."}</p><div className="scout-run-controls">{prefs.merit && prefs.college && <button className="btn btn-primary" onClick={() => void launch({ ...prefs, college: "" })}>Any college <ArrowRight size={16} /></button>}{prefs.remote && <button className="btn btn-primary" onClick={() => void launch({ ...prefs, remote: false })}>Include every work setting <ArrowRight size={16} /></button>}{prefs.locationStrict && prefs.location && <button className="btn btn-primary" onClick={() => void launch({ ...prefs, locationStrict: false })}>Prefer {prefs.location} instead <ArrowRight size={16} /></button>}{prefs.kind !== "both" && !prefs.merit && <button className="btn" onClick={() => void launch({ ...prefs, kind: "both" })}>Internships + scholarships <ArrowRight size={16} /></button>}<button className="btn" onClick={() => { setStep(0); setPhase("setup"); }}>Adjust my Scout</button></div></div>}
      {visibleSections.map(section => <section key={section.id} className="scout-result-section"><header><h2>{section.title} <span className="scout-tier-count">{section.items.length}</span></h2><p>{section.description}</p></header>{section.items.map(card => <article key={card.id} className="scout-result-row"><div className={`scout-result-symbol ${card.kind}`} >{card.kind === "scholarship" ? <GraduationCap size={23} /> : <BriefcaseBusiness size={23} />}</div><div className="scout-result-main"><div className="scout-result-meta"><span>{card.company}</span><span>{card.kind === "scholarship" ? "Scholarship" : "Internship"}</span></div><Link className="scout-result-title" href={`/listing/${card.id}?returnTo=${encodeURIComponent(resultPath)}`}>{card.title}</Link><div className="scout-result-facts"><span>{card.locations.join(" / ") || "Location not stated"}</span><span>{card.award || card.compensation}</span>{card.deadline && <span>Apply by {card.deadline}</span>}</div><div className={`scout-freshness freshness-${card.freshness.state}`}>{card.freshness.state === "recent" ? <Check size={13} /> : card.freshness.state === "older" ? <Clock3 size={13} /> : <CircleHelp size={13} />}<span>{card.verified}</span>{card.freshness.foundLabel && <span className="scout-found-label">{card.freshness.foundLabel}</span>}{card.bucketLabel && <span className="scout-fit-label">{card.bucketLabel}</span>}</div>{card.warnings.length > 0 && <p className="scout-warning">{card.warnings[0]}</p>}</div><div className="scout-result-actions"><Link className="btn" href={`/listing/${card.id}/apply?returnTo=${encodeURIComponent(resultPath)}`}>Prepare <ArrowRight size={14} /></Link><a href={card.url} target="_blank" rel="noopener noreferrer" title="Open listing source" aria-label={`Open source for ${card.title}`}><ExternalLink size={16} /></a><button title={saved.includes(card.id) ? "Remove browser bookmark" : "Bookmark on this browser"} aria-label={saved.includes(card.id) ? "Remove browser bookmark" : "Bookmark on this browser"} aria-pressed={saved.includes(card.id)} onClick={() => toggleBookmark(card.id)}><Bookmark size={16} fill={saved.includes(card.id) ? "currentColor" : "none"} /></button></div></article>)}</section>)}
      {!data.full && data.total > allCount && <div className="scout-upgrade"><p>Your free Scout shows your top {allCount} of {data.total.toLocaleString()}.{data.bestTotal > bestShown ? ` ${(data.bestTotal - bestShown).toLocaleString()} more exact matches${data.interest ? ` for “${data.interest}”` : ""} ranked below them.` : ""} Pro unlocks up to 100.</p><Link className="btn" href="/pricing?feature=feed_full_depth">See Pro <ArrowRight size={15} /></Link></div>}<p className="scout-storage-note">Fit describes alignment with available evidence. It does not predict selection or scholarship awards.</p>
    </section>}
  </main>;
}
