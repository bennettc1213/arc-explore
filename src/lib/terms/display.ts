/**
 * Render helpers for term provenance.
 *
 * Keeps the display rule in one place so cards, detail pages, and emails
 * cannot drift.
 */

import { displayTerm, type TermSeason } from "./parser";

export interface TermDisplayInput {
  term: string | null;
  termSource: "explicit" | "inferred" | "unknown";
}

export function formatTerm({ term, termSource }: TermDisplayInput): string {
  if (!term) return "term not stated";
  if (termSource === "inferred") return `${term} (inferred)`;
  return term;
}

export function formatTermShort({ term, termSource }: TermDisplayInput): string {
  if (!term) return "unknown";
  if (termSource === "inferred") return `${term}*`;
  return term;
}

export interface TermViewInput extends TermDisplayInput {
  termSeason?: TermSeason | null;
  termYear?: number | null;
}

/** Parse a stored or user-selected display string back into season/year. */
export function parseTermLabel(
  term: string,
): { season: TermSeason; year: number } | null {
  const m = term.trim().match(/^(co-?op|spring|summer|fall|autumn|winter)\s+(\d{4})$/i);
  if (!m) return null;
  const raw = m[1].toLowerCase().replace(/-/g, "");
  const season: TermSeason =
    raw === "coop" || raw === "co-op" ? "co-op" : (raw === "autumn" ? "fall" : (raw as TermSeason));
  return { season, year: Number(m[2]) };
}

/**
 * The term a student should actually be shown.
 *
 * `postings.term` is free text that predates `term_season`/`term_year`, and the
 * two can disagree on rows written before INS-004 — for example a JD whose only
 * season mention is an eligibility window ("graduation date from Spring 2025 to
 * Fall 2026") left the text saying `Spring 2025` while the structured columns
 * correctly said `Summer 2027`. Every ended-term check reads the structured
 * columns, so displaying the free text would show a card labelled with a term
 * that has already ended. The structured columns win, always.
 */
export function resolveTermView(input: TermViewInput): TermDisplayInput {
  const { term, termSource, termSeason, termYear } = input;

  if (!termSeason || termYear === null || termYear === undefined) {
    return { term: term ?? null, termSource };
  }

  const structured = displayTerm(termSeason, termYear);
  if (!term) return { term: structured, termSource };

  const parsed = parseTermLabel(term);
  if (parsed && parsed.season === termSeason && parsed.year === termYear) {
    return { term, termSource };
  }

  return { term: structured, termSource };
}
