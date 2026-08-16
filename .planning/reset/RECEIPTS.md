# Atomic Operation Market Reset — Receipts

Measured evidence per card. Append-only. Cards defined in [`CARD-LEDGER.md`](CARD-LEDGER.md).

## P0-a — Stash triage

**Verdict: abandon all 13, archived as recoverable tags.**

Every stash was created on retired branches (`gsd/plan-21.7`, `gsd/execute-21.6`,
`codex/stabilize-working-tree`) against an architecture that no longer exists. Path existence
check on the current tree: every touched path is dead.

| Dead path family | Present today |
| --- | --- |
| `convex/ownerInbox.ts`, `convex/ownerInboxDashboard.ts`, `convex/ownerInbox/` | no |
| `src/views/inbox/`, `src/routes/dashboard.inbox.tsx` | no |
| `src/lib/billing/` (`outcomeBilling.ts`, `moneyMovementGate.ts`) | no |
| `src/lib/convex/runtimeStores/`, `src/lib/inbox/` | no |
| `src/routes/v1/agents/chat-sessions.ts` | no |
| `tests/security/` | no |
| `.planning/OUTCOME-VOCABULARY.md`, `.planning/SCHEMA.md` | no |

No unique surviving work exists in any stash: outcome-billing was superseded by
`src/modules/money`, owner-inbox by the operator supply surfaces, and the agent chat-session
routes by `src/modules/answer-thread`. Restoring any stash would resurrect deleted modules.

Archive tags (recoverable via `git stash apply <tag>` or `git show <tag>`):

| Tag | Commit | Origin |
| --- | --- | --- |
| `archive/stash-00` | `1b5d2cba` | gsd/plan-21.7 pre-main-integration dirty state |
| `archive/stash-01` | `561991d0` | ownerInbox drift |
| `archive/stash-02` | `c5bbd1d8` | final unrelated churn isolation |
| `archive/stash-03` | `ab28a444` | dashboard inbox route drift |
| `archive/stash-04` | `dbde3a65` | inbox drift |
| `archive/stash-05` | `893591ae` | 21.7 planning-closeout source drift |
| `archive/stash-06` | `017448af` | pre-restore dirty on gsd/plan-21.7 |
| `archive/stash-07` | `0481ef94` | post-21.6-merge billing churn |
| `archive/stash-08` | `2199ce82` | pre-21.6 branch cleanup |
| `archive/stash-09` | `325b149b` | post-21.6-closeout billing drift |
| `archive/stash-10` | `385e8235` | post-21.6 execution churn (42 files) |
| `archive/stash-11` | `9208ebb4` | 21.6-wave1-isolation (16 files) |
| `archive/stash-12` | `75fd8cc2` | pre-21.6-execution churn isolation |

Stash list cleared after tagging. Per the operating model, any new stash after Phase 0 is a regression.

## P0-d — Source gate on the baseline

**Verdict: gate red at the baseline tag; two independent causes, both now closed.**

`npm run test:release:source` fails closed at `verify:deployment-manifest` for missing
operator-owned production configuration (Stripe, x402, Clerk, Convex, source-write keys). That is
the intended production posture, not a code defect, and it is unchanged by this reset.

Running past it via `test:release:source:after-codegen` exposed two real defects that the outer
failure had been masking:

| Failure | Cause | Closed by |
| --- | --- | --- |
| `tests/unit/schema/convex-schema.test.ts` | inventory missing `moneyExternalSpendReservations` | baseline slice commits |
| `tests/unit/action-invocation/development-host-parity.test.ts` | dev fixture returned an unencoded `payment-response`, so the new settlement verifier refused before output validation | `fe5812cb` |
| `tests/imports/backup-imports.test.ts`, `private-imports.test.ts` | settlement work imported `@x402/core/http` and `viem` directly and reached into `internal/` across modules | `c69f2d60` |
| `tests/imports/ts-standards.test.ts` | double cast through `unknown`, non-null assertion, `Promise<unknown>` | `5132efbd` |

The ts-standards suite runs *after* `test:release:unit` in the gate chain, so the earlier unit
failure meant it had never executed. Gate ordering hid three violations for the length of the
settlement work — worth remembering when a gate is red for a known reason.

## P1-b — Qualified Use delivery receipts

