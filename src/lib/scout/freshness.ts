export function scoutFreshness(firstSeenAt: Date, lastSeenAt: Date, tier: string, now: Date) {
  const age = now.getTime() - lastSeenAt.getTime();
  const known = Number.isFinite(age) && age >= 0 && tier !== "unverified_static";
  const state = !known ? "unverified" : age <= 86_400_000 ? "recent" : "older";
  const discovered = now.getTime() - firstSeenAt.getTime();
  let foundLabel: string | null = null;
  if (Number.isFinite(discovered) && discovered >= 0 && discovered <= 86_400_000) {
    const minutes = Math.floor(discovered / 60_000);
    foundLabel = minutes < 1 ? "New to Instela just now" : minutes < 60 ? `Found ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago` : `Found ${Math.floor(minutes / 60)} ${Math.floor(minutes / 60) === 1 ? "hour" : "hours"} ago`;
  }
  return { state, foundLabel };
}
