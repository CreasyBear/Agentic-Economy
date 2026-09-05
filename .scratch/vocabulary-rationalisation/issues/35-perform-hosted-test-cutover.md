# Perform the coordinated hosted-test cutover

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / hosted test deployment-operations owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34

## Outcome

Run the approved maintenance-window cutover of the renamed application,
Convex backend and matching clients in the existing synthetic hosted-test
environment. Pause and account for all pending work, prove backup/restore and
external financial reconciliation first, deploy through the existing projects,
repeat live acceptance, and reopen test activity only after the candidate is
verified. This issue never promotes synthetic state to production or creates a
new Vercel project.

## Exact target card and current blockers

Resolve every field from live readback immediately before mutation. The
preflight card is a lead, not permission to act:

- Environment: `package4-release`, synthetic/non-production, Stripe sandbox,
  fixture Formance value and Base Sepolia testnet only; never promote in place.
- Web project: Vercel `agentic-economy-package4-release`, project
  `prj_ADlGp7Fkox0D2MsAq0RkL3oaNFFn`, canonical URL
  `https://agentic-economy-package4-release.vercel.app`; observed alias
  deployment `dpl_4eu4Fnn5EydfJybpixbY7t7h4QyZ`, staged candidate
  `dpl_BHhR2rMv3oWkAzWZw3BXNvMGUX95` (ready but unpromoted at preflight).
- Backend: Convex development deployment `fastidious-barracuda-66`, linked to
  the synthetic release project; the local `.vercel/project.json` points at
  the separate primary project and is not an implicit binding.
- Identity: Clerk test application `app_3Io6c0wmApyND4IBtoeomurojqj` and
  instance `ins_3Io6c2NfCPqxUqJI3Vx3Jvc37V9`.
- Financial authority: Formance edge `formance-release.aecon.ai`, ledger
  `agentic-economy-release`; Stripe sandbox account `acct_1Tlni770N4UjLqHt`;
  Base Sepolia/x402 only for the selected testnet proof.
- Infrastructure: AWS account `197716152388`, `ap-southeast-2` primary,
  `ap-southeast-4` DR, private k3s `i-063c00d935d85d74f`, private RDS
  `package4-release-formance`.

Before any reset or deployment, reconcile the fresh hosted census: 25 funding
commands total (20 pending, 4 succeeded, 1 reversed), with 18 of the 20
pending commands carrying external/provider references and none carrying an
applied Stripe event or applied Formance transaction reference. Calls, Quotes,
x402 attempts, Provider obligations, Stripe inbox rows and reconciliation
cases were all zero at preflight; 21 Provider connections and 11 issued money
documents existed. The 350 historical scheduled-function rows were successful
but still require maintenance-window accounting. Do not clear, replay or
restore over this value-bearing state until issue 31 records exact external
readback, a no-replay disposition and fresh native Convex backup/restore proof.

The replacement Stripe snapshot `we_1UBshw70N4UjLqHtRdcPu1FS` and Accounts v2
destination `ed_test_61VLGGSYypj7Fpg7S16UvBfU9V8SqsP28ZeVu4UQaVMO` were disabled
at preflight; the enabled endpoint `we_1UBYM070N4UjLqHtknl4R8Ep` was unpinned
and had an extra `checkout.session.expired` event. Callback cutover therefore
requires the existing rollout procedure, restricted key bindings and replay/
Connect canaries. The old hosted alias reported source revision
`6593dbe7b4b8f75304caeed5b468acc497b720f4`, older than the current checkout;
do not call it refactor proof.

## Finite operational read/write/output allowlist

Read the following exact operational, deployment and release records before
acting:

- `docs/operations/deployment-registry.yaml`
- `docs/operations/deployment-architecture.md`
- `docs/operations/deployment-commands.md`
- `docs/operations/aws-foundation.md`
- `docs/operations/deployment-maturity.md`
- `docs/operations/vocabulary-cutover-preflight.md`
- `docs/guides/package-4-operations.md`
- `docs/guides/package-4-release-evidence.md`
- `infra/package4/README.md`
- `src/lib/deployment/manifest.ts`
- `.vercel/project.json`
- `.agents/skills/deployment-operations/scripts/deployment_snapshot.sh`
- `.agents/skills/deployment-operations/SKILL.md`
- `.scratch/vocabulary-rationalisation/issues/31-hosted-cutover-preflight.md`
- `.scratch/vocabulary-rationalisation/reports/31-hosted-cutover-preflight.md`
- `package.json`
- `tools/dev/local-dev.mjs`

The only repository write/output paths are these operational records and this
ticket's closure receipt:

- `docs/operations/deployment-registry.yaml`
- `docs/operations/deployment-maturity.md`
- `docs/guides/package-4-release-evidence.md`
- `.scratch/vocabulary-rationalisation/issues/35-perform-hosted-test-cutover.md`

Provider resources and the named synthetic Convex/Vercel/Stripe/Formance
targets are external mutation targets, not repository files. Do not edit issue
31, source, generated artifacts, tests, plan/map/work record, Package 6/7
records, backup archives or infrastructure definitions from this ticket.

## Cutover sequence and gates

1. Resolve and record the live target card, full source SHA, provider project/
   deployment IDs, Clerk instance, Stripe mode, Formance ledger, AWS account/
   region, Cloudflare hostname, payment mode, blast radius and rollback
   boundary. Stop on any identity drift or missing field.
