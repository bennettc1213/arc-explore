/**
 * Listing reports: what a student can tell us that no check of ours can see.
 *
 * Kept free of database imports so the validation is unit-testable without a
 * connection, the same rule `profile/types.ts` follows.
 */

import { z } from "zod";

import { REPORT_REASONS, type ReportReason } from "@/db/schema";

export { REPORT_REASONS, type ReportReason };

/**
 * The reasons, in the order they are offered.
 *
 * Ordered by how badly a human is needed rather than by how common they are.
 * The first two are things our own checks catch eventually — the link checker
 * finds a 404 in about six days, the ATS poll finds a closure in twenty
 * minutes — so a report mostly makes them faster. The rest are invisible to
 * every automated signal we have, and they are why this feature exists.
 */
export const REPORT_OPTIONS: ReadonlyArray<{
  value: ReportReason;
  label: string;
  hint: string;
}> = [
  {
    value: "dead_link",
    label: "the link is broken",
    hint: "it 404s, or it lands somewhere that is not this listing",
  },
  {
    value: "already_closed",
    label: "it is already closed",
    hint: "the page says applications are shut, or the deadline has passed",
  },
  {
    value: "wrong_details",
    label: "the details are wrong",
    hint: "amount, deadline, location, eligibility — say which in the box",
  },
  {
    value: "asks_for_payment",
    label: "it asks for money",
    hint: "an application fee, a deposit, or payment details. we treat this as urgent",
  },
  {
    value: "not_real",
    label: "it is not a real opportunity",
    hint: "a lead-generation form, a course being sold, or a listing that does not exist",
  },
  { value: "other", label: "something else", hint: "tell us in the box" },
];

/** Reports we want to see the moment they arrive, ahead of everything else. */
export const URGENT_REASONS: ReadonlySet<ReportReason> = new Set(["asks_for_payment", "not_real"]);

export const MAX_DETAIL_LENGTH = 1000;

export const reportInputSchema = z.object({
  postingId: z.string().uuid({ message: "that is not a listing we recognise" }),
  reason: z.enum(REPORT_REASONS, { message: "pick one of the reasons" }),
  /** Trimmed, and "" becomes null — an empty box is "no comment", not a comment. */
  detail: z
    .string()
    .trim()
    .max(MAX_DETAIL_LENGTH, { message: `keep it under ${MAX_DETAIL_LENGTH} characters` })
    .transform((s) => (s.length === 0 ? null : s))
    .nullable(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

export function reasonLabel(reason: ReportReason): string {
  return REPORT_OPTIONS.find((o) => o.value === reason)?.label ?? reason;
}

/**
 * Sort key for the admin queue.
 *
 * Money and fraud first regardless of age, because a scholarship charging an
 * application fee is the one thing here that can cost a student money today.
 * Everything else is oldest-first, so nothing rots at the bottom.
 */
export function queuePriority(reason: ReportReason): number {
  return URGENT_REASONS.has(reason) ? 0 : 1;
}
