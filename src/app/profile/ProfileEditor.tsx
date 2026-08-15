"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Mascot } from "@/components/chrome/Mascot";
import {
  INTEREST_OPTIONS,
  WORK_AUTH_OPTIONS,
  type UserProfile,
} from "@/lib/profile/types";

import {
  saveProfileAction,
  uploadResumeAction,
  type ProfileFormState,
  type ResumeUploadState,
} from "./actions";

interface FormValues {
  displayName: string;
  school: string;
  major: string;
  gradYear: string;
  gpa: string;
  workAuth: string;
  targetVerticals: string[];
  targetLocations: string;
  openToRemote: boolean;
  portfolioUrl: string;
  githubUsername: string;
  linkedinUrl: string;
}

function toFormValues(profile: UserProfile | null): FormValues {
  return {
    displayName: profile?.displayName ?? "",
    school: profile?.school ?? "",
    major: profile?.major ?? "",
    gradYear: profile?.gradYear != null ? String(profile.gradYear) : "",
    gpa: profile?.gpa != null ? String(profile.gpa) : "",
    workAuth: profile?.workAuth ?? "",
    targetVerticals: profile?.targetVerticals ?? [],
    targetLocations: (profile?.targetLocations ?? []).join(", "),
    openToRemote: profile?.openToRemote ?? true,
    portfolioUrl: profile?.portfolioUrl ?? "",
    githubUsername: profile?.githubUsername ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
  };
}

const SAVE_INITIAL: ProfileFormState = { status: "idle" };
const UPLOAD_INITIAL: ResumeUploadState = { status: "idle" };

