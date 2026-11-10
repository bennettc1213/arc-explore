/**
 * US states, by name and postal code. Pure data so the Scout form and the
 * tier matcher read one list.
 */
export const US_STATES = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
} as const;

export type StateName = keyof typeof US_STATES;
export const STATE_OPTIONS = Object.keys(US_STATES) as StateName[];

const BY_CODE = new Map(Object.entries(US_STATES).map(([name, code]) => [code, name as StateName]));
const BY_NAME = new Map(STATE_OPTIONS.map((name) => [name.toLowerCase(), name]));

/** "texas", "TX" and "Texas" all name Texas; anything else is not a state. */
export function stateFrom(text: string): StateName | null {
  const t = text.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return BY_CODE.get(t.toUpperCase() as never) ?? null;
  return BY_NAME.get(t.toLowerCase()) ?? null;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A matcher for one location preference against a posting's stated locations.
 *
 * A state matches its full name or its postal code as a standalone, upper-case
 * token ("Austin, TX"), never the letters inside a word: "IN" in "INTERN" or
 * "OR" in "Portland OR Remote" written in title case is exactly the false
 * positive the field taxonomy learned to avoid. Anything that is not a state
 * (a city, a region) is matched as a case-insensitive phrase.
 */
export function locationMatcher(preference: string): (locations: string[]) => boolean {
  const state = stateFrom(preference);
  if (state) {
    const name = new RegExp(`\\b${escape(state)}\\b`, "i");
    const code = new RegExp(`(?:^|[\\s,(/-])${US_STATES[state]}(?:$|[\\s,)/-])`);
    return (locations) => locations.some((l) => name.test(l) || code.test(l));
  }
  const phrase = new RegExp(`\\b${escape(preference.trim())}`, "i");
  return (locations) => locations.some((l) => phrase.test(l));
}
