/**
 * Cover letter persistence.
 *
 * Our connection is the table owner and bypasses RLS, so every function here
 * takes a `userId` and filters on it — that `where` clause is the actual
 * access control, same as `lib/applications/store.ts`.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { coverLetters } from "@/db/schema";

import { coerceCoverLetter, type CoverLetterDraft } from "./types";

export interface StoredCoverLetter extends CoverLetterDraft {
  id: string;
  postingId: string;
  updatedAt: Date;
}

/** The user's draft for a posting, or null. */
export async function getCoverLetter(
  userId: string,
  postingId: string,
): Promise<StoredCoverLetter | null> {
  const [row] = await db
    .select()
    .from(coverLetters)
    .where(and(eq(coverLetters.userId, userId), eq(coverLetters.postingId, postingId)))
    .limit(1);

  if (!row) return null;
  const draft = coerceCoverLetter({ paragraphs: row.paragraphs, unfilledSlots: row.unfilledSlots });
  if (!draft) return null;
  return { ...draft, id: row.id, postingId: row.postingId, updatedAt: row.updatedAt };
}

/**
 * Upsert the user's draft for a posting.
 *
 * One row per (user, posting) — enforced by a unique index, so regenerate and
 * save can never split the letter across two rows.
 */
export async function saveCoverLetter(
  userId: string,
  postingId: string,
  draft: CoverLetterDraft,
): Promise<StoredCoverLetter> {
  const values = {
    userId,
    postingId,
    paragraphs: draft.paragraphs,
    unfilledSlots: draft.unfilledSlots,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(coverLetters)
    .values(values)
    .onConflictDoUpdate({
      target: [coverLetters.userId, coverLetters.postingId],
      set: { paragraphs: values.paragraphs, unfilledSlots: values.unfilledSlots, updatedAt: values.updatedAt },
    })
    .returning();

  return {
    id: row.id,
    postingId: row.postingId,
    // Written through the validated draft type on the way in; the column's own
    // structural type cannot express the role union, so we assert it back.
    paragraphs: row.paragraphs as CoverLetterDraft["paragraphs"],
    unfilledSlots: row.unfilledSlots,
    updatedAt: row.updatedAt,
  };
}

/** The postings this user has drafted a letter for, most recently edited first. */
export async function listCoverLetters(userId: string): Promise<Array<{ postingId: string; updatedAt: Date }>> {
  return db
    .select({ postingId: coverLetters.postingId, updatedAt: coverLetters.updatedAt })
    .from(coverLetters)
    .where(eq(coverLetters.userId, userId))
    .orderBy(desc(coverLetters.updatedAt));
}

export async function deleteCoverLetter(userId: string, postingId: string): Promise<void> {
  await db
    .delete(coverLetters)
    .where(and(eq(coverLetters.userId, userId), eq(coverLetters.postingId, postingId)));
}
