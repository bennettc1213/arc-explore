/** Add public-API employer hints to the existing discovery table, not the feed. */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { db, closeDb } from "../src/db/client";
import { sources, discoveryCandidates } from "../src/db/schema";
import { describeError } from "../src/lib/ingest/errors";
import { fetchDiscoveryFeed, discoveryFeedConfig, type DiscoveryFeed } from "../src/lib/ingest/sources/discovery-feeds";

const flag = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
async function main() {
  const provider = flag("source") as DiscoveryFeed;
  if (!["arbeitnow", "arbeitnow-uk", "remoteok", "themuse"].includes(provider)) throw new Error("Choose --source arbeitnow|arbeitnow-uk|remoteok|themuse");
  const apply = process.argv.includes("--apply");
  if (apply && provider === "themuse" && !process.env.THEMUSE_API_KEY) throw new Error("Muse connection is test-only until the owner registers an app and supplies THEMUSE_API_KEY");
  const result = await fetchDiscoveryFeed(provider, { maxPages: Number(flag("pages") ?? (provider === "themuse" ? 1 : 2)), museKey: process.env.THEMUSE_API_KEY });
  if (apply) {
    const config = discoveryFeedConfig(provider);
    const now = new Date();
    await db.transaction(async tx => {
      const [source] = await tx.insert(sources).values({
        key: `manual-api:${provider}`, provider, authority: "discovery_only", state: "paused", opportunityKind: "internship",
        publicPageUrl: config.origin, pollTier: "B", pollIntervalSec: 315360000, rawStorage: "none",
        termsReviewStatus: "restricted", termsReviewedAt: now, termsReviewNote: result.attribution,
        robotsReviewStatus: "approved", robotsReviewedAt: now,
        adapterConfig: { manualOnly: true, apiPath: config.path, noFeedPublication: true },
      }).onConflictDoUpdate({ target: sources.key, set: { updatedAt: now, termsReviewNote: result.attribution } }).returning({ id: sources.id });
      for (const hint of result.employers) await tx.insert(discoveryCandidates).values({ sourceId: source.id, origin: "manual", candidateKey: hint.key,
        organizationName: hint.company, note: `Employer hint only; observed at ${hint.sourceUrl}. ${result.attribution}`,
      }).onConflictDoUpdate({ target: [discoveryCandidates.sourceId, discoveryCandidates.candidateKey], set: { lastSeenAt: now } });
    });
  }
  const summary = { ...result, mode: apply ? "employer hints only; no published jobs" : "connection test" };
  if (flag("report")) { await mkdir(dirname(flag("report")!), { recursive: true }); await writeFile(flag("report")!, JSON.stringify(summary, null, 2)); }
  console.log(JSON.stringify({ ...summary, employers: result.employers.length }));
}
main().catch(e => { console.error(describeError(e)); process.exitCode = 1; }).finally(() => closeDb());
