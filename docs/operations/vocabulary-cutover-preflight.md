# Vocabulary cutover preflight

**Status:** Partial Phase 0 preflight; read-only evidence captured on 2026-09-05 (Australia/Perth).

This report is an operational boundary record for the vocabulary refactor. It does not authorise or perform a reset, deployment, provisioning, credential retrieval, replay, refund, webhook delivery, or other external financial effect. Secret values, webhook signing material, private endpoints and credentials are intentionally excluded.

## Evidence classes and boundary

- **Fresh readback:** official AWS, Convex, Stripe CLI, Vercel CLI and HTTP health/readiness probes run during this preflight.
- **Source evidence:** the deployment registry, runbooks, infrastructure configuration, local scripts and current project configuration.
- **Historical evidence:** dated release/recovery records and an older Convex export reference. Historical evidence is retained for context and is not a current clean-backend proof.

The working boundary at capture was branch `codex/vocabulary-rationalisation`, HEAD `91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`. The checkout contained approximately 131 modified or staged path entries and 122 untracked entries (253 total; no deletions). Existing work was preserved; no clean checkout or reset was performed.

## Target card

| Target | Exact binding/readback | Current status and use |
|---|---|---|
| Local development | Convex `local:local-joel_chan_agentic_economy_ea30d-5`; `VITE_CONVEX_URL=http://127.0.0.1:3212`; site URL `http://127.0.0.1:3213`; local Vite default `http://127.0.0.1:3024` | Source binding is present, but the local Convex backend was not running. No current local data census was possible. |
| Hosted synthetic test release | Vercel project `agentic-economy-package4-release` (`prj_ADlGp7Fkox0D2MsAq0RkL3oaNFFn`); canonical URL `https://agentic-economy-package4-release.vercel.app`; current aliased deployment `dpl_4eu4Fnn5EydfJybpixbY7t7h4QyZ`; Convex `fastidious-barracuda-66`; Node 22.x | Current hosted test binding. Health, readiness and release probes were healthy. Reported source revision is `6593dbe7b4b8f75304caeed5b468acc497b720f4`, which predates the current checkout HEAD. |
| Hosted staged candidate | Vercel deployment `dpl_BHhR2rMv3oWkAzWZw3BXNvMGUX95`; URL `https://agentic-economy-package4-release-a7f46w8ef-creasybears-projects.vercel.app` | Ready and target production, but unpromoted and without the canonical alias. Direct health probes received the normal Vercel protection redirect; no bypass was attempted. |
| Primary application | Vercel project `agentic-economy` (`prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`); aliases include `https://www.aecon.ai` and `https://aecon.ai`; current deployment `dpl_7SzWUGFVdGwnWqqZqMT3iqfZeAG5`; Node 24.x | Not a suitable refactor test target at this point: `/api/health` was 200, but `/api/ready` was 503 for an invalid/missing production configuration and `/api/v1/release` was 503 for an unconfigured source revision. |
| Reference Provider fixture | Vercel project `package5-reference-provider` (`prj_gyaX8fy0abiwTFfvfqnqrn71Al8p`); source `tools/release/package5-reference-provider` | Project and local fixture rewrites exist, but no Vercel deployment was listed. No hosted Provider endpoint is established by this preflight. |
| AWS hosted-test support | Region `ap-southeast-2`; DR region `ap-southeast-4`; EC2 `i-063c00d935d85d74f`; source RDS `package4-release-formance`; restore-drill RDS `package4-release-restore-20260904`; primary vault `package4-release-package4-primary`; DR vault `package4-release-package4-dr`; state bucket `agentic-economy-p4-state-197716152388-ap-southeast-2` | Fresh readback found the source instance/RDS available and protected. The restore drill is retained and isolated; it is not a clean Convex test dataset. |
| Formance | Existing hosted-test edge `formance-release.aecon.ai`; health readback from Convex reports gateway `v2.3.1`, ledger `v2.4.12`, schema `v1.3.0` | Convex-side health was `ready`. Direct unauthenticated edge access correctly returned unauthorized; no credentials were retrieved. |

The local `.vercel/project.json` links the checkout to the primary project, not the synthetic release project. It must not be treated as an implicit hosted-test deployment binding. The local `.env.local` contains the local Convex values above; the hosted-like Formance, authenticated E2E and CLI base URL bindings were not populated there.

## Fresh hosted probes

### Application and release

