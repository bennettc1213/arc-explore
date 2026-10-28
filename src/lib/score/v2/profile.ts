import { z } from "zod";
import { toScoreProfile, type UserProfile } from "@/lib/profile/types";
import { coerceParsedResume } from "@/lib/resume/types";
import { skillsFromParsedResume } from "../skills";
import type { ScoreProfile } from "../fit";

type Params = Record<string, string | string[] | undefined>;
const optionalText = z.string().trim().min(1).max(160).catch("");
const scale = z.coerce.number().refine(value => [4, 4.3, 4.5, 5].includes(value)).optional().catch(undefined);
const gpa = z.coerce.number().min(0).max(5).optional().catch(undefined);
const enrollment = z.enum(["enrolled", "admitted", "incoming", "transfer"]).optional().catch(undefined);
const education = z.enum(["high_school", "undergraduate", "graduate"]).optional().catch(undefined);
const priority = z.enum(["fit", "deadline", "award", "effort"]).catch("fit");

/** Unlike the legacy bridge, school/GPA are checked ONLY against explicit source criteria. */
export function toScoringProfile(profile: UserProfile | null, resumeSkills: string[] = [], rawResume?: unknown): ScoreProfile {
  const resume = coerceParsedResume(rawResume);
  return {
    ...toScoreProfile(profile, resumeSkills),
    school: profile?.school ?? null, gpa: profile?.gpa ?? null,
    experienceSkills: skillsFromParsedResume({ experiences: resume.experiences, projects: resume.projects }),
  };
}
export function withScoringPreferences(profile: ScoreProfile, params: Params, guest = false): ScoreProfile {
  const one = (key: string) => { const value = params[key]; return (Array.isArray(value) ? value[0] : value)?.trim() || undefined; };
  return {
    ...profile,
    ...(guest ? { school: optionalText.parse(one("school")) || null, gpa: gpa.parse(one("gpa")) ?? null } : {}),
    gpaScale: scale.parse(one("gpaScale")) ?? null,
    enrollmentStatus: enrollment.parse(one("enrollmentStatus")) ?? null,
    educationLevel: education.parse(one("educationLevel")) ?? null,
    residency: optionalText.parse(one("residency")) || null,
    priority: priority.parse(one("priority")),
    collegeMerit: one("focus") === "merit",
  };
}
export function scoringQueryFrom(params: Params): string {
  const result = new URLSearchParams();
  for (const key of ["major", "gradYear", "workAuth", "locations", "targetVerticals", "remote", "school", "gpa", "gpaScale", "enrollmentStatus", "educationLevel", "residency", "priority", "focus"]) {
    const value = params[key];
    for (const v of Array.isArray(value) ? value : value ? [value] : []) result.append(key, v);
  }
  return result.toString();
}
