"use client";

import Link from "next/link";
import { useActionState, useOptimistic } from "react";

import { setStatusAction, type TrackerActionState } from "@/app/tracker/actions";
import type { ApplicationStatus } from "@/db/schema";

const INITIAL: TrackerActionState = { status: "idle" };

/**
 * The feed's one-click entry into the tracker.
 *
 * Deliberately not a full status picker. A feed row is for scanning, and eight
 * options on every row would drown the posting itself — moving an application
 * along its process belongs on /tracker, where that is the task at hand.
 *
 * OPTIMISTIC, AND THAT IS THE POINT. `setStatusAction` calls
 * `revalidatePath("/")`, so the truthful `current` prop cannot arrive until the
 * whole feed has been re-rendered on the server. Waiting for it made this
 * button sit on "saving…" for as long as that took — six seconds before the
 * feed was paginated, and still a visible beat after. Saving is a local,
 * certain, one-row write; there is no reason for the UI to pretend it is in
 * doubt.
 *
 * `useOptimistic` is the right tool rather than a plain `useState` because it
 * reconciles itself: the optimistic value is discarded automatically when the
 * action settles and the real prop arrives. A hand-rolled flag has to be
 * cleared by hand, and the case people forget is the failure — leaving the row
 * reading "saved" when the write did not happen. Here a rejected write reverts
 * the button on its own, and the error is shown beside it.
 */
export function TrackButton({
  postingId,
  current,
}: {
  postingId: string;
  current: ApplicationStatus | null;
}) {
  const [state, formAction] = useActionState(setStatusAction, INITIAL);
  const [optimistic, setOptimistic] = useOptimistic(
    current,
    (_prev, next: ApplicationStatus) => next,
  );

  if (optimistic) {
    return (
      <Link
        href="/tracker"
        className="mono press"
        style={{ color: "var(--accent)", whiteSpace: "nowrap" }}
        title="Open your tracker"
      >
        ▪ {optimistic}
      </Link>
    );
  }

  return (
    <form
      action={(formData) => {
        // Inside the form action, so React treats it as part of the same
        // transition the server call belongs to — which is what lets it roll
        // back cleanly if that call fails.
        setOptimistic("saved");
        return formAction(formData);
      }}
    >
      <input type="hidden" name="postingId" value={postingId} />
      <input type="hidden" name="status" value="saved" />
      <button
        type="submit"
        className="btn press"
        style={{ padding: "6px 12px", whiteSpace: "nowrap" }}
      >
        save
      </button>
      {state.status === "error" && (
        <span className="mono" role="alert" style={{ color: "var(--system-danger)" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
