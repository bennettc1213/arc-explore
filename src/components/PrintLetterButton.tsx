"use client";

/**
 * The print / save-as-PDF button for a letter.
 *
 * Just `window.print()` — the sheet's print stylesheet in globals.css hides
 * everything but the letter, so a student prints exactly what they will send.
 * Requires client JS, which is why it is its own component.
 */
export function PrintLetterButton() {
  return (
    <button type="button" className="btn press" onClick={() => window.print()}>
      print / save as PDF
    </button>
  );
}
