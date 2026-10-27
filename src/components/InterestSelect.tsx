"use client";

import { useState } from "react";
import "./InterestSelect.css";
import { INTEREST_OPTIONS } from "@/lib/profile/types";

export function InterestSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const matches = INTEREST_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const label = (id: string) =>
    INTEREST_OPTIONS.find((o) => o.value === id)?.label ??
    id.replace(/^custom:/, "");
  const toggle = (id: string) =>
    onChange(
      value.includes(id)
        ? value.filter((v) => v !== id)
        : [...value, id].slice(0, 50),
    );
  return (
    <div className="interest-select">
      <button
        className="field interest-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="interest-options"
        onClick={() => setOpen(!open)}
      >
        {value.length
          ? `${value.length} fields selected`
          : "Select your fields"}
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="interest-menu" id="interest-options">
          <label className="ob-field">
            <span className="sr-only">Search all fields</span>
            <input
              className="field"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search any field…"
              maxLength={90}
            />
          </label>
          <div className="interest-options">
            {matches.map((o) => (
              <label key={o.value}>
                <input
                  type="checkbox"
                  checked={value.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          {search.trim() &&
            !INTEREST_OPTIONS.some(
              (o) => o.label.toLowerCase() === search.trim().toLowerCase(),
            ) && (
              <button
                type="button"
                className="interest-add"
                onClick={() => {
                  toggle(`custom:${search.trim()}`);
                  setSearch("");
                }}
              >
                + Add “{search.trim()}”
              </button>
            )}
          <button
            type="button"
            className="ob-outline"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      )}
      {value.length > 0 && (
        <div className="interest-selected">
          {value.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-label={`Remove ${label(id)}`}
            >
              {label(id)} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
