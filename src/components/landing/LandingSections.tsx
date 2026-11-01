import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { getLandingPreview, getSourceCoverage } from "@/lib/landing-data";
import { FREE_DAILY_RESULTS } from "@/lib/feed-trim";
import { FEATURES } from "@/lib/pricing/tiers";
import { FEED_PATH } from "@/lib/routes";
import { MatchPreview } from "./MatchPreview";

export async function LiveMatchPreview() {
  const lanes = await getLandingPreview().catch(() => null);
  if (!lanes) return <section className="landing-block landing-preview-fallback" id="try-it"><Icon name="explore" size={28} /><h2>Your next move is waiting.</h2><p>The preview couldn’t load just now. You can still go straight to Explore and choose your direction there.</p><Link href={FEED_PATH} className="btn">Explore opportunities<Icon name="arrow" size={17} /></Link></section>;
  return <MatchPreview lanes={lanes} />;
}

export function PreviewSkeleton() {
  return <section className="landing-block landing-section-loading" aria-label="Loading opportunity preview" aria-busy="true"><div className="eyebrow">A little direction starts here</div><h2>Finding a few places to start…</h2><div className="landing-loading-bars"><span /><span /><span /></div></section>;
}

export function FreePlan({ signedIn }: { signedIn: boolean }) {
  const trackerLimit = FEATURES.tracker.limits.free;
  return <section className="landing-free landing-block" aria-labelledby="free-title">
    <div className="free-intro"><div className="eyebrow">Room to get started</div><h2 id="free-title">Your ambition.<br />A free place to start.</h2><p>Find possibilities, check the details, and keep your next steps together.</p><Link href={signedIn ? "/tracker" : "/login"} className="btn btn-primary">{signedIn ? "Open your tracker" : "Create your free account"}<Icon name="arrow" size={17} /></Link><span className="free-no-card">No credit card required.</span></div>
    <div className="free-inclusions"><div className="free-plan-label"><span>Included in the free plan</span><strong>$0<span> / to get started</span></strong></div><ul>
      <li><Icon name="search" size={20} /><div><h3>Search. Open. Go to the source.</h3><p>Search listings and open their details without signing up. Follow the original application link when you’re ready.</p></div></li>
      <li><Icon name="explore" size={20} /><div><h3>{FREE_DAILY_RESULTS} ranked results to explore</h3><p>Add your background for more relevant results. Free matching shows fit labels; full numerical scores and detailed breakdowns are on Apply.</p></div></li>
      <li><Icon name="tracker" size={20} /><div><h3>{trackerLimit === null ? "Keep your applications together" : `Track up to ${trackerLimit} applications`}</h3><p>Create an account to save opportunities and follow their progress from saved to applied to decision.</p></div></li>
    </ul><Link href="/pricing" className="landing-text-link">See all features and limits<Icon name="arrow" size={16} /></Link></div>
  </section>;
}

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver", timeZoneName: "short" }).format(new Date(value));
}

