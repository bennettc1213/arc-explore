# Merit Aid Finder — Stage 1 handoff

Only data-model and seed-pipeline work is implemented. No matcher, public API,
UI, auth changes, analytics events, scheduled workflows or Pro features yet.
The existing scholarship matcher and ingestion were not changed by this work.

## Database

`src/db/merit-schema.ts` defines exactly two tables, re-exported from the existing
schema: `merit_schools` and `merit_tiers`. Migration `0028_merit_aid.sql` is
handwritten and registered after the independent `0027` migration. The journal
timestamp is deliberately later than the prior entry, not a claim about an
award date. Do not use `db:generate`; it is guarded off in this repository.

Money is numeric(12,2), in dollars. Published GPA cutoffs have three decimal
places of storage precision. Award academic year is separate from COA academic
year; a missing source year stays null. `award_periods_per_year` only records an
explicit payment schedule and cannot annualize a total award. A later matcher
must not subtract a four-year total from annual COA or compare mixed-year costs.

Approved structured conditions represent all/any alternatives, published GPA
and ACT/SAT bounds, state restrictions and explicit manual-review criteria.
They are inert JSON, never executable expressions. When present they preserve
the complete condition; the flat minimum fields alone are insufficient. Do not
implement SAT/ACT conversions or turn an institution-calculated GPA into a
known GPA match. Unsupported index formulas and unmeasured requirements remain
manual review, rather than invented independent GPA/test thresholds.

RLS is enabled on both tables, with no public policies and explicit revocation
for PUBLIC/anon/authenticated. Public information is eventually served through
server queries filtering verified/current schools; raw drafts remain private.
Triggers invalidate approval on material school/tier changes, including direct
database edits. No existing table, policy, matcher or ingest rule is altered.

The migration is **not applied**. Follow the existing reviewed staging-first
workflow: choose the intended staging DATABASE_URL, inspect the pending journal
(including any other in-progress migrations), and run `npm run db:migrate`.
Do not apply the entire pending journal to production just to test this feature.

## Commands

- `npm run merit:validate`: validate all files; no DB connection, writes or verification.
- `npm run merit:import`: dry-run validation and plan; no DB connection.
- `npm run merit:import -- --apply`: atomically synchronize validated public seeds
  to the selected local/known-staging DB. Other remote targets additionally
  require `--allow-production`. `MERIT_DATABASE_URL` can select a target without
  editing the app's `.env`; otherwise DATABASE_URL is used.
- `npm run merit:stale`: read-only report of verified schools older than twelve
  calendar months. `--apply` marks them stale; other remote write targets also
  require `--allow-production`. Exactly twelve months old is not yet stale.
- `npm run merit:verify -- <slug>`: **OWNER ONLY. AGENTS MUST NEVER RUN THIS
  COMMAND, INCLUDING TO TEST REFUSAL.** The owner must compare every fact with
  the school's official pages, resolve `review_issues`, supply the sourced award
  year, import the exact file, and type the exact slug in an interactive terminal.
  Nonlocal/non-staging targets also require `--allow-production`.

Unknown CLI arguments fail. Neither `--yes` nor piped slug confirmation is
supported. CI/non-TTY environments fail before file reading or DB access.
Only this human CLI invokes the verification operation in normal application
code; validation/import/staleness never promote drafts. Tests exercise the
refusal helper, never the verification script.

Imports upsert stable `(school_id, seed_key)` identities and remove only obsolete
tiers within explicitly imported schools. They do not delete schools absent
from the directory. Unchanged imports preserve existing approval, staleness or
retirement. Changed facts invalidate approval; import cannot grant verification.
Approval covers a canonical SHA-256 digest. Changes to source-check dates alone
do not change that digest; material facts, conditions, review issues, sources,
amounts and scope notes do. Verification compares the file to actual stored
school/tier facts, not just the stored hash. Per-school transaction locks protect
import/verification races. Import is one transaction across the validated batch.

Seed files intentionally stay draft after an owner verifies the database record;
they cannot assert `status=verified` or carry a verification timestamp. This keeps
an edited/public JSON file from bypassing the human-only approval path.

## Scheduling proposal — no workflow changed

After approval, add a small daily `merit-stale` GitHub Actions workflow using the
repository's Node 24 setup and installation pattern, `workflow_dispatch`, a
dedicated concurrency group, the DATABASE_URL secret, and:

```sh
npm run merit:stale -- --apply --allow-production
```

This job only expires existing approvals. It must never invoke verification or
fetch scholarship pages. The future query/matcher must also enforce the
twelve-month cutoff at read time, so a delayed job cannot expose stale results.

## Research and privacy

See `data/merit-aid/RESEARCH.md` for the seven drafts, three policy holds, scope
limits, unknown costs, official calculator referrals and outstanding decisions.
There are no verified schools yet. No student input collection exists in Stage 1.
The planned on-page wording for Stage 3 is:

> We use your GPA and test scores to calculate these results. We don't save or log
> your exact scores. We record anonymous usage statistics using rounded score bands.

That wording is a Stage 3 requirement, not a claim that analytics or a form has
already been built. No dependencies were added. No commit or deployment is part
of this stage.