**Commit `941d6a06`. Clean tree.**

ADR-034 specified Delivery / Qualified Use receipts; nothing implemented them. A Qualified Use is
one authorized production invocation whose pinned contract accepted the input and whose terminal
supplier result passed output and evidence validation. It is evidence only — Action Invocation
stays the lifecycle authority and the money ledger stays the economic authority.

| Artifact | Path |
| --- | --- |
| Domain model, eligibility, write decision | `src/modules/money/internal/delivery.ts` |
| Durable table (4 indexes) | `src/modules/money/internal/convex-schema.ts` |
| Insert-once mutation + owner-bounded readback | `convex/qualifiedUse.ts` |
| Hook at contract-valid terminal dispatch | `convex/capabilityOperationInvocationWorker.ts` |

Immutability is enforced by decision, not convention: an exact repeat of an identity replays the
original receipt, and the same identity carrying changed material is refused as
`qualified_use_identity_conflict` rather than reconciled. Corrections must append facts elsewhere.

Five exclusions keep the metric honest — payment authorization, HTTP success, and provider
assertion are each insufficient alone: `non_production_environment`, `delivery_not_contract_valid`,
`outcome_uncertain`, `owner_self_invocation`, `refunded_before_delivery`. Owner self-invocation is
re-checked inside the mutation because it needs durable state to resolve the owner behind the
principal.

Measured: `npm run typecheck` clean, `npm run lint` clean, 140 tests green across
`tests/unit/money`, `tests/unit/schema`, and the worker suite. New coverage asserts digest
stability under evidence reordering, per-generation identity separation, each exclusion, and
replay-versus-conflict.

## HK-ts-standards — TypeScript standards fix card

**Commit `5132efbd` (+ codegen `c027a315`). Clean tree.**

Three violations, each fixed at the cause rather than the symptom:

| Violation | Fix |
| --- | --- |
| `as unknown as Record<string, string \| undefined>` on the Convex `env` | declared `AE_X402_RPC_URLS_JSON` in `convex/convex.config.ts` so the typed env exposes it |
| `.accepts[0]!` in the dev host fixture | destructure and throw `development_challenge_missing_requirement` |
| `Promise<unknown>` from the guarded RPC reader | return a `{ kind: 'result'; value } \| { kind: 'unavailable' }` envelope, which also stops an absent result from reading as a null one |

`npm run test:ts-standards` green; 771 tests across `tests/unit/action-invocation` and
`tests/unit/capability-supply` green.

## Known open — HK-faux-runtime

`tests/imports/faux-runtime-surfaces.test.ts` is red on
`src/modules/capability-execution/operation-approval.functions.ts:50,57`, which calls
`isLocalE2EAuthBypassEnabled()` inside a deployable target graph. This suite is not wired into any
release script, so it never blocked a gate. The fix is a behavioral decision — the precedent is
`tests/helpers/inquiry-local-e2e-adapter.ts`, where the bypass affordance was moved to the test
helper layer — so it is carded rather than patched in passing.

## Phase 1 reconnaissance — three plan corrections

Four read-only agents mapped the Phase 1 cards against the actual code before any card was
written. Three findings changed the plan.

### P1-a is not a re-key

The card assumed buyer money was keyed on something re-keyable to an organization `accountId`.
It is keyed **per API key**: `principalId` is literally `clerk_api_key:{keyId}` and the ledger
account ref is `clerk_api_key:{keyId}:{currency}` (`src/modules/money/internal/ledger.ts:119-121`).
No organization concept exists in the money module. Clerk's `orgId` is captured at auth and
deliberately ignored for billing, with a test pinning that
(`tests/unit/server/agent-access-auth.test.ts:34-48`). The console sums per-key balances and tells
the user "Keep credit separate for each assistant"
(`src/components/ae/console/AeAgentOperatorConsole.tsx:109`).

**Founder decision:** the account keys on the existing Clerk `ownerId`, not a Clerk organization.
`ownerId` is already the money authorization authority (`convex/moneyLedger.ts:1457-1480`), so
pooling funds there needs no new identity provider wiring. The console becomes one pooled balance
showing each key's grant and usage against it, which is why per-key attribution
(`principalId`/`credentialId` on transactions, usage, and budget rows) is retained rather than
replaced. Buyer refs become `owner:{ownerId}:{currency}`; the `account:` prefix was rejected
because supplier provider connections already use it for OAuth resources.

