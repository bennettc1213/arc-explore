import { createHash } from "node:crypto";

import type { ParsedResume } from "./types";

/**
 * A stable identity for one resume revision: a hash of the parsed structure
 * the critique actually reads.
 *
 * The same content always gives the same key, however many times the page
 * renders or whatever else on the profile changes; an edit to the resume is a
 * new key. Only the hash is stored (in `feature_grants.grant_key`), never the
 * resume text.
 */
export function resumeRevisionKey(parsed: ParsedResume): string {
  return `rev:${createHash("sha256").update(JSON.stringify(parsed)).digest("hex").slice(0, 32)}`;
}
