"use server";

import { revalidatePath } from "next/cache";
import { TIER_LABELS } from "@/lib/pricing/tiers";

import { requireUser } from "@/lib/auth";
import { recordEvent } from "@/lib/analytics/record";
import { getUserTier } from "@/lib/pricing/entitlements";
import { savedSearchLimit } from "@/lib/searches/alerting";
import { deleteSearch, pickFreeAlert, saveSearch, setNotify } from "@/lib/searches/store";
import { isEmptyFilters, saveSearchSchema } from "@/lib/searches/types";
import { FEED_PATH } from "@/lib/routes";

/** The single paid plan's display name — never hardcoded. */
const PAID = TIER_LABELS.apply;

export interface SaveSearchState {
  status: "idle" | "saved" | "error";
  message?: string;
}

/**
 * Save the current feed filters as a standing search.
 *
 * The filters arrive as a JSON string of what the feed page already parsed, and
 * are re-validated here against the same schema — a Server Action is a public
 * POST endpoint, so what the page sent is not what we can assume arrives.
 */
export async function saveSearchAction(
  _prev: SaveSearchState,
  formData: FormData,
): Promise<SaveSearchState> {
  const user = await requireUser(FEED_PATH);

  // Saving works on every plan, with or without email configured: the search
  // reopens from the feed either way. The plan sets how many may exist (one
  // on Free) and how often they alert (lib/searches/alerting.ts).
  const tier = await getUserTier(user.id);
  const limit = savedSearchLimit(tier);

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("filters") ?? "null"));
  } catch {
    return { status: "error", message: "could not read those filters" };
  }

  const parsed = saveSearchSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    filters: raw,
  });
  if (!parsed.success) {
    return { status: "error", message: "could not read those filters" };
  }

  // Saving "everything" would alert on every posting we ingest, which is not a
  // search — it is a firehose the student did not ask for.
  if (isEmptyFilters(parsed.data.filters)) {
    return { status: "error", message: "narrow the feed first — an empty search matches everything" };
  }

  const result = await saveSearch(user.id, parsed.data.name, parsed.data.filters, limit);
  if (result === "at_limit") {
    if (tier === "free") void recordEvent("upgrade_prompt_viewed", { feature: "saved_search_alerts" });
    return {
      status: "error",
      message:
        tier === "free"
          ? `${TIER_LABELS.free} keeps ${limit} saved search — delete it to save this one, or ${PAID} saves several and alerts daily`
          : `you already have ${limit} saved — delete one first`,
    };
  }

  revalidatePath(FEED_PATH);
  return { status: "saved" };
}

export async function deleteSearchAction(formData: FormData): Promise<void> {
  const user = await requireUser(FEED_PATH);
  const id = String(formData.get("id") ?? "");
  if (id) await deleteSearch(user.id, id);
  revalidatePath(FEED_PATH);
}

export async function toggleNotifyAction(formData: FormData): Promise<void> {
  const user = await requireUser(FEED_PATH);
  const id = String(formData.get("id") ?? "");
  if (id) await setNotify(user.id, id, formData.get("notify") === "1");
  revalidatePath(FEED_PATH);
}

/** Choose which saved search alerts while the account is on Free. */
export async function pickFreeAlertAction(formData: FormData): Promise<void> {
  const user = await requireUser(FEED_PATH);
  const id = String(formData.get("id") ?? "");
  if (id) await pickFreeAlert(user.id, id);
  revalidatePath(FEED_PATH);
}
