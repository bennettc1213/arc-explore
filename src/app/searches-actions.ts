"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { deleteSearch, saveSearch, setNotify } from "@/lib/searches/store";
import { MAX_SAVED_SEARCHES, isEmptyFilters, saveSearchSchema } from "@/lib/searches/types";

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
  const user = await requireUser("/");

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

  const result = await saveSearch(user.id, parsed.data.name, parsed.data.filters);
  if (result === "at_limit") {
    return {
      status: "error",
      message: `you already have ${MAX_SAVED_SEARCHES} saved — delete one first`,
    };
  }

  revalidatePath("/");
  return { status: "saved" };
}

export async function deleteSearchAction(formData: FormData): Promise<void> {
  const user = await requireUser("/");
  const id = String(formData.get("id") ?? "");
  if (id) await deleteSearch(user.id, id);
  revalidatePath("/");
}

export async function toggleNotifyAction(formData: FormData): Promise<void> {
  const user = await requireUser("/");
  const id = String(formData.get("id") ?? "");
  if (id) await setNotify(user.id, id, formData.get("notify") === "1");
  revalidatePath("/");
}
