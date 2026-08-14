import Link from "next/link";

import { ResumeEditor } from "@/components/ResumeEditor";
import { requireUser } from "@/lib/auth";
import { getLatestResume } from "@/lib/profile/store";
import { coerceParsedResume } from "@/lib/resume/types";

export const dynamic = "force-dynamic";

/**
 * The resume editor page.
 *
 * Separate from `/profile` because they answer different questions. The
 * profile is what a student tells us about themselves; this is what their
 * document says, and the difference matters — the critique and the keyword gap
 * are only meaningful against the document.
 */
export default async function ResumePage() {
  const user = await requireUser("/resume");
  const resume = await getLatestResume(user.id);

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <header style={{ marginBottom: 32 }}>
        <div className="eyebrow chrome">resume</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          what your resume <span style={{ color: "var(--accent)" }}>actually says</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "60ch", marginTop: 14 }}>
          This is the structure we read out of your upload. Fixing it here fixes what every
          score and cover letter draws on — they may state what is on this page and nothing
          else.
        </p>
      </header>

      {resume ? (
        <>
          <div
            className="flex flex-wrap items-center justify-between gap-4 border"
            style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 28 }}
          >
            <div>
              <div className="mono chrome">editing</div>
              <div className="t-sm" style={{ marginTop: 4, color: "var(--text)" }}>
                {resume.fileName ?? "your resume"}
              </div>
              <div className="mono" style={{ marginTop: 6 }}>
                uploaded {resume.createdAt.toISOString().slice(0, 10)}
              </div>
            </div>
            <Link href="/profile" className="btn press" style={{ textDecoration: "none" }}>
              upload a new one
            </Link>
          </div>

          {/* Said plainly because the gap is real until export ships: edits move
              our scores immediately, but the PDF an employer receives is still
              the file that was uploaded. */}
          <div className="slot" style={{ marginBottom: 28, padding: "14px 16px" }}>
            <span>
              edits change what we score and what cover letters may assert — they do not change
              the PDF you uploaded. download is not built yet
            </span>
          </div>

          <ResumeEditor initial={coerceParsedResume(resume.parsed)} />
        </>
      ) : (
        <div className="slot" style={{ padding: "20px" }}>
          <span>
            no resume yet —{" "}
            <Link href="/profile" style={{ color: "var(--accent)" }}>
              upload one on your profile
            </Link>{" "}
            and it will be parsed into fields you can correct here
          </span>
        </div>
      )}
    </main>
  );
}
