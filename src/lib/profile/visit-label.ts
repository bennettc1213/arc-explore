/** Pure wording for the "since you last looked" banner (no database). */

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "since this morning" / "since yesterday" / "since Tuesday" / "since Oct 3". */
export function sinceLabel(prev: Date, now: Date): string {
  const hours = (now.getTime() - prev.getTime()) / 3_600_000;
  const dayDiff = Math.floor(now.getTime() / 86_400_000) - Math.floor(prev.getTime() / 86_400_000);
  if (dayDiff <= 0) return hours < 1 ? "in the last hour" : `in the last ${Math.floor(hours)} hours`;
  if (dayDiff === 1) return "since yesterday";
  if (dayDiff < 7) return `since ${WEEKDAY.format(prev)}`;
  return `since ${SHORT.format(prev)}`;
}
