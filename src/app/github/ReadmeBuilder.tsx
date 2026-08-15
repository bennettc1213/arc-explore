import Link from "next/link";

import { CopyBlock } from "@/components/CopyBlock";
import type { GeneratedReadme } from "@/lib/github/readme";

const SOURCE_LABEL: Record<GeneratedReadme["sources"][number]["from"], string> = {
  github: "github",
  profile: "your profile",
  resume: "your resume",
  account: "your sign-in address",
};

/**
 * The profile README builder.
 *
 * Two things are load-bearing about how this reads. The placeholders are shown
 * as a list before the file, because a student who copies first and reads
 * second publishes a README with brackets in it. And the provenance line says
 * which facts came from where — the same rule as the application packet, since
 * this file goes on a public page under their name.
 */
export function ReadmeBuilder({
  readme,
  username,
  signedIn,
}: {
  readme: GeneratedReadme;
  username: string;
  signedIn: boolean;
}) {
  const used = [...new Set(readme.sources.map((s) => s.from))];

  return (
    <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
      <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
        your profile README
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: 16 }}>
        Put this in a public repository named exactly <span className="mono">{username}</span>, as{" "}
        <span className="mono">README.md</span>. GitHub renders it at the top of your profile.
        Every repository name, link and language below was copied out of the API response rather
        than written by a model, so none of them can be subtly wrong.
      </p>

      {readme.slots.length > 0 && (
        <div className="slot" style={{ padding: "14px 16px", marginBottom: 18 }}>
          <span>
            <strong>{readme.slots.length}</strong> {readme.slots.length === 1 ? "thing" : "things"} we
            do not know about you, left as a visible placeholder rather than a guess. Fill them in
            below before you copy — a bracket in a published README is better than a sentence we
            made up, but neither is what you want on the page.
          </span>
        </div>
      )}

      <CopyBlock initial={readme.markdown} label="README.md" rows={Math.min(30, readme.markdown.split("\n").length + 4)} />

      <div className="mono" style={{ marginTop: 14, color: "var(--faint-readable)" }}>
        facts pulled from: {used.map((u) => SOURCE_LABEL[u]).join(" · ")}
        {!signedIn && (
          <>
            {" "}
            ·{" "}
            <Link href={`/login?next=/github?u=${username}`} style={{ color: "var(--accent)" }}>
              sign in
            </Link>{" "}
            to fill your school, major, graduation year and skills in from your profile and resume
          </>
        )}
      </div>

      <p className="mono" style={{ marginTop: 12, color: "var(--faint-readable)" }}>
        no badge walls, no streak counters, no trophy widgets. the audit above measures a README
        after stripping images, because that is what a reader is left with — generating the thing
        we penalise would be incoherent.
      </p>
    </section>
  );
}
