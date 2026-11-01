export type WorkArrangement = "remote" | "hybrid" | "in_person" | null;
export type CompensationInterval = "hour" | "year" | null;

export function formatWorkArrangement(value: WorkArrangement): string {
  if (value === "remote") return "Remote";
  if (value === "hybrid") return "Hybrid";
  if (value === "in_person") return "In person";
  return "Not stated";
}

export function formatCompensation(
  minCents: number | null,
  maxCents: number | null,
  interval: CompensationInterval,
): string {
  if (minCents === 0 && maxCents === 0) return "Unpaid";
  if (minCents === null || maxCents === null || !interval) return "Not stated";
  const money = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  const range = minCents === maxCents ? money(minCents) : `${money(minCents)}–${money(maxCents)}`;
  return `${range}/${interval === "hour" ? "hr" : "yr"}`;
}
