# Rebuild and verify local test data

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / local database and integration verification owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 29, 30, 31, 32

## Outcome

Prove that the renamed local Convex dataset can be recreated through the
supported local procedure, seeded repeatedly and used through the existing
Tool → Quote → Call, policy and Provider workflows. This issue may mutate only
the explicitly named local Convex deployment through supported operations; it
must not touch hosted data, historical evidence, external payment state or
source files owned by implementation tickets.

## Fixed target and data rules

The local target is the exact preflight binding:

- Convex deployment: `local:local-joel_chan_agentic_economy_ea30d-5`
- Convex URL: `http://127.0.0.1:3212`
- Site URL: `http://127.0.0.1:3213`
- Vite URL: `http://127.0.0.1:3024`

Use only the existing idempotent commands `npm run dev:local` and
`npm run seed:dev`. `dev:local` selects local Convex, starts the local Convex
and Vite processes, ensures the fixed development identities and runs the
development catalogue seed; `seed:dev` invokes `devSeed:seedDevCatalog`.
Do not invent a reset, export, import or deployment flag. The exact supported
backup/restore operation and target must be supplied by the open issue 31
activity-safety receipt before any destructive local reset; if that receipt is
missing, this ticket is operationally blocked.

The fresh dataset must contain no copied hosted rows or replayable external
effects. Preserve old evidence, external financial history, webhook history
and queued work outside the fresh test dataset. Repeated seeding must remain
idempotent and must not duplicate identities, Tool/Provider rows, Quotes,
Calls, charges, documents or storage references.

## Finite source, target and evidence allowlist

These are the only source/procedure and maintained-test paths this issue reads
or runs; vocabulary changes remain with their owning implementation issues:

- `package.json`
- `tools/dev/local-dev.mjs`
- `convex/devSeed.ts`
- `convex/devSeedStore.ts`
- `convex/schema.ts`
- `tests/imports/capability-supply-boundaries.test.ts`
- `tests/imports/faux-runtime-surfaces.test.ts`
- `tests/integration/dev-seed-public-catalog-facts.test.ts`
- `tests/unit/convex/dev-seed-store.test.ts`
- `tests/unit/schema/convex-schema.test.ts`
- `tests/integration/capability-publication-publish.test.ts`
- `tests/integration/capability-operation-workpool.test.ts`
- `tests/integration/money-formance-boundary.test.ts`
- `tests/unit/convex/capability-operation-reservation.test.ts`
- `tests/unit/convex/capability-operation-recovery.test.ts`
- `tests/unit/convex/capability-operation-worker-run.test.ts`
- `tests/unit/convex/capability-operation-worker-reconcile.test.ts`
- `tests/integration/current-tool-snapshot-stability.test.ts`
- `docs/operations/vocabulary-cutover-preflight.md`
- `docs/operations/deployment-commands.md`
- `.scratch/vocabulary-rationalisation/issues/31-hosted-cutover-preflight.md`

The only write target is the local Convex deployment named above, plus this
issue's closure receipt. Do not edit `convex/devSeed.ts`, generated files,
tests, package files or any hosted/financial resource from this ticket. If the
renamed seed does not compile or seed facts are wrong, return the failure to
the owning implementation issue with the exact command and row/reference
evidence.

## Verification sequence

1. Confirm Node 22 and npm 11.5.1, the exact local target and no hosted
   `CONVEX_DEPLOYMENT` binding before starting the local stack.
2. Obtain issue 31's exact supported local backup/restore and activity-safety
   receipt. Demonstrate restoration before clearing or recreating any local
   dataset; retain the deliberate recovery record.
3. Run `npm run dev:local` through the normal local procedure and record the
   readiness output without copying secrets. Run `npm run seed:dev` once, then
   again against the same local target.
4. Use the existing seed/read procedures to verify identity/account/Agent
   access, Tool/Provider publication, Quote/Call references, policy fields,
   storage references, financial rows and workpool state. No external
   payment, webhook or historical queue is submitted.
5. Run the named seed, schema, publication, workpool, recovery and financial
   boundary tests below. Repeat the fresh-seed check after a supported clean
   local restore and compare counts/references.

## Verification commands and expected results

Use existing commands only, with Node 22 and npm 11.5.1:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run dev:local
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run seed:dev
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm exec vitest run \
  tests/imports/capability-supply-boundaries.test.ts \
  tests/imports/faux-runtime-surfaces.test.ts \
  tests/integration/dev-seed-public-catalog-facts.test.ts \
  tests/unit/convex/dev-seed-store.test.ts \
  tests/unit/schema/convex-schema.test.ts \
  tests/integration/capability-publication-publish.test.ts \
  tests/integration/capability-operation-workpool.test.ts \
  tests/integration/money-formance-boundary.test.ts \
  tests/unit/convex/capability-operation-reservation.test.ts \
  tests/unit/convex/capability-operation-recovery.test.ts \
  tests/unit/convex/capability-operation-worker-run.test.ts \
  tests/unit/convex/capability-operation-worker-reconcile.test.ts \
  tests/integration/current-tool-snapshot-stability.test.ts
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
```

Expected: the local backend is the named development deployment, seed runs are
repeatable, fresh identity/catalogue/Provider/Tool/Quote/Call references are
internally consistent, existing workflows read and write the renamed schema,
workpool and recovery state remain bounded, and financial/storage references
round-trip without replay. No hosted rows, external payments, webhooks or
historical evidence are changed. Any skipped Formance test is recorded as an
environment limitation, never as a pass.

## Exclusions and safety gates

- Do not run against `fastidious-barracuda-66`, the Vercel synthetic release,
  the primary application, Formance, Stripe, Base Sepolia or any production
  deployment. Hosted cutover is issue 35.
- Do not use a custom migration/reset script, edit a backup archive, rename
  tables in exported data, copy hosted rows, replay payments/webhooks or
  truncate a dataset without issue 31's exact target-bound restoration proof.
- Do not change the seed's product meaning, add fixtures, introduce a new
  dependency or alter acceptance to fit available data. Package 6/7 remain
  held.
- The 26 pre-existing TypeScript-standards findings remain baseline evidence;
  do not fix or reclassify them here.

## Acceptance

- [ ] Issue 31 supplies exact supported local target, backup/restore and
      activity-isolation evidence before any destructive local operation.
- [ ] A supported restore/clean operation and two seed runs on
      `local:local-joel_chan_agentic_economy_ea30d-5` produce the expected
      idempotent identity, Tool, Provider, Quote and Call state.
- [ ] Named seed/schema/publication/workpool/recovery/financial tests and
      typecheck pass, with baseline failures and environment skips separated.
- [ ] No hosted, external-financial, historical, generated, source or
      unrelated worktree state was changed.

## Closure evidence

Attach the target card, backup/restore receipt, clean-seed and repeat-seed
outputs, bounded row/reference counts, named test results, storage/financial
consistency observations, and any limitations. Keep the issue open if issue 31
has not supplied the exact restore procedure or if any external effect cannot
be proven absent.

