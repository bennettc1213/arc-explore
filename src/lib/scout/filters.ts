import type { FeedFilters } from "@/lib/feed";
import type { ScoutPreferences } from "./types";

/**
 * A Scout describes what should rank first; it is not a keyword search box.
 * Field and location become profile evidence for ranking, rather than SQL
 * conditions that can erase an otherwise useful result set.
 */
export function scoutFeedFilters(prefs: ScoutPreferences): Pick<FeedFilters,
  "kind" | "remoteOnly" | "hideBlocked" | "excludeMarketing" | "meritOnly" | "college"
> {
  return {
    kind: prefs.kind === "both" ? null : prefs.kind,
    // This is deliberately the one location/work-style hard filter: the
    // student explicitly chose "remote only", rather than merely preferring
    // a place. Location otherwise affects the ranking through their profile.
    remoteOnly: prefs.remote,
    hideBlocked: true,
    excludeMarketing: true,
    meritOnly: prefs.merit,
    college: prefs.merit && prefs.college ? prefs.college : null,
  };
}
