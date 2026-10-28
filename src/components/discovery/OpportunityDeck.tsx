"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent } from "react";
import { setStatusAction } from "@/app/tracker/actions";
import type { ApplicationStatus } from "@/db/schema";
import { GUEST_SAVES_KEY, readGuestSaves, savedSnapshot, type DiscoveryCard } from "@/lib/discovery/cards";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mascot } from "@/components/chrome/Mascot";
import { MatchingScreen } from "./MatchingScreen";
import { ScoringDetails } from "./ScoringDetails";

const STORAGE_EVENT = "instela:discovery-saves";
function subscribeToSaves(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(STORAGE_EVENT, callback); };
}
function readStorage() { try { return localStorage.getItem(GUEST_SAVES_KEY); } catch { return null; } }
function serverStorage() { return null; }
// The page renders this target before the deck and keeps it stable for its lifetime.
function toolbarTarget() { return document.getElementById("discovery-top-tabs"); }
function serverToolbarTarget() { return null; }
function subscribeToolbar() { return () => {}; }

function personalize() {
  const preferences = document.querySelector<HTMLDetailsElement>(".discovery-preferences-popover");
  if (preferences) preferences.open = true;
  const academic = document.querySelector<HTMLDetailsElement>(".scoring-preferences");
  if (academic) academic.open = true;
  const details = document.querySelector<HTMLDetailsElement>(".guest-profile-fields");
  if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "center" }); details.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); }
  else document.querySelector<HTMLElement>(".discovery-filters")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function OpportunityDeck({ cards, signedIn, statuses, kindLabel, total, dailyCapped, moreHref }: {
  cards: DiscoveryCard[]; signedIn: boolean; statuses: Record<string, ApplicationStatus>;
  kindLabel: string; total: number; dailyCapped: boolean; moreHref: string | null;
}) {
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [processed, setProcessed] = useState<Set<string>>(() => new Set());
  const [lastSkipped, setLastSkipped] = useState<string | null>(null);
  const [savedHere, setSavedHere] = useState<DiscoveryCard[]>([]);
  const [savedMode, setSavedMode] = useState(false);
  const [savedIndex, setSavedIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const interacted = useRef(false);
  const stageRef = useRef<HTMLElement>(null);
  const rawSaves = useSyncExternalStore(subscribeToSaves, readStorage, serverStorage);
  const topToolbar = useSyncExternalStore(subscribeToolbar, toolbarTarget, serverToolbarTarget);
  const guestSaves = useMemo(() => readGuestSaves(rawSaves), [rawSaves]);
  const savedCards = useMemo(() => {
    const sources = signedIn ? [...cards.filter(c => statuses[c.id] === "saved"), ...savedHere] : guestSaves;
    const live = new Map(cards.map(c => [c.id, c]));
    return [...new Map(sources.map(c => [c.id, live.get(c.id) ?? c])).values()];
  }, [cards, statuses, savedHere, signedIn, guestSaves]);
  const remaining = cards.filter(c => !processed.has(c.id));
  const card = savedMode ? savedCards[savedIndex % (savedCards.length || 1)] : remaining[0];
  const isSaved = Boolean(card && (statuses[card.id] || savedCards.some(c => c.id === card.id)));

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 100 : 1150);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (interacted.current && ready) {
      stageRef.current?.focus({ preventScroll: true });
      if (window.innerWidth <= 900) stageRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }, [card?.id, ready, savedMode]);

  function flipCard(next: boolean) {
    setError(""); setFlipped(next);
    if (window.innerWidth <= 900) stageRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }

  function advance(notice: string) {
    if (!card) return;
    interacted.current = true;
    setFlipped(false); setError(""); setMessage(notice);
    if (savedMode) setSavedIndex(i => i + 1);
    else setProcessed(previous => new Set([...previous, card.id]));
  }
  function skip() {
    if (!card || pending) return;
    if (!savedMode) setLastSkipped(card.id);
    advance(savedMode ? "Showing the next saved opportunity. Your saves are unchanged." : isSaved ? "Skipped in this set. Your existing save is unchanged." : "Skipped. This opportunity was not saved.");
  }
  function save() {
    if (!card || pending) return;
    if (isSaved) { advance("Already in your saves or tracker. On to the next possibility."); return; }
    setError("");
    if (!signedIn) {
      try {
        if (guestSaves.length >= 100) { setError("This browser has 100 saved opportunities. Sign in to manage applications in your tracker."); return; }
        localStorage.setItem(GUEST_SAVES_KEY, JSON.stringify([...guestSaves, savedSnapshot(card)]));
        window.dispatchEvent(new Event(STORAGE_EVENT));
        setLastSkipped(null); advance("Saved for later on this browser.");
      } catch { setError("Your browser could not save this opportunity. Allow local storage or sign in to use your tracker."); }
      return;
    }
    const selected = card;
    startTransition(async () => {
      try {
        const data = new FormData(); data.set("postingId", selected.id); data.set("status", "saved");
        const result = await setStatusAction({ status: "idle" }, data);
        if (result.status !== "ok") { setError(result.message ?? "Could not save. Please try again."); return; }
        setSavedHere(previous => [...previous, selected]);
        setLastSkipped(null); advance("Saved to your application tracker.");
      } catch { setError("Could not save this time. Check your connection and sign-in, then try again."); }
    });
  }
  function toggleSaved(next: boolean) {
    interacted.current = true; setSavedMode(next); setSavedIndex(0); setFlipped(false); setError(""); setMessage("");
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!card || pending || event.ctrlKey || event.metaKey || event.altKey || event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); skip(); }
    if (event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
    if (event.key === "ArrowRight") { event.preventDefault(); flipCard(!flipped); }
  }
  if (!ready) return <MatchingScreen kind={kindLabel} />;

  return <section className="opportunity-deck" aria-label="Opportunity discovery">
    {topToolbar && createPortal(<div className="deck-top-navigation"><div className="deck-view-tabs" role="group" aria-label="Discovery queue"><button type="button" aria-pressed={!savedMode} onClick={() => toggleSaved(false)}><Icon name="explore" size={16} />Discover</button><button type="button" aria-pressed={savedMode} onClick={() => toggleSaved(true)}><Icon name="bookmark" size={16} />Saved for later</button></div>{signedIn && <Link href="/tracker" className="deck-tracker-link">Your tracker<Icon name="arrow" size={14} /></Link>}</div>, topToolbar)}
    <div className={`deck-stage ${card ? "has-card" : ""}`}>
      <section ref={stageRef} className="deck-focus-surface" tabIndex={0} onKeyDown={onKeyDown} aria-label={card ? `${card.title}. Left arrow to skip, S to save, right arrow for application steps.` : "End of opportunity set"}>
        <AnimatePresence mode="wait" initial={false}>
          {card ? <motion.article key={`${card.id}:${flipped ? "back" : "front"}`} className={`discovery-card ${flipped ? "application-side" : ""}`} initial={reduce ? false : { opacity: 0, rotateY: flipped ? 75 : -8, y: 12 }} animate={{ opacity: 1, rotateY: 0, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, rotateY: flipped ? -60 : 8, y: -8 }} transition={{ duration: reduce ? 0 : .2, ease: "easeOut" }}>
            {flipped ? <ApplicationSide card={card} onBack={() => flipCard(false)} signedIn={signedIn} /> : <OpportunitySide card={card} saved={isSaved} signedIn={signedIn} />}
            <div className="discovery-actions"><button type="button" className="deck-skip" onClick={skip} disabled={pending}><Icon name="close" size={18} /><span>{savedMode ? "Next saved" : "Skip"}</span></button><button type="button" className="deck-save" onClick={save} disabled={pending}><Icon name={isSaved ? "check" : "bookmark"} size={18} /><span>{pending ? "Saving…" : isSaved ? "Saved · next" : "Save for later"}</span></button>{flipped ? <button type="button" className="deck-apply" onClick={() => flipCard(false)} disabled={pending}><Icon name="flip" size={17} /><span>Back to overview</span></button> : <button type="button" className="deck-apply" onClick={() => flipCard(true)} disabled={pending}><span>Apply now</span><Icon name="arrow" size={18} /></button>}</div>
          </motion.article> : <motion.div key={savedMode ? "saved-empty" : "finished"} className="deck-finished" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="deck-finished-icon"><Mascot size={50} /></div><span className="matching-eyebrow">Room for your next chapter</span><h2>{savedMode ? "Your shortlist starts here." : cards.length ? "A little closer to your next move." : "Let's try another direction."}</h2><p>{savedMode ? "Save an opportunity that catches your eye. It will be waiting here when you're ready." : cards.length ? "You've explored this set. Revisit your saves, adjust your preferences, or look through these opportunities again." : "No opportunities match this combination right now. Try a broader college name, fewer filters, or another kind of opportunity."}</p><div className="deck-finished-actions"><button className="btn btn-primary" type="button" onClick={savedMode ? () => toggleSaved(false) : savedCards.length ? () => toggleSaved(true) : personalize}>{savedMode ? "Back to discovery" : savedCards.length ? "Review my saves" : "Adjust preferences"}<Icon name="arrow" size={16} /></button>{!savedMode && cards.length > 0 && <button type="button" className="btn" onClick={() => { setProcessed(new Set()); setLastSkipped(null); setFlipped(false); setMessage(""); }}>Review this set again</button>}{!savedMode && moreHref && !dailyCapped && <Link href={moreHref} className="btn">Load more opportunities</Link>}</div>{signedIn && savedMode && <Link href="/tracker" className="deck-text-link">See every saved application in your tracker →</Link>}</motion.div>}
        </AnimatePresence>
      </section>
    </div>
    <div className="deck-feedback" aria-live="polite" aria-atomic="true">{error ? <p role="alert" className="deck-error">{error} {signedIn && <Link href="/pricing">View plan limits</Link>}</p> : <span>{message || (savedMode && !signedIn ? "Saved snapshots. Check the source for current availability." : "No rush. The right opportunity is worth a closer look.")}</span>}{lastSkipped && !savedMode && !pending && <button type="button" onClick={() => { setProcessed(previous => { const next = new Set(previous); next.delete(lastSkipped); return next; }); setLastSkipped(null); setFlipped(false); setMessage("Last skip undone."); }}>Undo skip</button>}</div>
    <div className="deck-bottom-note"><span><Icon name="shield" size={13} />Checked at the source. Always your decision.</span><span className="deck-shortcuts"><kbd>←</kbd> skip <kbd>S</kbd> save <kbd>→</kbd> apply</span></div>
    {!signedIn && savedCards.length > 0 && <div className="deck-save-account"><Icon name="bookmark" size={18} /><p><strong>Your shortlist, wherever you go.</strong><span>Browser saves stay on this device. Sign in to save future opportunities to your account.</span></p><Link href="/login?next=/explore" className="btn">Sign in<Icon name="arrow" size={14} /></Link></div>}
    <p className="deck-disclaimer">Fit and timing are explainable heuristics, not probabilities of winning. Showing {cards.length} of {total.toLocaleString("en-US")} matching opportunities.</p>
  </section>;
}

