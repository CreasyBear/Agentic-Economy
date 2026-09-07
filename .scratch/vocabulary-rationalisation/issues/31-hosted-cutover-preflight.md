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

This ticket authorises no deploy, reset, alteration of existing backups,
credential retrieval, financial command or production/mainnet action. The
coordinator-approved native read-only backup capture below implements the
accepted plan's recovery preparation; it does not authorise restoration or
cutover. The bounded output extension below controls its records.

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

- No deploy, hosted cutover, Convex reset, seed, backup deletion,
  restore mutation, Terraform/OpenTofu apply, callback disablement or financial
  command in this preflight. Only the explicitly bounded fresh native export
  below is allowed; no existing archive may be edited or replaced.
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

### Coordinator dispatch — fresh native Convex backup, 2026-09-05

While source implementation proceeds, capture one fresh backup of the existing
**development / synthetic release** Convex deployment
`dev:fastidious-barracuda-66` through the installed official Convex export
command, after current target readback. Preserve the existing local deployment,
all hosted data, callbacks, schedules and financial systems unchanged.

Use Node 22/npm 11.5.1 and the same explicit process-scoped deployment selection
as issue 22, blanking ambient deploy/deployment-token/self-hosted keys and
verbose logging. Inspect installed CLI help/source for supported export flags;
include native component/file-storage coverage where supported and state exact
coverage/limitations. Never use an ambient/default production target, `dev`,
`deploy`, import/replace, `run` mutations or environment-value inventory.

Native generated output is permitted only in a new mode-0700 directory beneath
`/Users/joelchan/.codex/backups/agentic-economy/`, with backup files mode0600.
Do not overwrite existing archives. Keep rows, credentials, file contents and
raw provider payloads out of tool output and repository records. Verify the
archive with native integrity checks and SHA-256; that is backup integrity,
**not** a demonstrated database restoration. No custom backup/restore engine
or archive rewriting is authorised.

The finite writable documentation extension is this ticket, its existing
scratch report, `docs/operations/vocabulary-cutover-preflight.md`,
`docs/operations/deployment-registry.yaml` and
`docs/operations/deployment-maturity.md`. Record only target identity, time,
coverage, private backup reference/hash, checks and limitations. Existing dated
evidence stays historical. No source/schema, other ticket or Git writes.

Separately inspect the supported restoration procedure read-only and return
an exact isolated-test proposal for coordinator review. Do not start a backend,
create another project, import data, retrieve secret values, change callbacks
or reconcile/submit financial commands. Missing access or unsafe isolation is
a concrete follow-up blocker, not permission to weaken or bypass the gate.
Issue31 remains open until its full restoration/isolation acceptance is met.

### Subagent receipt — fresh native Convex backup — 2026-09-05

Operation classified as inventory/backup capture. After the required current
target readback, one fresh native export was taken only from the existing
development/synthetic release deployment `dev:fastidious-barracuda-66`. The
synthetic app health, readiness and release probes were HTTP 200, the hosted
source revision remained `6593dbe7b4b8f75304caeed5b468acc497b720f4`, and the
exact Convex Stripe inbox readback was `stalled=0`, `failed=0`,
`reconciliationRequired=0`. Ambient Convex deployment keys, deployment tokens,
self-hosted selectors and verbose logging variables were blanked for the
process.

Runtime was Node `v22.22.0` / npm `11.5.1`; installed official Convex CLI was
`1.45.0`. The native command used `--include-file-storage` and completed at
`2026-09-05T10:21:44Z`. Its only output archive is retained privately at:

`/Users/joelchan/.codex/backups/agentic-economy/convex-native-20260905-102139/snapshot_fastidious-barracuda-66_1788603701438628839.zip`

