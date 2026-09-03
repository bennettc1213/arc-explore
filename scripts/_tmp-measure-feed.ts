import "dotenv/config";
import { closeDb } from "../src/db/client";
import { getFeed, type FeedItem } from "../src/lib/feed";
import { trimWithReservation, reservationFor, FREE_DAILY_RESULTS } from "../src/lib/feed-trim";
import { rankingScore, NEUTRAL_PRIOR, type ScoreProfile } from "../src/lib/score/fit";
import { rankingTiming } from "../src/lib/score/timing";
import { jitter, resolution } from "../src/lib/score/evidence";
import { dayIndex, rotationRank } from "../src/lib/score/rotation";

const EMPTY: ScoreProfile = {};
const FILLED: ScoreProfile = {
  major: "computer science", gradYear: 2027, workAuth: "us_citizen",
  targetLocations: ["New York, NY", "Boston, MA"], targetVerticals: ["software", "data_ai"],
  openToRemote: true, skills: ["python","javascript","react","sql","typescript","aws","docker","git"],
};

const resFor = (items: FeedItem[]) => ({
  fit: resolution(items.map((i) => ({ raw: i.fit.score, shrunk: rankingScore(i.fit) }))),
  timing: resolution(items.map((i) => ({ raw: i.timing.score, shrunk: rankingTiming(i.timing) }))),
});

function makeRank(timingPoints: number, day: number, res: { fit: number; timing: number }) {
  const key = (i: FeedItem) => {
    const fit = rankingScore(i.fit);
    if (fit < 0) return fit;
    const authority = res.fit / 4 + timingPoints;
    const bonus = authority === 0 ? 0 : (authority * (rankingTiming(i.timing) - NEUTRAL_PRIOR)) / NEUTRAL_PRIOR;
    return fit + bonus + jitter(rotationRank(i.id, day), res.fit / 2);
  };
  return (a: FeedItem, b: FeedItem): number => {
    if (a.fit.blocked !== b.fit.blocked) return a.fit.blocked ? 1 : -1;
    const ak = key(a), bk = key(b);
    if (bk !== ak) return bk - ak;
    const t = b.timing.score - a.timing.score;
    if (t) return t;
    return rotationRank(a.id, day) - rotationRank(b.id, day);
  };
}

async function report(label: string, profile: ScoreProfile, timingPoints: number) {
  const all = await getFeed(profile, { limit: 100000, timingPoints });
  const today = dayIndex();
  const res = resFor(all.items);
  const mine = [...all.items].sort(makeRank(timingPoints, today, res));
  const ok = mine.slice(0, 300).every((it, n) => it.id === all.items[n].id);
  console.log(`\n=== ${label} — ${all.total} rows | resolution fit ${res.fit.toFixed(1)} timing ${res.timing.toFixed(1)}`);
  console.log(`    re-impl reproduces getFeed top300: ${ok ? "YES" : "NO — INVALID"}`);
  if (!ok) return;

  // BOUND CHECK: two rows may swap only if their true keys were within one resolution.
  const trueKey = (i: FeedItem) => rankingScore(i.fit);
  let violations = 0, worst = 0;
  const sorted = mine;
  for (let i = 0; i < Math.min(sorted.length, 2000) - 1; i++) {
    const a = trueKey(sorted[i]), b = trueKey(sorted[i + 1]);
    if (a < 0 || b < 0) continue;
    if (b > a) { const gap = b - a; worst = Math.max(worst, gap);
      if (gap > res.fit + 2 * timingPoints + 1e-6) violations++; }
  }
  console.log(`    order-bound violations: ${violations}${violations ? " <-- BUG" : ""}  (largest inversion gap ${worst.toFixed(1)}, allowed ${(res.fit + 2 * timingPoints).toFixed(1)})`);

  const headFor = (day: number, limit: number) =>
    trimWithReservation([...all.items].sort(makeRank(timingPoints, day, res)), limit, reservationFor(limit)).map((i) => i.id);
  for (const limit of [FREE_DAILY_RESULTS, 20, 50]) {
    const base = new Set(headFor(today, limit));
    console.log(`    window ${String(limit).padStart(2)} unchanged:  ` +
      [1, 2, 7, 30].map((d) => `+${d}d ${headFor(today + d, limit).filter((id) => base.has(id)).length}/${limit}`).join("   "));
  }
  for (const limit of [FREE_DAILY_RESULTS, 50]) {
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) for (const id of headFor(today + d, limit)) seen.add(id);
    console.log(`    window ${String(limit).padStart(2)}: ${seen.size} distinct rows over 30 days`);
  }
  const head = trimWithReservation([...all.items].sort(makeRank(timingPoints, today, res)), 20, reservationFor(20));
  const fits = head.map((i) => i.fit.score ?? -1);
  console.log(`    top20 fit: mean ${(fits.reduce((a, b) => a + b, 0) / fits.length).toFixed(1)} min ${Math.min(...fits)}`);
  const s = head.filter((i) => i.kind === "scholarship").length;
  const dl = head.filter((i) => i.deadlineAt).length;
  console.log(`    top20 mix: ${s} scholarships / ${head.length - s} internships; ${dl} carry a real deadline`);
  return head.map((i) => i.id);
}

async function main() {
  await report("SIGNED OUT (free)", EMPTY, 0);
  const f = await report("FILLED CS PROFILE (free)", FILLED, 0);
  const p = await report("FILLED CS PROFILE (paid, 20pts)", FILLED, 20);
  if (f && p) console.log(`\npaid vs free top20 overlap: ${p.filter((id) => f.includes(id)).length}/20 (identical order: ${f.every((id, n) => id === p[n])})`);
}
main().then(closeDb).catch(async (e) => { console.error(e); await closeDb().catch(() => {}); process.exit(1); });
