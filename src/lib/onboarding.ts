import { z } from "zod";
import { profileInputSchema } from "@/lib/profile/types";

export const ONBOARDING_KEY = "instela-onboarding-v1";
export const GOALS = [
  {
    id: "scholarships",
    icon: "◇",
    title: "Scholarship opportunities",
    detail: "Find funding that fits your story.",
  },
  {
    id: "internships",
    icon: "↗",
    title: "Internship opportunities",
    detail: "Get experience. Get your foot in the door.",
  },
  {
    id: "resume",
    icon: "≡",
    title: "Resume checker",
    detail: "Make every line work harder.",
  },
  {
    id: "github",
    icon: "⌘",
    title: "GitHub audit",
    detail: "Turn your projects into proof.",
  },
  {
    id: "linkedin",
    icon: "in",
    title: "LinkedIn audit",
    detail: "Put your best professional self forward.",
  },
  {
    id: "merit",
    icon: "✧",
    title: "Automatic merit aid finder",
    detail: "For high school seniors and transfers.",
    soon: true,
  },
  {
    id: "hidden",
    icon: "⊕",
    title: "Hidden aid finder",
    detail: "Discover funding you might overlook.",
    soon: true,
  },
  {
    id: "research",
    icon: "⌁",
    title: "Research & summer programs",
    detail: "Take your curiosity somewhere new.",
    soon: true,
  },
  {
    id: "almost",
    icon: "↗",
    title: "“Almost eligible” unlocker",
    detail: "See what could put an opportunity in reach.",
    soon: true,
  },
  {
    id: "agent",
    icon: "✳",
    title: "AI application updates",
    detail: "An agent that follows scholarship and internship replies.",
    soon: true,
  },
] as const;

export const onboardingSchema = z.object({
  profile: profileInputSchema,
  goals: z
    .array(z.enum(GOALS.map((g) => g.id)))
    .min(1)
    .max(GOALS.length),
  education: z.enum([
    "high-school",
    "college",
    "transfer",
    "graduate",
    "other",
    "",
  ]),
  degree: z.string().trim().max(100),
});

/** A domain check is a preview of eligibility, never proof of enrollment. */
export function isSchoolEmail(email: string): boolean {
  return /^[^@\s]+@(?:[a-z0-9-]+\.)+(?:edu|edu\.[a-z]{2}|ac\.[a-z]{2})$/i.test(
    email.trim(),
  );
}
