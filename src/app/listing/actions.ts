"use server";

import { revalidatePath } from "next/cache";
import { TIER_LABELS } from "@/lib/pricing/tiers";

import { requireUser } from "@/lib/auth";
import { buildCoverLetterContext } from "@/lib/cover-letter/context";
import {
  CoverLetterGenerateError,
  generateDraft,
  regenerateParagraph,
} from "@/lib/cover-letter/generate";
import { getCoverLetter, listCoverLetters, saveCoverLetter } from "@/lib/cover-letter/store";
import {
  CoverLetterValidationError,
  LETTER_ROLES,
  normalizeDraft,
  type CoverLetterDraft,
  type LetterRole,
} from "@/lib/cover-letter/types";
import { getPosting, type FeedItem } from "@/lib/feed";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature } from "@/lib/pricing/tiers";
import { ensureProfile, getLatestResume, getProfile } from "@/lib/profile/store";
import { toScoreProfile, type UserProfile } from "@/lib/profile/types";
import { EMPTY_PARSED_RESUME, coerceParsedResume, type ParsedResume } from "@/lib/resume/types";
import { skillsFromParsedResume } from "@/lib/score/skills";

/** The single paid plan's display name — never hardcoded. */
const PAID = TIER_LABELS.apply;

export interface LetterActionState {
  status: "idle" | "saved" | "error";
  message?: string;
  draft?: CoverLetterDraft;
}

interface Grounding {
  item: FeedItem;
  profile: UserProfile | null;
  parsed: ParsedResume;
  hasResume: boolean;
}

/**
 * Everything a generation or rewrite may assert, loaded together.
 *
 * All three actions need the same thing: the posting (for facts), the profile
 * (for portfolio/contact), and the parsed resume (for evidence). Loading them
 * once here keeps the actions honest — they can only write a letter from the
 * same grounding the page shows.
 */
async function loadGrounding(userId: string, postingId: string): Promise<Grounding> {
  const [stored, resume] = await Promise.all([getProfile(userId), getLatestResume(userId)]);
  const resumeSkills = resume ? skillsFromParsedResume(resume.parsed) : [];
  const profile = toScoreProfile(stored, resumeSkills);
  const item = await getPosting(postingId, profile);

  if (!item) {
    throw new CoverLetterValidationError("that posting is no longer tracked");
  }

  return {
    item,
    profile: stored,
    parsed: resume ? coerceParsedResume(resume.parsed) : EMPTY_PARSED_RESUME,
    hasResume: Boolean(resume),
  };
}

function contextOf(g: Grounding) {
  return buildCoverLetterContext({ profile: g.profile, parsed: g.parsed, posting: g.item });
}

/** Generate (or regenerate) the whole letter and save it. */
export async function generateCoverLetterAction(
  _prev: LetterActionState,
  formData: FormData,
): Promise<LetterActionState> {
  const postingId = String(formData.get("postingId") ?? "").trim();
  if (!postingId) return { status: "error", message: "missing posting" };
  const user = await requireUser(`/listing/${postingId}`);

  // A letter with no resume to assert from would be a page of guesses. Grounding
  // is the whole point of this module — fail loud instead of letting the model
  // fill the void.
  const grounding = await loadGrounding(user.id, postingId);
  if (!grounding.hasResume) {
    return { status: "error", message: "upload a resume on your profile first — every claim in the letter must come from it" };
  }

  // Quantity cap, not fidelity — the other of the roadmap's two gating
  // patterns. Only a NEW posting's draft counts against it: regenerating a
  // letter the student already has is not a second draft, it is the same
  // one. `listCoverLetters` reads the real table rather than a usage
  // counter, because a cover letter already has exactly one row per unit —
  // counting it twice in a separate table would be the second, driftable
  // copy `USAGE_FEATURE_KEYS`'s own comment warns against.
  const existingLetter = await getCoverLetter(user.id, postingId);
  if (!existingLetter) {
    const tier = await getUserTier(user.id);
    const draftCount = (await listCoverLetters(user.id)).length;
    const access = evaluateFeature(tier, "cover_letter", draftCount);
    if (!access.usable) {
      return {
        status: "error",
        message:
          access.reason === "limit_reached"
            ? `you've used your free cover letter draft — upgrade to ${PAID} for unlimited drafts`
            : `cover letter drafts require the ${PAID} plan`,
      };
    }
  }

  await ensureProfile(user.id);

  let draft: CoverLetterDraft;
  try {
    draft = await generateDraft(contextOf(grounding));
  } catch (err) {
    if (err instanceof CoverLetterGenerateError) {
      return { status: "error", message: err.message };
    }
    throw err;
  }

  await saveCoverLetter(user.id, postingId, draft);
  revalidatePath(`/listing/${postingId}`);
  return { status: "saved", draft };
}

/** Save the student's edits to a draft. */
export async function saveCoverLetterAction(
  _prev: LetterActionState,
  formData: FormData,
): Promise<LetterActionState> {
  const postingId = String(formData.get("postingId") ?? "").trim();
  if (!postingId) return { status: "error", message: "missing posting" };
  const user = await requireUser(`/listing/${postingId}`);

  const raw = formData.get("paragraphs");
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch {
    return { status: "error", message: "could not read the letter to save" };
  }

  let draft: CoverLetterDraft;
  try {
    draft = normalizeDraft(parsed);
  } catch (err) {
    if (err instanceof CoverLetterValidationError) {
      return { status: "error", message: err.message };
    }
    throw err;
  }

  await saveCoverLetter(user.id, postingId, draft);
  revalidatePath(`/listing/${postingId}`);
  return { status: "saved", draft };
}

/** Rewrite a single paragraph in place. */
export async function regenerateParagraphAction(
  _prev: LetterActionState,
  formData: FormData,
): Promise<LetterActionState> {
  const postingId = String(formData.get("postingId") ?? "").trim();
  const paragraphId = String(formData.get("paragraphId") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim() as LetterRole;
  if (!postingId || !paragraphId) return { status: "error", message: "missing paragraph" };
  const user = await requireUser(`/listing/${postingId}`);

  const grounding = await loadGrounding(user.id, postingId);
  if (!grounding.hasResume) {
    return { status: "error", message: "upload a resume on your profile first — every claim in the letter must come from it" };
  }

  const existing = await getCoverLetter(user.id, postingId);
  if (!existing) {
    return { status: "error", message: "generate the letter first, then rewrite a paragraph" };
  }
  if (!LETTER_ROLES.includes(role)) {
    return { status: "error", message: "unrecognised paragraph" };
  }
  const target = existing.paragraphs.find((p) => p.id === paragraphId);
  if (!target) return { status: "error", message: "that paragraph no longer exists" };

  let rewritten;
  try {
    rewritten = await regenerateParagraph(contextOf(grounding), { role: target.role, text: target.text });
  } catch (err) {
    if (err instanceof CoverLetterGenerateError) {
      return { status: "error", message: err.message };
    }
    throw err;
  }

  const paragraphs = existing.paragraphs.map((p) =>
    p.id === paragraphId ? { ...p, text: rewritten.text } : p,
  );

  let draft: CoverLetterDraft;
  try {
    draft = normalizeDraft({ paragraphs });
  } catch (err) {
    if (err instanceof CoverLetterValidationError) {
      return { status: "error", message: err.message };
    }
    throw err;
  }

  await saveCoverLetter(user.id, postingId, draft);
  revalidatePath(`/listing/${postingId}`);
  return { status: "saved", draft };
}
