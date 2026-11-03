/**
 * The portal's destinations — every box on `/portal/navigate` — and what each
 * one means for a given plan.
 *
 * Pure: no database, no React. The catalog says where a box goes and which
 * entitlement it sits behind; `resolvePortalTiles` turns that into a state for
 * one tier. Nothing here compares a tier to a string. Every decision is
 * `evaluateFeature`'s, which is what `tiers.ts` says about every gate in the
 * codebase — so changing what Pro includes is a one-file change to the feature
 * catalog and the portal follows without being touched.
 *
 * THE STATE IS THE ALLOWANCE, NOT THE BALANCE. "limited" says what the plan
 * gives ("1 free run"), never how many are left: remaining usage is a database
 * read per feature, and a tile that claimed "1 free run" for someone who had
 * already spent it would be a number we asserted without observing. The page a
 * tile opens knows the real balance and says it there.
 */

import type { FeatureKey, TierId } from "@/lib/pricing/tiers";
import { evaluateFeature, FEATURES, statusNote, TIER_LABELS } from "@/lib/pricing/tiers";
import { FREE_DAILY_RESULTS } from "@/lib/feed-trim";
import { scoutButtonLabel, scoutHref, type ScoutFocus } from "@/lib/scout/focus";

export const PORTAL_ART_IDS = [
  "merit",
  "scholarships",
  "internships",
  "tracker",
  "resume",
  "extension",
  "github",
  "linkedin",
  "essay",
  "triage",
] as const;
export type PortalArtId = (typeof PORTAL_ART_IDS)[number];

/**
 * - `open`     — usable without limit on this plan.
 * - `limited`  — usable, with a cap or a shallower version on this plan.
 * - `locked`   — not on this plan; the tile routes to pricing, not the tool.
 * - `soon`     — not built. Unusable on every plan, including the paid one.
 */
export type PortalTileState = "open" | "limited" | "locked" | "soon";

export type PortalTileSize = "wide" | "regular";

interface Destination {
  id: PortalArtId;
  title: string;
  blurb: string;
  href: string;
  /** The entitlement this box sits behind, or null when it is open to everyone. */
  feature: FeatureKey | null;
  /**
   * `feature` alone is only a taste of the real thing — the paid version is a
   * different entitlement. The two discovery boxes are the case: searching is
   * unlimited on every plan, but free sees a capped window of the ranking.
   */
  full?: FeatureKey;
  /** Said when `full` is not usable on the plan. */
  limitedNote?: string;
  /** Nouns for a usage cap, so "1 free run" and "up to 5 tracked listings" read right. */
  unit?: readonly [singular: string, plural: string];
  /**
   * The discovery tools open a guided Scout rather than a screen of ranked
   * results. Set, it replaces `href` and names the tile's button.
   */
  scout?: ScoutFocus;
  /** Grid column span on the 12-column navigate grid. */
  span: 3 | 4 | 5 | 12;
}

/*
 * Ordered as the navigate grid lays them out: find, then prepare and apply,
 * then profile tools, then what is not built yet. Spans sum to 12 per row.
 */
const DESTINATIONS: readonly Destination[] = [
  {
    id: "merit",
    title: "College merit awards",
    blurb: "Merit-based awards from colleges and sponsors, ranked for you.",
    href: scoutHref("merit"),
    scout: "merit",
    feature: "feed_browse",
    full: "feed_full_depth",
    limitedNote: `Free shows your top ${FREE_DAILY_RESULTS} matches`,
    span: 5,
  },
  {
    id: "scholarships",
    title: "Scholarships",
    blurb: "Every open scholarship, scored for how well you fit.",
    href: scoutHref("scholarships"),
    scout: "scholarships",
    feature: "feed_browse",
    full: "feed_full_depth",
    limitedNote: `Free shows your top ${FREE_DAILY_RESULTS} matches`,
    span: 4,
  },
  {
    id: "internships",
    title: "Internships",
    blurb: "Open roles, confirmed live on the employer's own board.",
    href: scoutHref("internships"),
    scout: "internships",
    feature: "feed_browse",
    full: "feed_full_depth",
    limitedNote: `Free shows your top ${FREE_DAILY_RESULTS} matches`,
    span: 3,
  },
  {
    id: "tracker",
    title: "Application tracker",
    blurb: "Everything you've saved and sent, and what came back.",
    href: "/tracker",
    feature: "tracker",
    unit: ["tracked listing", "tracked listings"],
    span: 3,
  },
  {
    id: "resume",
    title: "Resume",
    blurb: "Build it once, then check it against what ATS systems read.",
    href: "/resume",
    feature: "resume_critique",
    unit: ["critique", "critiques"],
    span: 4,
  },
  {
    id: "extension",
    title: "Autofill extension",
    blurb: "Fills the employer's real form with your own facts. You press submit.",
    href: "/extension",
    feature: "extension_autofill_internships",
    span: 5,
  },
  {
    id: "github",
    title: "GitHub audit",
    blurb: "See your profile the way a recruiter does.",
    href: "/github",
    feature: "github_tools",
    unit: ["run", "runs"],
    span: 4,
  },
  {
    id: "linkedin",
    title: "LinkedIn tools",
    blurb: "Write the headline and summary recruiters search for.",
    href: "/linkedin",
    feature: "linkedin_tools",
    unit: ["run", "runs"],
    span: 4,
  },
  {
    id: "essay",
    title: "Essay review",
    blurb: "Four mechanical checks on your draft. The text stays in your browser.",
    href: "/essay",
    feature: "essay_reviewer",
    span: 4,
  },
  {
    id: "triage",
    title: "Deadline triage",
    blurb: "What to do this week, across everything you are tracking.",
    href: "/tracker",
    feature: "deadline_triage",
    span: 12,
  },
];

