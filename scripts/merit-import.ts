import "dotenv/config";
import { loadMeritSeeds } from "../src/lib/merit-aid/seed-files";
import { assertMeritWriteTarget, withMeritDatabase } from "./merit-cli";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--apply", "--allow-production"].includes(arg))) throw new Error("Usage: merit:import [--apply] [--allow-production]");
  const seeds = await loadMeritSeeds();
  if (!args.includes("--apply")) {
    for (const school of seeds) console.log(`Would sync ${school.slug}: ${school.tiers.length} tiers; file status=${school.status}`);
    console.log("Dry run: no database connection or writes. Add --apply to import; imports never grant verification.");
    return;
  }
  assertMeritWriteTarget(args);
  await withMeritDatabase(async () => {
    const { importMeritSeeds } = await import("../src/lib/merit-aid/store");
    for (const school of await importMeritSeeds(seeds)) console.log(`${school.slug}: ${school.changed ? "updated" : "unchanged"}; ${school.tiers} tiers; ${school.status}`);
  });
}
main().catch(() => { console.error("Merit import failed. Check seed validation, the migration, and the explicitly selected database. No partial catalog import is committed."); process.exitCode = 1; });
