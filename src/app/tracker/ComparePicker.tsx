"use client";

import Link from "next/link";
import { useState } from "react";

import { MAX_COMPARE, MIN_COMPARE } from "@/lib/compare";

/**
 * Pick two or three tracked opportunities to compare.
 *
 * Lives on the tracker rather than the feed on purpose: comparing is what you
 * do with a shortlist, and the shortlist is exactly what the tracker holds.
 * Comparing two of 3,765 feed rows is not a decision anyone is making.
 *
 * Off by default. A row of checkboxes across every card is visual noise for the
 * common case, which is opening one thing.
 */
export function ComparePicker({
  options,
}: {
  options: Array<{ postingId: string; title: string; company: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  if (options.length < MIN_COMPARE) return null;

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : // Silently ignoring the click past the cap would read as a bug; the
          // control disables instead, and the count says why.
          prev.length >= MAX_COMPARE
          ? prev
          : [...prev, id],
    );

  if (!open) {
    return (
      <button
        type="button"
        className="btn press"
        onClick={() => setOpen(true)}
        style={{ marginBottom: 24 }}
      >
        compare two or three
      </button>
    );
  }

  const ready = picked.length >= MIN_COMPARE;

  return (
    <section
      className="border"
      style={{ borderColor: "var(--line-strong)", padding: "16px 18px", marginBottom: 24 }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3" style={{ marginBottom: 12 }}>
        <span className="mono chrome">pick two or three</span>
        <span className="mono" style={{ color: "var(--faint-readable)" }}>
          {picked.length} of {MAX_COMPARE} selected
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {options.map((o) => {
          const checked = picked.includes(o.postingId);
          const full = !checked && picked.length >= MAX_COMPARE;
          return (
            <label
              key={o.postingId}
              className="flex items-start gap-2"
              style={{ opacity: full ? 0.45 : 1 }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={full}
                onChange={() => toggle(o.postingId)}
                style={{ marginTop: 5 }}
              />
              <span>
                <span className="t-sm" style={{ color: "var(--text)" }}>
                  {o.title}
                </span>
                <span className="mono" style={{ display: "block", color: "var(--faint-readable)" }}>
                  {o.company}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {ready ? (
          <Link
            href={`/compare?ids=${picked.join(",")}`}
            className="btn btn-primary press"
            style={{ textDecoration: "none" }}
          >
            compare {picked.length}
          </Link>
        ) : (
          <button type="button" className="btn" disabled>
            compare
          </button>
        )}
        <button
          type="button"
          className="btn press"
          onClick={() => {
            setOpen(false);
            setPicked([]);
          }}
        >
          cancel
        </button>
      </div>
    </section>
  );
}
