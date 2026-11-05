"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { MatchingScreen } from "./MatchingScreen";

const categories = [
  { value: "all", label: "All opportunities", icon: "explore" },
  { value: "internship", label: "Internships", icon: "resume" },
  { value: "scholarship", label: "Scholarships", icon: "graduation" },
  { value: "merit", label: "College merit awards", icon: "award" },
] as const;

export function ExploreMenu({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [expanded, setExpanded] = useState(pathname === "/explore");
  const [pending, startTransition] = useTransition();
  const [nextLabel, setNextLabel] = useState("opportunities");
  const trigger = useRef<HTMLButtonElement>(null);
  const active = pathname === "/explore" || pathname.startsWith("/listing/");
  const selected = search.get("focus") === "merit" ? "merit" : search.get("kind") ?? "all";

  useEffect(() => {
    if (!expanded) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && trigger.current?.parentElement?.contains(document.activeElement)) { setExpanded(false); trigger.current?.focus(); }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [expanded]);

  function selectCategory(value: string) {
    // A category starts clean. It opens the Scout start screen for that tool, and
    // a filter or view carried over from the page we were on would turn it back
    // into a results page.
    const params = new URLSearchParams();
    if (value === "merit") { params.set("kind", "scholarship"); params.set("focus", "merit"); }
    else if (value !== "all") params.set("kind", value);
    setNextLabel(value === "internship" ? "internships" : value === "all" ? "opportunities" : value === "merit" ? "college merit awards" : "scholarships");
    onNavigate();
    startTransition(() => router.push(params.size ? `/explore?${params}` : "/explore", { scroll: true }));
  }

  return <div className="explore-nav-dropdown">
    <button ref={trigger} type="button" className={`sidebar-link explore-nav-trigger ${active ? "is-active" : ""}`} aria-expanded={expanded} aria-controls="explore-category-menu" onClick={() => setExpanded(v => !v)}><Icon name="explore" size={18} /><span>Explore</span><Icon name="chevron" size={14} className={expanded ? "is-expanded" : ""} /></button>
    {expanded && <nav id="explore-category-menu" className="explore-category-menu" aria-label="Explore categories">{categories.map(category => <button key={category.value} type="button" aria-current={pathname === "/explore" && selected === category.value ? "page" : undefined} onClick={() => selectCategory(category.value)}><Icon name={category.icon} size={15} /><span>{category.label}</span>{pathname === "/explore" && selected === category.value && <i aria-hidden="true" />}</button>)}</nav>}
    {pending && createPortal(<MatchingScreen overlay kind={nextLabel} />, document.body)}
  </div>;
}
