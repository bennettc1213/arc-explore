import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { MeritEligibilityRule, MeritSeed } from "../lib/merit-aid/types";

const dollars = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });

/** Curated public facts. No student identifiers, GPA submissions, or test scores. */
export const meritSchools = pgTable("merit_schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  control: text("control").$type<"public" | "private">().notNull(),
  official_merit_url: text("official_merit_url").notNull(),
  net_price_calculator_url: text("net_price_calculator_url").notNull(),
  coa_in_state: dollars("coa_in_state"),
  coa_out_of_state: dollars("coa_out_of_state"),
  coa_academic_year: text("coa_academic_year"),
  coa_source_url: text("coa_source_url"),
  coa_source_checked_at: date("coa_source_checked_at"),
  notes: text("notes").notNull(),
  status: text("status").$type<"draft" | "verified" | "stale" | "retired">().notNull().default("draft"),
  verified_at: timestamp("verified_at", { withTimezone: true }),
  source_checked_at: date("source_checked_at").notNull(),
  content_hash: text("content_hash").notNull(),
  verified_content_hash: text("verified_content_hash"),
  review_issues: jsonb("review_issues").$type<string[]>().notNull().default([]),
  research: jsonb("research").$type<MeritSeed["research"]>().notNull(),
}, table => [uniqueIndex("merit_school_slug_unique").on(table.slug), index("merit_school_status_verified_idx").on(table.status, table.verified_at)]);

export const meritTiers = pgTable("merit_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  school_id: uuid("school_id").notNull().references(() => meritSchools.id, { onDelete: "cascade" }),
  seed_key: text("seed_key").notNull(),
  audience: text("audience").$type<"first_year" | "transfer">().notNull(),
  residency: text("residency").$type<"in_state" | "out_of_state" | "any">().notNull(),
  tier_label: text("tier_label").notNull(),
  award_academic_year: text("award_academic_year"),
  gpa_min: numeric("gpa_min", { precision: 4, scale: 3, mode: "number" }),
  gpa_min_inclusive: boolean("gpa_min_inclusive").notNull().default(true),
  gpa_basis_note: text("gpa_basis_note").notNull(),
  sat_min: integer("sat_min"),
  act_min: integer("act_min"),
  test_policy: text("test_policy").$type<"required" | "optional" | "not_considered">().notNull(),
  amount_type: text("amount_type").$type<"fixed" | "up_to" | "range">().notNull(),
  amount_min: dollars("amount_min").notNull(),
  amount_max: dollars("amount_max").notNull(),
  per: text("per").$type<"year" | "semester" | "total">().notNull(),
  award_periods_per_year: integer("award_periods_per_year"),
  renewable: boolean("renewable").notNull(),
  renewal_conditions: text("renewal_conditions"),
  requires_action: text("requires_action").notNull(),
  eligibility_rules: jsonb("eligibility_rules").$type<MeritEligibilityRule>(),
  source_url: text("source_url").notNull(),
  source_excerpt: text("source_excerpt").notNull(),
  source_checked_at: date("source_checked_at").notNull(),
}, table => [uniqueIndex("merit_tier_school_key_unique").on(table.school_id, table.seed_key), index("merit_tier_school_idx").on(table.school_id)]);
