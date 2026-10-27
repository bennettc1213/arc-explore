"use client";

import { trackExploreEvent } from "@/app/explore/actions";
import type { EventName } from "@/db/schema";

/**
 * Fire-and-forget. An analytics call must never block or break a click, so
 * this neither awaits in the caller's path nor lets a rejection surface.
 */
export function track(name: EventName, props: Record<string, string | number | boolean> = {}): void {
  void trackExploreEvent(name, props).catch(() => {});
}