The directory is mode `0700`; the archive is mode `0600` and 229,603 bytes.
SHA-256 is
`14a276d8b2d05caede5f155367cd0a8feffd8192d21c775fa5a721a38c3a9cbe`.
Native export completion, `unzip -tq` and `zip -T` all exited 0. Metadata-only
inspection found 355 archive members, 182 `documents.jsonl` members and 23
file-storage members, including `_storage`. The deployment declares 11
component mounts. The export command has no component-specific flag, so the
snapshot is deployment-wide; component data is not independently restore-proven
here. Native backup coverage excludes code/configuration, environment
variables and pending scheduled functions. No rows, file contents, credentials
or raw provider payloads were emitted or retained.

This proves backup integrity only; it is not restoration proof. A supported
restore proposal is recorded in the scratch and operational preflight reports:
resolve an existing empty non-authoritative development deployment in the same
project, prove it has no Vercel/Stripe/Provider/Formance/CDP/customer bindings
or credentials, establish the matching source and component mounts with the
existing `npx convex dev` procedure under a separately approved target, then
run native `npx convex import <archive>` with the same blanked selectors and no
replacement flags. Use only read-only `convex data` / `convex run --component`
queries to compare bounded application, `_storage`, scheduled/workpool/workflow
and component digests. If no isolated target can be resolved, stop; do not
create a project, guess a target or import into the source deployment.

No import, restore, target creation, backend start, deployment, callback
change, credential read, financial command or external effect was performed.
Issue 31 remains **open**: restoration/isolation proof, exact reconciliation of
20 pending funding commands (18 with external/provider references), callback/job
accounting, and the matched rollback gate are still outstanding. The five
previous snapshot skips remain explicit and unchanged (AWS, local restricted
command key, local restricted readback key, Stripe destinations and Cloudflare
alerts). See the [fresh preflight receipt](../../../docs/operations/vocabulary-cutover-preflight.md)
for the complete archive and procedure record.

### Subagent receipt — read-only isolated local restoration assessment — 2026-09-05

No local backend was started, configured, created or imported into during this
assessment. Node `v22.22.0` and npm `11.5.1` were confirmed. The existing local
target remains stopped: `http://127.0.0.1:3212` and
`http://127.0.0.1:3213` did not respond. Its project-local state is
`.convex/local/default/`, with the current SQLite and file-storage paths
present, so it is not an empty target and must not be used for restoration.
The recorded `.env.local` selector is
`local:local-joel_chan_agentic_economy_ea30d-5`; the non-secret deployment-name
field in the local config uses a different delimiter. No selection or config
rewrite was attempted; the coordinator must reconcile that identity before
reusing the existing target.

Installed Convex CLI `1.45.0` help/source establishes the following boundary:
`convex deployment create local` creates a local deployment and `--select`
writes selection state; the source rejects a second local deployment when the
current worktree already has `.convex/local/default/`. The source documents one
local state directory per project/worktree/clone, making a separate clean
worktree/clone the supported storage-isolation boundary. A linked local
deployment's first start also copies the project's default dev environment
variables; that path is unsuitable for this safety proof. The anonymous local
path does not copy linked project defaults. The installed CLI and local-backend
help expose no offline, network-deny, scheduler-disable or callback-suppression
flag. Convex's read-only inline queries are sandboxed, but Node actions in a
local deployment run on the host.

One exact provider-supported proposal for coordinator approval (not executed):
use a fresh separate checkout/worktree of this existing source, with no
`.env*` files or `.convex/` state copied from this checkout, and create the
anonymous local target named `anonymous-agent` using
`CONVEX_AGENT_MODE=anonymous`. Start only the local backend with the installed
CLI's source-supported `--skip-push --tail-logs disable` path, with all Convex
selector/deploy/self-hosted/verbose variables blank and an allowlist-only
process environment. This creates no Vercel/cloud project and does not link or
import project default environment variables. In a second terminal, while the
anonymous backend remains running, invoke native ZIP import with
`CONVEX_DEPLOYMENT=anonymous:anonymous-agent` and the immutable private archive
above, omitting `--prod`, `--replace`, `--replace-all`, `--append`, `--yes` and
`--component`. The default `requireEmpty` import mode supplies the empty-target
guard. Then use only read-only `convex data` / sandboxed `convex run
--inline-query` checks, including component-scoped reads where supported, and
retain counts/digests only in mode-0600 temporary output. Do not run seed,
mutations, actions or callbacks.

