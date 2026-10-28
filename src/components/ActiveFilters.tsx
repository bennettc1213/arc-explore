import Link from "next/link";
import { FEED_PATH } from "@/lib/routes";

const labels: Record<string, string> = { focus: "Award focus", college: "College", q: "Search", kind: "Type", deadline: "Deadline", minAmount: "Min award", location: "Location", category: "Category", remote: "Remote only", includeClosed: "Include closed", includeInferred: "Inferred terms", includeUnknownAmounts: "Unknown amounts", term: "Term", new: "Added in last", hideBlocked: "Hide ineligible", excludeMarketing: "Exclude marketing" };
const flags = new Set(["remote", "includeClosed", "includeInferred", "includeUnknownAmounts", "hideBlocked", "excludeMarketing"]);
export function ActiveFilters({ params }: { params: Record<string, string | string[] | undefined> }) {
  const pairs = Object.entries(params).flatMap(([k, v]) => v === undefined ? [] : (Array.isArray(v) ? v : [v]).map(value => [k, value] as [string, string]));
  const active = pairs.filter(([k, v]) => labels[k] && v && (!flags.has(k) || v === "1"));
  if (!active.length) return null;
  const reset = new URLSearchParams(pairs.filter(([k]) => !labels[k] && k !== "show"));
  return <nav className="active-filters" aria-label="Active filters">{active.map(([k, v]) => {
    const next = new URLSearchParams(pairs); next.delete(k); next.delete("show");
    const text = flags.has(k) ? labels[k] : `${labels[k]}: ${k === "deadline" && v !== "set" ? `${v} days` : k === "new" ? `${v} days` : v.replaceAll("_", " ")}`;
    return <Link key={`${k}:${v}`} href={`${FEED_PATH}?${next}`} className="filter-chip" aria-label={`Remove ${text}`} scroll={false}>{text}<span aria-hidden="true">×</span></Link>;
  })}<Link href={`${FEED_PATH}?${reset}`} className="clear-filters" scroll={false}>Clear filters</Link></nav>;
}
