/**
 * Term calendar boundaries.
 *
 * Every season maps to a deterministic start/end so "ended" is unambiguous
 * across scoring, filtering, and lifecycle decisions.
 */

export interface TermBounds {
  start: Date;
  end: Date;
}

const BOUNDARIES: Record<
  "spring" | "summer" | "fall" | "winter" | "co-op",
  { start: [number, number]; end: [number, number] }
> = {
  // Jan 1 – May 31
  spring: { start: [1, 1], end: [5, 31] },
  // Jun 1 – Aug 31
  summer: { start: [6, 1], end: [8, 31] },
  // Sep 1 – Dec 31
  fall: { start: [9, 1], end: [12, 31] },
  // Academic winter: Dec 1 prior year – Feb 28/29 of the named year.
  winter: { start: [12, 1], end: [2, 28] },
  // Co-op is year-long by default; refine later if employers state otherwise.
  "co-op": { start: [1, 1], end: [12, 31] },
};

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function termBounds(
  season: "spring" | "summer" | "fall" | "winter" | "co-op",
  year: number,
): TermBounds {
  const def = BOUNDARIES[season];

  let startYear = year;
  let endYear = year;

  if (season === "winter") {
    // Winter 2027 means Dec 2026 – Feb 2027.
    startYear = year - 1;
    endYear = year;
  }

  const endDay = season === "winter" && isLeapYear(endYear) ? 29 : def.end[1];

  return {
    start: new Date(Date.UTC(startYear, def.start[0] - 1, def.start[1], 0, 0, 0)),
    end: new Date(Date.UTC(endYear, def.end[0] - 1, endDay, 23, 59, 59, 999)),
  };
}

export function isTermEnded(
  season: "spring" | "summer" | "fall" | "winter" | "co-op" | null,
  year: number | null,
  now: Date = new Date(),
): boolean {
  if (!season || year === null) return false;
  return now > termBounds(season, year).end;
}

export function isTermCurrent(
  season: "spring" | "summer" | "fall" | "winter" | "co-op" | null,
  year: number | null,
  now: Date = new Date(),
): boolean {
  if (!season || year === null) return false;
  const { start, end } = termBounds(season, year);
  return now >= start && now <= end;
}
