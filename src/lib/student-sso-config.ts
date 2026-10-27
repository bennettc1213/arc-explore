import { z } from "zod";

const providerSchema = z.object({
  providerId: z.string().uuid(),
  name: z.string().min(1),
  domains: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/),
    )
    .min(1),
  affiliationClaim: z.string().min(1).default("affiliation"),
  studentValue: z.string().min(1).default("student"),
});
export type StudentSSOProvider = z.infer<typeof providerSchema>;
export function studentSSOProviders(): StudentSSOProvider[] {
  try {
    return z
      .array(providerSchema)
      .parse(JSON.parse(process.env.STUDENT_SSO_PROVIDERS ?? "[]"));
  } catch {
    return [];
  }
}
export function studentAffiliationMatches(
  value: unknown,
  expected: string,
  domains: string[],
) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,\s]+/)
      : [];
  return values.some((entry) => {
    if (typeof entry !== "string") return false;
    const [role, scope] = entry.toLowerCase().split("@");
    return (
      role === expected.toLowerCase() && (!scope || domains.includes(scope))
    );
  });
}
