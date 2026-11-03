"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo, type Variants } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type ReactNode } from "react";
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

/** How far (px, with a little credit for flick speed) a card must travel to count as a decision. */
const SWIPE_THRESHOLD = 110;

type ExitCustom = { dir: number; flipped: boolean; reduce: boolean };
/*
 * Exit is a variant because AnimatePresence keeps the *old* element's props:
 * an `exit` object built from the new state would be stale by the time it
 * runs. `custom` on AnimatePresence is the one value the leaving card does see
 * updated, so the swipe direction rides on that.
 */
const cardVariants: Variants = {
  exit: ({ dir, flipped, reduce }: ExitCustom) =>
    reduce ? { opacity: 0, transition: { duration: 0 } }
    : dir !== 0 ? { opacity: 0, x: dir * 460, transition: { duration: .24, ease: "easeIn" } }
    : { opacity: 0, rotateY: flipped ? 8 : -60, y: -8, transition: { duration: .2, ease: "easeOut" } },
};

function SwipeCard({ flipped, swipeable, reduce, onSwipe, children }: {
  flipped: boolean; swipeable: boolean; reduce: boolean; onSwipe: (direction: 1 | -1) => void; children: ReactNode;
}) {
  const x = useMotionValue(0);
  // Rotation is derived from the drag, not animated on its own, so it follows the finger and unwinds with it.
  const rotate = useTransform(x, [-240, 0, 240], [-9, 0, 9]);
  const saveStamp = useTransform(x, [24, 120], [0, 1]);
  const skipStamp = useTransform(x, [-120, -24], [1, 0]);
  function release(_: unknown, info: PanInfo) {
    const travel = info.offset.x + info.velocity.x * 0.18;
    if (travel > SWIPE_THRESHOLD) onSwipe(1);
    else if (travel < -SWIPE_THRESHOLD) onSwipe(-1);
  }
  return <motion.article
    className={`discovery-card ${flipped ? "application-side" : ""} ${swipeable ? "is-swipeable" : ""}`}
    style={swipeable ? { x, rotate } : undefined}
    drag={swipeable ? "x" : false}
    dragDirectionLock
    dragSnapToOrigin
    dragElastic={0.75}
    onDragEnd={release}
    initial={reduce ? false : { opacity: 0, scale: .94, y: 18 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    variants={cardVariants}
    exit="exit"
    transition={{ duration: reduce ? 0 : .2, ease: "easeOut" }}
  >
    {swipeable && <>
      <motion.span className="swipe-stamp swipe-stamp-save" style={{ opacity: saveStamp }} aria-hidden="true">Save</motion.span>
      <motion.span className="swipe-stamp swipe-stamp-skip" style={{ opacity: skipStamp }} aria-hidden="true">Skip</motion.span>
    </>}
    {children}
  </motion.article>;
}

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
  const [sheetOpen, setSheetOpen] = useState(true);
  // +1 = flew off to the right (saved), -1 = left (skipped), 0 = a flip or a reset.
  const [exitDir, setExitDir] = useState(0);
  const interacted = useRef(false);
  const stageRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetDrag = useDragControls();
  const rawSaves = useSyncExternalStore(subscribeToSaves, readStorage, serverStorage);
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
    // The popup scrolls inside itself; a new card (or its other side) starts at the top rather than wherever the last was left.
    scrollRef.current?.scrollTo({ top: 0 });
  }, [card?.id, flipped, savedMode]);

  const sheetShowing = ready && sheetOpen;
  useEffect(() => {
    if (!sheetShowing) return;
    // The page behind a sheet must not scroll under the finger that is swiping the card.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function escape(event: globalThis.KeyboardEvent) { if (event.key === "Escape") setSheetOpen(false); }
    document.addEventListener("keydown", escape);
    // Focus lands on the card so the arrow keys and S work the moment it opens.
    stageRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", escape); };
  }, [sheetShowing]);

  function flipCard(next: boolean) {
    setError(""); setExitDir(0); setFlipped(next);
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
    setExitDir(-1);
    if (!savedMode) setLastSkipped(card.id);
    advance(savedMode ? "Showing the next saved opportunity. Your saves are unchanged." : isSaved ? "Skipped in this set. Your existing save is unchanged." : "Skipped. This opportunity was not saved.");
  }
  function save() {
    if (!card || pending) return;
    setExitDir(1);
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

  const swipeable = !flipped && !pending && Boolean(card);
  const minimize = () => setSheetOpen(false);
  // Personalizing happens in the page behind the sheet, so the sheet gets out of the way first.
  const onPersonalize = () => { setSheetOpen(false); window.setTimeout(personalize, 320); };
  const onSwipe = (direction: 1 | -1) => { if (direction === 1) save(); else skip(); };

  const tabs = <div className="deck-view-tabs" role="group" aria-label="Discovery queue"><button type="button" aria-pressed={!savedMode} onClick={() => toggleSaved(false)}><Icon name="explore" size={16} />Discover</button><button type="button" aria-pressed={savedMode} onClick={() => toggleSaved(true)}><Icon name="bookmark" size={16} />Saved for later</button></div>;

  const actions = <div className="discovery-actions"><button type="button" className="deck-skip" onClick={skip} disabled={pending}><Icon name="close" size={18} /><span>{savedMode ? "Next saved" : "Skip"}</span></button><button type="button" className="deck-save" onClick={save} disabled={pending}><Icon name={isSaved ? "check" : "bookmark"} size={18} /><span>{pending ? "Saving…" : isSaved ? "Saved · next" : "Save for later"}</span></button>{flipped ? <button type="button" className="deck-apply" onClick={() => flipCard(false)} disabled={pending}><Icon name="flip" size={17} /><span>Back to overview</span></button> : <button type="button" className="deck-apply" onClick={() => flipCard(true)} disabled={pending}><span>Apply now</span><Icon name="arrow" size={18} /></button>}</div>;

  const finished = <motion.div key={savedMode ? "saved-empty" : "finished"} className="deck-finished" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="deck-finished-icon"><Mascot size={50} /></div><span className="matching-eyebrow">Room for your next chapter</span><h2>{savedMode ? "Your shortlist starts here." : cards.length ? "A little closer to your next move." : "Let's try another direction."}</h2><p>{savedMode ? "Save an opportunity that catches your eye. It will be waiting here when you're ready." : cards.length ? "You've explored this set. Revisit your saves, adjust your preferences, or look through these opportunities again." : "No opportunities match this combination right now. Try a broader college name, fewer filters, or another kind of opportunity."}</p><div className="deck-finished-actions"><button className="btn btn-primary" type="button" onClick={savedMode ? () => toggleSaved(false) : savedCards.length ? () => toggleSaved(true) : onPersonalize}>{savedMode ? "Back to discovery" : savedCards.length ? "Review my saves" : "Adjust preferences"}<Icon name="arrow" size={16} /></button>{!savedMode && cards.length > 0 && <button type="button" className="btn" onClick={() => { setProcessed(new Set()); setLastSkipped(null); setFlipped(false); setMessage(""); }}>Review this set again</button>}{!savedMode && moreHref && !dailyCapped && <Link href={moreHref} className="btn">Load more opportunities</Link>}</div>{signedIn && savedMode && <Link href="/tracker" className="deck-text-link">See every saved application in your tracker →</Link>}</motion.div>;

  const stage = <div className={`deck-stage ${card ? "has-card" : ""}`}>
    <section ref={stageRef} className="deck-focus-surface" tabIndex={0} onKeyDown={onKeyDown} aria-label={card ? `${card.title}. Left arrow to skip, S to save, right arrow for application steps.` : "End of opportunity set"}>
      <AnimatePresence mode="wait" initial={false} custom={{ dir: exitDir, flipped, reduce: Boolean(reduce) } satisfies ExitCustom}>
        {card ? <SwipeCard key={`${card.id}:${flipped ? "back" : "front"}`} flipped={flipped} swipeable={swipeable} reduce={Boolean(reduce)} onSwipe={onSwipe}>
          {flipped ? <ApplicationSide card={card} onBack={() => flipCard(false)} signedIn={signedIn} /> : <OpportunitySide card={card} saved={isSaved} signedIn={signedIn} onPersonalize={onPersonalize} />}
        </SwipeCard> : finished}
      </AnimatePresence>
    </section>
  </div>;

  const feedback = <div className="deck-feedback" aria-live="polite" aria-atomic="true">{error ? <p role="alert" className="deck-error">{error} {signedIn && <Link href="/pricing">View plan limits</Link>}</p> : <span>{message || (savedMode && !signedIn ? "Saved snapshots. Check the source for current availability." : "No rush. The right opportunity is worth a closer look.")}</span>}{lastSkipped && !savedMode && !pending && <button type="button" onClick={() => { setProcessed(previous => { const next = new Set(previous); next.delete(lastSkipped); return next; }); setLastSkipped(null); setFlipped(false); setMessage("Last skip undone."); }}>Undo skip</button>}</div>;

  const accountNudge = !signedIn && savedCards.length > 0 && <div className="deck-save-account"><Icon name="bookmark" size={18} /><p><strong>Your shortlist, wherever you go.</strong><span>Browser saves stay on this device. Sign in to save future opportunities to your account.</span></p><Link href="/login?next=/explore" className="btn">Sign in<Icon name="arrow" size={14} /></Link></div>;
  const disclaimer = <p className="deck-disclaimer">Fit and timing are explainable heuristics, not probabilities of winning. Showing {cards.length} of {total.toLocaleString("en-US")} matching opportunities.</p>;

  const left = remaining.length;
  return <section className="opportunity-deck deck-docked" aria-label="Opportunity discovery">
      <div className="deck-dock">
        <Icon name="explore" size={20} />
        <p><strong>{left > 0 ? `${left} ${left === 1 ? "card is" : "cards are"} ready to swipe` : "You've been through this set"}</strong><span>Swipe right to save, left to skip.</span></p>
        <button type="button" className="btn btn-primary" onClick={() => setSheetOpen(true)}>Open cards<Icon name="arrow" size={14} /></button>
      </div>
      {disclaimer}
      {createPortal(<AnimatePresence>
        {sheetOpen ? <motion.div key="sheet" className="deck-sheet-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .22 }}>
          <button type="button" className="deck-sheet-backdrop" aria-label="Minimize opportunity cards" onClick={minimize} tabIndex={-1} />
          <motion.div
            className="deck-sheet" role="dialog" aria-modal="true" aria-label="Opportunity cards"
            initial={reduce ? { y: 0 } : { y: "100%" }} animate={{ y: 0 }} exit={reduce ? { y: 0 } : { y: "100%" }}
            transition={reduce ? { duration: 0 } : { type: "spring", damping: 32, stiffness: 340, mass: .9 }}
            drag="y" dragControls={sheetDrag} dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .55 }}
            onDragEnd={(_: unknown, info: PanInfo) => { if (info.offset.y > 120 || info.velocity.y > 650) minimize(); }}
          >
            <div className="deck-sheet-head" onPointerDown={event => sheetDrag.start(event)}>
              <span className="deck-sheet-grip" aria-hidden="true" />
              <div className="deck-sheet-bar">{tabs}<button type="button" className="deck-sheet-close" onClick={minimize} onPointerDown={event => event.stopPropagation()} aria-label="Minimize cards"><Icon name="chevron" size={18} /></button></div>
            </div>
            <div className="deck-sheet-scroll" ref={scrollRef}>
              {stage}
              {accountNudge}
            </div>
            <div className="deck-sheet-foot">
              {card && actions}
              <div className="deck-sheet-hint" aria-hidden="true"><span><Icon name="close" size={12} />swipe left to skip</span><span>swipe right to save<Icon name="bookmark" size={12} /></span></div>
              {feedback}
            </div>
          </motion.div>
        </motion.div> : null}
      </AnimatePresence>, document.body)}
    </section>;
}

