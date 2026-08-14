"use client";

import { useState } from "react";

import type { PacketField } from "@/lib/apply/packet";

const SOURCE_LABEL: Record<PacketField["source"], string> = {
  profile: "from your profile",
  resume: "from your resume",
  account: "your sign-in address",
  missing: "we do not have this",
};

/**
 * One packet field with a copy button.
 *
 * The source label is not decoration. A student pasting a GPA into a form an
 * employer will check should be able to see, without clicking anything,
 * whether that number came from something they typed or something a parser
 * read off a PDF.
 */
export function CopyField({ field }: { field: PacketField }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!field.value) return;
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused (permissions, insecure context). The
      // value is on screen and selectable either way, so this is not worth an
      // error state — it just does not confirm.
      setCopied(false);
    }
  };

  return (
    <div
      className="border"
      style={{ borderColor: "var(--line)", padding: "12px 14px", marginBottom: 8 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div className="mono chrome">{field.label}</div>
          <div
            className="t-sm"
            style={{
              marginTop: 4,
              color: field.value ? "var(--text)" : "var(--faint-readable)",
              wordBreak: "break-word",
            }}
          >
            {field.value ?? "—"}
          </div>
        </div>

        {field.value && (
          <button type="button" className="btn press" onClick={copy}>
            {copied ? "copied" : "copy"}
          </button>
        )}
      </div>

      <div className="mono" style={{ marginTop: 8, color: "var(--faint-readable)" }}>
        {SOURCE_LABEL[field.source]}
        {field.note ? ` — ${field.note}` : ""}
      </div>

      {field.conflict && (
        <div className="mono" style={{ marginTop: 6, color: "var(--accent)" }}>
          your profile says {field.conflict.profile}, your resume says {field.conflict.resume} — one
          of them is about to go onto an application wrong
        </div>
      )}
    </div>
  );
}
