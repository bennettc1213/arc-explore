"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { ExploreView } from "@/lib/scholarships/plan";

import { track } from "./track";

/**
 * The kind switcher. It sets the existing `kind` param — the same one the
 * filter panel's select writes — rather than introducing a `type` alias, so
 * there is still exactly one reader of what the feed is scoped to.
 */
export function KindSwitcher({
  current,
  hrefs,
}: {
  current: "all" | "scholarship" | "internship";
  hrefs: Record<"all" | "scholarship" | "internship", string>;
}) {
  const options = [
    ["all", "everything"],
    ["scholarship", "scholarships"],
    ["internship", "internships"],
  ] as const;
  return (
    <nav aria-label="what to show" className="segmented" style={{ marginBottom: 16 }}>
      {options.map(([value, label]) => (
        <Link
          key={value}
          href={hrefs[value]}
          className="segmented-item press"
          aria-current={current === value ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

const STORAGE_KEY = "instela.explore.view";

function readStoredView(): ExploreView | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "plan" || v === "list" ? v : null;
  } catch {
    // Private windows and blocked storage throw; that just means no memory.
    return null;
  }
}

function storeView(v: ExploreView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // Same as above — remembering is a convenience, never a requirement.
  }
}

/**
 * Plan | list. The URL is the source of truth (`?view=`), so a shared link
 * opens the view it was shared from; localStorage only fills in when the URL
 * says nothing, and only after render, so the server-rendered default is never
 * wrong for long and never wrong without storage at all.
 */
export function ViewToggle({
  current,
  explicit,
  hrefs,
}: {
  current: ExploreView;
  /** True when `?view=` is in the URL; a remembered view then never overrides it. */
  explicit: boolean;
  hrefs: Record<ExploreView, string>;
}) {
  const router = useRouter();

  useEffect(() => {
    if (explicit) return;
    const stored = readStoredView();
    if (stored && stored !== current) router.replace(hrefs[stored], { scroll: false });
  }, [explicit, current, hrefs, router]);

  return (
    <nav aria-label="view" className="segmented" style={{ marginBottom: 24 }}>
      {(["plan", "list"] as const).map((v) => (
        <Link
          key={v}
          href={hrefs[v]}
          scroll={false}
          className="segmented-item press"
          aria-current={current === v ? "page" : undefined}
          onClick={() => {
            storeView(v);
            if (v !== current) track("explore_view_changed", { view: v });
          }}
        >
          {v}
        </Link>
      ))}
    </nav>
  );
}
