import { z } from "zod";

export const MERIT_STATUSES = ["draft", "verified", "stale", "retired"] as const;
export const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"] as const;
const text = z.string().trim().min(1).max(4000);
const url = z.url().refine(value => { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; }, "Use a public HTTPS URL without credentials");
const date = z.iso.date();
const year = z.string().regex(/^20\d{2}-20\d{2}$/).refine(value => Number(value.slice(5)) === Number(value.slice(0, 4)) + 1, "Use consecutive academic years");
const money = z.number().finite().min(0).max(9999999999.99).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, "Use at most two decimal places");
const gpa = z.number().finite().min(0).max(5).multipleOf(0.001);

export type MeritEligibilityRule =
  | { kind: "all" | "any"; rules: MeritEligibilityRule[] }
  | { kind: "gpa"; min: number; max: number | null; min_inclusive: boolean; max_inclusive: boolean; basis_note: string }
  | { kind: "sat" | "act"; min: number; max: number | null }
  | { kind: "home_state"; include: string[]; exclude: string[] }
  | { kind: "manual_review"; note: string };

/** A data grammar, not executable code. Unsupported school criteria stay explicit. */
const ruleSchema: z.ZodType<MeritEligibilityRule> = z.lazy(() => z.union([
  z.strictObject({ kind: z.enum(["all", "any"]), rules: z.array(ruleSchema).min(1).max(32) }),
  z.strictObject({ kind: z.literal("gpa"), min: gpa, max: gpa.nullable(), min_inclusive: z.boolean(), max_inclusive: z.boolean(), basis_note: text }).refine(value => value.max === null || value.max >= value.min, "GPA bounds are reversed"),
  z.strictObject({ kind: z.literal("sat"), min: z.number().int().min(400).max(1600), max: z.number().int().min(400).max(1600).nullable() }).refine(value => value.max === null || value.max >= value.min, "SAT bounds are reversed"),
  z.strictObject({ kind: z.literal("act"), min: z.number().int().min(1).max(36), max: z.number().int().min(1).max(36).nullable() }).refine(value => value.max === null || value.max >= value.min, "ACT bounds are reversed"),
  z.strictObject({ kind: z.literal("home_state"), include: z.array(z.enum(US_STATES)).max(51), exclude: z.array(z.enum(US_STATES)).max(51) }).refine(value => !value.include.some(state => value.exclude.includes(state)), "A state cannot be both included and excluded"),
  z.strictObject({ kind: z.literal("manual_review"), note: text }),
]));

const tierSchema = z.strictObject({
  seed_key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  audience: z.enum(["first_year", "transfer"]),
  residency: z.enum(["in_state", "out_of_state", "any"]),
  tier_label: text,
  award_academic_year: year.nullable(),
  gpa_min: gpa.nullable(),
  gpa_min_inclusive: z.boolean().default(true),
  gpa_basis_note: text,
  sat_min: z.number().int().min(400).max(1600).nullable(),
  act_min: z.number().int().min(1).max(36).nullable(),
  test_policy: z.enum(["required", "optional", "not_considered"]),
  amount_type: z.enum(["fixed", "up_to", "range"]),
  amount_min: money,
  amount_max: money.positive(),
  per: z.enum(["year", "semester", "total"]),
  // Only populate when the school explicitly states the award's payment periods.
  award_periods_per_year: z.number().int().min(1).max(4).nullable(),
  renewable: z.boolean(),
  renewal_conditions: text.nullable(),
  requires_action: text,
  eligibility_rules: ruleSchema.nullable(),
  source_url: url,
  source_excerpt: z.string().trim().min(1).max(200),
  source_checked_at: date,
}).superRefine((tier, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (tier.amount_min > tier.amount_max) issue("amount_min", "Amount minimum exceeds maximum");
  if (tier.amount_type === "fixed" && (tier.amount_min !== tier.amount_max || tier.amount_min === 0)) issue("amount_min", "Fixed awards need equal positive amounts");
  if (tier.test_policy === "not_considered" && (tier.sat_min !== null || tier.act_min !== null)) issue("test_policy", "A no-test tier cannot contain test cutoffs");
  if (tier.test_policy === "required" && tier.sat_min === null && tier.act_min === null && tier.eligibility_rules === null) issue("test_policy", "Required testing needs a published cutoff or structured rule");
  if (tier.per === "total" && tier.award_periods_per_year !== null) issue("award_periods_per_year", "Do not annualize a total award without a separate published schedule");
  if (tier.per === "year" && tier.award_periods_per_year !== 1) issue("award_periods_per_year", "A yearly award has one annual period");
  if (tier.renewable && !tier.renewal_conditions) issue("renewal_conditions", "Record the published renewal conditions or explicitly state what remains unknown");
});