### The brokered-only rule is not enforced today

The plan treats "V1 money is AE-brokered only" as settled policy. It is not implemented. The
invocation worker selects `economicRail: 'provider_direct_x402'` for any operation with
`adapterId === 'x402-fetch:v2'` (`convex/capabilityOperationInvocationWorker.ts:406-407`) and that
branch skips `moneyLedger.authorizeInvocationCharge` entirely. An x402 operation moves real money
outside AE's ledger, so AE cannot validate before settlement, take rake, or own the dispute.

Closing this refuses the lane in production only. Non-production keeps the path alive because the
development host-parity and provider-conformance scenarios are the only executable proof of the
x402 machinery, and the guardrails forbid retiring a proof without an equivalent.

### `/execute` is already the paid invoke path

`/api/v1/operations/execute` serves `operation.invoke` behind bearer auth and source-write
admission. Anonymous keyless `operation.execute` is MCP-only and has no HTTP route at all. So P1-e
is a rename plus two projection fields, not a new capability, and it needs no new registered
action — the frontier manifest pins the action inventory exactly
(`tests/imports/product-frontier-manifest.test.ts:41-57`) and adding `operation.call` would break
it for no gain.

Also noted for P1-d: operation gateway routes carry no HTTP-edge rate limit at all. Limits are
enforced inside Convex at reservation time (`convex/capabilityOperationInvocations.ts:470-483`), so
any new gateway route added outside that path would be unlimited.

### Pre-existing defect found, not yet carded

First period accrual creates a `moneyPayouts` row in `held_threshold` with `minimumPayoutUnits`
zero (`convex/moneyLedger.ts:1233-1244`), and `beginPayoutTransfer` can then proceed without the
period being closed or the review window being reached. `payoutReviewWindow`
(`src/modules/money/internal/payout-policy.ts:130-149`) exists but is never wired to settlement.
P1-d absorbs this.

### P1-f and P1-g — the plumbing exists, the surfaces do not

Publish, withdraw, and earnings are all fully implemented as owner-authenticated Convex mutations
and TanStack server functions over the existing OpenAPI and MCP importers
(`src/modules/capability-supply/internal/publication-importers.ts`,
`internal/publication/publish.ts`, `internal/publication/withdraw.ts`,
`convex/moneyLedger.ts:7700`). What is missing is only the standard-artifact action layer: no
`supply.publish`, `supply.withdraw`, or `supply.earnings` exists in the registry. P1-f is therefore
a surfacing card, not a build-from-scratch card, which is what the plan intended.

Two things P1-f must settle before it can be written as a no-discretion card:

1. **Authority.** Publishing today requires an authenticated Clerk owner passing both
   `requireSourceWrite('catalog_publish')` and `ownsPublishedBusiness`. Exposing supply writes as
   standard actions means deciding whether an agent API key may publish on behalf of its owner's
   business, and under which scope. That is a new write authority for agent keys and needs a
   founder decision before dispatch.
2. **Action budget.** The registry holds 43 actions and the frontier manifest pins the inventory
   exactly (`tests/imports/product-frontier-manifest.test.ts:41-57`), so three new actions require a
   manifest update. The end-state guardrail targets roughly 14 active actions; the reduction comes
   from quarantining the 13 `customerRequest.*`, 8 `workTree.*`, and 2 `study.*` actions in Phase 5,
   not from refusing supply actions the target product requires.

Incidental find: `storefrontImportDraftAction` is imported into `src/modules/actions/index.ts:55`
but never added to the `actions` array, so it is registered nowhere and reachable through no
surface. Dead import, carded separately rather than swept up here.

For P1-g the evidence spine already persists market tool calls: `answerToolCalls` rows carry
`toolId` of `operation.execute` or `operation.invoke` with input, result, and result hash, and
`answerTurns.evidenceJson` freezes the operation artifacts. The gap is narrower than the card
implies. The model calls a dynamically named tool `capability.{operationRef}`
(`answer-tool-use-agent.ts:2267-2320`) but execution is recorded under the canonical
`operation.execute` identity, so an audit cannot reconstruct which model-facing tool produced a
given call. The broker `invocationRef` also has no dedicated evidence field. Both are attribution
gaps rather than missing persistence, so P1-g-1 is scoped to identity and cross-reference.