function Fact({ icon, label, value, note }: { icon: IconName; label: string; value: string; note?: string | null }) {
  return <div className="discovery-fact"><span><Icon name={icon} size={15} />{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
function OpportunitySide({ card, saved, signedIn }: { card: DiscoveryCard; saved: boolean; signedIn: boolean }) {
  const awardParts = card.award?.split(" · ") ?? [];
  return <>
    <div className="discovery-card-top"><div className="discovery-organization"><span className="discovery-org-mark">{card.company.slice(0, 1).toUpperCase()}</span><div><strong>{card.company}</strong><span>{card.kind === "scholarship" ? "Scholarship opportunity" : "Internship opportunity"}</span></div></div><span className="discovery-kind"><Icon name={card.kind === "scholarship" ? "graduation" : "resume"} size={14} />{card.kind === "scholarship" ? "Scholarship" : "Internship"}</span></div>
    <div className="discovery-title-row"><div><h2>{card.title}</h2><p className="discovery-location"><Icon name="pin" size={14} />{card.locations.length ? card.locations.slice(0, 3).join(" · ") : card.kind === "scholarship" ? "See source for location requirements" : "Location not stated"}{card.remote ? " · Remote" : ""}</p></div><div className={`discovery-fit ${card.score !== null ? "has-score" : ""}`}><span>{card.score !== null ? <>{card.score}<small>/100</small></> : card.bucketLabel ?? "—"}</span><small>{card.score !== null || card.bucketLabel ? "Your fit" : "Not scored yet"}</small>{card.profileReady && <em>{card.scoreKnown}/{card.scoreTotal} factors known</em>}</div></div>
    <div className="discovery-facts">
      <Fact icon={card.kind === "scholarship" ? "award" : "resume"} label={card.kind === "scholarship" ? "Award amount" : "Term"} value={card.kind === "scholarship" ? awardParts[0] ?? "Not stated" : card.term ?? "Not stated"} note={card.kind === "scholarship" ? awardParts.slice(1).join(" · ") || "As stated by the source" : "Check employer for compensation"} />
      <Fact icon="people" label={card.kind === "scholarship" ? "Awards available" : "Work arrangement"} value={card.kind === "scholarship" ? card.awardsCount !== null ? `About ${card.awardsCount.toLocaleString("en-US")}` : "Not stated" : card.remote ? "Remote" : "See source"} note={card.kind === "scholarship" ? card.awardsCount !== null ? "Awards per year; source estimate" : "Recipient count not published in our data" : card.locations[0] ?? "Location details on application page"} />
      <Fact icon="calendar" label="Application deadline" value={card.deadline ?? "Not stated"} note={card.closes ?? "Check the source before applying"} />
    </div>
    {card.assessment ? <><ScoringDetails assessment={card.assessment} /><div className="scoring-edit"><button type="button" onClick={personalize}><Icon name="profile" size={14} />Update scoring details<Icon name="arrow" size={13} /></button></div></> : !card.profileReady ? <div className="discovery-personalize"><Icon name="profile" size={19} /><div><strong>A little about you. A better match.</strong><p>Add relevant profile details to see which requirements and preferences match.</p></div>{signedIn ? <Link href="/profile?next=/explore">Edit profile<Icon name="arrow" size={14} /></Link> : <button type="button" onClick={personalize}>Personalize<Icon name="arrow" size={14} /></button>}</div> : card.reasons.length > 0 ? <div className="discovery-reasons"><h3>Why this could be your next move</h3>{card.reasons.slice(0, 3).map((reason, i) => <div key={i} className={reason.kind === "bad" ? "is-caution" : ""}><Icon name={reason.kind === "good" ? "check" : "info"} size={15} /><span>{reason.label}</span></div>)}</div> : card.scoreLocked ? <div className="discovery-personalize"><Icon name="shield" size={18} /><p>Your fit label uses your profile. Full scores and explanations are available on the Apply plan.</p><Link href="/pricing">See plans<Icon name="arrow" size={14} /></Link></div> : null}
    {card.eligibility.length > 0 && <details className="discovery-eligibility"><summary>Eligibility & requirements<span>{card.eligibility.length} stated</span><Icon name="chevron" size={14} /></summary><ul>{card.eligibility.map((line, i) => <li key={i}>{line}</li>)}</ul></details>}
    {card.warnings.length > 0 && <div className="discovery-alert"><Icon name="info" size={17} /><div>{card.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div></div>}
    <div className="discovery-source-line"><span><i />{card.verified}{card.posted ? ` · ${card.posted}` : ""}</span><Link href={card.detailsHref ?? `/listing/${card.id}`}>Full details<Icon name="external" size={13} /></Link>{saved && <span className="discovery-saved-tag"><Icon name="check" size={12} />In your saves / tracker</span>}</div>
  </>;
}

function ApplicationSide({ card, onBack, signedIn }: { card: DiscoveryCard; onBack: () => void; signedIn: boolean }) {
  const safeUrl = /^https?:\/\//i.test(card.url) ? card.url : null;
  return <>
    <div className="application-back-top"><button type="button" onClick={onBack}><Icon name="flip" size={16} />Opportunity overview</button><span><Icon name="shield" size={14} />You&apos;re in control</span></div>
    <div className="application-title"><span className="matching-eyebrow">From possibility to application</span><h2>Make your next move.</h2><p>{card.title}</p><span>{card.company}{card.deadline ? ` · Apply by ${card.deadline}` : " · Check the source for the deadline"}</span></div>
    {card.warnings.length > 0 && <div className="discovery-alert"><Icon name="info" size={17} /><div>{card.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div></div>}
    <ol className="application-steps"><li><span>01</span><div><h3>Check that you&apos;re eligible</h3>{card.eligibility.length ? <ul>{card.eligibility.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p>The source hasn&apos;t provided detailed eligibility in our data. Review its full requirements before you start.</p>}</div></li><li><span>02</span><div><h3>{card.kind === "scholarship" ? "Get your materials together" : "Put your best application forward"}</h3><p>{card.kind === "scholarship" ? "Check the sponsor's application for requested essays, transcripts, recommendations, or enrollment details. Requirements vary; only submit what it asks for." : "Review the employer's requirements and prepare your resume. Add a cover letter or other materials if the application requests them."}</p><div className="application-tool-links"><Link href={card.kind === "scholarship" ? "/essay" : "/resume"}>{card.kind === "scholarship" ? "Essay review" : "Your resume"}<Icon name="arrow" size={13} /></Link><Link href={`/listing/${card.id}#cover-letter`}>Cover letter tools<Icon name="arrow" size={13} /></Link></div></div></li><li><span>03</span><div><h3>Apply directly at the source</h3><p>Follow the official instructions, review your information, and submit on the {card.kind === "scholarship" ? "sponsor's" : "employer's"} website. You make the final submission.</p>{safeUrl && <a className="application-source-button" href={safeUrl} target="_blank" rel="noopener noreferrer">Continue to {card.kind === "scholarship" ? "sponsor" : "employer"}<Icon name="external" size={17} /></a>}</div></li></ol>
    <div className="application-finish-note"><Icon name="tracker" size={18} /><p>{signedIn ? <>Submitted your application? Update its status in <Link href="/tracker">your tracker</Link>.</> : <>Save it for later to keep it on this browser, or <Link href="/login?next=/explore">sign in</Link> to track your application.</>}</p></div>
  </>;
}
