import { STATE_OPTIONS, US_STATES, type StateName } from "./places";

/**
 * Facts a student typed into the interest box that are not an interest.
 *
 * Measured 2026-11-10: "cyber security, with grad of 2028" was read as five
 * keywords that every listing had to contain, so "grad" and "2028" quietly
 * shrank the result set. Anything here that the form also asks for directly is
 * lifted out and used as that fact instead; whatever is left is the interest.
 */
export interface ParsedScoutText {
  interest: string;
  gradYear: number | null;
  location: StateName | null;
  remote: boolean;
}

const MIN_YEAR = 2020;
const MAX_YEAR = 2045;

/** Words left dangling once a fact has been removed: "with", "of", "in", "and". */
const CONNECTOR = /^(?:with|of|in|and|for|my|i|im|a|an|the|to|class|grad|graduating|graduate|graduation|year|looking|want|need|interested|internships?|scholarships?|opportunities|jobs?|roles?|near|around|based)$/i;

function tidy(text: string): string {
  const words = text.replace(/[,;:/|()]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  while (words.length && CONNECTOR.test(words[0])) words.shift();
  while (words.length && CONNECTOR.test(words[words.length - 1])) words.pop();
  return words.join(" ");
}

export function parseScoutText(raw: string): ParsedScoutText {
  let text = ` ${raw} `;
  let gradYear: number | null = null;
  let location: StateName | null = null;
  let remote = false;

  const yearIn = (s: string) => {
    const n = Number(s.length === 2 ? `20${s}` : s);
    return n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
  };

  // "grad of 2028", "class of '28", "graduating 2027", "graduation year 2029".
  const grad = /\b(?:grad(?:uat(?:e|es|ing|ion))?|class)(?:\s+(?:of|in|year|date))*\s*'?(20\d{2}|\d{2})\b/i;
  const g = text.match(grad);
  if (g && yearIn(g[1])) {
    gradYear = yearIn(g[1]);
    text = text.replace(g[0], " ");
  } else {
    // A lone year most often names the class year in this box, but only one.
    const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => yearIn(m[1])).filter((y): y is number => y !== null);
    if (years.length === 1) {
      gradYear = years[0];
      text = text.replace(new RegExp(`\\b${years[0]}\\b`), " ");
    }
  }

  if (/\bremote\b/i.test(text)) {
    remote = true;
    text = text.replace(/\b(?:fully\s+)?remote(?:\s+only)?\b/gi, " ");
  }

  // Longest names first so "West Virginia" is not read as "Virginia".
  for (const name of [...STATE_OPTIONS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "i");
    if (re.test(text)) {
      location = name;
      text = text.replace(re, " ");
      break;
    }
  }
  if (!location) {
    // A postal code only after "in", and only in capitals: "in TX", never "in it".
    const code = text.match(/\bin\s+([A-Z]{2})\b/);
    const hit = code && (Object.entries(US_STATES).find(([, c]) => c === code[1])?.[0] as StateName | undefined);
    if (code && hit) {
      location = hit;
      text = text.replace(code[0], " ");
    }
  }

  return { interest: tidy(text), gradYear, location, remote };
}

/**
 * A matcher for one catalogue term against free text, following the rule in
 * `interests.ts`: capitals are a case-sensitive whole-word acronym; under five
 * characters is a whole word; otherwise it matches at the start of a word.
 */
export function termMatcher(term: string): RegExp {
  // A trailing "!" forces a whole word (plurals allowed): "cyber!" matches
  // "Cyber and Forensic" but not "Cyberbullying"; a typed word "basket" must
  // not find "Basketball".
  const whole = term.endsWith("!");
  const clean = (whole ? term.slice(0, -1) : term).trim();
  const body = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
  if (clean === clean.toUpperCase() && /[A-Z]/.test(clean)) return new RegExp(`\\b${body}\\b`);
  if (whole || clean.length < 5) return new RegExp(`\\b${body}(?:s|es)?\\b`, "i");
  return new RegExp(`\\b${body}`, "i");
}
