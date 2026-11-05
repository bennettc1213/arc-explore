import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applicationMemoryFacts, profiles } from "@/db/schema";
import { buildAutofillValues } from "@/lib/apply/autofill";
import { buildApplicationPacket } from "@/lib/apply/packet";
import { coerceParsedResume } from "@/lib/resume/types";
import { getLatestResume, getProfile } from "./store";
import { applyMemoryFacts, MEMORY_FIELDS, memoryFactSchema, type MemoryFact, type MemoryKey } from "./memory";

export async function getMemoryFacts(userId: string) {
  return db.select().from(applicationMemoryFacts).where(eq(applicationMemoryFacts.userId, userId));
}

export async function getMemorySnapshot(userId: string, email: string | null): Promise<MemoryFact[]> {
  const [profile, resume, stored] = await Promise.all([getProfile(userId), getLatestResume(userId), getMemoryFacts(userId)]);
  const parsed = resume ? coerceParsedResume(resume.parsed) : null;
  const packet = buildApplicationPacket({ profile, resume: parsed, accountEmail: email });
  const links = [...(parsed?.links ?? []), profile?.portfolioUrl, profile?.linkedinUrl,
    profile?.githubUsername ? `https://github.com/${profile.githubUsername}` : null].filter((s): s is string => Boolean(s));
  const base = buildAutofillValues({ fields: packet.fields.filter(f => f.key !== "locations"), links });
  const values = applyMemoryFacts(base, stored);
  const packetKeys: Record<string, string> = { fullName: "name", firstName: "name", lastName: "name" };
  return MEMORY_FIELDS.map(({ key }) => {
    const saved = stored.find(f => f.key === key);
    const derivedName = ["firstName", "lastName"].includes(key) ? stored.find(f => f.key === "fullName") : null;
    const field = packet.fields.find(f => f.key === (packetKeys[key] ?? key));
    const fromProfileLink = key === "linkedinUrl" ? profile?.linkedinUrl : key === "githubUrl" ? profile?.githubUsername : profile?.portfolioUrl;
    const source = saved || derivedName ? "memory" : field?.source ?? (values[key] ? fromProfileLink ? "profile" : "resume" : "missing");
    return { key, value: values[key] ?? null, source, updatedAt: (saved ?? derivedName)?.updatedAt.toISOString() };
  });
}

/** userId must come from the verified session. Null is an explicit forget. */
export async function saveMemoryFact(userId: string, key: MemoryKey, value: string | null, source: "profile" | "application") {
  const fact = memoryFactSchema.parse({ key, value: value?.trim() || null });
  await db.transaction(async tx => {
    await tx.insert(profiles).values({ id: userId }).onConflictDoNothing();
    await tx.insert(applicationMemoryFacts).values({ userId, ...fact, source })
      .onConflictDoUpdate({ target: [applicationMemoryFacts.userId, applicationMemoryFacts.key], set: { value: fact.value, source, updatedAt: new Date() } });
    // Keep the existing profile editor and matching context in sync.
    const columns = { fullName: "displayName", school: "school", major: "major", gradYear: "gradYear", gpa: "gpa", portfolioUrl: "portfolioUrl", linkedinUrl: "linkedinUrl" } as const;
    const column = columns[key as keyof typeof columns];
    if (column) {
      const next = (key === "gradYear" || key === "gpa") && fact.value !== null ? Number(fact.value) : fact.value;
      await tx.update(profiles).set({ [column]: next, updatedAt: new Date() }).where(eq(profiles.id, userId));
    }
    if (key === "githubUrl") {
      const handle = fact.value ? new URL(fact.value).pathname.split("/").filter(Boolean)[0] ?? null : null;
      await tx.update(profiles).set({ githubUsername: handle, updatedAt: new Date() }).where(eq(profiles.id, userId));
    }
    if (key === "fullName") {
      // Explicit name edits invalidate old derived name overrides.
      for (const part of ["firstName", "lastName"]) await tx.delete(applicationMemoryFacts)
        .where(and(eq(applicationMemoryFacts.userId, userId), eq(applicationMemoryFacts.key, part)));
    }
  });
}
