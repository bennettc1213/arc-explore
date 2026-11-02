import { TIER_LABELS } from "@/lib/pricing/tiers";

/**
 * The paste-in profile tools — github, linkedin, essay — plus the autofill
 * extension. They share one home in the nav, so this list is the single source
 * of truth for the nav's "tools" menu, the mobile menu, the feed tease and the
 * landing toolkit.
 *
 * `access` says what a click actually costs, because the tools are NOT all
 * open signed-out, and an earlier version of this comment said they were
 * (FIXES.md §2). Verified on production: `/github` audits with no session;
 * `/linkedin` renders no textarea until you sign in; `/essay` mounts nothing
 * below the Apply plan. A tools menu is a promise about what happens when you
 * click, so the caveat travels with the link rather than waiting on the page.
 *
 * `status` separates working tools from ones that are built but unverified —
 * the remodel plan's "distinguish available tools from unfinished ones".
 */
export type ToolStatus = "available" | "beta";

export const TOOLS = [
  {
    href: "/github",
    label: "github",
    title: "GitHub audit",
    blurb: "audit what a recruiter sees — fetched from the public api",
    access: "open to everyone",
    status: "available",
  },
  {
    href: "/linkedin",
    label: "linkedin",
    title: "LinkedIn tools",
    blurb: "build the headline and summary recruiters search",
    access: "free account · 1 run",
    status: "available",
  },
  {
    href: "/essay",
    label: "essay",
    title: "Essay review",
    blurb: "four mechanical checks, on text that stays in your browser",
    access: `${TIER_LABELS.apply} plan`,
    status: "available",
  },
  {
    href: "/extension",
    label: "extension",
    title: "Autofill extension",
    // Says what it needs and what state it is in. The old blurb ("in one
    // click") described the finished thing and mentioned neither the Apply
    // plan nor the fact that nobody has driven it end to end in Chrome yet —
    // see FIXES.md §3.
    blurb: "fill an employer's real form with your own facts — you still press submit",
    access: `${TIER_LABELS.apply} plan · beta, not yet verified end to end`,
    status: "beta",
  },
] as const satisfies readonly {
  href: string;
  label: string;
  title: string;
  blurb: string;
  access: string;
  status: ToolStatus;
}[];
