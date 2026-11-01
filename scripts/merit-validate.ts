import { loadMeritSeeds } from "../src/lib/merit-aid/seed-files";

async function main() {
  const seeds = await loadMeritSeeds();
  const tiers = seeds.reduce((count, school) => count + school.tiers.length, 0);
  console.log(`Valid: ${seeds.length} public school drafts, ${tiers} sourced tiers. Validation does not verify or import anything.`);
  for (const seed of seeds) console.log(`${seed.slug}: ${seed.status}; ${seed.tiers.length} tiers; ${seed.review_issues.length} review issues`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Seed validation failed"); process.exitCode = 1; });