This data-only stage is isolated by construction: the native backup contains
table documents and optional storage but no deployment code, environment
variables or pending scheduled functions; the anonymous target has no linked
default variables, no pushed application code and no public inbound URL. The
ZIP import path preserves embedded component/table paths and storage, but
component data presence is not functional component restoration until matching
source is pushed. The `--skip-push` stage therefore demonstrates safe data
import only, not full application restoration.

The remaining blocker is precise: full component/function restoration would
require a later source push, which activates cron/component code, and the
provider-supported CLI offers no network or scheduler isolation. Because local
Node actions run on the host, blank environment variables alone do not prove
that every outbound callback/job is impossible. The coordinator must choose and
approve an additional execution/network boundary (or explicitly defer
functional component proof); until then, no full restoration/isolation proof is
possible without violating the no-effects gate. Issue 31 remains **open** and
the existing local target/data remains unchanged.

### Subagent receipt — coordinator-approved data-only restore command proposal — 2026-09-05

The coordinator approved proceeding only toward a data-only restore proof. No
workspace was created, no backend was started, and no import was run in this
receipt. The installed Convex CLI is `1.45.0`; Node `v22.22.0` and npm
`11.5.1` are available. The cached maintained local backend is
`precompiled-2026-08-25-7cce8fb`.

Fresh private workspace/state strategy (deferred until serialized Git approval):
use `/Users/joelchan/.codex/agentic-economy/convex-restore-31-20260905/` as a
mode-0700 clean checkout/worktree, with no `.env*` files and no `.convex/`
directory copied from the source checkout. The installed CLI binary is invoked
by its existing absolute path, so this procedure adds no package or dependency.
Convex 1.45.0 stores both local and anonymous state at
`<workdir>/.convex/local/default/` when that project-local path is new; its
legacy home path is consulted only as a fallback. Read-only checks confirm that
the proposed workspace, its state/env paths, and the legacy
`anonymous-agent` directory are currently absent. The existing local state and
the five explicit snapshot skips remain untouched. Ports `3224` and `3225` were
also read-only checked as unused.

After root creates the clean checkout, this is the exact metadata-only guard
(run from that workspace; it emits only pass/fail):

```sh
cd /Users/joelchan/.codex/agentic-economy/convex-restore-31-20260905
NODE_VERSION=22 /Users/joelchan/.nvm/nvm-exec node -e 'const fs=require("fs"),p=require("path"),w=process.cwd(),legacy="/Users/joelchan/.convex/anonymous-convex-backend-state/anonymous-agent"; const names=fs.readdirSync(w); const ok=(fs.statSync(w).mode&0o777)===0o700 && fs.existsSync(p.join(w,"package.json")) && fs.existsSync(p.join(w,"convex.json")) && fs.existsSync(p.join(w,"convex")) && !names.some(n=>n.startsWith(".env")) && !fs.existsSync(p.join(w,".convex")) && !fs.existsSync(legacy); if(!ok) process.exit(1); console.log("restore-workspace-empty-guard=pass");'
```

With that guard passing, the exact pinned startup command is:

```sh
env -u CONVEX_DEPLOY_KEY -u CONVEX_DEPLOYMENT -u CONVEX_DEPLOYMENT_TOKEN -u CONVEX_SELF_HOSTED_URL -u CONVEX_SELF_HOSTED_ADMIN_KEY -u CONVEX_VERBOSE -u CONVEX_PROVISION_HOST CONVEX_AGENT_MODE=anonymous CONVEX_ALLOW_ANONYMOUS=true NODE_VERSION=22 /Users/joelchan/.nvm/nvm-exec "/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/node_modules/.bin/convex" dev --skip-push --typecheck disable --codegen disable --tail-logs disable --local-cloud-port 3224 --local-site-port 3225 --local-backend-version precompiled-2026-08-25-7cce8fb < /dev/null
```

