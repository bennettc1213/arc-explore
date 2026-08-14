"use client";

/**
 * The print / save-as-PDF button, for any document sheet on the page.
 *
 * Just `window.print()` — the print stylesheet in globals.css hides the site
 * chrome and every `.print-hide` element, so a student prints exactly the
 * sheet they are looking at and nothing else. Requires client JS, which is
 * why it is its own component.
 *
 * Used by both the cover letter and the resume; named for what it does rather
 * than for the first thing that needed it.
 */
export function PrintButton({ label = "print / save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn press" onClick={() => window.print()}>
      {label}
    </button>
  );
}
