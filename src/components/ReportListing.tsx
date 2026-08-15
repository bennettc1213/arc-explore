"use client";

import { useActionState, useState } from "react";

import { reportListingAction, type ReportFormState } from "@/app/listing/[id]/report-actions";
import { MAX_DETAIL_LENGTH, REPORT_OPTIONS } from "@/lib/reports/types";

const INITIAL: ReportFormState = { status: "idle" };

/**
 * Report a listing.
 *
 * Collapsed by default and deliberately quiet — a prominent "report" button on
 * every row invites idle clicking, and a queue full of noise is a queue nobody
 * works. The reasons carry hints because "wrong details" means nothing to a
 * reviewer without knowing *which* detail, and asking for that at the point of
 * reporting is far more reliable than chasing it later.
 */
export function ReportListing({
  postingId,
  alreadyReported,
}: {
  postingId: string;
  alreadyReported: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(reportListingAction, INITIAL);

  if (alreadyReported && state.status === "idle") {
    return (
      <span className="mono" style={{ color: "var(--faint-readable)" }}>
        you reported this — thank you, we have it
      </span>
    );
  }

  if (state.status === "recorded" || state.status === "already") {
    return (
      <span className="mono" style={{ color: "var(--system-ok)" }}>
        {state.status === "recorded"
          ? "reported — thank you. a person reads every one of these."
          : state.message}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="mono press"
        onClick={() => setOpen(true)}
        style={{ color: "var(--faint-readable)", background: "none", border: "none", padding: 0 }}
      >
        report this listing
      </button>
    );
  }

  return (
    <form
      action={action}
      className="border"
      style={{ borderColor: "var(--line-strong)", padding: "16px 18px", width: "100%" }}
    >
      <input type="hidden" name="postingId" value={postingId} />

      <div className="mono chrome" style={{ marginBottom: 10 }}>
        what is wrong with it
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {REPORT_OPTIONS.map((o, i) => (
          <label key={o.value} className="flex items-start gap-2">
            <input
              type="radio"
              name="reason"
              value={o.value}
              defaultChecked={i === 0}
              style={{ marginTop: 5 }}
            />
            <span>
              <span className="t-sm" style={{ color: "var(--text)" }}>
                {o.label}
              </span>
              <span className="mono" style={{ display: "block", color: "var(--faint-readable)" }}>
                {o.hint}
              </span>
            </span>
          </label>
        ))}
      </div>

      <label style={{ display: "block", marginBottom: 14 }}>
        <span className="mono chrome" style={{ display: "block", marginBottom: 6 }}>
          anything else — optional
        </span>
        <textarea
          name="detail"
          rows={3}
          maxLength={MAX_DETAIL_LENGTH}
          placeholder="what you saw on the page"
          style={{
            background: "transparent",
            border: "1px solid var(--line-strong)",
            color: "var(--text)",
            padding: "10px 12px",
            font: "inherit",
            width: "100%",
            resize: "vertical",
          }}
        />
      </label>

      {state.status === "error" && (
        <p className="mono" style={{ color: "var(--accent)", marginBottom: 10 }}>
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn press" disabled={pending}>
          {pending ? "sending…" : "send report"}
        </button>
        <button type="button" className="btn press" onClick={() => setOpen(false)}>
          cancel
        </button>
      </div>
    </form>
  );
}