function Fact({ icon, label, value, note }: { icon: IconName; label: string; value: string; note?: string | null }) {
  return <div className="discovery-fact"><span><Icon name={icon} size={15} />{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
function OpportunitySide({ card, saved, signedIn, onPersonalize }: { card: DiscoveryCard; saved: boolean; signedIn: boolean; onPersonalize: () => void }) {
  const awardParts = card.award?.split(" · ") ?? [];
  return <>
    <div className="discovery-card-top"><div className="discovery-organization"><span className="discovery-org-mark">{card.company.slice(0, 1).toUpperCase()}</span><div><strong>{card.company}</strong><span>{card.kind === "scholarship" ? "Scholarship opportunity" : "Internship opportunity"}</span></div></div><span className="discovery-kind"><Icon name={card.kind === "scholarship" ? "graduation" : "resume"} size={14} />{card.kind === "scholarship" ? "Scholarship" : "Internship"}</span></div>
    <div className="discovery-title-row"><div><h2>{card.title}</h2><p className="discovery-location"><Icon name="pin" size={14} />{card.locations.length ? card.locations.slice(0, 3).join(" · ") : card.kind === "scholarship" ? "See source for location requirements" : "Location not stated"}{card.remote ? " · Remote" : ""}</p></div><div className={`discovery-fit ${card.score !== null ? "has-score" : ""}`}><span>{card.score !== null ? <>{card.score}<small>/100</small></> : card.bucketLabel ?? "—"}</span><small>{card.score !== null || card.bucketLabel ? "Your fit" : "Not scored yet"}</small>{card.profileReady && <em>{card.scoreKnown}/{card.scoreTotal} factors known</em>}</div></div>
    <div className="discovery-facts">
      <Fact icon={card.kind === "scholarship" ? "award" : "resume"} label={card.kind === "scholarship" ? "Award amount" : "Compensation"} value={card.kind === "scholarship" ? awardParts[0] ?? "Not stated" : card.compensation} note={card.kind === "scholarship" ? awardParts.slice(1).join(" · ") || "As stated by the source" : card.compensation === "Not stated" ? "The employer has not published pay in our data" : "Employer-stated range"} />
      <Fact icon="people" label={card.kind === "scholarship" ? "Awards available" : "Work arrangement"} value={card.kind === "scholarship" ? card.awardsCount !== null ? `About ${card.awardsCount.toLocaleString("en-US")}` : "Not stated" : card.workArrangement} note={card.kind === "scholarship" ? card.awardsCount !== null ? "Awards per year; source estimate" : "Recipient count not published in our data" : card.locations[0] ?? "Location not stated"} />
      {card.kind === "internship" && <Fact icon="calendar" label="Working period" value={card.term ?? "Not stated"} note={card.term ? "Employer-stated term" : "Check the source for start and end dates"} />}
      <Fact icon="calendar" label="Application deadline" value={card.deadline ?? "Not stated"} note={card.closes ?? "Check the source before applying"} />
    </div>
    {card.assessment ? <><ScoringDetails assessment={card.assessment} /><div className="scoring-edit"><button type="button" onClick={onPersonalize}><Icon name="profile" size={14} />Update scoring details<Icon name="arrow" size={13} /></button></div></> : !card.profileReady ? <div className="discovery-personalize"><Icon name="profile" size={19} /><div><strong>A little about you. A better match.</strong><p>Add relevant profile details to see which requirements and preferences match.</p></div>{signedIn ? <Link href="/profile?next=/explore">Edit profile<Icon name="arrow" size={14} /></Link> : <button type="button" onClick={onPersonalize}>Personalize<Icon name="arrow" size={14} /></button>}</div> : card.reasons.length > 0 ? <div className="discovery-reasons"><h3>Why this could be your next move</h3>{card.reasons.slice(0, 3).map((reason, i) => <div key={i} className={reason.kind === "bad" ? "is-caution" : ""}><Icon name={reason.kind === "good" ? "check" : "info"} size={15} /><span>{reason.label}</span></div>)}</div> : card.scoreLocked ? <div className="discovery-personalize"><Icon name="shield" size={18} /><p>Your fit label uses your profile. Full scores and explanations are available on Pro. Eligibility warnings show on every plan.</p><Link href="/pricing">See plans<Icon name="arrow" size={14} /></Link></div> : null}
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
