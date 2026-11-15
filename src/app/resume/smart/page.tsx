import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { PrintButton } from "@/components/PrintButton";
import { SmartResumeSheet } from "@/components/SmartResumeSheet";
import { UpgradeWall } from "@/components/pricing/UpgradeGate";
import { resolveViewer, type SearchParams } from "@/app/explore/viewer";
import { recordEvent } from "@/lib/analytics/record";
import { requireUser } from "@/lib/auth";
import { getPosting } from "@/lib/feed";
import { formatRenewal } from "@/lib/pricing/allowance";
import { getUserTier } from "@/lib/pricing/entitlements";
import { readAllowance, withAllowance } from "@/lib/pricing/grants";
import { TIER_LABELS, evaluateFeature } from "@/lib/pricing/tiers";
import { getLatestResume } from "@/lib/profile/store";
import { resumeRevisionKey } from "@/lib/resume/revision";
import { buildSmartResume, smartResumeGrantKey, type SmartTarget } from "@/lib/resume/smart";
import { coerceParsedResume } from "@/lib/resume/types";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The Smart Resume converter.
 *
 * `?listing=<id>` tailors it to that listing; without it, the standard
 * ATS layout. The conversion itself is `lib/resume/smart.ts` and is pure.
 *
 * METERING (owner's rule, 2026-11-15): Free gets one conversion every 30 days
 * and views it on screen only; PDF export is Pro. A conversion is keyed on
 * (resume revision, target), so reopening the same one is a free replay.
 *
 * A NEW FREE CONVERSION NEEDS AN EXPLICIT CLICK (`run=1`, from a form). The
 * resume critique charges on page render, which is fine for a page a student
 * opens on purpose; this page is linked from every listing, and a link
 * prefetch or a curious click must not spend someone's only conversion of the
 * month. Pro, being unlimited, converts on load.
 */
export default async function SmartResumePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const rawListing = one(sp.listing);
  const listingId = rawListing && UUID_RE.test(rawListing) ? rawListing : null;
  if (rawListing && !listingId) notFound();

  const here = `/resume/smart${listingId ? `?listing=${listingId}` : ""}`;
  const user = await requireUser(here);
  const [resume, tier] = await Promise.all([getLatestResume(user.id), getUserTier(user.id)]);

  let target: SmartTarget | null = null;
  if (listingId) {
    const { profile } = await resolveViewer(sp);
    const item = await getPosting(listingId, profile);
    if (!item) notFound();
    target = { title: item.title, company: item.company, skills: item.skills, eligibility: item.eligibility };
  }

  const header = (
    <header className="print-hide" style={{ marginBottom: 28 }}>
      <div className="eyebrow chrome">smart resume</div>
      <h1 className="section-title chrome" style={{ marginTop: 12 }}>
        {target ? (
          <>
            your resume, <span style={{ color: "var(--accent)" }}>ordered for {target.company}</span>
          </>
        ) : (
          <>
            your resume, <span style={{ color: "var(--accent)" }}>in the standard layout</span>
          </>
        )}
      </h1>
      <p className="t-base" style={{ color: "var(--muted)", maxWidth: "62ch", marginTop: 14 }}>
        {target
          ? `Reordered for ${target.title}: the experience, projects and skills this listing asks for come first. `
          : "One page, one column, standard section order and dates, strongest bullets first. "}
        Nothing is rewritten and no skill is added. Every line is from your resume.
      </p>
    </header>
  );

  const backHref = listingId ? `/listing/${listingId}` : "/resume";
  const backLabel = listingId ? "back to the listing" : "back to your resume";

  if (!resume) {
    return (
      <main className="wrap tool-page resume-page" style={{ paddingBlock: "48px 96px" }}>
        <BackLink href={backHref} label={backLabel} />
        {header}
        <div className="slot" style={{ padding: "20px" }}>
          <span>
            no resume yet.{" "}
            <Link href="/profile" style={{ color: "var(--accent)" }}>
              Upload one on your profile
            </Link>{" "}
            and come back to convert it.
          </span>
        </div>
      </main>
    );
  }

  const parsed = coerceParsedResume(resume.parsed);
  const keys = [smartResumeGrantKey(resumeRevisionKey(parsed), listingId)];
  const read = await readAllowance(user.id, tier, "smart_resume", keys);
  const runRequested = one(sp.run) === "1";

  const mayRun = read.access.unlimited || read.earned !== null || runRequested;
  const run = mayRun
    ? await withAllowance({ userId: user.id, tier, feature: "smart_resume", keys }, async () => buildSmartResume(parsed, target))
    : null;
  const smart = run?.value ?? null;
  const canExport = evaluateFeature(tier, "smart_resume_pdf", 0).usable;

  if (!smart) {
    const blocked = run?.begin.outcome === "blocked" || (!mayRun && !read.access.usable);
    if (blocked) void recordEvent("upgrade_prompt_viewed", { feature: "smart_resume" });
    return (
      <main className="wrap tool-page resume-page" style={{ paddingBlock: "48px 96px" }}>
        <BackLink href={backHref} label={backLabel} />
        {header}
        {run?.begin.outcome === "in_flight" ? (
          <div className="slot" style={{ padding: "16px 18px" }}>
            <span>your conversion is already being prepared. Reload in a moment.</span>
          </div>
        ) : blocked ? (
          <UpgradeWall
            feature="smart_resume"
            access={run?.begin.access ?? read.access}
            renewsAt={run?.begin.renewsAt ?? read.renewsAt}
            reasonNote="this period's free Smart Resume conversion is used"
          />
        ) : (
          <form
            method="get"
            action="/resume/smart"
            className="border"
            style={{ borderColor: "var(--line-strong)", padding: "18px 20px", maxWidth: 640 }}
          >
            {listingId && <input type="hidden" name="listing" value={listingId} />}
            <input type="hidden" name="run" value="1" />
            <p className="t-sm" style={{ color: "var(--text)" }}>
              {TIER_LABELS.free} includes one Smart Resume conversion every 30 days, viewed on screen.
              This one {target ? `(for ${target.title} at ${target.company})` : "(the standard layout)"} will use it.
              Reopening it later is free; editing your resume makes a new revision.
            </p>
            <p className="mono" style={{ color: "var(--muted)", marginTop: 8 }}>
              PDF export is part of {TIER_LABELS.apply}.
            </p>
            <button type="submit" className="btn press" style={{ marginTop: 14 }}>
              convert my resume
            </button>
          </form>
        )}
      </main>
    );
  }

  return (
    <main className="wrap tool-page resume-page" style={{ paddingBlock: "48px 96px" }}>
      <BackLink href={backHref} label={backLabel} />
      {header}

      <div
        className="print-hide flex flex-wrap items-center justify-between gap-4 border"
        style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 24 }}
      >
        <div className="mono">
          {smart.mode === "tailored" ? "tailored" : "standard layout"}
          {!read.access.unlimited && run?.begin.renewsAt ? ` · next free conversion ${formatRenewal(run.begin.renewsAt)}` : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {listingId && (
            <Link href="/resume/smart" prefetch={false} className="btn press" style={{ textDecoration: "none" }}>
              standard layout
            </Link>
          )}
          <Link href="/resume" className="btn press" style={{ textDecoration: "none" }}>
            edit resume
          </Link>
          {canExport ? (
            <PrintButton label="print / save as PDF" />
          ) : (
            <Link href="/pricing?feature=smart_resume_pdf" className="btn press" style={{ textDecoration: "none" }}>
              PDF export · {TIER_LABELS.apply}
            </Link>
          )}
        </div>
      </div>

      {/* Free views on screen only. The print stylesheet swaps the sheet for a
          notice inside this wrapper; see `.smart-print-locked` in globals.css. */}
      <div className={canExport ? undefined : "smart-print-locked"}>
        <SmartResumeSheet resume={smart} />
        {!canExport && (
          <div className="smart-print-notice">
            Smart Resume PDF export is part of {TIER_LABELS.apply}. Your conversion stays
            viewable on screen in Instela.
          </div>
        )}
      </div>

      <section className="print-hide" style={{ marginTop: 32, maxWidth: 720 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 10 }}>what changed</div>
        <ul className="t-sm" style={{ color: "var(--muted)", paddingLeft: 18, listStyle: "disc" }}>
          {smart.notes.map((n) => (
            <li key={n} style={{ marginBottom: 4 }}>{n}</li>
          ))}
        </ul>

        {smart.mode === "tailored" && (
          <div style={{ marginTop: 20 }}>
            <div className="eyebrow chrome" style={{ marginBottom: 8 }}>against this listing</div>
            {smart.matchedSkills.length > 0 && (
              <p className="t-sm" style={{ color: "var(--text)" }}>
                Your resume shows: {smart.matchedSkills.join(", ")}.
              </p>
            )}
            {smart.missingSkills.length > 0 && (
              <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6 }}>
                The listing asks for {smart.missingSkills.join(", ")}, and your resume does not show{" "}
                {smart.missingSkills.length === 1 ? "it" : "them"}. We did not add{" "}
                {smart.missingSkills.length === 1 ? "it" : "them"}. If you have{" "}
                {smart.missingSkills.length === 1 ? "it" : "them"},{" "}
                <Link href="/resume" style={{ color: "var(--accent)" }}>add it to your resume</Link> in your own words.
              </p>
            )}
          </div>
        )}

        {(smart.experiences.some((e) => e.omitted.length > 0) || smart.omittedProjects.length > 0) && (
          <div style={{ marginTop: 20 }}>
            <div className="eyebrow chrome" style={{ marginBottom: 8 }}>left off to fit one page</div>
            <ul className="t-sm" style={{ color: "var(--muted)", paddingLeft: 18, listStyle: "disc" }}>
              {smart.experiences.flatMap((e) =>
                e.omitted.map((b, i) => (
                  <li key={`${e.heading}-${i}`} style={{ marginBottom: 4 }}>
                    <span className="mono">{e.heading}</span> · {b}
                  </li>
                )),
              )}
              {smart.omittedProjects.map((p) => (
                <li key={`project-${p}`} style={{ marginBottom: 4 }}>
                  <span className="mono">project</span> · {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mono" style={{ marginTop: 20, color: "var(--faint-readable)" }}>
          tags beside a bullet (weak opener, no number, long) never print. They are what the resume
          critique would flag; fix them on the resume page.
        </p>
      </section>
    </main>
  );
}