P1-g-2 (traffic instrumentation) split out and dispatched independently: it shares no files with
the evidence work and unblocks the frozen-surface retirement decision, which needs measured data
rather than a guess.

## Orchestration correction — first Phase 1 dispatch wave withdrawn

**Four executor cards cancelled mid-run. No product branch was touched.**

The first wave diverged from the operating model in three ways, all of them the orchestrator's
error rather than any worker's:

1. **Executors self-certified.** Each card told one agent to make the change, run its own
   acceptance gates, and write its own commit. That collapses executor, validator, and committer
   into a single role and contradicts hard rules 5 and 6 and the pipeline diagram. The point of
   separation is that a diff arrives for review without a green label already attached to it.
2. **Two parallel cards claimed the same file.** `P1-e-1` and `P1-a-core` both listed
   `convex/capabilityOperationInvocationWorker.ts` in `ALLOWED_PATHS`, which hard rule 7 forbids and
   which would have collided on merge. The rule now carries an explicit pre-dispatch check.
3. **Workers ran on the reasoning model.** Cards are meant to remove discretion, so executing one
   does not need a model chosen for judgment. Model assignment per role is now pinned in the
   operating model.

Cancellation was clean. Two workers had already committed on their own isolated branches
(`p1-e-1-brokered-only-lane`, `hk-faux-runtime-bypass`); two had produced nothing and their
worktrees were removed. `main` never moved, the stash list stayed empty, and no orphaned worktree
was left behind.

The two surviving branches are not discarded — an executor commit on an isolated branch is exactly
the artifact the pipeline expects at that stage. Both were rebased onto current `main` and entered
the pipeline at the validator step, which is where they should have gone in the first place.

## P1-e-1 — Brokered-only payment lane

**Merged as `61624a78` + `0ea45ad6`. Executor → validator → reviewer → fix → re-validator → merge.**

The brokered-only rule existed only on paper. The invocation worker routed any operation with the
`x402-fetch:v2` adapter down a `provider_direct_x402` rail that skipped
`moneyLedger.authorizeInvocationCharge` entirely, so money moved between buyer and provider outside
AE's ledger and AE could neither validate output before settlement, take its rake, nor answer for a
dispute. `paymentLaneAdmission` now refuses that rail before any transport call or money mutation.

Refusal is scoped to production. Non-production keeps the direct rail because the host-parity and
provider-conformance scenarios are the only executable proof the x402 machinery still works, and
the guardrails forbid retiring a proof without an equivalent.

**Review caught two defects that a green suite could not.** Both matter more than the feature:

1. `refuseBeforeClaim` accepts `code: string` and Convex persists `code: v.string()`, so
   `payment_lane_not_brokered` compiled, stored, and passed 547 tests while being absent from
   `operationInvokeRefusalCodeValues` — the union every surface parses results against. HTTP, MCP,
   and CLI would each have rejected our own refusal as malformed and returned
   `operation_invoke_result_invalid` in place of the reason. A loosely typed parameter let a new
   failure mode reach production surfaces without appearing in any contract.
2. The admitted variant could not represent `lane: 'provider_direct_x402'`, so a sandbox
   provider-direct call was labelled `brokered`. Inert today, wrong the moment P1-e-3 sources a
   public `paymentLane` field from it.

`GATEWAY_PROBLEM_CODES` correctly needed no entry: domain refusals travel as HTTP 200 typed bodies,
and existing domain codes such as `grant_expired` are likewise absent from it.

## HK-faux-runtime — local-E2E authority relocated, not deleted

**Merged as `df107004` + `737ef01f`.**

The first attempt deleted two local-E2E guards from
`src/modules/capability-execution/operation-approval.functions.ts` after concluding they were dead
code. Review proved otherwise. These are `createServerFn` HTTP endpoints reachable independently of
the operator UI, and local E2E strips Clerk request middleware entirely (`src/start.ts:90`), so an
unauthenticated caller reaches the handler, which then authenticates to Convex with
`CONVEX_SELF_HOSTED_ADMIN_KEY` as `dev-seed-owner-session`. Convex checks only that an identity
exists and owns the row — and that subject *is* the seeded owner. Deleting the guards would have
moved an unauthenticated local caller from "refused" to "decides operation approvals as the owner".

