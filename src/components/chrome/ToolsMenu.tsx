"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { TOOLS } from "@/lib/tools";

export function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const keyboardOpened = useRef(false);
  const pathname = usePathname();

  // Any navigation closes the menu — a tool click, or the browser back button
  // landing on a page that still believes it is open. A render-phase reset
  // keyed on the previous pathname, rather than an effect: the menu is state
  // derived from where we are, and this is the pattern React endorses for it.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // pointerdown rather than click, so it wins the race against the click that
  // follows a press on a tool link — a click-outside listener closes over the
  // very click that should navigate.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // A keyboard open (ArrowDown) lands the user inside the menu; a mouse open
  // leaves focus on the trigger so the links are reached by Tab, as in the
  // disclosure pattern.
  useEffect(() => {
    if (!open || !keyboardOpened.current) return;
    keyboardOpened.current = false;
    itemRefs.current[0]?.focus();
  }, [open]);

  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      closeAndRefocus();
      return;
    }

    const items = itemRefs.current.filter(
      (el): el is HTMLAnchorElement => el !== null,
    );

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        keyboardOpened.current = true;
        setOpen(true);
        return;
      }
      const index = items.indexOf(document.activeElement as HTMLAnchorElement);
      items[(index + 1) % items.length]?.focus();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open || items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLAnchorElement);
      items[(index - 1 + items.length) % items.length]?.focus();
      return;
    }
    if (e.key === "Home" && open) {
      e.preventDefault();
      items[0]?.focus();
      return;
    }
    if (e.key === "End" && open) {
      e.preventDefault();
      items[items.length - 1]?.focus();
      return;
    }
    if (e.key === "Tab" && open) {
      // Leaving through either end closes the menu rather than stranding it
      // open behind the page while focus travels on.
      const index = items.indexOf(document.activeElement as HTMLAnchorElement);
      if ((e.shiftKey && index <= 0) || (!e.shiftKey && index === items.length - 1)) {
        setOpen(false);
      }
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="tools-menu"
        onClick={() => setOpen((v) => !v)}
        /* `.navlink` so the trigger highlights like the links beside it in the
           bar — it opens a panel rather than navigating, but it sits in the
           same row and reads as the same kind of thing, so a different hover
           would be the odd one out.

           The old inline `font: "inherit"` is deliberately gone. It out-ranked
           the `.mono` class this button also carried, so the trigger had been
           rendering at the header's inherited size while `tracker`/`resume`/
           `profile` beside it rendered at 0.6875rem — visibly the odd one out.
           `.navlink` sets the font itself, which a <button> needs anyway since
           it does not inherit one. */
        className="navlink press flex items-center gap-2"
        style={{ cursor: "pointer" }}
      >
        tools
        {/* a drawn caret rather than a text glyph — the mono font has no
            reliable triangle, and a CSS border triangle is font-independent */}
        <span
          aria-hidden
          style={{
            width: 0,
            height: 0,
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: "5px solid currentColor",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 150ms var(--ease-inout)",
          }}
        />
      </button>

      <div
        id="tools-menu"
        hidden={!open}
        className="absolute right-0 top-full flex w-72 max-w-[calc(100vw-24px)] flex-col"
        style={{
          marginTop: 12,
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          padding: 4,
        }}
      >
        {TOOLS.map((tool, i) => (
          <Link
            key={tool.href}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            href={tool.href}
            className="press flex flex-col gap-0.5 px-3 py-2.5 hover:bg-surface-2"
            style={{ textDecoration: "none", borderTop: i === 0 ? undefined : "1px solid var(--line)" }}
          >
            <span className="mono chrome" style={{ color: "var(--text)" }}>
              {tool.label}
            </span>
            <span className="t-xs" style={{ color: "var(--faint-readable)" }}>
              {tool.blurb}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
