/**
 * Honest award-amount rendering.
 *
 * Centralises the policy that program totals, per-award amounts, ranges,
 * estimates, and unknowns are never confused in the UI.
 */

import type { FeedItem } from "@/lib/feed";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function formatRange(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null && min !== max) {
    return `$${fmt(min)}–$${fmt(max)}`;
  }
  const value = min ?? max;
  return value === null ? null : `$${fmt(value)}`;
}

export function formatAward(item: Pick<
  FeedItem,
  "kind" | "amountMin" | "amountMax" | "amountStatus" | "programTotal" | "awardsCount" | "amountIsEstimated"
>): string | null {
  if (item.kind !== "scholarship") return null;

  if (item.amountStatus === "unparseable") {
    return "Amount not stated";
  }

  if (item.amountStatus === "varies") {
    if (item.programTotal !== null) return `$${fmt(item.programTotal)} total`;
    if (item.awardsCount !== null) return `about ${fmt(item.awardsCount)} awards a year`;
    return "Amount varies";
  }

  const amount = formatRange(item.amountMin, item.amountMax);
  if (amount === null) {
    // Defensive: status says we know something but bounds are missing.
    return item.programTotal !== null
      ? `$${fmt(item.programTotal)} total`
      : "Amount varies";
  }

  const parts: string[] = [item.amountIsEstimated ? `${amount} (est.)` : amount];
  if (item.awardsCount !== null) {
    parts.push(`about ${fmt(item.awardsCount)} awards a year`);
  } else if (item.programTotal !== null) {
    parts.push(`$${fmt(item.programTotal)} total`);
  }
  return parts.join(" · ");
}
