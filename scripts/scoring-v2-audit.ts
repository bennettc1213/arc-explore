/** Read-only comparison. No profile writes, analytics, messages, or migrations. */
import "dotenv/config";
import { getFeed } from "../src/lib/feed";
import type { ScoreProfile } from "../src/lib/score/fit";

const profiles: Array<{ label: string; value: ScoreProfile }> = [
  { label: "anonymous", value: {} },
  { label: "synthetic-cs-student", value: { major: "Computer Science", gradYear: 2027, workAuth: "us_citizen", targetLocations: ["New York"], openToRemote: true, skills: ["Python", "SQL", "JavaScript"], experienceSkills: ["Python", "SQL"] } },
];

async function main() {
  const original = process.env.INSTELA_SCORING_VERSION;
  try {
    for (const profile of profiles) {
      process.env.INSTELA_SCORING_VERSION = "legacy";
      const old = await getFeed(profile.value, { limit: 20, reservePerKind: 5 });
      process.env.INSTELA_SCORING_VERSION = "v2";
      const current = await getFeed(profile.value, { limit: 20, reservePerKind: 5 });
      const oldIds = new Set(old.items.map(item => item.id));
      const invalid = current.items.filter(item => item.fit.blocked && item.fit.score !== null || !item.fit.assessment?.hasProfile && item.fit.score !== null);
      if (invalid.length) throw new Error("Scoring invariant failed in the live-data comparison");
      console.log(JSON.stringify({ profile: profile.label, matched: current.total, top20Overlap: current.items.filter(item => oldIds.has(item.id)).length,
        oldNumeric: old.items.filter(item => item.fit.score !== null).length,
        newNumeric: current.items.filter(item => item.fit.score !== null).length,
        newTop: current.items.slice(0, 5).map(item => ({ title: item.title, fit: item.fit.score, eligibility: item.fit.assessment?.eligibility.state, coverage: item.fit.assessment?.confidence.coverage })),
      }, null, 2));
    }
  } finally {
    if (original === undefined) delete process.env.INSTELA_SCORING_VERSION;
    else process.env.INSTELA_SCORING_VERSION = original;
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : "Scoring audit failed"); process.exit(1); });