- Synthetic release: `/api/health` 200, `/api/ready` 200 with configuration and Convex ready, and `/api/v1/release` 200 with source revision `6593dbe7b4b8f75304caeed5b468acc497b720f4`.
- Primary application: `/api/health` 200, `/api/ready` 503 (`deployment_manifest_invalid`), and `/api/v1/release` 503 (`source_revision_unconfigured`).
- No refactor source or renamed schema was inferred to be deployed from a healthy probe; the hosted source revision is older than the current checkout.

### Hosted Convex schema and data census

The current synthetic deployment still exposes the pre-refactor physical table names, including `actionInvocation*`, `capabilityOperation*`, `capabilitySupplierOperationProjections`, `marketActiveOperations`, `marketActiveSuppliers`, `marketOperationCategories`, `marketOperationRatings` and `registeredOperationMappings`. No table rename, migration or destructive operation was performed.

Safe aggregate queries and existing internal read-only health/candidate queries returned:

| Area | Fresh result |
|---|---:|
| `moneyFundingCommands` | 25 total: 20 `pending`, 4 `succeeded`, 1 `reversed` |
| Pending funding commands with an external reference and provider evidence reference | 18 of 20 |
| Pending funding commands with an applied Stripe event or applied transaction reference | 0 of 20 for each field |
| Funding command age | The 20 pending rows were in the one-day age bucket at query time; all 25 rows were one-to-six days old |
| Calls (`capabilityOperationInvocations`) | 0 |
| Quotes (`capabilityOperationCommitments`) | 0 |
| x402 payment attempts | 0 |
| Provider obligations | 0 |
| Stripe webhook inbox rows | 0 |
| Reconciliation cases | 0 |
| Active Provider connections | 21 |
| Provider connection attempts | 0 |
| Provider offboarding cases/targets | 0 / 0 |
| Issued money documents | 11 |

The deployed funding-command readback leaves provider checkout/payment status fields unset for all 25 rows. This is value-bearing financial state, not disposable seed data. The 18 pending rows carrying external/provider evidence require exact external readback and reconciliation before any clean-test reset. No payment, webhook, queued job or funding row was replayed or changed.

The default workpool, Stripe webhook workpool and workflow components each had zero rows in their safe aggregate tables, including pending work, payloads, steps and completion failures. The root `_scheduled_functions` aggregate contained 350 historical rows, all with `state: success`; the safe query exposed no pending scheduled-function state. This is not evidence that scheduled work may be discarded without the maintenance-window accounting required by the runbook.

### Stripe callback targets

Fresh metadata readback was performed without retrieving signing secrets or sending events:

| Target | Readback |
|---|---|
| Replacement snapshot `we_1UBshw70N4UjLqHtRdcPu1FS` | Test mode; URL `https://agentic-economy-package4-release.vercel.app/api/stripe/webhook`; **disabled**; API `2026-07-29.dahlia`; six enabled events: checkout completed, asynchronous success, asynchronous failure, refund created, refund updated and refund failed |
| Accounts v2 `ed_test_61VLGGSYypj7Fpg7S16UvBfU9V8SqsP28ZeVu4UQaVMO` | Test mode; URL `https://agentic-economy-package4-release.vercel.app/api/stripe/webhook/accounts-v2`; **disabled**; five enabled Accounts v2 events; API metadata did not expose a signing secret |
| Currently enabled legacy/current endpoint `we_1UBYM070N4UjLqHtknl4R8Ep` | Test mode; same funding webhook URL; **enabled**; API version unpinned; seven events, including the six above plus `checkout.session.expired` |

The replacement destinations are not ready for cutover. The current endpoint has a broader event set than the replacement and is unpinned. The read-only snapshot could not perform local restricted command/readback checks because the required local Stripe key bindings were absent; names visible in hosted configuration are not proof of usable access.

## Backup and restore evidence

### Fresh AWS backup census

- Source RDS `package4-release-formance` was available, encrypted, private, Multi-AZ, deletion-protected, PostgreSQL 16.13, with seven-day backup retention and a latest restorable time of `2026-09-05T07:29:13+00:00`.
- Latest primary backup job `4B00048A-9797-5E4C-18E9-1EB3835EB254` was `COMPLETED` (created `2026-09-05T00:00:00+08:00`; completed `2026-09-05T00:31:43.064000+08:00`).
- Latest DR copy job `B8DFF3A4-D9B1-F266-6E09-9A7B77746140` was `COMPLETED` (created `2026-09-05T00:36:06.746000+08:00`; completed `2026-09-05T00:39:43.459000+08:00`).
- Corresponding latest primary and DR recovery points were present and completed. CloudWatch, budget and account-control checks were otherwise available; Cost Explorer forecast was unavailable because there was insufficient historical data.

### Existing recovery drill

