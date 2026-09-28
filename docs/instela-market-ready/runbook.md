# Instela Market-Ready Operations Runbook

**Purpose:** Safe, repeatable procedures for migrations, backfills, dry-runs, rollbacks, staging seeds, and evidence capture while executing the market-ready plan.  
**Applies to:** `INS-003` and every later `INS-###` prompt that touches data or deploys a feature.

---

## 1. Before any data change

1. Run the current baseline:
   ```bash
   npm run baseline:audit
   ```
2. Capture the output artifact under `docs/instela-market-ready/baselines/`.
3. Run the full validation suite:
   ```bash
   npm run check
   ```
4. Confirm the branch is clean except for the planned change.

---

## 2. Database migrations

### Generate a migration

```bash
npm run db:generate
```

Review the generated SQL in `src/db/migrations/` before applying.

### Apply migrations locally

```bash
npm run db:migrate
```

### Production migration rule

- Take a database backup first.
- Run migrations during a low-traffic window.
- Apply them in the order they were generated.
- Never skip a migration.

---

## 3. Backfill dry-run

Every backfill script must support a dry-run mode. When writing a backfill, accept a `--dry-run` flag or `DRY_RUN=1` environment variable and print the affected row counts without writing.

Example pattern for a new backfill script:

```bash
# Dry run
DRY_RUN=1 tsx scripts/backfill-example.ts

# Live run
tsx scripts/backfill-example.ts
```

Before a live backfill:

1. Run dry-run and inspect the counts.
2. Run `npm run baseline:audit` and note the current numbers.
3. Run the live backfill.
4. Re-run `npm run baseline:audit` and verify the numbers moved as expected.

---

## 4. Rollback

### Schema rollback

If a migration caused a problem:

1. Identify the migration file in `src/db/migrations/`.
2. Restore from the pre-migration backup, or run the generated down migration if one exists and has been tested.
3. Re-run `npm run baseline:audit` and compare.
4. Document the rollback in the relevant gate document.

### Feature rollback

For features guarded by `marketReadyFlags`:

1. Remove or unset the environment variable that enabled the feature.
2. Redeploy the previous build if the feature code is also being removed.
3. Re-run smoke tests and the baseline audit.

### Code rollback

1. Revert to the last known-good commit.
2. Deploy the reverted build.
3. Verify with `npm run check` and `npm run baseline:audit`.

---

## 5. Staging seed

For phase-gate validation, use the fixture library to create representative staging data without copying production rows:

```ts
import {
  completeProfile,
  marketingAwardPosting,
  pastTermPosting,
  // ...
} from '@/lib/market-ready/fixtures';
```

If you do seed from production, run the data through the redaction helpers first:

```ts
import { redactSourcePayload, redactProfileFixture } from '@/lib/market-ready/redact';
```

Never commit raw source payloads, profile rows, or application notes without redaction.

---

## 6. Evidence capture

Each gate document must include:

1. The baseline artifact generated before the phase work.
2. The post-work baseline artifact.
3. The `npm run check` result.
4. The commands run.
5. Any failures and how they were resolved.
6. Rollback instructions specific to the phase.

Store artifacts under `docs/instela-market-ready/gates/` and `docs/instela-market-ready/baselines/`.

---

## 7. Feature rollout switches

Use `src/lib/market-ready/flags.ts` to stage new work:

```ts
import { marketReadyFlags } from '@/lib/market-ready/flags';

if (marketReadyFlags.billing()) {
  // new checkout path
}
```

Default behavior is OFF. Set environment variables only after the corresponding gate passes:

```bash
MARKET_READY_BILLING=true
MARKET_READY_RANKER=true
MARKET_READY_SOURCE_ACADEMICWORKS=true
MARKET_READY_NOTIFICATIONS_INSTANT=true
MARKET_READY_OPENING_SOON=true
```

These flags are server-only. Do not expose them to the client.

---

## 8. Quick reference

| Task | Command |
|---|---|
| Full validation | `npm run check` |
| Baseline audit | `npm run baseline:audit` |
| Generate migration | `npm run db:generate` |
| Apply migration | `npm run db:migrate` |
| Security audit | `npm run db:audit` |
| Lint only | `npm run lint` |
| Tests only | `npm test` |
| Typecheck only | `npm run typecheck` |
