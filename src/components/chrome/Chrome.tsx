"use client";

import { useEffect } from "react";

import { CustomCursor } from "./CustomCursor";
import { FocusRing } from "./FocusRing";
import { WarmGrid } from "./WarmGrid";

/**
 * Mounts the background grid, custom cursor, and focus ring once near the
 * app root. Also flips on `.js-ready`, which is what actually hides the
 * native cursor and default outline in globals.css — gated behind JS having
 * hydrated, so a failed hydration never leaves a visitor with no cursor.
 */
export function Chrome() {
  useEffect(() => {
    document.documentElement.classList.add("js-ready");
  }, []);

  return (
    <>
      <WarmGrid />
      <CustomCursor />
      <FocusRing />
    </>
  );
}
