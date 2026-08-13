/**
 * Re-run the derived-field detectors over descriptions we already hold.
 *
 * `work_auth` and `term` are computed once, when a posting's description first
 * lands. So improving a detector changes nothing for the existing corpus — the
 * postings that motivated the improvement keep their old answer forever, and
 * the fix looks like it did not work.
 *
 * This is the pass that closes that gap. It reads only stored text and makes no
 * network calls, so it is cheap and safe to re-run after any change to
 * `detectWorkAuth` / `detectTerm`.
 *
 *   npm run ingest:rederive [-- --apply]
 *
 * Defaults to a dry run: a detector change is exactly the kind of thing worth
 * previewing before it rewrites a field the feed blocks people on.
 */

import "dotenv/config";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { closeDb, db } from "../src/db/client";
import { postings } from "../src/db/schema";
import { detectTerm, detectWorkAuth } from "../src/lib/ingest/normalize";
import { extractSkills } from "../src/lib/score/skills";

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({
      id: postings.id,
      title: postings.title,
      descriptionText: postings.descriptionText,
      workAuth: postings.workAuth,
      term: postings.term,
      skills: postings.skills,
    })
    .from(postings)
    .where(and(isNotNull(postings.descriptionText), isNull(postings.closedAt)));

  let authAdded = 0;
  let authChanged = 0;
  let authCleared = 0;
  let termAdded = 0;
  let skillsChanged = 0;
  const changes: Array<{
    id: string;
    workAuth?: string | null;
    term?: string | null;
    skills?: string[];
  }> = [];
  const samples: string[] = [];

  for (const r of rows) {
    const nextAuth = detectWorkAuth(r.descriptionText, r.title);
    const nextTerm = detectTerm(r.title, r.descriptionText ?? undefined);

    const nextSkills = extractSkills(r.title, r.descriptionText);

    const patch: { workAuth?: string | null; term?: string | null; skills?: string[] } = {};

    // Skills are a pure function of the posting text, so unlike work_auth
    // there is no judgement to preserve — the new answer is always the better
    // one, including when it is shorter.
    if (nextSkills.join("|") !== r.skills.join("|")) {
      skillsChanged++;
      patch.skills = nextSkills;
    }

    if (nextAuth !== r.workAuth) {
      // A detector that stops recognising something it used to is a
      // regression, not an improvement — surface it rather than applying it.
      if (r.workAuth !== null && nextAuth === null) {
        authCleared++;
      } else {
        if (r.workAuth === null) authAdded++;
        else authChanged++;
        patch.workAuth = nextAuth;
        if (samples.length < 8) samples.push(`  ${nextAuth}  ${r.title.slice(0, 64)}`);
      }
    }

    // Term is only ever filled in, never overwritten: the poll path already
    // owns the authoritative value and this pass has no fresher information.
    if (r.term === null && nextTerm !== null) {
      termAdded++;
      patch.term = nextTerm;
    }

    if (Object.keys(patch).length > 0) changes.push({ id: r.id, ...patch });
  }

  console.log(`scanned            : ${rows.length} open postings with stored text`);
  console.log(`work_auth added    : ${authAdded}`);
  console.log(`work_auth changed  : ${authChanged}`);
  console.log(`work_auth would be cleared (NOT applied): ${authCleared}`);
  console.log(`term added         : ${termAdded}`);
  console.log(`skills recomputed  : ${skillsChanged}`);
  if (samples.length > 0) {
    console.log(`\nsample of new detections:`);
    for (const s of samples) console.log(s);
  }

  if (!APPLY) {
    console.log(`\ndry run — ${changes.length} rows would change. re-run with --apply`);
    return;
  }

  for (const c of changes) {
    const { id, ...set } = c;
    await db.update(postings).set(set).where(eq(postings.id, id));
  }
  console.log(`\napplied to ${changes.length} rows`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
