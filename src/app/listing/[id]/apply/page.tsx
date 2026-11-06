import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { ApplicationWorkspace } from "@/components/apply/ApplicationWorkspace";
import { requireUser } from "@/lib/auth";
import { directApplicationUrl, embedStatus } from "@/lib/apply/apply-url";
import { getPosting } from "@/lib/feed";
import { getUserTier } from "@/lib/pricing/entitlements";
import { autofillFeature, evaluateFeature, TIER_LABELS } from "@/lib/pricing/tiers";
import { getProfile, getLatestResume } from "@/lib/profile/store";
import { getMemorySnapshot } from "@/lib/profile/memory-store";
import { toScoreProfile } from "@/lib/profile/types";
import { skillsFromParsedResume } from "@/lib/score/skills";
import { MEMORY_FIELDS } from "@/lib/profile/memory";
import { scoutReturnPath } from "@/lib/scout/navigation";
import { probeApplicationFrame } from "@/lib/apply/frame-probe";

export const dynamic = "force-dynamic";
export default async function ApplyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const returnTo = scoutReturnPath((await searchParams).returnTo);
  const user = await requireUser(`/listing/${id}/apply`);
  const [profile, resume, facts, tier] = await Promise.all([getProfile(user.id), getLatestResume(user.id), getMemorySnapshot(user.id, user.email ?? null), getUserTier(user.id)]);
  const posting = await getPosting(id, toScoreProfile(profile, resume ? skillsFromParsedResume(resume.parsed) : []));
  if (!posting) notFound();
  const access = evaluateFeature(tier, autofillFeature(posting.kind));
  const applicationUrl = directApplicationUrl(posting.url);
  const recordedEmbedding = embedStatus(applicationUrl, { frameAllowStrikes: posting.frameAllowStrikes });
  const liveEmbedding = !posting.closedAt && access.usable && recordedEmbedding !== "embedded" && recordedEmbedding !== "withheld"
    ? await probeApplicationFrame(applicationUrl) : null;
  const embedded = recordedEmbedding === "embedded" || liveEmbedding === "allow";
  return <main className="wrap apply-page" style={{ paddingBlock: "32px 80px" }}>
    <BackLink href={returnTo ?? `/listing/${id}`} label={returnTo ? "Back to Scout results" : "Back to listing"} />
    <header className="memory-heading"><div><div className="eyebrow">APPLY WITH INSTELA · {TIER_LABELS.apply}</div><h1>{posting.title}</h1><p>{posting.company ?? (posting.kind === "scholarship" ? "Scholarship application" : "Internship application")}</p></div><Link href="/profile#application-memory" className="btn">View your Instela memory</Link></header>
    {posting.closedAt ? <p role="status">This opportunity is closed. <Link href="/explore">Find another opportunity</Link>.</p> : access.usable ? <><div className="apply-how-it-works"><span><b>1</b> Open the application form</span><span><b>2</b> Autofill with Instela</span><span><b>3</b> Answer gaps, review & submit</span></div><p className="t-sm" style={{ color: "var(--muted)", marginBottom: 20 }}>Instela reuses your saved details and asks for anything missing. New profile facts are saved for next time. Answers about this specific opportunity stay in this application. <Link href="/extension">Extension setup</Link></p><ApplicationWorkspace postingId={id} url={applicationUrl} embedded={embedded} frameIssue={recordedEmbedding === "withheld" ? "withheld" : liveEmbedding === "allow" ? null : liveEmbedding} /></> : <section className="memory-privacy"><div><h2>Spend less time retyping with Instela Pro</h2><p>Autofill supported application forms from your profile, answer missing questions as you go, and save reusable details for next time.</p><Link href="/pricing?feature=extension_autofill_internships" className="btn btn-primary">Explore Pro</Link> <a href={applicationUrl} target="_blank" rel="noopener noreferrer" className="btn">Open application</a></div></section>}
    <details className="application-packet"><summary>Your reusable details · {facts.filter(f => f.value).length} saved</summary><dl>{facts.filter(f => f.value).map(fact => <div key={fact.key}><dt>{MEMORY_FIELDS.find(f => f.key === fact.key)?.label}</dt><dd>{fact.value}</dd></div>)}</dl><Link href="/profile#application-memory">Edit your saved details</Link></details>
  </main>;
}