The retained isolated RDS drill `package4-release-restore-20260904` was available, encrypted and private. Its recorded verification was pass, schema `v1.3.0`, RTO 2,998 seconds against a 3,600-second target, and one idempotent replay. Recorded RPO was 308 seconds against a 300-second target, an eight-second miss. The drill remains retained pending an explicit cleanup decision; this preflight did not destroy it or retrieve its credential.

### Missing proof before a hosted reset

The AWS/RDS backup and restore evidence does **not** prove that the current hosted Convex dataset can be safely reset. The existing dated Convex export reference (`1788295840323299000`) predates the current value-bearing funding census and is not a current backup proof. Before destructive test cutover, the owner must:

1. Retain the fresh supported Convex export recorded below and demonstrate restoration into the existing project structure or an approved isolated recovery target.
2. Reconcile the 20 pending funding commands, especially the 18 with external/provider references, against Stripe and Formance using approved restricted readback access. Record exact references and a no-replay decision.
3. Repeat or formally accept the isolated recovery drill with the RPO miss addressed; retain rollback evidence.
4. Establish a maintenance-window inventory proving no callbacks, pending Calls, workflow/workpool jobs or scheduled work can act on the fresh dataset.

### Fresh native Convex export — 2026-09-05 10:21 UTC

This is a bounded inventory/backup-capture receipt. Immediately before the
capture, the exact development/synthetic release target
`dev:fastidious-barracuda-66` was read back with process-scoped Convex
selection. Ambient deployment keys, deployment tokens, self-hosted selectors
and verbose logging variables were blanked. The synthetic release health,
readiness and release probes were HTTP 200; the hosted source revision remained
`6593dbe7b4b8f75304caeed5b468acc497b720f4`; and the exact Convex Stripe inbox
readback returned `stalled=0`, `failed=0` and `reconciliationRequired=0`.

The installed official Convex CLI was `1.45.0`; runtime was Node `v22.22.0`
and npm `11.5.1`. The native command was:

```text
CONVEX_DEPLOYMENT=dev:fastidious-barracuda-66
CONVEX_DEPLOY_KEY=''
CONVEX_DEPLOYMENT_TOKEN=''
CONVEX_SELF_HOSTED_URL=''
CONVEX_SELF_HOSTED_ADMIN_KEY=''
CONVEX_VERBOSE=''
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx convex export \
  --include-file-storage \
  --path /Users/joelchan/.codex/backups/agentic-economy/convex-native-20260905-102139
```

The native export completed at `2026-09-05T10:21:44Z`. It produced
`snapshot_fastidious-barracuda-66_1788603701438628839.zip` in the new private
directory
`/Users/joelchan/.codex/backups/agentic-economy/convex-native-20260905-102139/`.
The directory is mode `0700`; the archive is mode `0600` and 229,603 bytes.
SHA-256:
`14a276d8b2d05caede5f155367cd0a8feffd8192d21c775fa5a721a38c3a9cbe`.
Native export completion, `unzip -tq` and `zip -T` all exited 0. Metadata-only
inspection found 355 archive members, 182 `documents.jsonl` members and 23
file-storage members, including the native `_storage` area. No rows, file
contents, credentials or raw provider payloads were emitted or retained in
this record.

