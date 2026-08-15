import { db } from "@/db/client";
import { events, type EventName } from "@/db/schema";

import { sanitize } from "./props";

/**
 * Writing a usage event.
 *
 * FIRST-PARTY, AND THAT IS NOT A PREFERENCE. `/privacy` enumerates every
 * service that receives anything — four of them, each named, each with the one
 * job it does. Dropping in an analytics script would add a fifth that receives
 * what every visitor looks at, and would make a policy written from the schema
 * false the day it shipped. So this writes one row to our own Postgres and no
 * request leaves the building.
 *
 * TWO RULES, BOTH ENFORCED RATHER THAN TRUSTED TO CALLERS:
 *
 *  1. **Nothing identifying is recorded.** No user id, no IP, no user agent, no
 *     search text. `sanitize` (in `props.ts`, so it is testable) drops anything
 *     that is not a small scalar.
 *  2. **This may never break or noticeably slow a page.** Every failure is
 *     swallowed. A metrics row is worth strictly less than the page the visitor
 *     came for, and an analytics write that can 500 a feed is a bad trade in
 *     every direction.
 */
export async function recordEvent(
  name: EventName,
  props?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(events).values({ name, props: sanitize(props) });
  } catch {
    // Deliberately silent. There is no user-visible consequence of a missing
    // metrics row, and there is a very visible one to an error page.
  }
}
