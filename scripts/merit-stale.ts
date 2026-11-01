import "dotenv/config";
import { assertMeritWriteTarget, withMeritDatabase } from "./merit-cli";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--apply", "--allow-production"].includes(arg))) throw new Error("Usage: merit:stale [--apply] [--allow-production]");
  const apply = args.includes("--apply");
  if (apply) assertMeritWriteTarget(args);
  else if (process.env.MERIT_DATABASE_URL) process.env.DATABASE_URL = process.env.MERIT_DATABASE_URL;
  await withMeritDatabase(async () => {
    const { staleMeritSchools } = await import("../src/lib/merit-aid/store");
    const schools = await staleMeritSchools(apply);
    console.log(`${apply ? "Marked stale" : "Would mark stale"}: ${schools.length} schools older than 12 calendar months.`);
    for (const school of schools) console.log(school.slug);
  });
}
main().catch(() => { console.error("Stale check failed. Check the merit migration and selected database."); process.exitCode = 1; });