The CLI source makes `--skip-push` skip `devAgainstDeployment`; the command
therefore starts only the anonymous local backend and does not push application
code. It uses the fixed anonymous name `anonymous-agent`, but the state is
workspace-local and the legacy collision path is absent. `--tail-logs disable`
only suppresses log output; it is not a scheduler or network isolation switch.
The stdin redirection keeps the CLI noninteractive, so its new-deployment path
does not prompt for AI-file installation; the clean checkout already contains
the generated directory and `convex/tsconfig.json`, leaving `.convex` state as
the only intended new workspace output.

While that backend remains running, the exact native import command is:

```sh
env -u CONVEX_DEPLOY_KEY -u CONVEX_DEPLOYMENT_TOKEN -u CONVEX_SELF_HOSTED_URL -u CONVEX_SELF_HOSTED_ADMIN_KEY -u CONVEX_VERBOSE -u CONVEX_PROVISION_HOST CONVEX_AGENT_MODE=anonymous CONVEX_ALLOW_ANONYMOUS=true CONVEX_DEPLOYMENT=anonymous:anonymous-agent NODE_VERSION=22 /Users/joelchan/.nvm/nvm-exec "/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/node_modules/.bin/convex" import --format zip /Users/joelchan/.codex/backups/agentic-economy/convex-native-20260905-102139/snapshot_fastidious-barracuda-66_1788603701438628839.zip
```

Do not add `--prod`, `--replace`, `--replace-all`, `--append`, `--yes` or
`--component`. With none of those flags, the installed CLI sends the native
ZIP import as `requireEmpty`; this is the provider's authoritative empty-target
guard. After completion, use only read-only `convex data` and sandboxed
`convex run --inline-query` checks, retaining counts/digests only and emitting
no rows or file contents.

