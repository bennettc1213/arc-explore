/**
 * HTML → plain text for job descriptions.
 *
 * The output is only ever read by regex detectors (work authorization, term)
 * and stored for the cold-email generator. It is never rendered as markup, so
 * this is deliberately a text extractor and not a sanitiser — do not use it to
 * make untrusted HTML safe to inject.
 *
 * Sources escape inconsistently: Greenhouse returns markup that is itself
 * entity-escaped (`&lt;p&gt;`), while SmartRecruiters returns ordinary HTML. A
 * single decode-then-strip pass handles one and mangles the other, so we decode,
 * strip, and decode again. Anything still entity-shaped after that was literal
 * text to begin with.
 */

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&bull;": "•",
  "&hellip;": "…",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&(?:lt|gt|amp|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|ldquo|rdquo|bull|hellip|#39);/g,
      (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, d: string) => {
      const code = Number(d);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : _;
    });
}

export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;

  const text = decodeEntities(
    decodeEntities(html)
      // Block-level boundaries become spaces, not nothing — otherwise
      // "</li><li>Must be a U.S. citizen" collapses into a single run-on word
      // and the work-auth detector's \b anchors stop matching.
      .replace(/<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|section)\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 0 ? text : null;
}