The installed CLI/source exposes deployment-wide export and
`--include-file-storage`; it has no export-specific `--component` selector.
The deployment declares 11 mounted component instances. The archive therefore
has deployment-wide component coverage only; no per-component export or
per-component restore was selected or independently proved. Convex's official
[backup contract](https://docs.convex.dev/database/backup-restore) states that
the ZIP contains documents for all Convex tables and, when requested, `_storage`
metadata/files, but excludes code/configuration, environment variables and
pending scheduled functions. This archive is consequently not a backend,
callback, queue or runtime backup.

### Supported isolated Convex restoration proposal — not executed

The official supported path is a native ZIP import (or dashboard restore) into
another deployment. The import documentation confirms that ZIP imports retain
document IDs/creation times and restore `_storage` when present; replacement
flags are destructive. The following exact procedure is held for coordinator
review only:

1. Resolve an existing, non-authoritative empty development deployment in the
   same Convex project and read it back. The exact selector is **NOT VERIFIED**
   here; do not substitute `dev`, `fastidious-barracuda-66`, the project default
   production deployment or a guessed name. If no isolated target exists, the
   restoration gate remains blocked; this receipt does not create a project,
   deployment or other infrastructure.
2. Prove that target has no Vercel alias, Stripe destination, Provider callback,
   Formance edge, CDP/x402 custody or customer identity bound to it. Keep
   external credentials absent and account for target callbacks, pending Calls,
   workpool/workflow rows and scheduled work. Reconcile the source's 20 pending
   funding commands (18 with external/provider references) against Stripe and
   Formance before any source reset or cutover.
3. With separate coordinator authorization, establish the matching approved
   source revision and all 11 component mounts on the isolated development
   target using the existing `npx convex dev` procedure. Do not use
   `convex deploy` with `CONVEX_DEPLOYMENT`; the installed CLI documents that
   combination as the project default production target.
4. Verify the isolated target is empty, then import the unchanged archive using
   the explicit target and blank ambient selectors. Omit `--prod`,
   `--replace`, `--replace-all`, `--append` and `--component` so a non-empty
   target fails instead of being overwritten:

   ```text
   CONVEX_DEPLOYMENT=dev:<approved-isolated-reference>
   CONVEX_DEPLOY_KEY=''
   CONVEX_DEPLOYMENT_TOKEN=''
   CONVEX_SELF_HOSTED_URL=''
   CONVEX_SELF_HOSTED_ADMIN_KEY=''
   CONVEX_VERBOSE=''
   NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx convex import \
     /Users/joelchan/.codex/backups/agentic-economy/convex-native-20260905-102139/snapshot_fastidious-barracuda-66_1788603701438628839.zip
   ```

5. Run only supported read-only `convex data` and `convex run --component`
   queries after import. Compare bounded counts/digests for application data,
   `_storage`, root scheduled/workpool/workflow state and every declared
   component. Keep transient raw output in a mode-`0600` file and retain only
   aggregate receipts; never print rows or file contents.
6. Reopen only after the isolated data/component comparison passes, the 20
   pending funding records have exact no-replay dispositions, callback/job
   isolation is evidenced and matched application/backend/data rollback is
   recorded. Any new external effect stops the procedure for reconciliation;
   never import over the authoritative source.

No import, restore, target creation, backend start, deployment, callback change,
credential read, financial command or external effect was performed here. The
fresh archive proves backup integrity, **not** database restoration. Ticket 31
remains open pending an approved isolated target, restoration/isolation proof,
pending funding reconciliation and callback/job accounting.

## Supported clean-environment and rollback method

The supported local path is `npm run dev:local`, which selects the local Convex deployment, starts Convex locally with the project’s normal procedure, and performs the existing idempotent development identity/catalogue setup. `npm run seed:dev` is the supported seed entry point. The local backend must be running before a local census or fresh seed can be verified.

The supported hosted path is to pause new test activity, account for pending Calls/callbacks/scheduled work, verify backup and restore, establish a clean dataset in the existing `package4-release` Convex project using supported Convex operations and the updated seed, deploy the matching schema/backend/clients through the existing Vercel project, reconnect test identities, verify callback isolation, rerun acceptance, and reopen activity only after proof passes. Historical external financial records and evidence remain retained. No custom migration engine, backup-archive table rename, new Vercel project or production/mainnet rollout is in scope.

Rollback is the matched previous application/backend configuration plus retained data. If any new external financial effect exists, stop and reconcile it before rollback; never replay it or restore over it blindly.

## Concrete blockers and next safe actions

1. **Hosted Convex reset is blocked by value-bearing state.** Do not clear or reseed while pending funding commands have external/provider references. Obtain restricted provider readback, reconcile, and document the disposition first.
2. **Callback cutover is not ready.** The replacement Stripe snapshot and Accounts v2 destinations are disabled; the active endpoint is unpinned and includes `checkout.session.expired`. Complete the existing cutover procedure only during the approved maintenance window, with canaries and rollback evidence.
3. **Candidate/application pairing is incomplete.** The staged Vercel candidate is unpromoted and protected from direct probes; the primary app is not ready; the healthy hosted alias reports an older source revision. A matching refactor candidate and client bundle must be verified later.
4. **Local verification is unavailable.** The local Convex backend is stopped. Starting it and seeding it is a later supported action, not part of this read-only preflight.
5. **Alert and cost evidence has gaps.** The Cloudflare account/alert target was not verifiable because the local account binding was a placeholder/missing and no token was supplied. Cost forecast was unavailable. These require operations follow-up; no workaround was introduced.
6. **Recovery evidence needs one qualification.** The retained RDS drill passed verification and RTO but missed RPO by eight seconds. This is not a current Convex restore proof and must not be represented as one.

The original preflight changed no source, database row, callback destination,
credential, queue, payment or hosted resource and did not alter existing
backup archives. The later bounded native-export receipt above added only the
new private archive and its allowlisted documentation evidence; it still did
not perform restoration or cutover.