export async function SourceProof() {
  const coverage = await getSourceCoverage().catch(() => null);
  return <section className="landing-sources landing-block" aria-labelledby="sources-title">
    <div className="landing-section-heading"><div><div className="eyebrow">Follow the evidence</div><h2 id="sources-title">A real source.<br />A clearer starting point.</h2></div><p>Freshness has a timestamp. Every opportunity has a source. You should be able to see both.</p></div>
    <div className="source-proof-grid"><div className="source-ledger">
      <div className="source-ledger-top"><span><Icon name="shield" size={17} />Source coverage</span><span className="source-ledger-status">{coverage ? coverage.mode === "registry" ? "From our source registry" : "From recorded checks" : "Snapshot unavailable"}</span></div>
      {coverage ? <><dl className="source-metrics"><div><dt>{coverage.mode === "registry" ? "Employer boards in active coverage" : "Employer boards with recorded polls"}</dt><dd>{coverage.employerBoards.toLocaleString("en-US")}</dd></div><div><dt>{coverage.mode === "registry" ? "Scholarship sources in active coverage" : "Scholarship feeds represented in open listings"}</dt><dd>{coverage.scholarshipSources.toLocaleString("en-US")}</dd></div><div><dt>{coverage.mode === "registry" ? "Sources fully checked in the last 24 hours" : "Employer boards successfully checked in the last 24 hours"}</dt><dd>{coverage.checkedRecently.toLocaleString("en-US")}<span> / {coverage.activeSources.toLocaleString("en-US")}</span></dd></div></dl><div className="source-check-time"><Icon name="calendar" size={16} /><div><span>{coverage.mode === "registry" ? "Most recent complete source check" : "Most recent successful employer-board check"}</span>{coverage.latestCheck ? <time dateTime={new Date(coverage.latestCheck).toISOString()}>{timestamp(coverage.latestCheck)}</time> : <span>No successful check recorded yet</span>}</div></div><p className="source-snapshot-time">Coverage snapshot: <time dateTime={coverage.measuredAt}>{timestamp(coverage.measuredAt)}</time>. {coverage.mode === "registry" ? "Active coverage is a monitoring list, not a promise that every source was checked today. Sources covering both kinds can appear in both counts." : "Board counts reflect recorded polling attempts. Scholarship feeds count distinct data adapters, not individual awards or sponsors. Each listing carries its own check date."}</p></> : <p className="source-unavailable">We couldn’t retrieve the coverage numbers right now. Open a listing to see its individual source and latest recorded check.</p>}
    </div><div className="source-explainer"><h3>What you can actually check.</h3><ol><li><span>01</span><div><h4>Where it came from</h4><p>Employer boards and sponsor or university pages, with a link back to the original application.</p></div></li><li><span>02</span><div><h4>When we last saw it</h4><p>“First seen” and “last confirmed” describe our observations. A posting date appears only when the source provides one.</p></div></li><li><span>03</span><div><h4>What still needs your attention</h4><p>Missing requirements stay unknown. Inferred details are labeled. You make the final eligibility check.</p></div></li></ol><Link href="/how-we-verify" className="landing-text-link">Read how verification works<Icon name="arrow" size={16} /></Link></div></div>
    <div className="source-privacy"><Icon name="shield" size={18} /><p>Your next opportunity shouldn’t cost your privacy. <strong>We never sell your data.</strong></p><Link href="/privacy">Our privacy policy<Icon name="arrow" size={15} /></Link></div>
  </section>;
}

export function LandingFAQ() {
  const questions = [
    { question: "Can I explore without an account?", answer: <>Yes. Search opportunities, read listing details, and follow the original application link without signing up. Create a free account when you want to save listings and track applications.</> },
    { question: "What can I do for free?", answer: <>The free plan includes searching and opening listings, {FREE_DAILY_RESULTS} ranked results, and fit labels. An account lets you track {FEATURES.tracker.limits.free === null ? "your" : `up to ${FEATURES.tracker.limits.free}`} applications. Some application tools have free allowances; full limits and availability are on the <Link href="/pricing">pricing page</Link>.</> },
    { question: "Where do the opportunities come from?", answer: <>We read employer job boards and scholarship pages published by sponsors, universities, and foundations. Each listing links to its source. Check its timestamp to see when it was last observed; different sources are checked on different schedules. <Link href="/how-we-verify">See how we verify listings.</Link></> },
    { question: "What does a fit score actually mean?", answer: <>It compares the background you provide with information available in the listing. Unknown details stay unknown, and eligibility requirements are checked separately. A fit label or score is a guide for what to review next, never a prediction of winning an award or getting hired.</> },
    { question: "Does Instela submit applications for me?", answer: <>You apply on the employer’s or sponsor’s own site and review everything before submitting. The internship autofill extension is an Apply feature that is still being tested end to end; it helps fill fields and never presses submit. Scholarship autofill is not available yet.</> },
    { question: "Is this only for computer science students?", answer: <>You can search both internships and scholarships across subjects. Our current field filters focus on software, data, hardware, finance, product, and business. For other subjects, use a keyword search; coverage and the detail available vary by source.</> },
    { question: "What happens to my personal information?", answer: <>Your profile supports matching and application tools. We never sell student data. You can manage your information from your profile; the <Link href="/privacy">privacy policy</Link> explains what we store and how to delete your account.</> },
  ];
  return <section className="landing-faq landing-block" aria-labelledby="faq-title"><div className="faq-intro"><div className="eyebrow">Before you jump in</div><h2 id="faq-title">Good questions.<br />Straight answers.</h2><p>A few things you might be wondering before your first search.</p><Link href={FEED_PATH} className="landing-text-link">Ready? Take a look<Icon name="arrow" size={16} /></Link></div><div className="faq-questions">{questions.map((item, index) => <details key={item.question} name="landing-faq"><summary><span className="faq-number">0{index + 1}</span><span>{item.question}</span><span className="faq-toggle" aria-hidden="true">+</span></summary><div className="faq-answer"><p>{item.answer}</p></div></details>)}</div></section>;
}
