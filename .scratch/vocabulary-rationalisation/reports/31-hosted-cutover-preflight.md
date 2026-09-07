# Hosted-test cutover preflight report — vocabulary rationalisation

Status: partial; cutover blocked
Ticket: [Prepare the hosted-test cutover target, backup proof and rollback boundary](../issues/31-hosted-cutover-preflight.md)
Operator: Luna Max / refactor_cutover_preflight
Prepared at: 2026-09-05

The completed read-only evidence is maintained in the single
[operational preflight report](../../../docs/operations/vocabulary-cutover-preflight.md).
This issue receipt links that report; it does not duplicate its target inventory.
No reset, deployment or external financial action was performed.

## Historical preparation worksheet (superseded by the linked report)

| Boundary | Registry candidate | Confirmation |
| --- | --- | --- |
| Environment | `package4-release`, synthetic/non-production, fixture-only money mode | Pending snapshot |
| Vercel | `agentic-economy-package4-release` / canonical `vercel.app` URL | Pending inspect |
| Convex | development deployment `fastidious-barracuda-66` | Pending target proof |
| Identity | Clerk test instance recorded in registry | Pending identity proof |
| Processor | Stripe sandbox, webhook snapshot and Accounts v2 destinations | Pending endpoint/secret-binding proof without reading secrets |
| Financial edge | Protected Formance `formance-release.aecon.ai` | Pending unauthenticated 401 and health proof |
| Infrastructure | Private AWS RDS/k3s path, `ap-southeast-2` | Pending account/role/health proof |

Registry capture: `2026-09-04T08:48:02Z`, source revision
`8621ef3f3017a0e2ebe19c6277da98f7d5488909`. Treat it as an inventory lead,
not current live evidence.

## Required readiness matrix

| Gate | Evidence / receipt | State |
| --- | --- | --- |
| Exact local and hosted targets | Redacted IDs, project links, source revisions and environment class | Pending |
| Callback and queue isolation | Stripe routes, inbox Workpool, scheduled work, dispatch/cleanup/recovery jobs | Pending |
| External financial accounting | Stripe/Formance/x402 testnet effects and reconciliation boundary | Pending |
| Backup scope | Fresh native Convex export (deployment-wide, file storage included) plus infrastructure backup coverage | Captured; archive integrity verified |
| Restoration demonstration | Receipt, restored namespace/target and verification result | Blocked; isolated target unresolved and restore not executed |
| Clean backend/fresh seed | Existing supported procedure and repeatability guard | Pending |
| Maintenance window | Pause, pending-Call/job account, reopen gate | Pending |
| Rollback | Matched app/backend/data state and external-effect stop/reconcile rule | Pending |
| Production exclusion | Explicit proof no production/mainnet target is touched | Pending |

## Current blockers

- Hosted test has 20 pending funding commands, 18 carrying external/provider
  references. Reconcile their external state before any destructive reset.
- Convex backup integrity is now verified; isolated Convex restoration/component proof and callback isolation are outstanding.
- Local backend was stopped; local data proof is separate from hosted proof.
- Matching refactor application/backend/clients have not been deployed.

Unrelated alert/cost gaps in the operational report do not extend this refactor.
No hosted blocker erases source implementation or independently obtained local
proof. Local reset still requires its own verified backup and exact target.

## Closure receipt

Read-only inventory received and reviewed by the coordinator. Issue 31 remains
open for current backup/restore, external-state reconciliation and executable
isolation/rollback proof. The private source archive is not database proof.

### Non-deploying generator check — 2026-09-05 09:10 UTC

The coordinator's existing snapshot confirmed test health/readiness (200),
unchanged old release revision `6593dbe7b4b8f75304caeed5b468acc497b720f4`,
protected Formance edge (401), and Stripe inbox health 0/0/0. The snapshot was
incomplete with five explicit skips, not an operational pass. Native Convex
codegen dry-run against exactly `dev:fastidious-barracuda-66` exited 0; all five
generated Convex files and the route tree still matched the source backup.
[Issue 22](../issues/22-regenerate-shared-artifacts.md) records the approved
non-deploying generator target, independently of this issue's destructive
reset/cutover gates. No deployment, data mutation or local backend restart
occurred. The pending funding, backup/restore and callback blockers remain.

### Fresh native Convex backup receipt — 2026-09-05 10:21 UTC

