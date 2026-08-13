"use client";

import { useActionState, useState } from "react";

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
  const [statusState, statusAction, statusPending] = useActionState(setStatusAction, INITIAL);
  const [detailState, detailAction, detailPending] = useActionState(updateDetailsAction, INITIAL);
  const [, removeFormAction, removePending] = useActionState(removeAction, INITIAL);
  const [open, setOpen] = useState(false);

  const meta = statusMeta(app.status);

  return (
    <article
      className={`border-b ${app.closed ? "is-closed" : ""}`}
      style={{ borderColor: "var(--line)", padding: "16px 0" }}
    >
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
          <form action={statusAction}>
            <input type="hidden" name="postingId" value={app.postingId} />
            <select
              name="status"
              defaultValue={app.status}
              className="field"
              style={{ width: "auto", padding: "6px 9px", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}
              disabled={statusPending}
              // Auto-submit: a separate "update" button for a control whose
              // only purpose is to change one value is friction, not safety.
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