export interface PortalTile {
  id: PortalArtId;
  title: string;
  blurb: string;
  span: Destination["span"];
  state: PortalTileState;
  /** Where the tile goes. Null only for `soon`, which goes nowhere. */
  href: string | null;
  /** The small badge: "Pro" on a locked tile, "Free" on a limited one, "Coming soon". */
  pill: string | null;
  /** What the plan gives, in words — "Free: 1 run". Null when there is nothing to qualify. */
  note: string | null;
  /** A truthfulness caveat about the feature itself, shown on the way in. */
  caveat: string | null;
  /** The button on a tile that opens a guided Scout ("Start a Scout for internships"). */
  cta: string | null;
  feature: FeatureKey | null;
}

function capNote(limit: number, unit: readonly [string, string] | undefined): string {
  const [one, many] = unit ?? ["use", "uses"];
  return limit === 1 ? `Free: 1 ${one}` : `Free: up to ${limit} ${many}`;
}

function sentence(text: string | null): string | null {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

function resolve(d: Destination, tier: TierId): PortalTile {
  const base = { id: d.id, title: d.title, blurb: d.blurb, span: d.span, feature: d.feature, cta: d.scout ? scoutButtonLabel(d.scout) : null };

  // Open to everyone, no entitlement behind it.
  if (!d.feature) {
    return { ...base, state: "open", href: d.href, pill: null, note: null, caveat: null };
  }

  const access = evaluateFeature(tier, d.feature);
  const caveat = sentence(statusNote(FEATURES[d.feature].status));

  if (access.reason === "coming_soon") {
    // No href: there is nothing to open, and a link to a page that cannot do
    // the thing would be the "decorated, not disabled" failure.
    return { ...base, state: "soon", href: null, pill: "Coming soon", note: null, caveat: null };
  }

  if (!access.usable) {
    return {
      ...base,
      state: "locked",
      // The same URL `UpgradeWall` sends to. The pricing page does not read
      // `feature` yet (FIXES.md §2), so today this only lands on pricing; the
      // parameter is there so it can say what the student came for once it does.
      href: `/pricing?feature=${d.feature}`,
      pill: TIER_LABELS[access.minimumTier],
      note: null,
      caveat,
    };
  }

  if (!access.unlimited && access.limit !== null) {
    return {
      ...base,
      state: "limited",
      href: d.href,
      pill: "Free",
      note: capNote(access.limit, d.unit),
      caveat,
    };
  }

  if (d.full && !evaluateFeature(tier, d.full).usable) {
    return {
      ...base,
      state: "limited",
      href: d.href,
      pill: "Free",
      note: d.limitedNote ?? null,
      caveat,
    };
  }

  return { ...base, state: "open", href: d.href, pill: null, note: null, caveat };
}

/** Every tile, resolved for one plan, in grid order. */
export function resolvePortalTiles(tier: TierId): PortalTile[] {
  return DESTINATIONS.map((d) => resolve(d, tier));
}

/** The three boxes the portal home repeats as its "jump in" row. */
export const JUMP_IN_IDS: readonly PortalArtId[] = ["merit", "scholarships", "internships"];
