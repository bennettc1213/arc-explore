"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { memoryFactSchema } from "@/lib/profile/memory";
import { saveMemoryFact } from "@/lib/profile/memory-store";

export async function editMemoryFact(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/memory");
  const parsed = memoryFactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your answer." };
  try {
    await saveMemoryFact(user.id, parsed.data.key, parsed.data.value, "profile");
  } catch { return { ok: false, error: "Your answer could not be saved. Please try again." }; }
  revalidatePath("/profile");
  revalidatePath("/memory");
  revalidatePath("/listing", "layout");
  revalidatePath("/explore");
  return { ok: true };
}
