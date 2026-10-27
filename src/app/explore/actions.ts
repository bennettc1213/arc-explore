"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { EventName } from "@/db/schema";
import { isInAppBrowser } from "@/lib/analytics/in-app";
import { recordEvent } from "@/lib/analytics/record";
import { getSessionUser } from "@/lib/auth";
import { saveFundingGoal } from "@/lib/profile/funding-goal";
import { FEED_PATH } from "@/lib/routes";
import { parseFundingGoal } from "@/lib/scholarships/plan";

/**
 * The events the explore views may fire from the browser.
 *
 * An allowlist, because a Server Action is a public POST endpoint: without one,
 * anyone could write any event name into the table. Props still pass through
 * `sanitize` in `record.ts`, so nothing identifying gets in either way.
 */
const CLIENT_EVENTS = new Set<EventName>([
  "explore_view_changed",
  "explore_row_viewed",
  "card_start_clicked",
  "card_saved",
  "goal_set",
  "locked_card_clicked",
]);

/**
 * Record one explore event, with `in_app_browser` and `type` on every one.
 *
 * Both are attached here rather than trusted from the caller: the browser
 * cannot reliably tell that it is a webview, and `type` is always
 * "scholarship" because only the scholarship views fire these.
 */
export async function trackExploreEvent(
  name: EventName,
  props: Record<string, string | number | boolean> = {},
): Promise<void> {
  if (!CLIENT_EVENTS.has(name)) return;
  const ua = (await headers()).get("user-agent");
  await recordEvent(name, { ...props, in_app_browser: isInAppBrowser(ua), type: "scholarship" });
}

export interface GoalActionState {
  status: "idle" | "saved" | "error";
  message?: string;
}

export async function setFundingGoalAction(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  // The session's own id, never one from the form.
  const user = await getSessionUser();
  if (!user) return { status: "error", message: "sign in to save a goal" };

  const goal = parseFundingGoal(formData.get("goal"));
  if (goal === null) return { status: "error", message: "enter a dollar amount, like 12000" };

  const saved = await saveFundingGoal(user.id, goal);
  if (!saved) return { status: "error", message: "goals cannot be saved yet" };

  const ua = (await headers()).get("user-agent");
  await recordEvent("goal_set", { in_app_browser: isInAppBrowser(ua), type: "scholarship" });
  revalidatePath(FEED_PATH);
  return { status: "saved" };
}
