import { z } from "zod";

export const scoutSchema = z.object({
  kind: z.enum(["both", "internship", "scholarship"]),
  /** Required, except for merit awards: there are few enough of those that a field usually empties the result. */
  field: z.string().trim().max(100),
  location: z.string().trim().max(100),
  remote: z.boolean(),
  priority: z.enum(["fit", "deadline", "award"]),
  school: z.string().trim().max(160),
  gradYear: z.union([z.literal(""), z.coerce.number().int().min(2020).max(2045)]),
  workAuth: z.enum(["", "us_citizen", "permanent_resident", "needs_sponsorship"]),
  gpa: z.union([z.literal(""), z.coerce.number().min(0).max(5)]),
  gpaScale: z.enum(["4", "4.3", "4.5", "5"]),
  residency: z.string().trim().max(100),
  /** Merit awards only. Defaults keep preferences saved before these existed loadable. */
  merit: z.boolean().default(false),
  college: z.string().trim().max(160).default(""),
}).refine(p => p.merit || p.field.length >= 2, { message: "Add a field or interest.", path: ["field"] });
export type ScoutPreferences = z.infer<typeof scoutSchema>;
export const defaultScout: ScoutPreferences = { kind: "both", field: "", location: "", remote: false, priority: "fit", school: "", gradYear: "", workAuth: "", gpa: "", gpaScale: "4", residency: "", merit: false, college: "" };
