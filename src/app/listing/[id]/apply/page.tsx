import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyField } from "@/components/CopyField";
import { requireUser } from "@/lib/auth";
import { buildApplicationPacket } from "@/lib/apply/packet";
import { getPosting } from "@/lib/feed";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { toScoreProfile } from "@/lib/profile/types";
import { coerceParsedResume } from "@/lib/resume/types";
import { skillsFromParsedResume } from "@/lib/score/skills";

export const dynamic = "force-dynamic";

/**
 * The application packet for one posting.
 *
 * WHAT THIS PAGE IS FOR. Applying to twenty internships means typing the same
 * fifteen facts twenty times. This assembles them once, from what the student
 * already gave us, with a copy button on each.
 *
 * WHAT IT DOES NOT DO, ON PURPOSE. It does not submit anything, and there is
 * no button here that will. Every employer form stays a form the student fills
 * in and sends themselves. Two reasons, and neither is timidity:
 *
 *  - Applications ask questions no stored profile answers — "why this team",
 *    "describe a time you…" — and a model answering those would be asserting
 *    things about a student that nothing in their resume supports. That is the
 *    exact failure the cover-letter generator's honest-slot rule exists to
 *    prevent, and it would be far worse here, because the output goes to an
 *    employer under the student's name without them reading it.
 *  - Applications also carry legal attestations. Those are separated out
 *    below and never pre-filled with a guess.
 */
export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/listing/${id}/apply`);

  const [profile, resume] = await Promise.all([getProfile(user.id), getLatestResume(user.id)]);

  const parsed = resume ? coerceParsedResume(resume.parsed) : null;
  const scoreProfile = toScoreProfile(profile, parsed ? skillsFromParsedResume(parsed) : []);
  const posting = await getPosting(id, scoreProfile);
  if (!posting) notFound();

  const packet = buildApplicationPacket({
    profile,
    resume: parsed,
    accountEmail: user.email ?? null,
  });

  const gaps = packet.fields.filter((f) => f.value === null);
  const conflicts = packet.fields.filter((f) => f.conflict);

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/listing/${id}`} className="mono chrome press" style={{ color: "var(--accent)" }}>
          ← back to the listing
        </Link>
      </div>

      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">application packet</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          everything this form will <span style={{ color: "var(--accent)" }}>ask you for</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "62ch", marginTop: 14 }}>
          {posting.title}
          {posting.company ? ` · ${posting.company}` : ""}
        </p>
      </header>

      <div
        className="flex flex-wrap items-center justify-between gap-4 border"
        style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 28 }}
      >
        <div>
          <div className="mono chrome">ready to paste</div>
          <div className="t-sm" style={{ marginTop: 4, color: "var(--text)" }}>
            {packet.known} of {packet.total} fields filled from what you have already given us
          </div>
        </div>
        <a
          href={posting.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary press"
          style={{ textDecoration: "none" }}
        >
          open the real application ↗
        </a>
      </div>

      {conflicts.length > 0 && (
        <div className="slot" style={{ marginBottom: 24, padding: "14px 16px" }}>
          <span>
            {conflicts.length === 1 ? "one field disagrees" : `${conflicts.length} fields disagree`}{" "}
            between your profile and your resume — worth settling before you submit
          </span>
        </div>
      )}

      <div className="eyebrow chrome" style={{ marginBottom: 12 }}>
        01 — your details
      </div>
      {packet.fields.map((field) => (
        <CopyField key={field.key} field={field} />
      ))}

      {gaps.length > 0 && (
        <p className="mono" style={{ marginTop: 10, color: "var(--faint-readable)" }}>
          {gaps.length} of these we do not hold. Filling them in on{" "}
          <Link href="/profile" style={{ color: "var(--accent)" }}>
            your profile
          </Link>{" "}
          or{" "}
          <Link href="/resume" style={{ color: "var(--accent)" }}>
            your resume
          </Link>{" "}
          fills them in here, and on every application after this one.
        </p>
      )}

      <div className="eyebrow chrome" style={{ marginTop: 36, marginBottom: 12 }}>
        02 — you answer these yourself
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "62ch", marginBottom: 14 }}>
        These are legal declarations rather than form-filling. We do not pre-fill a guess at any of
        them, and where you have told us something we show it back for you to confirm rather than
        treating it as ours to assert.
      </p>
      {packet.attestations.map((field) => (
        <CopyField key={field.key} field={field} />
      ))}

      <div className="eyebrow chrome" style={{ marginTop: 36, marginBottom: 12 }}>
        03 — your cover letter
      </div>
      <div className="slot" style={{ padding: "14px 16px" }}>
        <span>
          the{" "}
          <Link href={`/listing/${id}`} style={{ color: "var(--accent)" }}>
            listing page
          </Link>{" "}
          drafts one grounded in this posting and your resume, editable paragraph by paragraph
        </span>
      </div>

      <footer className="mono" style={{ marginTop: 48, color: "var(--faint-readable)" }}>
        we do not submit applications for you. every field here is yours, assembled so you stop
        retyping it — you review it and you send it.
      </footer>
    </main>
  );
}
