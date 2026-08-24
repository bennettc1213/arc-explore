"use client";

import Link from "next/link";
import { FormEvent, useTransition, useState } from "react";

import {
  generateCoverLetterAction,
  regenerateParagraphAction,
  saveCoverLetterAction,
  type LetterActionState,
} from "@/app/listing/actions";
import {
  LETTER_ROLE_LABELS,
  type CoverLetterDraft,
} from "@/lib/cover-letter/types";

import { PrintButton } from "./PrintButton";

const INITIAL: LetterActionState = { status: "idle" };

export interface EditorCandidate {
  name: string | null;
  email: string | null;
  phone: string | null;
  portfolioUrl: string | null;
}

/**
 * The cover letter editor.
 *
 * Two states, deliberately:
 *  - No draft yet → a single "generate a first draft" form. Generation is the
 *    only path in, so every letter starts from the grounded context.
 *  - A draft exists → each paragraph is an editable textarea with a rewrite
 *    button, a save form, a start-over form, and a print button.
 *
 * Server actions are called directly inside `startTransition` rather than
 * through `useActionState` so the returned draft lands in state from the
 * event handler — there is no effect needed, and the letter sheet below the
 * editor renders from that same state, so print always matches what is on
 * screen.
 */
export function CoverLetterEditor({
  postingId,
  kind,
  initialDraft,
  candidate,
  hasResume,
}: {
  postingId: string;
  kind: "internship" | "scholarship";
  initialDraft: CoverLetterDraft | null;
  candidate: EditorCandidate;
  hasResume: boolean;
}) {
  const [draft, setDraft] = useState<CoverLetterDraft | null>(initialDraft);
  const [notice, setNotice] = useState<{ kind: "saved" | "error"; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"edit" | "preview">("edit");

  function applyResult(result: LetterActionState) {
    if (result.draft) setDraft(result.draft);
    setNotice(
      result.status === "error"
        ? { kind: "error", message: result.message }
        : { kind: "saved" },
    );
  }

  function run(action: (prev: LetterActionState, formData: FormData) => Promise<LetterActionState>) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(async () => {
        applyResult(await action(INITIAL, formData));
      });
    };
  }

  function updateParagraph(id: string, value: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      paragraphs: draft.paragraphs.map((p) => (p.id === id ? { ...p, text: value } : p)),
    });
  }

  const saved = notice?.kind === "saved" && !isPending;
  const error = notice?.kind === "error" ? notice.message : null;

  if (!hasResume) {
    return (
      <div className="slot" style={{ padding: "14px 16px" }}>
        <span>
          upload a resume on{" "}
          <Link href="/profile" style={{ color: "var(--accent)" }}>
            your profile
          </Link>{" "}
          first — every claim in the letter must come from it
        </span>
      </div>
    );
  }

  if (!draft) {
    return (
      <div>
        <form onSubmit={run(generateCoverLetterAction)}>
          <input type="hidden" name="postingId" value={postingId} />
          <button type="submit" className="btn btn-primary press" disabled={isPending}>
            {isPending ? "writing…" : "generate a first draft"}
          </button>
        </form>
        <p className="mono t-sm" style={{ color: "var(--faint-readable)", marginTop: 8 }}>
          the draft asserts only what your resume and profile actually say. where a specific
          detail is missing, it leaves a <span className="chrome">[YOUR SPECIFIC DETAIL: …]</span>{" "}
          placeholder for you — it never invents one.
        </p>
        {error && (
          <p className="mono" role="alert" style={{ color: "var(--system-danger)", marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const greeting = kind === "scholarship" ? "Dear Scholarship Committee," : "Dear Hiring Team,";
  const contact = [candidate.email, candidate.phone, candidate.portfolioUrl].filter(
    (c): c is string => Boolean(c),
  );
  const signName = candidate.name ?? "[YOUR NAME]";

  return (
    <div>
      <div className="print-hide">
        {error && (
          <p className="mono" role="alert" style={{ color: "var(--system-danger)", marginBottom: 12 }}>
            {error}
          </p>
        )}

        {draft.unfilledSlots.length > 0 && (
          <div className="slot" style={{ padding: "12px 16px", marginBottom: 16 }}>
            <div className="mono chrome">this letter still needs these filled in — we do not guess:</div>
            <ul className="t-sm" style={{ marginTop: 6, paddingLeft: 18, color: "var(--text)" }}>
              {draft.unfilledSlots.map((slot) => (
                <li key={slot} className="mono">
                  {slot}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={view === "edit" ? "btn btn-primary press" : "btn press"}
            onClick={() => setView("edit")}
          >
            edit
          </button>
          <button
            type="button"
            className={view === "preview" ? "btn btn-primary press" : "btn press"}
            onClick={() => setView("preview")}
          >
            preview
          </button>
        </div>

        <div className="flex flex-col gap-4" style={{ display: view === "edit" ? undefined : "none" }}>
          {draft.paragraphs.map((p) => (
            <label className="field-row" key={p.id}>
              <span className="mono chrome">{LETTER_ROLE_LABELS[p.role]}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <textarea
                  className="field"
                  value={p.text}
                  rows={5}
                  onChange={(e) => updateParagraph(p.id, e.target.value)}
                  style={{ width: "100%", minHeight: 110, resize: "vertical" }}
                />
                <form onSubmit={run(regenerateParagraphAction)}>
                  <input type="hidden" name="postingId" value={postingId} />
                  <input type="hidden" name="paragraphId" value={p.id} />
                  <input type="hidden" name="role" value={p.role} />
                  <input type="hidden" name="text" value={p.text} />
                  <button type="submit" className="btn press" disabled={isPending}>
                    {isPending ? "rewriting…" : "rewrite"}
                  </button>
                </form>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3" style={{ marginTop: 20 }}>
          <form onSubmit={run(saveCoverLetterAction)}>
            <input type="hidden" name="postingId" value={postingId} />
            <input type="hidden" name="paragraphs" value={JSON.stringify(draft.paragraphs)} />
            <button type="submit" className="btn btn-primary press" disabled={isPending}>
              {isPending ? "saving…" : "save edits"}
            </button>
          </form>

          <form onSubmit={run(generateCoverLetterAction)}>
            <input type="hidden" name="postingId" value={postingId} />
            <button
              type="submit"
              className="btn press"
              disabled={isPending}
              title="Regenerate the whole letter from the same facts"
            >
              {isPending ? "regenerating…" : "start over"}
            </button>
          </form>

          <PrintButton />
          {saved && (
            <span className="mono" style={{ color: "var(--accent)" }}>
              saved
            </span>
          )}
        </div>
      </div>

      {/* The sheet is what gets printed; it renders from the same state as the
          textareas so print always matches the edits on screen. Hidden on
          screen while the edit tab is active — the print stylesheet forces it
          back on regardless of `view`, see the .letter-sheet override in
          globals.css. */}
      <div
        className="letter-sheet"
        style={{ marginTop: 32, display: view === "preview" ? undefined : "none" }}
      >
        <div className="mono chrome" style={{ marginBottom: 24, color: "#55555c" }}>
          preview
        </div>
        <p className="letter-greeting">{greeting}</p>
        {draft.paragraphs.map((p) => (
          <p className="letter-paragraph" key={p.id}>
            {p.text}
          </p>
        ))}
        <div className="letter-signature" style={{ marginTop: 28 }}>
          <p>Sincerely,</p>
          <p className="letter-name">{signName}</p>
          {contact.map((line) => (
            <p className="letter-contact" key={line}>
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
