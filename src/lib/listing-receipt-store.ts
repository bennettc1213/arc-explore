import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { SOURCE_CATALOGUE } from "@/lib/admin/source-health";

import { describeReceipt, type ReceiptFacts, type ReceiptLine } from "./listing-receipt";

const ISO = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS"Z"'`);

/**
 * One listing's receipt facts. Timestamps leave Postgres as ISO text because
 * `db.execute` returns timestamptz as a string (HANDOFF §6). Public data only:
 * the same facts the listing page already implies, stated precisely.
 */
async function getReceiptFacts(postingId: string): Promise<ReceiptFacts | null> {
  const rows = await db.execute<{
    kind: "internship" | "scholarship";
    url: string;
    sources: string[] | null;
    first_seen_at: string;
    last_seen_at: string;
    confirmed_at: string | null;
    url_checked_at: string | null;
    url_status: number | null;
    reopen_count: number;
    closed_at: string | null;
  }>(sql`
    select p.kind, p.url,
      (select array_agg(distinct ps.source order by ps.source) from posting_sources ps where ps.posting_id = p.id) as sources,
      to_char(p.first_seen_at at time zone 'UTC', ${ISO}) as first_seen_at,
      to_char(p.last_seen_at at time zone 'UTC', ${ISO}) as last_seen_at,
      to_char(p.confirmed_at at time zone 'UTC', ${ISO}) as confirmed_at,
      to_char(p.url_checked_at at time zone 'UTC', ${ISO}) as url_checked_at,
      p.url_status, p.reopen_count,
      to_char(p.closed_at at time zone 'UTC', ${ISO}) as closed_at
    from postings p
    where p.id = ${postingId}`);
  const r = rows[0];
  if (!r) return null;
  return {
    kind: r.kind,
    url: r.url,
    // Catalogue names ("Scholarships.com"), not storage keys ("scholarshipscom").
    sources: (r.sources ?? []).map((s) => SOURCE_CATALOGUE.find((d) => d.key === s)?.label ?? s),
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    confirmedAt: r.confirmed_at,
    urlCheckedAt: r.url_checked_at,
    urlStatus: r.url_status,
    reopenCount: r.reopen_count,
    closedAt: r.closed_at,
  };
}

/** Receipt lines worded against this request's clock (kept out of render). */
export async function getListingReceipt(postingId: string): Promise<ReceiptLine[] | null> {
  const facts = await getReceiptFacts(postingId);
  return facts ? describeReceipt(facts, new Date()) : null;
}
