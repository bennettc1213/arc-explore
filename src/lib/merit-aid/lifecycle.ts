import { createHash } from "node:crypto";
import type { MeritSeed } from "./types";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",") + "}";
  }
  return JSON.stringify(value);
}

/** Check timestamps don't change facts. Everything a human approves otherwise does. */
export function meritContentHash(seed: MeritSeed): string {
  const school = Object.fromEntries(Object.entries(seed).filter(([key]) => !["source_checked_at", "coa_source_checked_at", "verified_at", "status", "schema_version", "research", "tiers"].includes(key)));
  const policy = Object.fromEntries(Object.entries(seed.research).filter(([key]) => key !== "checked_at"));
  const facts = [...seed.tiers].sort((a, b) => a.seed_key.localeCompare(b.seed_key)).map(tier => Object.fromEntries(Object.entries(tier).filter(([key]) => key !== "source_checked_at")));
  return createHash("sha256").update(canonical({ ...school, research: policy, tiers: facts })).digest("hex");
}

export function verificationCutoff(now: Date): Date {
  // Calendar months, with month-end clamping (e.g. Feb 29 -> Feb 28).
  const day = now.getUTCDate();
  const cutoff = new Date(now);
  cutoff.setUTCDate(1);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  cutoff.setUTCDate(Math.min(day, new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()));
  return cutoff;
}

export function meritIsCurrent(status: string, verifiedAt: Date | null, now: Date): boolean {
  return status === "verified" && verifiedAt !== null && Number.isFinite(verifiedAt.getTime()) && verifiedAt <= now && verifiedAt >= verificationCutoff(now);
}

export function importedStatus(previous: { status: string; content_hash: string } | null, seed: MeritSeed) {
  const unchanged = previous?.content_hash === meritContentHash(seed);
  if (seed.status === "retired" || seed.status === "stale") return { status: seed.status, retainVerification: unchanged };
  // Draft files cannot resurrect retired/stale records or promote anything.
  if (unchanged && previous && ["verified", "stale", "retired"].includes(previous.status)) return { status: previous.status as "verified" | "stale" | "retired", retainVerification: true };
  return { status: "draft" as const, retainVerification: false };
}

/** Used by the human-only entrypoint; safe to test without running that script. */
export function requireInteractiveVerification(input: { stdinTTY?: boolean; stdoutTTY?: boolean; unattended: boolean }) {
  if (!input.stdinTTY || !input.stdoutTTY || input.unattended) throw new Error("Verification requires an interactive terminal. Only the owner may run merit:verify.");
}

export function requireExactSlug(slug: string, typed: string) {
  if (typed !== slug) throw new Error("Slug confirmation did not match; nothing was verified.");
}

export function requireReviewableSeed(seed: MeritSeed) {
  if (seed.status === "retired" || seed.review_issues.length || seed.tiers.some(tier => tier.award_academic_year === null)) throw new Error("Resolve the seed's review issues and award academic years before verification.");
}
