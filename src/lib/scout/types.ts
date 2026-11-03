import { z } from "zod";

export const scoutSchema = z.object({
  kind: z.enum(["both", "internship", "scholarship"]),
  field: z.string().trim().min(2, "Add a field or interest.").max(100),
  location: z.string().trim().max(100),
  remote: z.boolean(),
  priority: z.enum(["fit", "deadline", "award"]),
  school: z.string().trim().max(160),
  gradYear: z.union([z.literal(""), z.coerce.number().int().min(2020).max(2045)]),
  workAuth: z.enum(["", "us_citizen", "permanent_resident", "needs_sponsorship"]),
  gpa: z.union([z.literal(""), z.coerce.number().min(0).max(5)]),
  gpaScale: z.enum(["4", "4.3", "4.5", "5"]),
  residency: z.string().trim().max(100),
});
export type ScoutPreferences = z.infer<typeof scoutSchema>;
export const defaultScout: ScoutPreferences = { kind: "both", field: "", location: "", remote: false, priority: "fit", school: "", gradYear: "", workAuth: "", gpa: "", gpaScale: "4", residency: "" };
