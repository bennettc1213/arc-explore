"use client";

import { useState } from "react";

/**
 * A block of text with a copy button.
 *
 * Rendered as an editable textarea rather than a `<pre>`: a student filling in
 * the placeholders should be able to do it here, before they copy, instead of
 * copying a file full of brackets and finding them again in GitHub's editor.
 * Nothing is stored — this is a scratch surface over generated text.
 */
export function CopyBlock({
  initial,
  label,
  rows = 22,
}: {
  initial: string;
  label: string;
  rows?: number;
}) {
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused (permissions, insecure context). The
      // text is on screen and selectable either way, so this is not worth an
      // error state — it just does not confirm.
      setCopied(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 8 }}>
        <span className="mono chrome">{label}</span>
        <div className="flex items-center gap-3">
          {text !== initial && (
            <span className="mono" style={{ color: "var(--faint-readable)" }}>
              edited
            </span>
          )}
          <button type="button" className="btn press" onClick={copy}>
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="mono w-full"
        style={{
          background: "transparent",
          border: "1px solid var(--line-strong)",
          color: "var(--text)",
          padding: "12px 14px",
          lineHeight: 1.6,
          resize: "vertical",
        }}
      />
    </div>
  );
}
