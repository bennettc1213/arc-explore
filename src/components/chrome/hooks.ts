"use client";

import { useSyncExternalStore } from "react";

/**
 * Reactive `matchMedia` — re-renders if the query's match changes (OS-level
 * reduced-motion toggle, viewport crossing a breakpoint), not just on mount.
 * `useSyncExternalStore` is the correct primitive for subscribing to a
 * browser API like this — unlike a `useEffect` + `setState` version, it
 * never triggers a spurious extra render on mount.
 */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false, // server snapshot: no window, assume the non-matching default
  );
}

export function useReducedMotion(): boolean {
  return useMedia("(prefers-reduced-motion: reduce)");
}

export function useIsMobile(): boolean {
  return useMedia("(max-width: 768px)");
}
