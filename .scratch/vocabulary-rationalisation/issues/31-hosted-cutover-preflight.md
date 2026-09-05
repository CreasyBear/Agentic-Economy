# Prepare the hosted-test cutover target, backup proof and rollback boundary

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / deployment-operations subagent
Parent: ../map.md
Blocked by: 03, 04, 08

## Outcome

Produce a read-only, source-backed preflight record for the selected hosted
test cutover. Name the exact local and hosted test targets, linked Vercel,
Convex and identity projects, callbacks, Convex component queues/workpools and
external financial systems; record backup scope and demonstrated restoration;
define the maintenance window, clean-test-backend procedure, callback/job
isolation and matched rollback. Missing access is an explicit cutover blocker,
not permission to guess or to block independent source work.

This ticket authorises no deploy, reset, backup mutation, credential retrieval,
financial command or production/mainnet action. The worker owns only this issue
and `.scratch/vocabulary-rationalisation/reports/31-hosted-cutover-preflight.md`.

## Fixed vocabulary and protected boundaries

The cutover must carry the accepted Customer, Agent, Tool, Provider, Spending
policy, Request authorization/Approval, Quote, Call, Action execution,
Suggested next action, Purchase resolution/status and Outcome records. It must
not treat a Tool rename as permission to rename generic IAM Principal/Account/
Business/User/Credential/DelegationGrant, portfolio Service, Offering,
Publication, Listing, Source, `SuppliedQuote`, Provider/Seller/payment-recipient
roles, Charge/Provider obligation/payable/payout/delivery/payment records,
external protocol fields, opaque identifiers, canonical hash/signature material
or external financial namespaces.

The source cutover is governed by the exact public and table mappings in
`docs/designs/vocabulary-rationalisation.md` and issue 05, including
`registry.operations.*` -> `registry.tools.*`, `operation.inspect` ->
`tool.quote`, `operation.invoke` -> `tool.call`, `operation.list` -> `call.list`,
`operation.status/cancel/reconcile` -> `call.status/cancel/reconcile`,
`/api/v1/market-operations/*` -> `/api/v1/market-tools/*`,
`/api/v1/operations/inspect` -> `/api/v1/tools/quote`,
`/api/v1/operations/call` -> `/api/v1/tools/call`,
`GET /api/v1/operations` -> `GET /api/v1/calls`, and
`operationRef`/`commitmentRef`/`invocationRef` ->
`toolRef`/`quoteRef`/`callRef`. The AE-owned label
`supplier_operations:v1` -> `provider_tools:v1`; MCP `/mcp`, MCP methods,
portfolio Service APIs and market-request APIs stay as they are.

## Finite read-only evidence allowlist

Use the existing deployment-operations procedure and only these named records
and files; do not perform a broad repository scan:

- `.agents/skills/deployment-operations/SKILL.md`
- `.agents/skills/deployment-operations/agents/openai.yaml`
- `.agents/skills/deployment-operations/scripts/deployment_snapshot.sh`
- `docs/operations/deployment-registry.yaml`
- `docs/operations/deployment-architecture.md`
- `docs/operations/deployment-commands.md`
- `docs/operations/credentials-and-access.md`
- `docs/operations/deployment-maturity.md`
- `docs/operations/README.md`
- `convex.json`
- `.env.example` (template only; never print ignored environment values)
- `src/lib/deployment/manifest.ts`
- `tools/release/verify-deployment-manifest.ts`
- `tests/unit/deployment/deployment-manifest.test.ts`
- `tests/unit/deployment/package4-release-topology.test.ts`
- `tests/imports/deployment-manifest-boundaries.test.ts`
- `infra/package4/README.md`
- `infra/package4/bootstrap/state-and-deployer.yaml`
- `infra/package4/environments/package4-release/main.tf`
- `infra/package4/environments/package4-release/variables.tf`
- `infra/package4/environments/package4-release/versions.tf`
- `infra/package4/modules/release-environment/backup.tf`
- `infra/package4/modules/release-environment/database.tf`
- `infra/package4/modules/release-environment/variables.tf`
- `infra/package4/recovery-drill/README.md`
- `infra/package4/recovery-drill/verify-restored-formance.sh`
- `convex/convex.config.ts`
- `convex/crons.ts`
- `convex/marketDispatchWorkpool.ts`
- `convex/moneyStripeWebhookInbox.ts`
- `convex/moneyStripeWebhookWorker.ts`
- `convex/capabilityProviderConnectionCleanup.ts`
- `convex/capabilityProviderConnectionCleanupAction.ts`
- `convex/capabilityOperationLiveX402.ts`
- `convex/capabilityOperationX402AuthorizationExpiry.ts`
- `src/routes/api.stripe.webhook.ts`
- `src/routes/api.stripe.webhook.accounts-v2.ts`
- `src/routes/api.internal.provider-connection-cleanup.ts`
- `src/routes/api.internal.provider-consequence.ts`
- `src/modules/capability-supply/internal/route-transport-x402.ts`
- `src/modules/capability-supply/internal/route-transport-x402-payment.ts`
- `.scratch/vocabulary-rationalisation/issues/03-current-footprint.md`
- `.scratch/vocabulary-rationalisation/issues/04-retained-data.md`
- `.scratch/vocabulary-rationalisation/issues/08-execution-baseline.md`
- `.scratch/vocabulary-rationalisation/issues/37-prepare-implementation-issues.md`
- `docs/designs/vocabulary-rationalisation.md`

The only writable output is
`.scratch/vocabulary-rationalisation/reports/31-hosted-cutover-preflight.md`
and this issue's resolution section.

## Required preflight record

