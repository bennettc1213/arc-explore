/**
 * Turning the page the student is standing on into a row in `postings`.
 *
 * The URL canonicalisation this depends on lives in `apply-url.ts`, free of
 * database imports so it can be tested without a connection; this module is
 * the half that needs one.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { organizations, postings } from "@/db/schema";
import { normalizeApplyUrl } from "./apply-url";

/* ------------------------------------------------------------------ *
 * Lookup
 * ------------------------------------------------------------------ */

export interface MatchedPosting {
  id: string;
  title: string;
  company: string | null;
  kind: string;
  url: string;
}

/**
 * Find the open posting whose apply URL points at this page.
 *
 * Canonicalisation happens in SQL over the stored column so the comparison is
 * done once per row by Postgres rather than by pulling 3,788 URLs into memory
 * on every keystroke of the extension. The expression mirrors
 * `normalizeApplyUrl` exactly — scheme and `www.` stripped, query and fragment
 * dropped, trailing slash removed.
 *
 * Hidden rows are excluded for the same reason `getPosting` 404s them: a row
 * an operator took down must not come back through a side door. Closed rows
 * are excluded too — offering to autofill something we believe has closed
 * would be walking a student into a wasted application.
 */
export async function findPostingByUrl(pageUrl: string): Promise<MatchedPosting | null> {
  const canonical = normalizeApplyUrl(pageUrl);
  if (!canonical) return null;

  const rows = await db
    .select({
      id: postings.id,
      title: postings.title,
      // Same coalesce the feed uses, so the extension names an employer
      // exactly as every other surface does.
      company: sql<string | null>`coalesce(${organizations.name}, ${postings.sponsorName})`,
      kind: postings.kind,
      url: postings.url,
    })
    .from(postings)
    .leftJoin(organizations, eq(postings.orgId, organizations.id))
    .where(
      and(
        isNull(postings.closedAt),
        isNull(postings.hiddenAt),
        sql`regexp_replace(
              regexp_replace(
                regexp_replace(${postings.url}, '^https?://(www\\.)?', ''),
                '[?#].*$', ''
              ),
              '/+$', ''
            ) = ${canonical}`,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * What the extension is told
 * ------------------------------------------------------------------ */

/**
 * The payload shape the extension consumes.
 *
 * `attestations` carries LABELS ONLY and never values — the extension shows
 * them as "these are yours to answer" beside the highlighted fields on the
 * page. Sending the value would make the strongest guarantee in `autofill.ts`
 * depend on the extension choosing not to use it, which is not a guarantee.
 */
export interface ExtensionPacket {
  posting: MatchedPosting;
  /** Fillable values, keyed by AutofillKey. */
  values: Record<string, string>;
  /** Labels of the legal declarations the student must answer themselves. */
  attestations: string[];
  /** True when a saved cover letter for this posting was included. */
  hasCoverLetter: boolean;
  /** Whether the student has already marked this applied. */
  alreadyApplied: boolean;
}
