"use client";

import { useActionState, useOptimistic, useState } from "react";

import type { ApplicationStatus } from "@/db/schema";
import { STATUSES, statusMeta } from "@/lib/applications/types";

import {
  removeAction,
  setStatusAction,
  updateDetailsAction,
  type TrackerActionState,
} from "./actions";

const INITIAL: TrackerActionState = { status: "idle" };

export interface CardApplication {
  id: string;
  postingId: string;
  status: ApplicationStatus;
  appliedAgo: string | null;
  outcome: string | null;
  notes: string | null;
  title: string;
  company: string;
  url: string;
  locations: string[];
  term: string | null;
  closed: boolean;
}

export function ApplicationCard({ app }: { app: CardApplication }) {
  const [statusState, statusAction] = useActionState(setStatusAction, INITIAL);
  const [detailState, detailAction, detailPending] = useActionState(updateDetailsAction, INITIAL);
  const [, removeFormAction, removePending] = useActionState(removeAction, INITIAL);
  const [open, setOpen] = useState(false);

  /*
   * Optimistic status, for the same reason as `TrackButton`.
   *
   * `setStatusAction` revalidates BOTH `/` and `/tracker`, so the true status
   * could not come back until the feed had been rebuilt too — a card on this
   * page was waiting on a render of a different one. The select used to dim
   * and freeze for that whole time, which reads as "did that work?" on an
   * action that is a single-row write.
   *
   * The label and the pip beside it are driven from the same optimistic value,
   * so the whole card moves at once. Anything less is worse than waiting: a
   * dropdown that jumps to "submitted" above a label still reading "applying"
   * looks broken in a way the honest delay did not.
   */
  const [status, setStatus] = useOptimistic(
    app.status,
    (_prev, next: ApplicationStatus) => next,
  );

  const meta = statusMeta(status);

  return (
    <article className={`card ${app.closed ? "is-closed" : ""}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {/* filled vs hollow square, not a second hue — colourblind-safe
                and on-language with the pixel motif */}
            <span className={meta.terminal ? "pip pip-closed" : "pip pip-live"} aria-hidden />
            <span className="mono">{meta.label}</span>
            {app.appliedAgo && <span className="mono">· applied {app.appliedAgo}</span>}
            {app.closed && (
              <span className="mono" style={{ color: "var(--accent-lite)" }}>
                · posting closed
              </span>
            )}
          </div>

          {/* Employer-authored text, rendered as written. */}
          <h3 className="t-base" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="press"
              style={{ color: "var(--text)", textDecoration: "none" }}
            >
              {app.title}
            </a>
          </h3>

          <div className="t-sm mt-1" style={{ color: "var(--muted)" }}>
            {app.company}
            {app.locations.length > 0 && <> · {app.locations.slice(0, 2).join(" / ")}</>}
            {app.term && <> · {app.term}</>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <form
            action={(formData) => {
              const next = String(formData.get("status") ?? "");
              // Guarded rather than cast: the value comes off a form, and a
              // status the app does not know must not become the optimistic
              // one — the server would reject it and the card would have shown
              // a state that never existed.
              if (STATUSES.some((s) => s.value === next)) {
                setStatus(next as ApplicationStatus);
              }
              return statusAction(formData);
            }}
          >
            <input type="hidden" name="postingId" value={app.postingId} />
            <select
              name="status"
              value={status}
              className="field"
              style={{
                width: "auto",
                padding: "6px 9px",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
              }}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </form>

          <button
            type="button"
            className="btn press"
            style={{ padding: "6px 12px" }}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {app.notes || app.outcome ? "notes ▪" : "notes"}
          </button>
        </div>
      </div>

      {statusState.status === "error" && (
        <p className="mono" role="alert" style={{ color: "var(--system-danger)", marginTop: 8 }}>
          {statusState.message}
        </p>
      )}

      {open && (
        <div style={{ marginTop: 14, borderLeft: "1px solid var(--line-strong)", paddingLeft: 14 }}>
          <form action={detailAction}>
            <input type="hidden" name="applicationId" value={app.id} />

            <label className="field-row" style={{ marginBottom: 12 }}>
              <span className="mono chrome">notes</span>
              <textarea
                name="notes"
                defaultValue={app.notes ?? ""}
                rows={3}
                className="field"
                placeholder="who you spoke to, what they asked, what to follow up on"
              />
            </label>

            <label className="field-row">
              <span className="mono chrome">outcome</span>
              <input
                name="outcome"
                defaultValue={app.outcome ?? ""}
                className="field"
                placeholder="what actually happened, in your words"
              />
              <span className="mono">
                {/* Being straight about why we ask. */}
                this is the only real evidence this app will ever have about what works — it is
                not used to score anything today
              </span>
            </label>

            <div className="mt-4 flex items-center gap-4">
              <button type="submit" className="btn btn-primary press" disabled={detailPending}>
                {detailPending ? "saving…" : "save notes"}
              </button>
              {detailState.status === "ok" && (
                <span className="mono" style={{ color: "var(--accent)" }}>
                  saved
                </span>
              )}
            </div>
          </form>

          <form action={removeFormAction} style={{ marginTop: 18 }}>
            <input type="hidden" name="applicationId" value={app.id} />
            <button
              type="submit"
              className="btn press"
              style={{ borderColor: "var(--line)", color: "var(--faint-readable)" }}
              disabled={removePending}
            >
              {removePending ? "removing…" : "remove from tracker"}
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
