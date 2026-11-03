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
import { getCoverLetter, saveCoverLetter } from "@/lib/cover-letter/store";
import { recordEvent } from "@/lib/analytics/record";
import {
  CoverLetterValidationError,
  LETTER_ROLES,
  normalizeDraft,
  type CoverLetterDraft,
  type LetterRole,
} from "@/lib/cover-letter/types";
import { getPosting, type FeedItem } from "@/lib/feed";
import { getUserTier } from "@/lib/pricing/entitlements";
import { formatRenewal } from "@/lib/pricing/allowance";
import { AI_REQUESTS_PER_HOUR, throttleAiRequest, withAllowance } from "@/lib/pricing/grants";
import { ensureProfile, getLatestResume, getProfile } from "@/lib/profile/store";
import { type UserProfile } from "@/lib/profile/types";
import { toScoringProfile as toScoreProfile } from "@/lib/score/v2/profile";
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
  const profile = toScoreProfile(stored, resumeSkills, resume?.parsed);
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

/**
 * The operational limit on AI calls, on every plan. Unlimited Pro drafts are
 * still bounded per hour so one account cannot run up provider cost without
 * limit; the number is disclosed on the pricing page. Null means proceed.
 */
async function throttleMessage(userId: string): Promise<string | null> {
  const result = await throttleAiRequest(userId, "cover_letter");
  if (result === "duplicate") return "that request is already being written — give it a moment";
  if (result === "hourly_limit") {
    return `you've reached ${AI_REQUESTS_PER_HOUR} letter generations in the last hour — this protects the service on every plan; try again shortly`;
  }
  return null;
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

  // One draft for a DISTINCT opportunity per 30-day allowance period on Free.
  // Regenerating a letter the student already has is revising earned work,
  // not a new use: an existing draft, or an earlier grant for this posting
  // (e.g. a deleted and re-drafted letter), replays for free. Usage lives in
  // feature_grants, not in a count of cover_letters rows, because rows can be
  // edited and deleted. The unit is reserved before the model call and given
  // back if the provider fails.
  const existingLetter = await getCoverLetter(user.id, postingId);
  const tier = await getUserTier(user.id);

  const throttled = await throttleMessage(user.id);
  if (throttled) return { status: "error", message: throttled };

  await ensureProfile(user.id);

  let draft: CoverLetterDraft | null;
  try {
    if (existingLetter) {
      draft = await generateDraft(contextOf(grounding));
    } else {
      const run = await withAllowance(
        { userId: user.id, tier, feature: "cover_letter", keys: [postingId] },
        () => generateDraft(contextOf(grounding)),
      );
      if (run.begin.outcome === "in_flight") {
        return { status: "error", message: "this letter is already being written — give it a moment" };
      }
      if (run.begin.outcome === "blocked") {
        void recordEvent("upgrade_prompt_viewed", { feature: "cover_letter" });
        const renews = run.begin.renewsAt ? ` Your next free draft is available ${formatRenewal(run.begin.renewsAt)}.` : "";
        return {
          status: "error",
          message: `this period's free cover letter was used on another opportunity — your existing drafts stay editable.${renews} ${PAID} drafts without a limit.`,
        };
      }
      draft = run.value;
    }
  } catch (err) {
    if (err instanceof CoverLetterGenerateError) {
      return { status: "error", message: err.message };
    }
    throw err;
  }
  if (!draft) return { status: "error", message: "the draft could not be generated" };

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

  // Rewriting one paragraph of an earned draft never uses the allowance, on
  // any plan — only the hourly AI limit applies.
  const throttled = await throttleMessage(user.id);
  if (throttled) return { status: "error", message: throttled };

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
