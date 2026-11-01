import { and, eq, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { meritSchools, meritTiers } from "@/db/merit-schema";
import { importedStatus, meritContentHash, requireReviewableSeed, verificationCutoff } from "./lifecycle";
import { validateMeritSeed, type MeritSeed } from "./types";

function schoolValues(seed: MeritSeed) {
  return {
    slug: seed.slug, name: seed.name, state: seed.state, control: seed.control,
    official_merit_url: seed.official_merit_url, net_price_calculator_url: seed.net_price_calculator_url,
    coa_in_state: seed.coa_in_state, coa_out_of_state: seed.coa_out_of_state,
    coa_academic_year: seed.coa_academic_year, coa_source_url: seed.coa_source_url,
    coa_source_checked_at: seed.coa_source_checked_at, notes: seed.notes,
    source_checked_at: seed.source_checked_at, review_issues: seed.review_issues,
    research: seed.research, content_hash: meritContentHash(seed),
  };
}

/** All seed files are validated before this is called; a catalog import is atomic. */
export async function importMeritSeeds(seeds: MeritSeed[], database = db) {
  return database.transaction(async tx => {
    const report: Array<{ slug: string; changed: boolean; tiers: number; status: string }> = [];
    for (const seed of [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`merit-aid:${seed.slug}`}, 0))`);
      const [previous] = await tx.select().from(meritSchools).where(eq(meritSchools.slug, seed.slug));
      const content_hash = meritContentHash(seed);
      let changed = previous?.content_hash !== content_hash;
      if (previous && !changed) {
        const oldTiers = await tx.select().from(meritTiers).where(eq(meritTiers.school_id, previous.id));
        try { changed = meritContentHash(seedFromDatabase(seed, previous, oldTiers)) !== content_hash; }
        catch { changed = true; }
      }
      const decision = importedStatus(previous ?? null, seed);
      const values = schoolValues(seed);
      const [school] = await tx.insert(meritSchools).values({ ...values, status: "draft" })
        .onConflictDoUpdate({ target: meritSchools.slug, set: { ...values,
          // A repeated import cannot claim a source was checked less recently.
          source_checked_at: previous && previous.source_checked_at > seed.source_checked_at ? previous.source_checked_at : seed.source_checked_at,
          status: decision.status, verified_at: decision.retainVerification ? previous?.verified_at ?? null : null,
          verified_content_hash: decision.retainVerification ? previous?.verified_content_hash ?? null : null,
        } }).returning();
      if (changed) {
        await tx.update(meritSchools).set({ status: "draft", verified_at: null, verified_content_hash: null }).where(eq(meritSchools.id, school.id));
        for (const tier of seed.tiers) await tx.insert(meritTiers).values({ ...tier, school_id: school.id })
          .onConflictDoUpdate({ target: [meritTiers.school_id, meritTiers.seed_key], set: tier });
        // Remove only obsolete tiers of this explicitly named imported school.
        await tx.delete(meritTiers).where(and(eq(meritTiers.school_id, school.id), notInArray(meritTiers.seed_key, seed.tiers.map(tier => tier.seed_key))));
      } else {
        for (const tier of seed.tiers) await tx.update(meritTiers).set({ source_checked_at: tier.source_checked_at })
          .where(and(eq(meritTiers.school_id, school.id), eq(meritTiers.seed_key, tier.seed_key), lt(meritTiers.source_checked_at, tier.source_checked_at)));
      }
      // Tier mutation triggers invalidate approval. Preserve explicit retirement/staleness after syncing.
      if (decision.status === "retired" || decision.status === "stale") await tx.update(meritSchools).set({ status: decision.status }).where(eq(meritSchools.id, school.id));
      const [final] = await tx.select({ status: meritSchools.status }).from(meritSchools).where(eq(meritSchools.id, school.id));
      report.push({ slug: seed.slug, changed, tiers: seed.tiers.length, status: final.status });
    }
    return report;
  });
}

/** Called only by the interactive human CLI, never by import or validation. */
export async function verifyImportedMeritSeed(seed: MeritSeed, now = new Date(), database = db) {
  requireReviewableSeed(seed);
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`merit-aid:${seed.slug}`}, 0))`);
    const [school] = await tx.select().from(meritSchools).where(eq(meritSchools.slug, seed.slug));
    if (!school || school.content_hash !== meritContentHash(seed)) throw new Error("Import this exact seed file before verifying it");
    const tiers = await tx.select().from(meritTiers).where(eq(meritTiers.school_id, school.id));
    // A direct database edit can leave the stored content_hash unchanged. Reconstruct facts too.
    const comparison = seedFromDatabase(seed, school, tiers);
    if (meritContentHash(comparison) !== meritContentHash(seed)) throw new Error("Stored facts differ from the file. Re-import and review before verifying.");
    await tx.update(meritSchools).set({ status: "verified", verified_at: now, verified_content_hash: school.content_hash, source_checked_at: now.toISOString().slice(0, 10) }).where(eq(meritSchools.id, school.id));
    return seed.slug;
  });
}

function seedFromDatabase(seed: MeritSeed, school: typeof meritSchools.$inferSelect, tiers: Array<typeof meritTiers.$inferSelect>): MeritSeed {
  const publicSchool = Object.fromEntries(Object.entries(school).filter(([key]) => !["id", "content_hash", "verified_content_hash"].includes(key)));
  return validateMeritSeed({
    ...seed, ...publicSchool, status: "draft", verified_at: null,
    tiers: tiers.map(tier => Object.fromEntries(Object.entries(tier).filter(([key]) => !["id", "school_id"].includes(key)))),
  });
}

export async function staleMeritSchools(apply: boolean, now = new Date(), database = db) {
  const cutoff = verificationCutoff(now);
  const condition = and(eq(meritSchools.status, "verified"), lt(meritSchools.verified_at, cutoff));
  return apply
    ? database.update(meritSchools).set({ status: "stale" }).where(condition).returning({ slug: meritSchools.slug })
    : database.select({ slug: meritSchools.slug }).from(meritSchools).where(condition);
}