2. Pause new hosted test activity. Account for pending Calls, callbacks,
   scheduled functions, Convex Workpool jobs, Stripe inbox deliveries and
   Formance work. Keep status and exact-reference recovery available.
3. Obtain issue 31's fresh native Convex export/snapshot and restoration proof
   for `fastidious-barracuda-66`, and its exact supported clean-data operation
   in the existing project structure. The RDS drill is not Convex proof; the
   dated Convex export reference is not current proof. If issue 31 has not
   closed these gates, stop without mutation.
4. Reconcile all 20 pending funding commands, especially the 18 with external
   or Provider references, against Stripe and Formance through restricted
   readback. Record exact references, status and the no-replay decision. Stop
   on partial, conflicting or unavailable evidence.
5. Deploy the renamed schema/backend and matching clients through the existing
   `package4-release` project and approved Convex procedure. Reconnect test
   identities and seed fresh data only after the matched backup/restore and
   clean-backend proof. Do not use a second project, archive table rename,
   migration engine or production deployment.
6. Complete the existing Stripe replacement-destination rollout: deploy the
   backend route and restricted readback/command bindings, pin the replacement
   snapshot to API `2026-07-29.dahlia`, remove the unexpected event, enable the
   thin Accounts v2 destination, and run exact Checkout replay and Accounts v2
   canaries. Preserve duplicate/conflicting-event handling and do not retrieve
   or record secrets.
7. Repeat issue 34's live journeys against the deployed candidate: sign-in,
   Account/Agent credentials and permissions, Tool → Quote → useful x402 Call,
   blocked/expired/uncertain/recovery, Provider publish/withdraw and money
   records. Verify the same Call and no duplicate financial effect.
8. Reopen hosted test activity only after all acceptance results, callback
   isolation and rollback evidence pass. Update the three operational records
   with observed identities, times and bounded references; do not mark
   production or Package 6/7 complete.

## Existing verification commands and expected results

Use the exact commands from `docs/operations/deployment-commands.md` and the
deployment-operations skill; do not invent flags or use ambient projects:

```sh
git branch --show-current
git rev-parse HEAD
git status --short
aws sts get-caller-identity \
  --profile package4-release-deployer \
  --output json
npx vercel@59.11.2 inspect \
  https://agentic-economy-package4-release.vercel.app \
  --scope creasybears-projects
curl --fail --silent --show-error \
  https://agentic-economy-package4-release.vercel.app/api/health
curl --fail --silent --show-error \
  https://agentic-economy-package4-release.vercel.app/api/ready
curl --fail --silent --show-error \
  https://agentic-economy-package4-release.vercel.app/api/v1/release
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  https://formance-release.aecon.ai/_healthcheck
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run verify:deployment-manifest -- --environment development
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:e2e:authenticated:required
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:imports
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run build
```

The AWS caller must be account `197716152388` and the expected
`Package4ReleaseOpenTofu` role. Health, readiness and release must identify the
same candidate and source SHA; unauthenticated Formance must return `401`.
The native Convex backup/restore command is intentionally not repeated here:
issue 31 must provide the exact supported operation and restored target before
dispatch, so this ticket cannot guess a flag or use `dev --once` as a reset.
The application/client checks must pass on the deployed candidate; baseline
failures, environment skips and missing external proof remain explicit.

## Rollback boundary and exclusions

Rollback restores the matched previous application/backend configuration and
retained data in the same synthetic project. If any new Stripe/Formance/x402
effect occurred, stop, read exact references and reconcile it before rollback;
never replay it or restore over it blindly. Keep the isolated RDS recovery drill
retained until Joel approves evidence cleanup and run its exact-name cleanup
path before any reviewed destroy plan.

- Do not touch production/mainnet, the primary Vercel project, the production
  Convex deployment, domains, a new Vercel project or historical evidence.
- Do not mutate pending funding rows, enable callbacks, retrieve secrets, use
  `convex env list`, query PostgreSQL as a product API or bypass Cloudflare.
- Unrelated alert/cost gaps do not extend this refactor acceptance, but a
  missing backup, target identity, value-bearing reconciliation or isolation
  proof is a hard cutover blocker.

## Acceptance

- [ ] Issue 31 supplies fresh native Convex backup/restore and exact clean-data
      procedure, plus the 20-pending-funding/18-external reconciliation and
      no-replay record, before any destructive operation.
- [ ] A target-bound maintenance window accounts for Calls, callbacks,
      scheduled functions, Workpool jobs, Stripe inbox and Formance work.
- [ ] The renamed backend/schema, matching clients and fresh seed are deployed
      only through the existing synthetic project; old callbacks and queued
      work cannot act on the fresh dataset.
- [ ] Stripe replacement/Accounts v2 callback rollout and canaries pass with
      exact event/idempotency evidence and no secret disclosure.
- [ ] Issue 34's live journeys pass against the deployed candidate, including
      useful x402 Call, refusal/uncertainty/recovery, Provider withdrawal and
      money/business records; no duplicate external effect occurs.
- [ ] Rollback evidence, registry/maturity/release records and reopen decision
      are attached; production, Package 6/7 and unrelated work remain held.

## Closure evidence

Attach the resolved target card, pre/post source SHAs, deployment IDs, Convex
backup/restoration references, pending-funding reconciliation, callback and
queue census, client/build results, live journey references, external
financial readbacks, rollback boundary and the three updated operational
records. Keep the issue open for any unverified hosted behavior, missing native
restore proof or unresolved external financial effect.
