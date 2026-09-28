/**
 * Market-ready rollout switches.
 *
 * These are intentionally conservative: every flag defaults to OFF. They are
 * read from server-side environment variables so no client can enable a paid,
 * security, or unreleased feature by editing local state.
 *
 * Use these to stage new rankers, source adapters, notifications, billing, and
 * Opening Soon without changing the live product until the corresponding phase
 * gate passes.
 */

function isEnabled(key: string): boolean {
  const raw = process.env[key];
  return raw === 'true' || raw === '1';
}

function envKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export const marketReadyFlags = {
  /** New ranking engine (INS-027). */
  ranker: (): boolean => isEnabled('MARKET_READY_RANKER'),

  /** New source adapters such as AcademicWorks or Workday (INS-016-INS-023). */
  sourceAdapter: (name: string): boolean =>
    isEnabled(`MARKET_READY_SOURCE_${envKey(name)}`),

  /** New notification paths such as instant alerts (INS-031). */
  notifications: (feature: string): boolean =>
    isEnabled(`MARKET_READY_NOTIFICATIONS_${envKey(feature)}`),

  /** Stripe billing and checkout flows (INS-032-INS-036). */
  billing: (): boolean => isEnabled('MARKET_READY_BILLING'),

  /** Opening Soon predictions, calendar, and watchlists (INS-038-INS-039). */
  openingSoon: (): boolean => isEnabled('MARKET_READY_OPENING_SOON'),

  /** Generic per-key gate for smaller staged features. */
  feature: (key: string): boolean => isEnabled(`MARKET_READY_FEATURE_${envKey(key)}`),
};