export function ProfileEditor({
  profile,
  resume,
}: {
  profile: UserProfile | null;
  resume: { fileName: string | null; createdAt: string } | null;
}) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(profile));
  const [saveState, saveAction, saving] = useActionState(saveProfileAction, SAVE_INITIAL);
  const [uploadState, uploadAction, uploading] = useActionState(
    uploadResumeAction,
    UPLOAD_INITIAL,
  );
  const [appliedUpload, setAppliedUpload] = useState<ResumeUploadState | null>(null);
  const [filledFields, setFilledFields] = useState<string[]>([]);

  /*
   * Fold a fresh parse into the form during render rather than in an effect —
   * the state adjustment happens before paint, so the user never sees the old
   * values flash. Only fields they left blank are touched (the action decides
   * that); a resume is evidence, not an override, and nothing is stored until
   * they press save.
   */
  if (uploadState.status === "parsed" && uploadState !== appliedUpload) {
    const s = uploadState.suggestions ?? {};
    const merged = { ...values };
    const filled: string[] = [];

    if (s.displayName) { merged.displayName = s.displayName; filled.push("name"); }
    if (s.school) { merged.school = s.school; filled.push("school"); }
    if (s.major) { merged.major = s.major; filled.push("major"); }
    if (s.gradYear != null) { merged.gradYear = String(s.gradYear); filled.push("graduation year"); }
    if (s.gpa != null) { merged.gpa = String(s.gpa); filled.push("gpa"); }
    if (s.portfolioUrl) { merged.portfolioUrl = s.portfolioUrl; filled.push("portfolio"); }

    setAppliedUpload(uploadState);
    setValues(merged);
    setFilledFields(filled);
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const toggleVertical = (value: string) =>
    setValues((v) => ({
      ...v,
      targetVerticals: v.targetVerticals.includes(value)
        ? v.targetVerticals.filter((x) => x !== value)
        : [...v.targetVerticals, value],
    }));

  const err = (field: string) => saveState.fieldErrors?.[field];

  return (
    <>
      {/* ---------------------------------------------------------- resume */}
      <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
          resume — optional
        </div>
        <p className="t-sm" style={{ color: "var(--muted)", marginBottom: 16, maxWidth: "62ch" }}>
          We read it once to fill in the fields below. A PDF is never stored — only the
          structure we read out of it. A .txt or .md upload is kept as text, so a re-parse
          does not need it again. Nothing is saved to your profile until you press save.{" "}
          <Link href="/privacy" style={{ color: "var(--accent)" }}>
            what we hold
          </Link>
        </p>

        <form action={uploadAction} className="flex flex-wrap items-center gap-3">
          <input
            className="field"
            type="file"
            name="resume"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            style={{ width: "auto", maxWidth: "100%" }}
          />
          <button type="submit" className="btn press" disabled={uploading}>
            {uploading ? "reading…" : "read my resume"}
          </button>
        </form>

        {uploadState.status === "error" && (
          <p className="mono" role="alert" style={{ color: "var(--system-danger)", marginTop: 12 }}>
            {uploadState.message}
          </p>
        )}

        {uploadState.status === "parsed" && (
          <div className="mt-4 flex items-start gap-3" style={{ background: "var(--accent-dim)", padding: "12px 14px" }}>
            <Mascot size={26} />
            <div>
              <div className="mono-strong chrome">
                read {uploadState.counts?.experiences ?? 0} roles ·{" "}
                {uploadState.counts?.skills ?? 0} skills ·{" "}
                {uploadState.counts?.projects ?? 0} projects
              </div>
              <div className="mono" style={{ marginTop: 4 }}>
                {filledFields.length > 0
                  ? `filled in: ${filledFields.join(", ")} — check them, then save`
                  : "nothing new to fill in — your answers below already cover it"}
              </div>
            </div>
          </div>
        )}

        {resume && uploadState.status !== "parsed" && (
          <p className="mono" style={{ marginTop: 12 }}>
            on file: {resume.fileName ?? "resume"} · read {resume.createdAt}
          </p>
        )}
      </section>

      {/* --------------------------------------------------------- profile */}
      <form action={saveAction} style={{ border: "1px solid var(--line-strong)", padding: 22 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 18 }}>
          your details
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="name" error={err("displayName")}>
            <input
              className="field"
              name="displayName"
              value={values.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              placeholder="how you sign an email"
            />
          </Field>

          <Field label="school" error={err("school")}>
            <input
              className="field"
              name="school"
              value={values.school}
              onChange={(e) => set("school", e.target.value)}
              placeholder="University of Somewhere"
            />
          </Field>

          <Field label="major" error={err("major")} hint="drives which roles count as your field">
            <input
              className="field"
              name="major"
              value={values.major}
              onChange={(e) => set("major", e.target.value)}
              placeholder="Computer Science"
            />
          </Field>

          <Field label="graduation year" error={err("gradYear")} hint="drives which terms fit">
            <input
              className="field"
              name="gradYear"
              type="number"
              inputMode="numeric"
              value={values.gradYear}
              onChange={(e) => set("gradYear", e.target.value)}
              placeholder="2027"
            />
          </Field>

          <Field label="work authorization" error={err("workAuth")}>
            <select
              className="field"
              name="workAuth"
              value={values.workAuth}
              onChange={(e) => set("workAuth", e.target.value)}
            >
              <option value="">prefer not to say</option>
              {WORK_AUTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="gpa"
            error={err("gpa")}
            hint="stored for cold emails — never used to score a posting"
          >
            <input
              className="field"
              name="gpa"
              type="number"
              step="0.01"
              value={values.gpa}
              onChange={(e) => set("gpa", e.target.value)}
              placeholder="3.7"
            />
          </Field>

          <Field label="preferred locations" error={err("targetLocations")} hint="comma separated">
            <input
              className="field"
              name="targetLocations"
              value={values.targetLocations}
              onChange={(e) => set("targetLocations", e.target.value)}
              placeholder="San Francisco, New York"
            />
          </Field>

          <Field label="portfolio" error={err("portfolioUrl")}>
            <input
              className="field"
              name="portfolioUrl"
              type="url"
              value={values.portfolioUrl}
              onChange={(e) => set("portfolioUrl", e.target.value)}
              placeholder="https://yoursite.com"
            />
          </Field>

          <Field
            label="github"
            error={err("githubUsername")}
            hint="username or profile URL — links your audit to your profile"
          >
            <input
              className="field"
              name="githubUsername"
              value={values.githubUsername}
              onChange={(e) => set("githubUsername", e.target.value)}
              placeholder="octocat"
              spellCheck={false}
            />
          </Field>

          <Field
            label="linkedin"
            error={err("linkedinUrl")}
            hint="stored so you can get back to it — we never fetch it"
          >
            <input
              className="field"
              name="linkedinUrl"
              type="url"
              value={values.linkedinUrl}
              onChange={(e) => set("linkedinUrl", e.target.value)}
              placeholder="https://linkedin.com/in/you"
            />
          </Field>
        </div>

        <div style={{ marginTop: 22 }}>
          <div className="mono chrome" style={{ marginBottom: 8 }}>
            what you are looking for
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {INTEREST_OPTIONS.map((o) => (
              <label key={o.value} className="mono chrome flex items-center gap-2">
                <input
                  type="checkbox"
                  name="targetVerticals"
                  value={o.value}
                  checked={values.targetVerticals.includes(o.value)}
                  onChange={() => toggleVertical(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          <p className="mono" style={{ marginTop: 8 }}>
            pick these if your major does not imply the roles you want
          </p>
        </div>

        <label className="mono chrome flex items-center gap-2" style={{ marginTop: 18 }}>
          <input
            type="checkbox"
            name="openToRemote"
            value="1"
            checked={values.openToRemote}
            onChange={(e) => set("openToRemote", e.target.checked)}
          />
          open to remote roles
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="submit" className="btn btn-primary press" disabled={saving}>
            {saving ? "saving…" : "save profile"}
          </button>

          {saveState.status === "saved" && (
            <span className="mono" style={{ color: "var(--accent)" }}>
              saved — your feed is scored against this now
            </span>
          )}
          {saveState.status === "error" && (
            <span className="mono" role="alert" style={{ color: "var(--system-danger)" }}>
              {saveState.message}
            </span>
          )}
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field-row">
      <span className="mono chrome">{label}</span>
      {children}
      {error ? (
        <span className="mono" style={{ color: "var(--system-danger)" }}>
          {error}
        </span>
      ) : hint ? (
        <span className="mono">{hint}</span>
      ) : null}
    </label>
  );
}
