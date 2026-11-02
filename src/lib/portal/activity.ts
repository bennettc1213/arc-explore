import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { applications, organizations, postings } from "@/db/schema";
import { getFundingTotals } from "@/lib/scholarships/explore";
import type { FundingTotals } from "@/lib/scholarships/plan";

import { summarizeActivity, type ActivitySummary } from "./summary";

export interface PortalActivity {
  summary: ActivitySummary;
  funding: FundingTotals;
}

/**
 * Everything the portal home reads about one student, in one place.
 *
 * Our connection is the table owner and bypasses RLS, so the `userId` filter
 * below is the access control, exactly as in `applications/store.ts`.
 *
 * NOT `listApplications`. That function inner-joins `organizations`, and a
 * scholarship has no `org_id`, so every saved or submitted scholarship vanishes
 * from it (FIXES.md §2). A portal that says "applied: 3" while the student has
 * applied to five would be the same bug on a prettier page, so this reads
 * `postings` directly and takes the company from the organization when there is
 * one and from the sponsor when there is not — the same coalesce the feed uses.
 *
 * The dollar figure is `getFundingTotals`, not a second sum: it already
 * restricts to confirmed amounts and counts the unconfirmed without adding
 * them, and a second implementation would eventually disagree with it.
 */
export async function getPortalActivity(userId: string): Promise<PortalActivity> {
  const [rows, funding] = await Promise.all([
    db
      .select({
        postingId: applications.postingId,
        status: applications.status,
        kind: postings.kind,
        title: postings.title,
        company: sql<string | null>`coalesce(${organizations.name}, ${postings.sponsorName})`,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .innerJoin(postings, eq(applications.postingId, postings.id))
      .leftJoin(organizations, eq(postings.orgId, organizations.id))
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.updatedAt)),
    getFundingTotals(userId),
  ]);

  return { summary: summarizeActivity(rows, new Date()), funding };
}