1. Verify the requested local target and hosted test target from current
   read-only evidence. The registry's current candidate is the non-production
   synthetic `package4-release` environment: Vercel project
   `agentic-economy-package4-release` at its canonical URL, Convex development
   deployment `fastidious-barracuda-66`, Clerk test instance, Stripe sandbox,
   protected Formance edge `formance-release.aecon.ai`, and the private AWS
   Formance/RDS path in `ap-southeast-2`. Treat the 2026-09-04 registry capture
   as stale until the supported snapshot confirms it; never infer a target from
   a hostname or use the production foundation.
2. Record linked project/deployment identities, environment class, release
   revision and callback endpoints without exposing secrets. At minimum trace
   Stripe snapshot `/api/stripe/webhook`, Stripe Accounts v2
   `/api/stripe/webhook/accounts-v2`, provider cleanup/consequence callbacks,
   Convex scheduled work and the four-wide Stripe inbox Workpool. Identify
   market dispatch, provider connection cleanup, Call/x402 expiry/recovery and
   any queued work that could address the fresh dataset.
3. Name every external financial boundary in scope (Stripe sandbox funding and
   refunds, Formance ledger/balances/postings, x402/CDP testnet payment and
   Provider evidence, plus any webhook/readback system) and state how fresh
   test identities and namespaces prevent old callbacks or queued work from
   producing new effects.
4. Record backup coverage and demonstrate restoration through supported
   Convex/deployment procedures before any destructive reset. Keep backup
   archives immutable; do not edit them to simulate table renames. The prior
   infrastructure recovery drill is evidence to reconcile, not automatic
   approval: registry records RTO 2,998 seconds passing its 3,600-second target
   but RPO 308 seconds missing its 300-second target.
5. Define the clean test backend and fresh seed procedure, pause/account for
   pending Calls, callbacks, scheduled jobs and external effects, then identify
   the exact reopen gate. The procedure must use the existing project and
   supported Convex operations; no new Vercel project or custom migration engine.
6. Define rollback as the matched previous application/backend configuration
   plus retained data. If a new external financial effect occurs, stop and
   reconcile it before rollback; never blindly replay or restore over it.

## Explicit exclusions

- No deploy, hosted cutover, Convex reset, seed, backup creation/deletion,
  restore mutation, Terraform/OpenTofu apply, callback disablement or financial
  command in this preflight.
- No production/mainnet, production foundation, domain change or new Vercel
  project. No secret values, tokens, signing secrets or environment contents
  may be printed or copied into the report.
- No source/schema/client/documentation implementation, table rename, alias,
  compatibility framework or custom tracker/checker/migration framework.
- A missing credential or live target read is reported as a cutover blocker;
  do not substitute stale registry text or invent an identifier.

## Dependencies and sequencing

- Retained-data inventory issue 04, execution baseline issue 08 and current
  footprint issue 03 must be available before this preflight closes.
- This Phase 0 preflight can proceed independently of core implementation and
  the canonical-document owner, but issues 33–35 cannot perform data rebuild or
  hosted cutover until this report proves target, backup/restore and rollback
  readiness.
- Issue 37 remains claimed/unresolved with implementation/verification tickets
  pending. Package 6 and Package 7 remain held; this report does not resume
  them.

## Verification commands and expected results

- `node --version` — `v22.*`; `npm --version` — `11.5.1`.
- `git diff --check -- .scratch/vocabulary-rationalisation/issues/31-hosted-cutover-preflight.md .scratch/vocabulary-rationalisation/reports/31-hosted-cutover-preflight.md` — no whitespace errors.
- `npm run verify:deployment-manifest -- --environment development` — pass or record an exact access/environment blocker; do not treat a skipped check as proof.
- `npm run check:convex-codegen` — pass for the current source when run as a read-only check; no deployment is implied.
- `.agents/skills/deployment-operations/scripts/deployment_snapshot.sh` in
  strict read-only mode with approved non-secret target variables — live
  identity/health/callback evidence or an explicit missing-access blocker; no
  secret values in output or report.

## Acceptance

- [ ] Report names the exact local and hosted test targets, linked projects,
      identities, revisions, callback endpoints, Convex queues/workpools and
      external financial systems, with stale registry entries reconciled.
- [ ] Backup scope and a supported restoration demonstration are recorded, or
      cutover is explicitly blocked; no archive editing is used as migration.
- [ ] Clean test backend, fresh-seed, in-flight Call/job accounting, callback
      isolation, maintenance-window pause/reopen gate and matched rollback are
      executable and evidence-backed.
- [ ] Production/mainnet and new-Vercel scope are explicitly excluded, secrets
      are absent, and any missing access is a concrete blocker.
- [ ] No deployment, reset, data, source, plan or generated-output mutation is
      included; Package 6/7 remain held.

## Closure evidence

### Current receipt — 2026-09-05

Read-only preflight completed by `refactor_cutover_preflight`; the coordinator
reviewed [its report](../../../docs/operations/vocabulary-cutover-preflight.md).
Status remains open: current Convex restore proof, 20 pending funding records
(18 externally referenced) and callback isolation require follow-up. No reset,
deployment or external financial mutation occurred. The initial dispatch was
read-only; a subsequent bounded assignment must explicitly include the
supported backup/restore operations before attempting them. Their requirement
is not waived by this partial receipt.

The local and hosted gates are separate: hosted financial reconciliation does
not block source work or local testing against a separately verified safe
local dataset. Alert/cost follow-up is outside refactor acceptance.

Attach `.scratch/vocabulary-rationalisation/reports/31-hosted-cutover-preflight.md`,
redacted target/project references, registry revision/capture timestamp,
read-only snapshot output, backup/restore receipt references (not data),
callback/queue isolation matrix, rollback steps and a list of any blockers.
