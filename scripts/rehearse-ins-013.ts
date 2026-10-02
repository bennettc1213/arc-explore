/**
 * INS-013 state-machine rehearsal (staging only).
 *
 * The acceptance criteria for INS-013 are claims about the database, not about
 * functions: "replaying the same poll changes nothing", "a partial read cannot
 * close a listing", "first-seen survives an ordinary update". None of those can
 * be established by the unit suite, because the unit suite tests the pure
 * planner and never touches a row. A decision that nothing writes to is a
 * decision that never happened — and that failure mode is invisible to every
 * test in the repo.
 *
 * This script writes to a scratch organization it creates and deletes
 * afterwards, and refuses to run against anything but a database whose project
 * ref is the known staging ref. There is no path by which this touches
 * production: the guard is a hard exit, not a warning.
 *
 *   npx tsx scripts/rehearse-ins-013.ts
 */

import "dotenv/config";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import postgres from "postgres";

import { db } from "../src/db/client";
import {
  ingestRuns,
  organizations,
  pollRunMarks,
  postingLifecycleEvents,
  postings,
  sources,
} from "../src/db/schema";
import { persistPoll } from "../src/lib/ingest/persist";
import { startRun } from "../src/lib/ingest/runs";
import type { SourcePosting } from "../src/lib/ingest/types";

/** The one project ref this script may touch. */
const STAGING_PROJECT_REF = "dgkjfmohtphrmispucwf";
const SCRATCH_SLUG = "ins013-rehearsal";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`          expected: ${JSON.stringify(expected)}`);
    console.log(`          actual:   ${JSON.stringify(actual)}`);
  }
}

function ok(label: string, condition: boolean, note = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`);
}

/**
 * A scratch posting.
 *
 * `title` is part of the canonical dedup key, so two fixtures differing only in
 * `sourceId` are the *same* role and legitimately collapse into one posting —
 * which is correct behaviour, and the first version of this script tripped over
 * it. Distinct roles here means distinct titles.
 */
function posting(sourceId: string, title: string, overrides: Partial<SourcePosting> = {}): SourcePosting {
  return {
    source: "greenhouse",
    sourceId,
    companyName: "INS-013 Rehearsal Co",
    title,
    url: `https://boards.greenhouse.io/ins013rehearsal/jobs/${sourceId}`,
    locations: ["Austin, TX"],
    isRemote: false,
    postedAt: new Date("2026-01-05T00:00:00Z"),
    deadlineAt: null,
    descriptionText: "Build things. Intern for Summer 2026.",
    employmentHint: "Internship",
    raw: { id: sourceId, title },
    ...overrides,
  };
}

