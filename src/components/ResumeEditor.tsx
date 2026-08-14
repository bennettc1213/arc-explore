"use client";

import { FormEvent, useState, useTransition } from "react";

import { saveResumeAction, type ResumeEditState } from "@/app/resume/actions";
import { parseBulletsInput, parseSkillsInput } from "@/lib/resume/edit";
import type { ParsedResume } from "@/lib/resume/types";

/**
 * The resume editor.
 *
 * Everything lives in one piece of client state and is posted as a single JSON
 * field. The alternative — index-encoded form names like `experiences.0.role`
 * — has to be reassembled on the server by string-parsing keys, and a student
 * deleting the second of three experiences leaves a hole that reindexing has
 * to paper over. One JSON payload keeps array order the client's business,
 * and the server still validates it against the stored schema, so nothing is
 * trusted just because it arrived shaped correctly.
 *
 * Skills and bullets stay raw strings while being typed and are only split on
 * submit. Splitting on every keystroke means a student cannot type a comma.
 */
export function ResumeEditor({ initial }: { initial: ParsedResume }) {
  const [resume, setResume] = useState<ParsedResume>(initial);
  const [skillsText, setSkillsText] = useState(initial.skills.join(", "));
  const [bulletText, setBulletText] = useState<Record<number, string>>(() =>
    Object.fromEntries(initial.experiences.map((e, i) => [i, e.bullets.join("\n")])),
  );
  const [state, setState] = useState<ResumeEditState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof ParsedResume>(key: K, value: ParsedResume[K]) =>
    setResume((r) => ({ ...r, [key]: value }));

  /** The structure as it would be stored, with the raw text fields split. */
  const collect = (): ParsedResume => ({
    ...resume,
    skills: parseSkillsInput(skillsText),
    experiences: resume.experiences.map((e, i) => ({
      ...e,
      bullets: parseBulletsInput(bulletText[i] ?? ""),
    })),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("resume", JSON.stringify(collect()));

    startTransition(async () => {
      const next = await saveResumeAction(state, data);
      setState(next);
      if (next.status === "saved") {
        // Re-sync from what was actually collected, so the on-screen skill
        // list matches the deduped list that was stored rather than the
        // looser text that produced it.
        const stored = collect();
        setResume(stored);
        setSkillsText(stored.skills.join(", "));
      }
    });
  }

  const addExperience = () =>
    setResume((r) => ({
      ...r,
      experiences: [...r.experiences, { organization: null, role: null, dates: null, location: null, bullets: [] }],
    }));

  const removeExperience = (index: number) => {
    setResume((r) => ({ ...r, experiences: r.experiences.filter((_, i) => i !== index) }));
    // Bullet text is keyed by index, so the map has to shift with the array or
    // the row below inherits the deleted row's bullets.
    setBulletText((prev) => {
      const next: Record<number, string> = {};
      let cursor = 0;
      for (const [key, value] of Object.entries(prev)) {
        const i = Number(key);
        if (i === index) continue;
        next[cursor++] = value;
      }
      return next;
    });
  };

  const patchExperience = (index: number, patch: Partial<ParsedResume["experiences"][number]>) =>
    setResume((r) => ({
      ...r,
      experiences: r.experiences.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }));

  const patchProject = (index: number, patch: Partial<ParsedResume["projects"][number]>) =>
    setResume((r) => ({
      ...r,
      projects: r.projects.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));

  return (
    <form onSubmit={onSubmit}>
      <section style={{ marginBottom: 32 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 12 }}>
          01 — contact + education
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="name" value={resume.name} onChange={(v) => set("name", v)} />
          <Field label="email" value={resume.email} onChange={(v) => set("email", v)} />
          <Field label="phone" value={resume.phone} onChange={(v) => set("phone", v)} />
          <Field label="school" value={resume.school} onChange={(v) => set("school", v)} />
          <Field label="major" value={resume.major} onChange={(v) => set("major", v)} />
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field
              label="grad year"
              value={resume.gradYear === null ? null : String(resume.gradYear)}
              onChange={(v) => set("gradYear", v === null ? null : Number(v))}
              placeholder="2027"
            />
            <Field
              label="gpa"
              value={resume.gpa === null ? null : String(resume.gpa)}
              onChange={(v) => set("gpa", v === null ? null : Number(v))}
              placeholder="3.7"
            />
          </div>
        </div>
        <p className="mono" style={{ marginTop: 10, color: "var(--faint-readable)" }}>
          leave anything your resume does not state blank — an empty field is recorded as
          &quot;not stated&quot;, never as zero
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 12 }}>
          02 — skills
        </div>
        <textarea
          className="field"
          rows={3}
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
          placeholder="Python, React, PostgreSQL"
          style={{ width: "100%", resize: "vertical" }}
        />
        <p className="mono" style={{ marginTop: 8, color: "var(--faint-readable)" }}>
          commas or new lines. these are matched against what each listing asks for, so the
          feed re-scores as soon as you save
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="eyebrow chrome">03 — experience</div>
          <button type="button" className="btn press" onClick={addExperience}>
            + add
          </button>
        </div>

        {resume.experiences.length === 0 && (
          <div className="slot" style={{ padding: "14px 16px" }}>
            nothing read from your resume yet — add an entry
          </div>
        )}

        {resume.experiences.map((exp, i) => (
          <div
            key={i}
            className="border"
            style={{ borderColor: "var(--line)", padding: 16, marginBottom: 12 }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="organization"
                value={exp.organization}
                onChange={(v) => patchExperience(i, { organization: v })}
              />
              <Field label="role" value={exp.role} onChange={(v) => patchExperience(i, { role: v })} />
              <Field
                label="dates"
                value={exp.dates}
                onChange={(v) => patchExperience(i, { dates: v })}
                placeholder="Jun 2025 – Aug 2025"
              />
              <Field
                label="location"
                value={exp.location}
                onChange={(v) => patchExperience(i, { location: v })}
              />
            </div>

            <label className="field-row" style={{ marginTop: 12 }}>
              <span className="mono chrome">bullets — one per line</span>
              <textarea
                className="field"
                rows={4}
                value={bulletText[i] ?? ""}
                onChange={(e) => setBulletText((prev) => ({ ...prev, [i]: e.target.value }))}
                style={{ resize: "vertical" }}
              />
            </label>

            <button
              type="button"
              className="btn press"
              style={{ marginTop: 12 }}
              onClick={() => removeExperience(i)}
            >
              remove
            </button>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 32 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="eyebrow chrome">04 — projects</div>
          <button
            type="button"
            className="btn press"
            onClick={() =>
              setResume((r) => ({ ...r, projects: [...r.projects, { name: null, description: null, link: null }] }))
            }
          >
            + add
          </button>
        </div>

        {resume.projects.map((project, i) => (
          <div
            key={i}
            className="border"
            style={{ borderColor: "var(--line)", padding: 16, marginBottom: 12 }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="name" value={project.name} onChange={(v) => patchProject(i, { name: v })} />
              <Field label="link" value={project.link} onChange={(v) => patchProject(i, { link: v })} />
            </div>
            <label className="field-row" style={{ marginTop: 12 }}>
              <span className="mono chrome">description</span>
              <textarea
                className="field"
                rows={2}
                value={project.description ?? ""}
                onChange={(e) => patchProject(i, { description: e.target.value || null })}
                style={{ resize: "vertical" }}
              />
            </label>
            <button
              type="button"
              className="btn press"
              style={{ marginTop: 12 }}
              onClick={() => setResume((r) => ({ ...r, projects: r.projects.filter((_, j) => j !== i) }))}
            >
              remove
            </button>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary press" disabled={isPending}>
          {isPending ? "saving…" : "save resume"}
        </button>
        {state.status === "saved" && <span className="mono">saved</span>}
        {state.status === "error" && (
          <span className="mono" style={{ color: "var(--accent)" }}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}) {
  return (
    <label className="field-row">
      <span className="mono chrome">{label}</span>
      <input
        className="field"
        value={value ?? ""}
        placeholder={placeholder}
        // Blank becomes null here as well as on the server, so the value the
        // editor holds is the value that would be stored.
        onChange={(e) => onChange(e.target.value.length > 0 ? e.target.value : null)}
      />
    </label>
  );
}
