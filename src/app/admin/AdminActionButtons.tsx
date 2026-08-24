"use client";

import { PendingButton } from "@/components/PendingButton";

import {
  hideListingAction,
  markReviewedAction,
  resolveReportAction,
  unhideListingAction,
} from "./actions";

export function HideForm({ postingId }: { postingId: string }) {
  return (
    <form action={hideListingAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="postingId" value={postingId} />
      <input
        name="reason"
        placeholder="why (recorded, never shown publicly)"
        style={{
          background: "transparent",
          border: "1px solid var(--line)",
          color: "var(--text)",
          padding: "6px 8px",
          font: "inherit",
          fontSize: "0.8rem",
          minWidth: 240,
        }}
      />
      <PendingButton type="submit" pendingLabel="hiding…" className="btn press">
        hide
      </PendingButton>
    </form>
  );
}

export function UnhideButton({ postingId }: { postingId: string }) {
  return (
    <form action={unhideListingAction}>
      <input type="hidden" name="postingId" value={postingId} />
      <PendingButton type="submit" pendingLabel="putting back…" className="btn press">
        put it back
      </PendingButton>
    </form>
  );
}

export function ResolveForm({ reportId }: { reportId: string }) {
  return (
    <form action={resolveReportAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <input
        name="resolution"
        placeholder="what you decided"
        style={{
          background: "transparent",
          border: "1px solid var(--line)",
          color: "var(--text)",
          padding: "6px 8px",
          font: "inherit",
          fontSize: "0.8rem",
          minWidth: 200,
        }}
      />
      <PendingButton type="submit" pendingLabel="resolving…" className="btn press">
        resolve
      </PendingButton>
    </form>
  );
}

export function MarkReviewedButton({ postingId }: { postingId: string }) {
  return (
    <form action={markReviewedAction}>
      <input type="hidden" name="postingId" value={postingId} />
      <PendingButton type="submit" pendingLabel="noted…" className="btn press">
        looked, leave it up
      </PendingButton>
    </form>
  );
}