export const meritSeedSchema = z.strictObject({
  schema_version: z.literal(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  name: text,
  state: z.enum(US_STATES),
  control: z.enum(["public", "private"]),
  official_merit_url: url,
  net_price_calculator_url: url,
  coa_in_state: money.nullable(),
  coa_out_of_state: money.nullable(),
  coa_academic_year: year.nullable(),
  coa_source_url: url.nullable(),
  coa_source_checked_at: date.nullable(),
  notes: text,
  // Files never grant operator verification. Only the interactive command can.
  status: z.enum(["draft", "stale", "retired"]),
  verified_at: z.null(),
  source_checked_at: date,
  review_issues: z.array(text).max(30),
  research: z.strictObject({ robots_url: url, terms_urls: z.array(url).max(10), policy_note: text, checked_at: date }),
  tiers: z.array(tierSchema).min(1).max(500),
}).superRefine((school, ctx) => {
  if ((school.coa_in_state !== null || school.coa_out_of_state !== null) && (!school.coa_academic_year || !school.coa_source_url || !school.coa_source_checked_at)) {
    ctx.addIssue({ code: "custom", path: ["coa_source_url"], message: "Known COA requires an academic year, official source, and check date" });
  }
  const keys = school.tiers.map(tier => tier.seed_key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["tiers"], message: "Tier seed keys must be unique within a school" });
  const officialDomain = new URL(school.official_merit_url).hostname.split(".").slice(-2).join(".");
  for (const [index, tier] of school.tiers.entries()) {
    const host = new URL(tier.source_url).hostname;
    if (host !== officialDomain && !host.endsWith(`.${officialDomain}`)) ctx.addIssue({ code: "custom", path: ["tiers", index, "source_url"], message: "Tier source must be on this school's official domain" });
  }
  if (school.coa_source_url) {
    const host = new URL(school.coa_source_url).hostname;
    if (host !== officialDomain && !host.endsWith(`.${officialDomain}`)) ctx.addIssue({ code: "custom", path: ["coa_source_url"], message: "COA must have an official school source" });
  }
});

export type MeritSeed = z.infer<typeof meritSeedSchema>;
export type MeritTierSeed = MeritSeed["tiers"][number];

export function validateMeritSeed(raw: unknown, today = new Date().toISOString().slice(0, 10)): MeritSeed {
  // Bound recursive input before Zod visits it, including malicious JSON.
  const stack = [{ value: raw, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++nodes > 50000 || depth > 24) throw new Error("Seed exceeds the nesting or size limit");
    if (value && typeof value === "object") for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
  }
  const seed = meritSeedSchema.parse(raw);
  for (const tier of seed.tiers) {
    if (tier.test_policy === "not_considered" && tier.eligibility_rules) {
      const rules = [tier.eligibility_rules];
      while (rules.length) {
        const rule = rules.pop()!;
        if (rule.kind === "act" || rule.kind === "sat") throw new Error("A not-considered tier cannot contain test-score rules");
        if (rule.kind === "all" || rule.kind === "any") rules.push(...rule.rules);
      }
    }
  }
  for (const checked of [seed.source_checked_at, seed.coa_source_checked_at, seed.research.checked_at, ...seed.tiers.map(tier => tier.source_checked_at)]) {
    if (checked && checked > today) throw new Error("A source check date cannot be in the future");
  }
  return seed;
}