The archive has 182 `documents.jsonl` members; 92 are at component/nested path
depth, and component/nested storage members are present. Yes: component table
data can be imported without component source code. The native ZIP importer
walks each table path and prepares its component namespace/table before writing
documents; the official backend source shows this `prepare_component_for_import`
path ([snapshot import source](https://github.com/get-convex/convex-backend/blob/main/crates/application/src/snapshot_import/mod.rs)). This restores component
data/storage only. It does not restore component code, environment variables,
or pending scheduled functions, so no app function or cron is activated in this
stage.

Minimal incident notice: local deployment admin-key and instance-secret fields
appeared in agent tool output during metadata inspection; that output may be
retained in the agent transcript. The exact values are intentionally not
recorded here. This notice concerns local scope only; no hosted secret fields
are identified in it.

Issue 31 remains **open**: this procedure is data-only restore evidence, not
functional component/scheduler or hosted cutover proof. The existing local
deployment/data remains unchanged.

### Subagent receipt — approved data-only target startup attempt — 2026-09-05

The coordinator-approved detached worktree was created at
`/Users/joelchan/.codex/agentic-economy/convex-restore-31-20260905/` from the
reviewed commit and set to mode `0700`. The pre-start guard passed: the tracked
`.env.example` template was the only `.env*` entry; no active environment file,
`.convex/` state, or legacy home `anonymous-agent` directory existed. The
original checkout's local state was not copied or changed. Node `v22.22.0`, npm
`11.5.1`, installed CLI `1.45.0`, pinned cached backend
`precompiled-2026-08-25-7cce8fb`, and free ports `3224`/`3225` were confirmed.

The exact blanked-selector anonymous `convex dev` command was run with
`--skip-push --typecheck disable --codegen disable --tail-logs disable`, the
pinned backend version and ports. It selected exactly
`anonymous:anonymous-agent`; the generated local config records deployment name
`anonymous-agent`, ports `3224`/`3225` and the pinned backend. The CLI-created
`.env.local` contains only target URLs/selection metadata in this private
worktree; no credential values were emitted. No application code was pushed.

The command then exited successfully because CLI 1.45.0's `--skip-push` branch
skips `devAgainstDeployment` and has no long-running supervisor after local
backend setup; its cleanup stopped the child backend. Read-only probes confirmed
both ports stopped. The native import was **not** run, so no restore proof or
archive mutation occurred. The empty-target pre-start guard passed, but the
native provider `requireEmpty` guard was not reached.

This exposes a precise execution blocker: the maintained CLI has no persistent
no-push backend command. Keeping the backend alive would require either a direct
local-binary launch with the saved local instance secret or a custom wrapper,
which is outside the approved no-credential/custom-engine boundary. Do not race
the one-shot process or pass secrets through a new script. The private
task-created worktree/state is retained for coordinator review; the existing
local deployment/data remains untouched. Issue 31 remains **open**.

### Subagent receipt — native data-only restore proof — 2026-09-05

The native import completed in the fresh anonymous local target
`anonymous:anonymous-agent` at
`/Users/joelchan/.codex/agentic-economy/convex-restore-31-20260905/`, using the
approved immutable source archive and the native default `requireEmpty` mode.
The installed CLI completed successfully. No application code was pushed; no
seed, mutation, action, scheduler or callback was run. Read-only root and
`agent` component inline-query checks passed with their outputs discarded.

The maintained CLI's read-only `_system/cli/tables` watch was used as the
task-local backend supervisor after the documented `--skip-push` startup
branch exited; this did not push code or invoke app functions. After proof,
that supervisor/backend was stopped. The original local deployment and data
remain untouched.

Installed CLI source confirms that `convex import` itself does not call
`withRunningBackend` or start a stopped backend: `src/cli/convexImport.ts`
loads the selected credentials with the default `ensureLocalRunning: true`,
and anonymous selection delegates that check to `assertLocalBackendRunning`.
The import implementation sets native default mode `requireEmpty` and then
uses the selected deployment's HTTP import endpoints. By contrast, the
maintained `convex run` command wraps its action in `withRunningBackend`,
whose local path starts an ephemeral backend from saved config and cleans it
up after the action. This is the read-only supervisor used for this proof.

Native target export:
`/Users/joelchan/.codex/agentic-economy/convex-restore-31-20260905/validation/target-native-export.zip`, mode `0600`, SHA256
`21136301c2c839eec9da3c1179ad7b1ecc9e4fab980ab91761db3e8093aa5b7a`.
`unzip -tq` and `zip -T` passed. Metadata and canonical content digests
matched the immutable source without emitting rows or file contents: 355
members; 182 `documents.jsonl` entries (90 root, 92 nested/component); 15
component paths; 544 document rows; document-member digest
`563cc03b70a7c88d6f8ef2516ca79fa7f648787bc1a7cb5bf2e85dc8de611e6a` on both;
22 storage payloads totaling 25,110 bytes; storage digest
`8e92dad0e15aa8d7450edcabfac73d3a516403f3cb319f7a0ddd89ffbae1e6fb` on both.
The target identity remained `anonymous:anonymous-agent` on ports `3224`/`3225`
with the pinned backend and no cloud project. Both target ports and the
existing source ports `3212`/`3213` are stopped. The private restored state
and validation export are retained as recovery evidence.

This proves native data/table/component/storage restoration only, not
functional component execution, cron or other scheduled work, callbacks,
external effects, or hosted cutover. Native backup/restore excludes code,
environment variables and pending scheduled functions; no code was pushed.
The incident notice is intentionally limited to the corrected wording above:
local admin-key/instance-secret fields appeared in agent tool output, which
may be retained in the transcript; exact values are not recorded, and no
hosted secret fields are identified. Issue 31 remains **open**.
