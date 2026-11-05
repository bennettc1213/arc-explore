import { z } from "zod";
import { splitName, type AutofillValues } from "../apply/autofill";

// Only stable, explicitly named facts can become cross-application memory.
// An arbitrary employer question can never create a new memory key.
export const MEMORY_FIELDS = [
  { key: "fullName", label: "Full name", group: "Contact" },
  { key: "firstName", label: "First name", group: "Contact" },
  { key: "lastName", label: "Last name", group: "Contact" },
  { key: "email", label: "Application email", group: "Contact" },
  { key: "phone", label: "Phone number", group: "Contact" },
  { key: "location", label: "Current city / location", group: "Contact" },
  { key: "school", label: "School", group: "Education" },
  { key: "major", label: "Major / field of study", group: "Education" },
  { key: "degree", label: "Degree", group: "Education" },
  { key: "gradYear", label: "Graduation year", group: "Education" },
  { key: "gpa", label: "GPA", group: "Education" },
  { key: "linkedinUrl", label: "LinkedIn URL", group: "Links" },
  { key: "githubUrl", label: "GitHub URL", group: "Links" },
  { key: "portfolioUrl", label: "Portfolio / website", group: "Links" },
] as const;
export type MemoryKey = (typeof MEMORY_FIELDS)[number]["key"];
export const memoryKeySchema = z.enum(MEMORY_FIELDS.map(f => f.key) as [MemoryKey, ...MemoryKey[]]);
export const memoryFactSchema = z.object({
  key: memoryKeySchema,
  value: z.string().trim().max(500).nullable(),
}).superRefine(({ key, value }, ctx) => {
  if (!value) return;
  const invalid = (message: string) => ctx.addIssue({ code: "custom", path: ["value"], message });
  const limits: Partial<Record<MemoryKey, number>> = { fullName: 120, school: 160, major: 160, portfolioUrl: 300, linkedinUrl: 300, githubUrl: 300 };
  if (limits[key] && value.length > limits[key]!) invalid(`Use ${limits[key]} characters or fewer.`);
  if (key === "email" && !z.email().safeParse(value).success) invalid("Enter a valid email address.");
  const year = new Date().getFullYear();
  if (key === "gradYear" && (!/^\d{4}$/.test(value) || Number(value) < year - 10 || Number(value) > year + 10)) invalid(`Enter a graduation year between ${year - 10} and ${year + 10}.`);
  if (key === "gpa" && (!/^\d(?:\.\d+)?$/.test(value) || Number(value) > 4.5)) invalid("Enter a GPA between 0 and 4.5.");
  if (key.endsWith("Url")) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
      if (key === "linkedinUrl" && !/(^|\.)linkedin\.com$/i.test(url.hostname)) throw new Error();
      if (key === "githubUrl" && url.hostname.toLowerCase() !== "github.com") throw new Error();
    } catch { invalid("Enter a valid profile URL starting with https://."); }
  }
});

export interface MemoryFact {
  key: MemoryKey;
  value: string | null;
  source: "profile" | "resume" | "account" | "memory" | "missing";
  updatedAt?: string;
}

export function applyMemoryFacts(base: AutofillValues, facts: { key: string; value: string | null }[]): AutofillValues {
  const values = { ...base };
  const name = facts.find(f => f.key === "fullName");
  if (name) {
    delete values.firstName;
    delete values.lastName;
    if (name.value) {
      const parts = splitName(name.value);
      if (parts.firstName) values.firstName = parts.firstName;
      if (parts.lastName) values.lastName = parts.lastName;
    }
  }
  for (const fact of facts) {
    const key = memoryKeySchema.safeParse(fact.key);
    if (!key.success) continue;
    if (fact.value) values[key.data] = fact.value;
    else delete values[key.data]; // A forgotten fact must not reappear from a resume fallback.
  }
  return values;
}