The executor's investigation was not careless: it correctly verified the React tree short-circuits
before calling either function. It stopped at the component boundary, and these endpoints do not
care about the component.

The refusal moved to `src/lib/server/operation-approval-source.ts`, the layer that already owns
local-E2E authority alongside `local-e2e-bypass.ts`, `convex-source.ts`, and `rate-limit.ts`. The
guardrail bans this call inside listed deployable domain graphs, not everywhere, so relocation
honors its intent where deletion did not. Behavior was verified textually identical to the original.

**The deleted behavior had no test.** That is why removing it looked safe — the suite was green
because nothing described the behavior, not because the behavior was unnecessary. A test now pins
both guards and fails on either the wrong return value or an unexpected Convex call.

Non-blocking follow-up: `operation-approval-source.ts` takes its types from the `capability-execution`
module that imports its functions back. The type edge is erased at runtime and `lib/server` depending
on `modules/` for contracts is this repo's convention; only the back-edge to the same `*.functions.ts`
is unusual. Carded as cleanup.

## Measured: two failures that were not ours

A full-suite run on the brokered-lane branch reported the faux-runtime guardrail failing and a
market-terminal CLI test timing out at 30s. A differential against clean `main` settled both by
measurement rather than argument: the guardrail failed identically on base with the same violation
string, and base ran the full 4063-test unit suite with no timeout while the CLI test passed three
of three isolated runs on the branch. Load flake, not regression.

The guardrail red was self-inflicted card authoring — the validator was told to run all of
`tests/imports` on a branch that did not fix the one test known to be red there.

## Merged Phase 1 gate — green

`npm run test:release:source:after-codegen` exits 0 on `main` with both cards merged: lint,
typecheck, kernel retirement, product frontier, 498 unit files, 85 integration files, import
boundaries, ts-standards, SEO, UI contract, eval report, and build. The market-terminal CLI test
passed here too, independently confirming the earlier single timeout was load flake.

The outer `test:release:source` still fails closed at `verify:deployment-manifest` for missing
operator-owned production configuration. That is the intended posture and is unchanged by the reset.

## Founder decisions — P1-f supply authority

Agent keys may publish supply under a new narrow scope, bound server-side to a business their owner
already owns. The V1 acceptance packet requires an independent supplier to publish from its own
descriptor with no AE operator intervention, so keeping publishing human-only would leave supply
non-agent-native while the demand side is fully agent-callable. The binding is resolved from the
key's registered owner, never from caller input, so a key cannot reach another owner's business.

Withdraw drains rather than cancels: in-flight invocations finish and settle, and withdrawal only
stops new ones. The buyer of an already-authorized call is owed delivery or a refund, and cancelling
mid-flight would create exactly the unresolved-outcome state the money model works to avoid.

## P1-a-core — validator RED, partially unattributable

Branch `p1a-core-owner-account` at `c792f9c3`. Lint, targeted money/schema units, ts-standards, and
product frontier passed. Typecheck and four suite commands failed.

Two failures are deterministic and branch-caused:

- `npm run typecheck` — `tests/unit/ui/demand-console.test.tsx:53` omits the now-required
  `accountId` on the demand console fixture.
- `tests/unit/convex/money-ledger-pagination.test.ts:168` — the usage-summary readback returns
  `{ kind: 'refused', code: 'billing_identity_missing' }` where it previously returned the summary.
  This is an assertion failure, not a timeout, so load cannot explain it.

The remaining failures are **not attributable from this run**: 29 integration failures across 7
files, plus three unit/imports failures, are all bare `Test timed out` at the suite's 5s/15s/30s
budgets, with no assertion text. This validator ran concurrently with the P1-e-2 validator on the
same machine, and both were executing full suites. Concurrent CPU starvation produces exactly this
signature. `main` was measured green on 85 integration files at `fd833e0b` and has since taken only
docs commits, so the baseline is not in question — the attribution of these specific timeouts is.

Orchestration fault, not worker fault: the two validators were dispatched in parallel. Rule 7a now
forbids concurrent full-suite validation. Re-measurement runs serially on a quiet machine before any
fix card is written for the timeout set.