const A = (o?: Partial<SourcePosting>) => posting("a", "Software Engineer Intern", o);
const B = (o?: Partial<SourcePosting>) => posting("b", "Data Analyst Intern", o);
const C = (o?: Partial<SourcePosting>) => posting("c", "Product Design Intern", o);
const D = (o?: Partial<SourcePosting>) => posting("d", "Security Engineer Intern", o);

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(STAGING_PROJECT_REF)) {
    console.error(
      "REFUSING TO RUN.\n" +
        "This script writes rows and deletes them afterwards, and it is only\n" +
        "approved against staging. The DATABASE_URL in this shell does not\n" +
        `point at the staging project (${STAGING_PROJECT_REF}).\n` +
        "Point DATABASE_URL at staging and try again.",
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const orgId = crypto.randomUUID();
  const tag = `ins013-rehearsal-${Date.now()}`;
  const runIds: string[] = [];
  let sourceRow: { id: string } | undefined;

  try {
    // ---- scratch fixture -------------------------------------------------
    await db.insert(organizations).values({
      id: orgId,
      name: "INS-013 Rehearsal Co",
      normalizedName: tag,
      atsType: "greenhouse",
      atsSlug: SCRATCH_SLUG,
      discoveredVia: "ins013-rehearsal",
    });

    // A registered source of truth, so the publication gate has real facts
    // rather than the unresolved fallback.
    [sourceRow] = await db
      .insert(sources)
      .values({
        key: `greenhouse:${SCRATCH_SLUG}:${tag}`,
        provider: "greenhouse",
        authority: "source_of_truth",
        state: "active",
        orgId,
        termsReviewStatus: "approved",
        robotsReviewStatus: "approved",
      })
      .returning({ id: sources.id });

    // Every run this script opens is tracked so teardown can remove it.
    const openRun = async () => {
      const id = await startRun("A", "rehearsal");
      runIds.push(id);
      return id;
    };

    console.log(`\nfixture: org=${orgId} source=${sourceRow.id}\n`);

    // =====================================================================
    console.log("1. a first poll inserts and stamps provenance");
    // =====================================================================
    const run1 = await openRun();
    const first = await persistPoll(orgId, [A(), B(), C()], 3, null, { runId: run1 });

    check("inserted all three roles", first.inserted, 3);
    check("nothing closed on a first poll", first.closed, 0);

    const [afterFirst] = await db
      .select({
        firstSeenAt: postings.firstSeenAt,
        publicationState: postings.publicationState,
        confirmedAt: postings.confirmedAt,
        lastSeenAt: postings.lastSeenAt,
      })
      .from(postings)
      .where(eq(postings.orgId, orgId))
      .limit(1);

    check(
      "publication state is verified from a witnessed source of truth",
      afterFirst.publicationState,
      "verified",
    );
    ok("confirmed_at is stamped", afterFirst.confirmedAt !== null);
    const originalFirstSeen = afterFirst.firstSeenAt;
    ok("first_seen_at is set", originalFirstSeen !== null);

    // =====================================================================
    console.log("\n2. replaying the same poll is a no-op");
    // =====================================================================
    // This is the acceptance criterion. The same runId carrying the same rows
    // must not re-apply absence, advance a strike, or write a second event.
    const replay = await persistPoll(orgId, [A(), B(), C()], 3, null, { runId: run1 });

    ok("the replay is reported as a replay", replay.replayed === true);
    check("the replay returns the original outcome, not a zeroed one", replay.inserted, first.inserted);
    check("and it closed nothing", replay.closed, 0);

    const [afterReplay] = await db
      .select({ missingStrikes: postings.missingStrikes, firstSeenAt: postings.firstSeenAt })
      .from(postings)
      .where(eq(postings.orgId, orgId))
      .limit(1);

    check("a replay leaves missing_strikes alone", afterReplay.missingStrikes, 0);
    check("a replay leaves first_seen_at alone", afterReplay.firstSeenAt, originalFirstSeen);

    const marks = await db
      .select({ runId: pollRunMarks.runId })
      .from(pollRunMarks)
      .where(eq(pollRunMarks.orgId, orgId));
    check("exactly one mark for the run", marks.length, 1);

    const run1Events = await db
      .select({ event: postingLifecycleEvents.event })
      .from(postingLifecycleEvents)
      .where(eq(postingLifecycleEvents.runId, run1));
    check(
      "one first_seen event per role, not one per attempt",
      run1Events.filter((e) => e.event === "first_seen").length,
      3,
    );

    // =====================================================================
    console.log("\n3. an ordinary update preserves first_seen_at");
    // =====================================================================
    // A description refresh is the ordinary case: content changes, identity does
    // not. Requirement 6 says first-seen survives exactly this.
    //
    // The refreshed text keeps the "Summer 2026" sentence deliberately: the
    // canonical key folds in the parsed term, so a description that silently
    // drops the term parses as a *different* opportunity and arrives as an
    // insert. That is pre-existing and arguably correct behaviour, but it means
    // this test has to vary the text without varying the term to isolate what it
    // is actually testing.
    const run2 = await openRun();
    const update = await persistPoll(
      orgId,
      [
        A(),
        B({
          descriptionText:
            "Intern for Summer 2026. Now with a much longer and more detailed job description.",
        }),
        C(),
      ],
      3,
      null,
      { runId: run2 },
    );

    ok("the run counted a real change", update.updated >= 1, `updated=${update.updated}`);
    ok("and a confirmed-unchanged role", update.unchanged >= 1, `unchanged=${update.unchanged}`);
    check("and inserted nothing", update.inserted, 0);

    const [afterUpdate] = await db
      .select({ firstSeenAt: postings.firstSeenAt, lastSeenAt: postings.lastSeenAt })
      .from(postings)
      .where(eq(postings.orgId, orgId))
      .limit(1);

    check(
      "first_seen_at survives an ordinary update",
      afterUpdate.firstSeenAt?.toISOString(),
      originalFirstSeen?.toISOString(),
    );
    ok(
      "last_seen_at advanced",
      afterUpdate.lastSeenAt !== null && afterUpdate.lastSeenAt >= originalFirstSeen!,
    );

    // =====================================================================
    console.log("\n4. two genuine misses close a listing");
    // =====================================================================
    // The control: proving the rule still fires is what makes the replay guard
    // in section 2 meaningful rather than a system that never closes anything.
    const run3 = await openRun();
    const miss1 = await persistPoll(orgId, [A(), C()], 2, null, { runId: run3 });
    check("the first miss does not close", miss1.closed, 0);
    check("the first miss records missing_1", miss1.missing1, 1);

    const run4 = await openRun();
    const miss2 = await persistPoll(orgId, [A(), C()], 2, null, { runId: run4 });
    check("the second miss closes", miss2.closed, 1);

    const [closedRow] = await db
      .select({ closedAt: postings.closedAt, missingStrikes: postings.missingStrikes })
      .from(postings)
      .where(and(eq(postings.orgId, orgId), isNotNull(postings.closedAt)));
    ok("closed_at is set on the absent role", closedRow !== undefined);
    check("strikes are cleared once closed", closedRow.missingStrikes, 0);

    // =====================================================================
    console.log("\n5. a partial read cannot close anything");
    // =====================================================================
    // The bug this whole ticket exists to prevent: a truncated read treated as a
    // complete one closes every listing on the board.
    const run5 = await openRun();
    // Same rows as the last complete poll, but the adapter only got through part
    // of the board — so an absent role must not advance.
    const partial = await persistPoll(orgId, [A()], 1, null, {
      runId: run5,
      successfulComplete: false,
    });

    check("a partial read closes nothing", partial.closed, 0);
    check("and records no missing strike", partial.missing1, 0);
    ok("and says why the close was suppressed", partial.closeSuppressed === true);
    check("naming the cause", partial.closeSuppressedReason, "poll_incomplete");

    const [stillOpen] = await db
      .select({ missingStrikes: postings.missingStrikes, closedAt: postings.closedAt })
      .from(postings)
      .where(and(eq(postings.orgId, orgId), isNull(postings.closedAt)));
    check("a present role gains no strike from a partial read", stillOpen.missingStrikes, 0);
    ok("and is not closed", stillOpen.closedAt === null);

    // =====================================================================
    console.log("\n6. an empty board is treated as suspicious, not as a closure");
    // =====================================================================
    const run6 = await openRun();
    const empty = await persistPoll(orgId, [], 0, null, { runId: run6 });

    check("an empty board closes nothing", empty.closed, 0);
    check("because the empty-scrape guard fired", empty.closeSuppressedReason, "empty_scrape");

    // =====================================================================
    console.log("\n7. a partial read still persists the rows it fetched");
    // =====================================================================
    // Incompleteness must suppress closing, not ingestion. Throwing away a
    // SmartRecruiters sweep's rows because the last query hit a cap costs
    // freshness for no benefit.
    const run7 = await openRun();
    const partialFresh = await persistPoll(orgId, [A(), D()], 2, null, {
      runId: run7,
      successfulComplete: false,
    });
    check("a role read only on a partial poll was still stored", partialFresh.inserted, 1);

    const stored = await db
      .select({ title: postings.title, publicationState: postings.publicationState })
      .from(postings)
      .where(and(eq(postings.orgId, orgId), eq(postings.title, "Security Engineer Intern")));
    check("and it is queryable afterwards", stored.length, 1);
    check(
      // Deliberate, and the more interesting claim than the one I first wrote:
      // a row seen only on an incomplete read is NOT verified. We do not know it
      // is still listed — that is the whole meaning of a partial read — so it
      // waits for a complete read before anything may publish it. Storing it as
      // verified would make the next partial poll able to close it as though
      // absence were established.
      "but it is unverified until a complete read confirms it",
      stored[0].publicationState,
      "unverified",
    );

    // =====================================================================
    console.log("\n8. the source's last complete poll is not advanced by a partial read");
    // =====================================================================
    // The earlier polls in this script were complete, so this timestamp is
    // already set. The claim to test is that a *partial* read leaves it alone,
    // which is what makes "we hold everything this source published"
    // answerable.
    const [beforePartial2] = await db
      .select({ lastCompletePollAt: sources.lastCompletePollAt })
      .from(sources)
      .where(eq(sources.id, sourceRow.id));
    ok("a complete poll has advanced it", beforePartial2.lastCompletePollAt !== null);

    const run8 = await openRun();
    await persistPoll(orgId, [A(), D()], 2, null, {
      runId: run8,
      successfulComplete: false,
    });

    const [afterPartial2] = await db
      .select({ lastCompletePollAt: sources.lastCompletePollAt })
      .from(sources)
      .where(eq(sources.id, sourceRow.id));
    check(
      "a partial read does not advance it",
      afterPartial2.lastCompletePollAt?.toISOString(),
      beforePartial2.lastCompletePollAt?.toISOString(),
    );

    // A complete poll must advance it.
    const run9 = await openRun();
    await persistPoll(orgId, [A(), D()], 2, null, {
      runId: run9,
    });
    const [sourceComplete] = await db
      .select({ lastCompletePollAt: sources.lastCompletePollAt })
      .from(sources)
      .where(eq(sources.id, sourceRow.id));
    ok(
      "a complete poll does advance it",
      sourceComplete.lastCompletePollAt! > beforePartial2.lastCompletePollAt!,
    );

    // =====================================================================
    console.log("\n9. a complete read promotes the row the partial read left unverified");
    // =====================================================================
    const promoted = await db
      .select({ publicationState: postings.publicationState })
      .from(postings)
      .where(and(eq(postings.orgId, orgId), eq(postings.title, "Security Engineer Intern")));
    check(
      "the complete read is what earns it verified",
      promoted[0].publicationState,
      "verified",
    );

    // =====================================================================
    console.log("\n10. the run status is recorded");
    // =====================================================================
    const [runRow] = await db
      .select({ status: ingestRuns.status })
      .from(ingestRuns)
      .where(eq(ingestRuns.id, run9));
    check("startRun defaults to a known status", runRow.status, "successful_complete");
  } finally {
    // ---- teardown --------------------------------------------------------
    // Ordered by the foreign keys: lifecycle events and posting_sources cascade
    // from postings, poll marks cascade from the org, and the source and run
    // rows go last because postings point at them.
    await db.delete(postings).where(eq(postings.orgId, orgId));
    await db
      .delete(postingLifecycleEvents)
      .where(and(eq(postingLifecycleEvents.sourceId, sourceRow!.id)));
    await db.delete(pollRunMarks).where(eq(pollRunMarks.orgId, orgId));
    if (sourceRow) await db.delete(sources).where(eq(sources.id, sourceRow.id));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    for (const id of runIds) await db.delete(ingestRuns).where(eq(ingestRuns.id, id));
    await sql.end();
  }

  console.log(
    failures === 0
      ? "\nINS-013 rehearsal: all checks passed\n"
      : `\nINS-013 rehearsal: ${failures} check(s) FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});