/**
 * The three paste-in profile tools — github, linkedin, essay. They share a
 * shape (a form that reads text you bring, a result that stays in your
 * browser or is built from public data) and one home in the nav, so this list
 * is the single source of truth for both the nav's "tools" menu and the feed
 * tease that points signed-out visitors at them.
 *
 * Open signed-out on purpose, like each tool it names: the github audit runs
 * only on public data, and the others run entirely in your browser.
 */
export const TOOLS = [
  {
    href: "/github",
    label: "github",
    blurb: "audit what a recruiter sees — fetched from the public api",
  },
  {
    href: "/linkedin",
    label: "linkedin",
    blurb: "build the headline and summary recruiters search",
  },
  {
    href: "/essay",
    label: "essay",
    blurb: "four mechanical checks, on text that stays in your browser",
  },
  {
    href: "/extension",
    label: "extension",
    // Says what it needs and what state it is in. The old blurb ("in one
    // click") described the finished thing and mentioned neither the Apply
    // plan nor the fact that nobody has driven it end to end in Chrome yet —
    // see FIXES.md §3. A tools menu is a promise about what happens when you
    // click, so it carries the caveat too.
    blurb: "fill an employer's real form with your own facts — Apply plan, and not yet verified end-to-end",
  },
] as const;