The structural checks all held. Supplier payout policy and the delivery-receipt files are untouched,
and the provider and rake account ref formats are byte-identical to base
(`business:{businessId}:{currency}`, `ae:rake:{currency}`), so the re-key stayed on the buyer side.
`accountRefForOperator` still exists and is still exported — expected, since per-key attribution
survives pooling, but its remaining call sites are a reviewer question.

## P1-e-2 — validator RED, and the red proves the concurrency fault

Branch `p1-e-2-canonical-call-route` at `2f6b839f`. Typecheck, lint, targeted server/discovery/SEO
units, product frontier, and ts-standards all passed. The three suite commands failed, and every
single failure is a bare `Test timed out` with no assertion text, in files this branch does not
touch: market-terminal `cli-errors` and `doctor`, `action-invocation/full-yolo`,
`capability-supply/curated-seed-drift-idempotency` and `development-evidence-surface`, and
`imports/customer-request-source-completeness`.

This settles the attribution question left open on P1-a-core. Both validators ran concurrently, and
three files timed out in **both** runs — `cli-errors`, `development-evidence-surface`, and
`customer-request-source-completeness`. Two branches with disjoint diffs cannot produce the same
failures; one saturated machine can. Neither branch is implicated by its timeout set. Rule 7a exists
because of this pair of runs.

The structural evidence for the card is strong. Both route files exist and delegate to the same
`handleOperationInvokePost`; the shared handler diff is empty, so the two paths cannot drift; the
product-frontier baseline diff is empty, confirming no new action was registered; and the new tests
assert `/call` and `/execute` agree both on a served request and on the unauthenticated problem
shape.

Two notes for review. The route files hardcode their path literals in `createFileRoute` instead of
reading them from `OPERATION_INVOKE_ROUTE_CONTRACT`, which is what the file-based router requires but
which does leave the contract and the router able to disagree silently. And checks 17 and 18 in the
card were unusable: they were written as `grep -rn --include=*.ts`, and zsh expanded the unquoted
glob before grep saw it. Card-authoring fault, not worker fault.

## Serial re-measurement — the timeouts were all contention

One validator, both branches, back to back on an idle machine, full
`test:release:source:after-codegen`. A3 took 6m21s, B3 took 6m08s.

Every timeout-suspect file passed on both branches: market-terminal `cli-errors` and `doctor`,
`capability-supply/development-evidence-surface` and `curated-seed-drift-idempotency`,
`action-invocation/full-yolo`, and `integration/capability-operation-workpool` plus the
customer-request aggregate and curated provider registry integration files. Not one `Test timed out`
appeared in either phase. All ~35 earlier failures were manufactured by dispatching two full-suite
validators concurrently. Neither branch was ever implicated.

Unit counts: 499 files / 4074 tests green on P1-a-core, 498 / 4073 on P1-e-2.

## `projectSpine` is a worktree artifact, not a branch failure

Both phases then failed identically on three assertions in `convex/projectSpine.test.ts`, a file
neither branch touches. Differential:

| Where | Result |
| --- | --- |
| `main`, file in isolation | passes (4/4) |
| `main`, full `test:release:integration` | passes (85 files, 581 tests) |
| worktree, file in isolation, same file content | fails 3/4 |

The worktrees symlink `node_modules` at the main checkout, which is how the orchestrator told
validators to bootstrap them. Convex component resolution walks that path, so the workflow/workpool
spike resolves against the wrong root and the workflow reports `failed` instead of `inProgress`.
Only the component-dependent test is affected, which is why the other 84 integration files pass.
The acceptance surface is `main`, and `main` is green, so this blocks neither card. It does mean a
worktree gate run cannot certify anything component-dependent.

## Both Phase 1 cards reviewed — pass, with findings acted on

Both reviews returned no blockers. Neither approved on the strength of the test runs; each judged the
diff directly.

**P1-a-core.** Money conservation holds: the buyer debit and the supplier-plus-rake credit still come
from the same floor-rounded split. Owner identity is derived from the registered `agentAccessPrincipals`
row on every money path and a caller-supplied account ref that disagrees is refused, so no key can
reach another owner's wallet — the highest-severity class of failure for this card, and it is closed.
Per-key `principalId` and `credentialId` survive on transactions, usage events, and budget rows, so
pooling did not cost per-key visibility. Idempotency keys and replay semantics are unchanged.

