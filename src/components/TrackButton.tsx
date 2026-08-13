"use client";

import Link from "next/link";
import { useActionState } from "react";

import { setStatusAction, type TrackerActionState } from "@/app/tracker/actions";
import type { ApplicationStatus } from "@/db/schema";

const INITIAL: TrackerActionState = { status: "idle" };

/**
 * The feed's one-click entry into the tracker.
 *
 * Deliberately not a full status picker. A feed row is for scanning, and eight
 * options on every row would drown the posting itself — moving an application
 * along its process belongs on /tracker, where that is the task at hand.
 */
export function TrackButton({
  postingId,
  current,
}: {
  postingId: string;
  current: ApplicationStatus | null;
}) {
  const [state, formAction, pending] = useActionState(setStatusAction, INITIAL);

  if (current) {
    return (
      <Link
        href="/tracker"
        className="mono press"
        style={{ color: "var(--accent)", whiteSpace: "nowrap" }}
        title="Open your tracker"
      >
        ▪ {current}
      </Link>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="postingId" value={postingId} />
      <input type="hidden" name="status" value="saved" />
      <button
        type="submit"
        className="btn press"
        style={{ padding: "6px 12px", whiteSpace: "nowrap" }}
        disabled={pending}
      >
        {pending ? "saving…" : "save"}
      </button>
      {state.status === "error" && (
        <span className="mono" role="alert" style={{ color: "var(--system-danger)" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
