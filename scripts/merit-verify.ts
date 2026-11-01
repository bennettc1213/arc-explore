/** HUMAN ONLY. Agents must never execute this file, including to test its refusal path. */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { loadMeritSeed } from "../src/lib/merit-aid/seed-files";
import { meritContentHash, requireExactSlug, requireInteractiveVerification, requireReviewableSeed } from "../src/lib/merit-aid/lifecycle";
import { assertMeritWriteTarget, withMeritDatabase } from "./merit-cli";

async function main() {
  // Refuse unattended use BEFORE reading a file or opening a database.
  requireInteractiveVerification({ stdinTTY: process.stdin.isTTY, stdoutTTY: process.stdout.isTTY, unattended: Boolean(process.env.CI || process.env.GITHUB_ACTIONS) });
  const [slug, ...args] = process.argv.slice(2);
  if (!slug || args.some(arg => arg !== "--allow-production")) throw new Error("Usage: merit:verify <slug> [--allow-production]");
  const seed = await loadMeritSeed(slug);
  requireReviewableSeed(seed);
  const hash = meritContentHash(seed);
  console.log(`Review ${seed.name}: ${seed.official_merit_url}`);
  console.log("Confirm every tier, amount, deadline, source, year, and cost against the official pages yourself.");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try { requireExactSlug(slug, await terminal.question(`Type exactly ${slug} to record your review: `)); }
  finally { terminal.close(); }
  const reread = await loadMeritSeed(slug);
  if (meritContentHash(reread) !== hash) throw new Error("The file changed during review. Nothing was verified.");
  assertMeritWriteTarget(args);
  await withMeritDatabase(async () => {
    const { verifyImportedMeritSeed } = await import("../src/lib/merit-aid/store");
    await verifyImportedMeritSeed(reread);
  });
  console.log(`${slug}: verified by interactive owner confirmation.`);
}
main().catch(error => { console.error(error instanceof Error && !error.message.includes("Failed query") ? error.message : "Verification failed; check the selected database and imported facts."); process.exitCode = 1; });