**P1-e-2.** Both paths funnel into one untouched handler, the action inventory is unchanged, and
`/execute` still serves identically with no redirect and no deprecation header. Authorization parity
holds on both doors including the method guards.

Two findings were promoted out of "non-blocking" and fixed before merge rather than filed.

The first is money going missing. The re-key reads only `owner:*` wallets, so a pre-existing
`clerk_api_key:*` row with a non-zero balance is never selected: the owner would see a fresh empty
wallet and the funds would be stranded with no error raised anywhere. The card assumed zero balances;
nothing enforced it. Both `authorizeInvocationCharge` and `reserveCreditTopup` now refuse when a legacy
row with a non-zero balance exists. The guard only refuses — sweeping the money is a separate decision
with its own card (`P1-a-sweep`), because moving funds needs its own evidence. `accountRefForOperator`
survives as `legacyPerKeyAccountRef`, whose only remaining job is naming those rows for detection.

The second is advertising a deprecation we have not decided. `listOperationRouteDescriptors` spread
the whole contract entry into the public descriptor, so `legacyPath` and `servedPaths` reached the UCP
handshake and `ae manifest --json` — telling every agent that `/execute` is legacy, ahead of the Phase 5
card that owns notice and `Deprecation`/`Sunset` headers. Those fields are now kept out of the public
descriptor, `servedPaths` is deleted as a third restatement of `path` plus `legacyPath`, and a binding
test imports both route modules and pins their literals to the contract, since the existing dual-serve
tests inject the service and never prove the doors are wired.

Filed rather than fixed: `HK-topup-derivation` (an outer prefix check digests a caller-supplied
account ref while the authoritative Convex path still re-derives and refuses mismatches, so it is
defence in depth) and a noted overclaim in the `readKeyUsage` commit message, which describes a
canonical-zero fallback that does not apply when the summary and the principal row are both absent —
in that case no currency exponent exists and refusing is correct.

## `npm ci` is broken on `main` — pre-existing, unrelated to the reset

Discovered while trying to give a worktree real dependencies. `npm ci` exits `EUSAGE` on `main`:
`package.json` and `package-lock.json` are out of sync, with `gcp-metadata`, `@vercel/functions`,
`@vercel/oidc`, `jose`, `zod@4.1.11` and roughly twenty more missing from the lock file. Any clean
install — CI, a fresh clone, a new worktree — fails at dependency install. This predates the reset
and is filed as `HK-lockfile-drift`.

## P1-a-core — committed

`main` fast-forwarded to `9c2377c37d7ce3701c774ffa7a5735f111f190f2`. The initial and final
`git status --porcelain=v1` were clean. The first dirty-diff validator failed only because the expected
diff was concurrently committed before it ran; this is preserved as orchestration evidence, not a
product failure. Its replacement, pinned to `9c2377`, passed typecheck, `git diff --check`, and
`tests/unit/money/owner-account-pooling.test.ts` (1 file / 9 tests). The independent reviewer found no
blocking correctness, security, scope, or test issue and verified the absent-wallet distinction plus
both guarded paths.


## P1-c — committed

The exact reversal, dispute, and supplier `recoveryDue` authority is integrated. Its atomic
outcome is no-write for refused or conflicting terminal decisions, with terminal state remaining
monotonic.

Integration order: clean `main` at `ceb0b39216adb611647bb38b1bbc04e820abcd78`, then cherry-pick
feature commit `e97b62a524771a0e838bf334ffd80792ac926999`, producing integrated `main` at
`b3cecc5f753469634948aa9e18cb2755c22e5a2d`.

Fresh Node 22 validation on integrated `main`:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run check:convex-codegen`: PASS against the local self-hosted deployment.
- Focused validation: 18 files / 268 tests PASS.

Independent security review: PASS. The correctness review's only P1 blocker — required
`recoveryDueUnits` on populated rows — was closed with a safe widen/migrate/narrow bridge: the field
is optional, undefined legacy reads as zero, and a bounded idempotent backfill preserves present
debt. Tests cover the bridge.

No hosted migration was run. Later narrowing requires running every cursor page to `done: true` on
every target deployment and verifying zero missing fields. Main was not pushed. Live money remains
fail-closed. Final main porcelain was empty.

This records the committed card only; it is not a full release-gate result or hosted acceptance.