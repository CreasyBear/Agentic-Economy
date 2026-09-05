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
| Backup scope | Supported Convex and infrastructure backup coverage | Pending |
| Restoration demonstration | Receipt, restored namespace/target and verification result | Pending |
| Clean backend/fresh seed | Existing supported procedure and repeatability guard | Pending |
| Maintenance window | Pause, pending-Call/job account, reopen gate | Pending |
| Rollback | Matched app/backend/data state and external-effect stop/reconcile rule | Pending |
| Production exclusion | Explicit proof no production/mainnet target is touched | Pending |

## Current blockers

- Hosted test has 20 pending funding commands, 18 carrying external/provider
  references. Reconcile their external state before any destructive reset.
- Current Convex export/restore proof and callback isolation are outstanding.
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