This bounded receipt classifies the operation as inventory/backup capture. The
current target readback completed before capture against the exact
development/synthetic release selector `dev:fastidious-barracuda-66` with all
ambient Convex deployment keys, deployment tokens, self-hosted selectors and
verbose logging variables blanked for the process. The synthetic release
health, readiness and release probes were HTTP 200; the reported hosted source
revision remained `6593dbe7b4b8f75304caeed5b468acc497b720f4`. The exact Convex
Stripe inbox readback returned `stalled=0`, `failed=0` and
`reconciliationRequired=0`. No source, deployment or data mutation occurred
during the readback.

The installed official Convex CLI is `1.45.0`. The project runtime was Node
`v22.22.0` and npm `11.5.1`. The native command used the approved process-scoped
selection and included file storage:

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

The native export completed at `2026-09-05T10:21:44Z` and produced the only
archive in the new private directory
`/Users/joelchan/.codex/backups/agentic-economy/convex-native-20260905-102139/`:

`snapshot_fastidious-barracuda-66_1788603701438628839.zip`

The directory is mode `0700`; the archive is mode `0600` and 229,603 bytes.
Its SHA-256 is
`14a276d8b2d05caede5f155367cd0a8feffd8192d21c775fa5a721a38c3a9cbe`.
Native export completion, `unzip -tq` and `zip -T` all exited 0. Metadata-only
archive inspection found 355 members, 182 `documents.jsonl` members and 23
file-storage members, including the native `_storage` area. No rows, file
contents, credentials or provider payloads were emitted or retained here.

The CLI/source supports deployment-wide export and the
`--include-file-storage` flag. It has no export-specific `--component` flag;
the request is the deployment snapshot endpoint with `includeStorage=true`.
The deployment declares 11 mounted component instances. Their data is covered
only by the deployment-wide snapshot semantics; there is no independently
selectable per-component export or per-component restore receipt in this
capture. The official Convex backup contract excludes code/configuration,
environment variables and pending scheduled functions, so the archive is not
a backend, callback, queue or runtime backup. Component table/queue
verification remains part of the unexecuted isolated restore proposal below.

### Read-only isolated restoration proposal — not executed

Convex's supported restore path is a native ZIP import (or the dashboard
restore action) into a different deployment. The official import path preserves
document IDs/creation times and imports `_storage` when present, but it is
destructive when replacement flags are used. The following is a coordinator
review proposal, not an executed command:

1. Resolve and read back an existing, non-authoritative empty development
   deployment in the same Convex project. The exact selector is intentionally
   **NOT RESOLVED** in this receipt; do not substitute `dev`, the source
   deployment, the project default production deployment or a guessed name. If
   no such target exists, stop for explicit target-bound approval; do not create
   a project or infrastructure as part of this ticket.
2. Prove the target is not bound to the canonical Vercel alias, Stripe
   destinations, provider callbacks, Formance edge, CDP/x402 custody or any
   customer identity. Keep external credentials absent, keep test callbacks
   isolated, and account for all pending Calls, workpool/workflow rows and
   scheduled work before opening the target. The source's 20 pending funding
   commands (18 with external/provider references) still require exact Stripe
   and Formance reconciliation before any source reset or cutover.
3. After separate coordinator approval, place the matching approved backend
   source and 11 component mounts on that isolated development deployment via
   the existing `npx convex dev` procedure. Do not use `convex deploy` with a
   `CONVEX_DEPLOYMENT` variable because the installed CLI documents that form as
   the project default production target. No application or external action is
   part of the restore proof.
4. Verify the target is empty and import the unchanged private ZIP with the
   same blanked process-scoped selectors, omitting `--prod`, `--replace`,
   `--replace-all`, `--append` and `--component` so a non-empty target fails
   rather than being overwritten:

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

5. Use only supported read-only CLI queries after import. Compare bounded
   counts/digests for application tables, `_storage` metadata/files, root
   scheduled/workpool/workflow state and each declared component through the
   CLI's `data`/`run --component` selectors. Keep any transient raw readback in
   a mode-`0600` file and retain only aggregate receipts; do not print rows or
   file contents. A component or queue mismatch, target binding, callback,
   credential or external effect is a failed isolation proof.
6. Reopen the cutover gate only after the isolated comparison passes, the 20
   pending financial records have an exact no-replay disposition, callback and
   queue isolation is evidenced, and the matched application/backend/data
   rollback is recorded. If any new external effect occurs, stop and reconcile
   it before cleanup or rollback; never import over the authoritative source.

This proposal remains unexecuted: no import, restore, target creation, backend
start, deployment, callback change, credential read, financial command or
external effect was performed. The fresh archive proves backup integrity, not
database restoration. Ticket 31 therefore remains open and cutover remains
blocked on an approved isolated target, restoration/isolation proof, pending
funding reconciliation and callback/job accounting.
