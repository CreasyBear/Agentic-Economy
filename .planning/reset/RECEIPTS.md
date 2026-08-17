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

## P1-d1 — committed

Product commit `439c378a5592b356f35b8225b1acd2a33475c94e`; `main` was clean at acceptance and the commit was not pushed.

Core invariants:

- Qualified-Use payout allocation is immutable, replay-safe, and keyed by the canonical Qualified-Use material plus the UTC payout day.
- Allocation validates the source money journal, owner/provider/rake account identities, exact amount conservation, and append-only reversal corrections.
- The owner transfer-status surface is automatic/read-only; it reports recorded state without authorizing or initiating provider transfer I/O.
- Period-close admission is required before transfer progression; live money remains closed and fail-closed.

Observed Node 22 evidence:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- Focused tests: 177 + remaining 101 PASS.
- Seeded owner-route smoke: PASS.
- Independent security review: PASS.
- Correctness findings fixed, including period-close admission.

Explicit exclusions: no cron, no pre-provider reservation, no hosted migration/provider transfer, and no full release gate.

## P1-d2 — committed

Product commit `63b7731d8fd6e2b8d41be6615e661d8b5d2da392`; `main` was clean immediately after the commit and the commit was not pushed.

Core invariants:

- `beginPayoutTransfer` atomically reserves supplier earnings before provider I/O: one deterministic pending payout transaction, one immutable provider debit, one account-version advance, and one frozen payout command.
- Success applies that reservation without a second debit. Unknown outcomes remain frozen. Definitive failure or `not_released` appends one exact reversal transaction and credit; post-success reversal uses the same one-to-one mechanism.
- Exact replay and owner readback share one bounded terminal-journal validator. Applied, reversed, and failed states require exact account, amount, evidence, snapshot, and reversal composition; mutable later payout composition cannot rewrite the attempted amount.
- Pending/unknown payouts fence refunds and other payout commands. Delayed reversals and later credits cannot corrupt cumulative paid snapshots or hide the active payout from owner readback.
- Earnings projections fail closed on orphan, cross-business, malformed recovery, or non-exact payout/reversal rows. Pending/unknown reservations reduce held funds but are not labelled `paidOut`.
- Schema-free V1 admits one reservation command per canonical `payoutRef`. A different command cannot overwrite frozen evidence after failure. Failed residual funds remain held; deterministic carry-forward/manual reconciliation is an explicit P1-d3 dependency.

Observed Node 22 evidence on the accepted product diff:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- Focused payout/readback/schema tests: 209 PASS.
- Remaining money/access regression tests: 69 PASS.
- `git diff --check`: PASS.
- Independent security/accounting review: PASS.
- Independent correctness review: PASS after retracting an unreachable snapshot-bound concern and classifying failed-residual carry-forward under the explicit P1-d3 dependency.

No hosted migration or real provider transfer ran. Live money remains source-closed and fail-closed. This is not a full release-gate or hosted-acceptance result.

## P1-f — committed

Product commit `c7e58ecfc22c5483f5d61e7e9efb39b54ac2771b` (`feat: add standard supplier actions`); `main` was clean immediately after the commit and the commit was not pushed.

Core invariants:

- The canonical action set is exactly three actions: `supply.publish`, `supply.withdraw`, and `supply.earnings`.
- The actions require the exact `market_supply:manage` scope and use an owner-wide bounded mandate.
- Every Convex operation revalidates the current durable principal, grant, scope, lifecycle, and expiry, plus the owner→business binding; mutations also revalidate source-write authority.
- Publication reuses the existing standard artifact import, normalization, preflight, operation-ledger, and publish path.
- Withdrawal excludes the current resolution without cancelling claimed or running invocations.
- Earnings preserves exact accounting and status while stripping the payout command, idempotency, Stripe destination/transfer, request/transfer digest, and other mutable or internal handles.
- Authenticated MCP list/call filters exact scopes and publishes canonical object-root output schemas.
- Generic credentialed CLI actions use authenticated MCP with exact origin binding.
- MCP remains bounded at 320 KiB to carry the existing 262,144-byte source artifact.

Observed Node 22 evidence:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- Complete focused P1-f suite: 141 PASS.
- Post-copy focused action/registry: 32 PASS.
- Frozen frontier manifest: 5 PASS.
- Independent correctness: PASS.
- Independent security: PASS.

No hosted provider publication, provider network call, live money, or push was performed; this is not the Phase One acceptance packet or release gate.

## P1-g — committed

- This is the P1-g implementation commit about to be created; no SHA is assigned.
- Dynamic operation calls continue through the canonical AnswerToolCallRecord → frozen operation artifacts → FrozenTurnEvidence → answerToolCalls path. Reporting-only Harness events cover direct `operation.execute`/`operation.invoke` calls with exactly one `tool.started` plus `tool.completed(ok)` or `tool.failed(refused/error)`, canonical `toolId`/original `toolCallId`, generic error codes, and no raw input/result/provider data.
- Existing `legacy_registry_api_request` PostHog event covers exact legacy action IDs on MCP and Answer as well as HTTP, with only `route_family`, `route_kind`, `surface`, `$process_person_profile:false`, and `$geoip_disable:true`; unknown/nonlegacy IDs emit nothing.
- MCP instrumentation occurs only inside admitted registered callbacks; Answer static instrumentation occurs after known/read-only/strict-schema gates. Auth/action/error/result behavior is unchanged.
- Node 22 focused suite: 4 files / 82 tests PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS (Vercel nodejs22.x output); existing informational warnings only.
- Independent correctness review: PASS.
- Independent security/privacy review: PASS.
- No hosted/live-provider call, network call, live money, push, release packet, or source-write was performed.

## HK-topup-derivation — committed

Product commit `338f219ad624614d28a7f4e19c38edf6dcb6e8d7` (`fix: derive credit top-up account server-side`); final product commit porcelain was empty.

Authority and digest/callsite cutover:

- Public browser top-up input no longer includes `accountRef`.
- The default source resolver derives the owner from Clerk `userId` after the fail-closed live-money gate and before provider/source I/O.
- `accountRefForOwner(ownerId, currency)` controls the command digests, input digests, and reserve payload.
- Extra forged runtime input cannot override the derived account ref; missing owner refuses as `billing_identity_missing`.
- The direct hosted-smoke callsite injects its already-bound `ownerUserId`.

The Convex second check is unchanged: `reserveCreditTopup` independently re-authenticates the principal and re-derives the owner account ref, refusing mismatches.

Observed validation and reviews:

- Node 22 focused tests: 2 files / 36 passed.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Correctness review: 0.97 PASS.
- Security review: PASS.
- A red-capable forged-input assertion covers the extra runtime `accountRef` case and fails if caller input can influence the derived owner ref.

Explicit exclusions from the contract: no Convex edit, hosted run, provider call, live money, push, or release gate.

## P1-a-proj — committed (already satisfied)

Current source revision: `569be0ea44fb71caca0d31adae18881044fea018`.

The projection already carries both fields end to end; no product edit was made because
duplicating this existing projection would be wrong.

- **Derivation:** `src/modules/capability-supply/operation-projection.ts` types
  `PublicOperationDescriptor.callVia` from
  `OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path` and types `paymentLane` as
  `"brokered"`. The canonical contract in
  `src/modules/capability-execution/operation-invoke-entry.ts` sets that path to
  `/api/v1/operations/call`. The production projection derives
  `paymentLane` through
  `paymentLaneAdmission({ rail: 'ae_internal', environment: 'production' })`,
  and startup fails unless the result is admitted with lane `brokered`.
  `projectCapabilityOperation` assigns both values; callers and storage cannot select
  alternate values.
- **Validation:** `src/modules/capability-supply/operation-schemas.ts` uses strict
  Zod descriptor schemas with
  `callVia: z.literal(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path)` and
  `paymentLane: z.literal('brokered')`. The descriptor is nested in the detail, search,
  and compare output schemas. `convex/capabilitySupplyOperations.ts` independently
  requires the same literals with Convex validators. `serializeOperationDescriptor` and
  `deserializeOperationDescriptor` preserve both fields across the wire round trip.
- **HTTP fail-closed boundary:** the search, detail, and compare HTTP routes
  safe-parse action output and return `operation_read_result_invalid` with HTTP 503 when
  the published projection is invalid.
- **Refusal:** `src/modules/capability-supply/internal/x402-invocation-policy.ts`
  refuses `provider_direct_x402` in production with
  `payment_lane_not_brokered`. The operation worker applies that admission before the
  canonical claim, provider transport, or money path, and records the refusal through
  `refuseBeforeClaim`.

Observed evidence and reviews:

- Node 22 focused suite: 7 files / 54 tests PASS.
- Prior current-HEAD lineage: typecheck, lint, and build PASS.
- Independent correctness review: `0.99 PASS_ALREADY_SATISFIED`.
- Independent security review: `PASS_ALREADY_SATISFIED`.

Explicit exclusions: no product source change, test change, new action, new route,
provider call, network call, live-money operation, hosted run, push, or release proof.

## P1-a-sweep — committed

**Founder decision:** “rip it out. there are no users yet.”

Product HEAD is `3638ae7420c1400cce73356bec75f4a0b3572716`, with parent
`8b6d195fd155620825edf6d939e008489483e254` and message
`refactor: remove unused legacy buyer accounts`. The final product commit porcelain was empty.

**Deletion scope:** the product removed only the legacy
`moneyAccounts.accountRef = clerk_api_key:*` compatibility helper/export, its Convex detector,
refusals, and calls, plus detector-only fixtures and tests. Ordinary Clerk API-key principal
attribution and canonical owner-pooled accounts remain.

**Canonical invariants preserved:** ordinary Clerk API-key principal attribution remains on the
existing transactions, usage, and budget records; canonical owner-pooled accounts remain the
money authority. No migration, schema change, balance transfer, quarantine, or fallback was
introduced.

**Validation and reviews:**

- Node 22 focused validation: 3 files / 24 tests PASS.
- Convex codegen dry-run: PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Independent correctness review: 0.98 PASS.
- Independent security review: PASS.

This receipt explicitly supersedes the earlier detection-only compatibility note in the P1-a-core
receipt, which recorded that `accountRefForOperator` survived as `legacyPerKeyAccountRef` solely to
name legacy rows for detection. That historical receipt remains unchanged.

**Explicit exclusions:** no hosted deploy, data mutation, provider call, network call, live-money
operation, push, or release proof.

## P2-a — committed

Product HEAD is `a03d3eff11b38d625b2e0cd0984cbb904127c7e5`, parent
`aba35dce2d5d379eac86d03fc851da03695fbe42`, with message
`refactor: move tool projection into actions`; final product porcelain was empty.

Git records the strict-schema move as R099; the accepted allowlist contained 13 unique paths.

**Ownership cutover:**

- `actions` now owns the strict schema walker, canonical schema/hash/provider diagnostics, the generic `ActionToolContract` and model projection, and uninstrumented execute.
- `harness` retains the adapter, policy, instrumentation, Zod runtime validation, status/hash/timeouts, and the existing public `HarnessToolContract`/`ExecuteArgs` interface.
- The Answer descriptor and dynamic strict checks consume the action-owned seam.
- The harness run loop, session journal, replay, and collector were untouched.

**Run-loop decision:** KEEP the custom run loop. The installed AI SDK is `7.0.44`, but no SDK↔Harness parity validator exists; custom loop removal was explicitly not authorized.

**Validation and reviews:**

- Focused validation: 11 files / 70 tests PASS.
- Node 22 `typecheck`, `lint`, and `build`: PASS after the exact five-diagnostic correction.
- Independent correctness review: `0.97 PASS`.
- Independent security review: PASS.

**Explicit exclusions:** no hosted proof, provider proof, network proof, live-money proof, push, or release proof.

## P2-b — committed

**Accepted product chain:**

1. Product commit `9d2063a6af3f58ff6df74d2fd7d8e9239f8e4208`, parent
   `134a8a1fec56fd37ea65015d87bb7457b9af88e4`, message
   `refactor: move curated publications to seed ownership`.
   The commit covered 17 unique paths and four R099 moves. The typed static
   20-publication payload moved to `src/modules/dev/internal`, exported through
   `src/modules/dev/public.ts`; runtime mapping, admission, normalization, and the Convex host stayed
   runtime authorities.

2. Product HEAD commit `f805c50b7ecfe3ee1aa71224ef61224ce4558501`, parent
   `9d2063a6af3f58ff6df74d2fd7d8e9239f8e4208`, message
   `refactor: move development fixtures out of runtime`.
   The commit covered exactly 63 raw paths, 15 moves across R97-R100, and 33
   consumer/boundary edits. Development fixtures moved out of runtime into
   test/seed ownership without moving runtime authority.

**Validation and reviews:**

- First commit: 10 files / 86 tests PASS; Node 22 typecheck, lint, and build
  PASS; independent correctness review: 0.98 PASS; independent boundary/security
  review: PASS.
- Second commit: 28 files / 411 tests PASS; Node 22 typecheck, lint, and build
  PASS; independent correctness review: 0.98 PASS; independent boundary/security
  review: PASS.

**Invocation evidence and clean-revision proof:**

- Invocation run+verify checksum:
  `sha256:bfd6b9b24762295e17597433987387a924f4a9ad60c155a28cbe7fc1a8c2d79a`.
- Working-tree phase3b run+verify checksum:
  `sha256:163d3548d57022c5572966d376bb7e09fb01e0e91850c84756e196e3d61fc770`.
- Post-commit clean-revision phase3b run+verify checksum:
  `sha256:1ae9496f437915b674c1165885bf5cfb9f8bd65099beda4b9d479e764bfd15f6`.
- Temporary smoke artifacts were deleted; the post-commit revision was clean.

**Preserved authorities and explicit exclusions:** runtime mapping, admission,
normalization, and the Convex host remained runtime authorities. No
source/Convex→tools import, aliases, runtime authority move, hosted/provider/
network/live-money/push/release proof was performed.

## P2-c — committed

**Accepted commit lineage from the P2-b HEAD:**

| Commit | Parent | Message | Exact path scope |
|---|---|---|---|
| `aef1ab3e393a88c92331cfe80fcb7fd876f02a19` | `f805c50b7ecfe3ee1aa71224ef61224ce4558501` | `docs: record fixture ownership cutover` | 2 modified paths: `.planning/reset/CARD-LEDGER.md`, `.planning/reset/RECEIPTS.md` |
| `2a8d92986ed58a121a27d59a09c8bf3959973c4a` | `aef1ab3e393a88c92331cfe80fcb7fd876f02a19` | `refactor: move service auth to agent access` | 26 changed records / 28 raw path endpoints: 24 modified consumers plus `R100 src/modules/customer-request/service-auth-envelope.ts → src/modules/agent-access/service-auth-envelope.ts` and `R097 tests/unit/customer-request/service-auth-envelope.test.ts → tests/unit/agent-access/service-auth-envelope.test.ts` |
| `112ede5b2fbf9cdfd24e06eaf0518caf8b095747` | `2a8d92986ed58a121a27d59a09c8bf3959973c4a` | `refactor: move consumer adapter to demand` | 4 paths: `src/modules/customer-request/application/consumer-plan-projection.ts`, its `public.ts`, `src/modules/registry/public.ts`, `tests/unit/registry/services-api-projection.test.ts` |
| `5739456916ad1245a0fc62096e82277b17a3b5ed` | `112ede5b2fbf9cdfd24e06eaf0518caf8b095747` | `refactor: remove answer type from capability execution` | 1 path: `src/modules/capability-execution/operation-execute.actions.ts` |
| `1cfdbe10752b637bce1584a93ac1e9b86f067734` | `5739456916ad1245a0fc62096e82277b17a3b5ed` | `refactor: move answer tool selection out of harness` | 6 paths: Answer-thread tool registry/tooling, Harness public/tool-contract, and the two corresponding tests |
| `c5f790b1f148dc0d965caeba799801da4674fc23` | `1cfdbe10752b637bce1584a93ac1e9b86f067734` | `refactor: move answer run viewer out of harness` | 8 changed records / 13 raw path endpoints: 3 source moves at `R100`, 2 test moves at `R099`, and 3 modified consumers (`AeHarnessRunViewer` plus the two admin run routes) |
| `be76bdd5f62c76541ec3e2e43aef4a328541329f` | `c5f790b1f148dc0d965caeba799801da4674fc23` | `refactor: move inquiry proof out of harness` | 5 changed records / 7 raw path endpoints: proof source `R100`, proof test `R098`, plus `harness/public.ts`, `inquiries/public.ts`, and notification readback test edits |
| `9db36a215316c6bac3b658a04819bfc994a8a648` | `be76bdd5f62c76541ec3e2e43aef4a328541329f` | `docs: map existing codebase` | 7 modified `.planning/codebase/{ARCHITECTURE,CONCERNS,CONVENTIONS,INTEGRATIONS,STACK,STRUCTURE,TESTING}.md` paths |
| `9c8e6fbc4de7de66a2866694824e848b3774d343` | `9db36a215316c6bac3b658a04819bfc994a8a648` | `refactor: split oversized market modules` | 28 changed paths; added exactly `src/modules/capability-execution/operation-invoke-contracts.ts`, `src/modules/capability-supply/internal/operation-projection-wire.ts`, and `src/modules/registry/internal/projection-contracts.ts`; remaining paths are the existing invoke/projection/registry consumers, Convex invoke consumers, Answer/discovery consumers, operation route/tests, CLI, and release-smoke adapter |
| `9b17267c541613e9a55ddc835f5d9ddadd6925b4` | `4188989757359147c2d5dec350e038538519ad09` | `refactor: route demand through market seams` | 12 paths; product |
| `9a887be8e1456531d7d5979c14a0229086e103b7` | `197b58da7299988cf3d7c5baa45c3afeb218eff3` | `refactor: route answer evidence through registry action` | 2 paths; product |
| `78d34714e75bf444703f8741346d335aacce0a03` | `120f057e3992fa7b6c1eaeb5294c4e254502fd41` | `test: pin demand market boundaries` | 1 test path; product |
| `588b15c9a672f44f2d62011328f14a1697f9b52f` | `776caa0e3a29a8828df3dba4fbac44fc314990f6` | `fix: keep Convex bundles off execution barrel` | 1 path; product |

**Non-product interleaves:** Documentation/PAPERCUTS-only commits in this parent chronology are `2f65de9bf03a0477f9e720bc9c7935f32cd570f9`, `b2a8f2866eaf7e9e3dcc60a84923ecec3c7cf973`, `7fba18f317d8504d80974b5749ebd27403b60f77`, `d9a631646eab081809c011298ce1748593154f9f`, `4188989757359147c2d5dec350e038538519ad09`, `197b58da7299988cf3d7c5baa45c3afeb218eff3`, `120f057e3992fa7b6c1eaeb5294c4e254502fd41`, `776caa0e3a29a8828df3dba4fbac44fc314990f6`, and `eb2b6e0a97c13a654e4923ff67c6e73669d5cdc3`; they do not count as product cutovers.

The earlier target `9c8e6fbc4de7de66a2866694824e848b3774d343` was an ancestor of clean intermediate HEAD `7fba18f317d8504d80974b5749ebd27403b60f77`; the accepted P2-c product tail above ends at `588b15c9a672f44f2d62011328f14a1697f9b52f`.

**Ownership and preserved behavior:** service-auth assertion ownership moved to `agent-access`; the Customer Request consumer adapter remains behind `customer-request/application`; Answer tool selection is owned by the canonical Answer-thread registry; the run viewer is owned by Answer Thread; inquiry proof is owned by Inquiries; and invoke/projection/registry wire contracts were extracted into leaf modules. Existing operation-result/status/refusal schemas, serializers/deserializers, validators, public barrel exports, invocation routing, dispatch, and runtime authority remained unchanged. The capability-supply and registry public barrels re-export the extracted wire/contract names. Reverse edges from the new wire/contracts modules are type-only; no runtime cycle, duplicate implementation, alias, or retired-path consumer remains. No Layer-0 Answer/Customer Request import was introduced.
**Boundary state after P2-c:** Demand consumes registry/action-contract/capability-execution public seams; the evidence assembler calls `registrySearchAction.run` with caller `answerThread`, while other callers retain `registry_action`. The AST guard covers 41 unique Answer/Customer Request files, alias/relative normalization, comments/dynamic-import exclusion, and passes 7/7; no target implementation imports `capability-supply` or `registry.functions`.

**Focused validation and reviews:** the supplied focused records report Answer-edge `4 files / 29 tests PASS` with Node 22 typecheck/lint/build PASS; run-viewer `2 files / 8 tests PASS` with the same checks; and inquiry-proof `2 files / 13 tests PASS` with the same checks. Final independent correctness and boundary/security reviews passed for service auth, consumer adapter, dead candidate removal, Answer edge, run viewer, inquiry proof, and projection/registry extraction. The interim invoke review BLOCK was solely because a newly added contracts file was absent from an indexed patch; after commit, the final refactor validator passed and confirmed the file/import cutover. No current review finding remains.

**Phase 2 source-gate evidence:** exact Node 22 command `env PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/usr/sbin:/sbin npm run test:release:source:after-codegen` passed with unit `505 files / 4307 tests`, integration `86 files / 722 tests`, types `1 / 4`, imports `15 / 60`, TypeScript standards `1 / 1`, SEO `6 / 35`, UI contract `1 / 1`, eval `13 cases / 15 turns` (`failedCases=0`, `failedScoreCases=0`, minimum score `9.5`, average `9.87`, p95 turn timing `1258 ms`), kernel-retirement verified, product-frontier OK, and client/SSR/Nitro build succeeded. Separate Node 22 conformance passed `24 files / 396 tests` (`8.11s`); `npm run check:convex-codegen` passed all generation/bundling/upload/binding/TypeScript stages. Initial and final porcelain, untracked files, and stashes were empty; final HEAD remained `7fba18f317d8504d80974b5749ebd27403b60f77`.

**Explicit exclusions:** no hosted, provider, network, live-money, push, or release proof was performed or claimed; no runtime authority was moved; and no source/Convex→tools import was added. Production `gate:release` remains blocked solely at deployment-manifest environment prerequisites; this does not invalidate the green source, conformance, or codegen evidence above.

## P2-d — committed

Product commit `abce7e16b142263446adb27e076a2f0c10b88152`; parent `2f65de9bf03a0477f9e720bc9c7935f32cd570f9`; message `refactor: separate invocation recovery contracts` (2026-08-17 20:03 +0800). `git show` reports 14 paths, +104/-71, including new `src/modules/capability-execution/operation-recovery-contracts.ts`.

`src/modules/capability-execution/operation-invoke-contracts.ts` remains the sole owner of the five public invoke result kinds: `completed | pending | needs_authority | reconciliation_required | refused`. The new `operation-recovery-contracts.ts` owns the ten detailed status/recovery diagnostics: `gathering_information | awaiting_authority | authorized | leased | in_progress | retryable | reconciliation_required | terminal | cancelled | invalidated`, plus status/recovery result unions. Existing strict envelopes and principal/correlation/reconciliation/cancellation behavior remain wired through the same action/functions, route, CLI, manifest, and owner-page consumers; no compatibility re-export was added.

Docs and tests make that ownership explicit: `.planning/codebase/ARCHITECTURE.md`, generated `src/modules/discovery/internal/agent-skill.ts`, and `tools/ae/README.md` state that only `result.kind` is an operation outcome, while `found.state` is a recovery diagnostic and `terminal` is not an invoke result. `tests/seo/agent-skill.test.ts` pins both vocabularies. `tests/unit/server/operation-recovery-api.test.ts` aligns its admitted principal subject (`user_one`) and preserves authenticated status/cancel/reconcile coverage.

Focused P2-d validation: 10 files / 91 tests passed; `git diff --check` passed; all seven moved declarations occurred exactly once in `operation-recovery-contracts.ts` and no stale moved imports remained; typecheck, lint, and build passed (build warnings only). Independent correctness review passed at 0.98; independent boundary/security review passed at 0.98; no findings across all 14 paths.
**Dependency-order correction:** P2-d landed out of ledger dependency order and does not advance Phase 2 until P2-c closes.

## Intermediate Phase 2 source gate — green; card acceptance was pending
Green source/conformance/codegen evidence does not override the open P2-c acceptance.

Current HEAD is `7fba18f317d8504d80974b5749ebd27403b60f77` on `main`; final porcelain, untracked files, and stashes were empty. Under Node `v22.22.0` / npm `10.9.4`:

- `npm run test:release:source:after-codegen`: exit 0. Lint, typecheck, kernel-retirement, product-frontier, unit (`505 files / 4307 tests`), integration (`86 files / 722 tests`), types (`1 / 4`), imports (`15 / 60`), ts-standards (`1 / 1`), SEO (`6 / 35`), UI contract (`1 / 1`), eval (`13 cases / 15 turns; failedCases=0; failedScoreCases=0; minScore=9.5/9; avgScore=9.87; p95=1258ms`), and client/SSR/Nitro build passed.
- `npm run test:conformance`: exit 0; 24 files / 396 tests passed (8.11s).
- `npm run check:convex-codegen`: exit 0 (5.40s). Stages: Finding component definitions; Generating server code; Bundling component definitions; Bundling component schemas and implementations; Downloading current deployment state; Uploading functions to Convex; Generating TypeScript bindings; Running TypeScript.
- `npm run gate:release` remains blocked at its first production `verify:deployment-manifest` step (exit 1), fingerprint `sha256:096333e60ef23f0d459cade659a9253a22ce0b3019ad5aaf30cd963e98a263d3`; runtime Node 22 is compatible. The retained blocker is malformed/missing operator-owned source-write authority/family keys, canonical origin, Clerk, Convex/source, OpenRouter, Stripe, and x402 custody configuration. No bypass was used.

Attributable post-P2-d gate-fix commits/messages:

- `5781963af350761b55ebe86b4a39eb2c70d2e3e0` — `test: update compare operation fixture` (adds canonical `callVia` and `paymentLane` to the compare fixture).
- `b2a8f2866eaf7e9e3dcc60a84923ecec3c7cf973` — `docs: restore prompt map update rule` (restores the architecture-map link/update rule).
- `891447ec65e2de6ef0dccf2f497396f80ceefe65` — `test: use admitted answer API key subject` (changes the rate-limit fixture subject to `user_answer`).
- `1845d4453329c2e57a9dfd6ad0e618d9125def00` — `refactor: type supply source mutations` (replaces broad source-mutation result types/casts with exact `FunctionReference`/`FunctionReturnType` typing).
- `68c51f702a44e997be76eed34b9559f0584b7b68` — `refactor: narrow money ledger state` (makes optional-state narrowing explicit and removes the money-ledger non-null assertions).

Intermediate gate attribution was direct: the target revision's after-codegen segment had two unit failures (compare fixture and prompt-map link); after those fixes, the answer rate-limit integration fixture returned 403 until the admitted subject fix; after that, ts-standards reached the supply typing and money-ledger state fixes. A later run stopped on one integration timeout, while the clean current-HEAD rerun passed all 86 files / 722 tests.

No bypass was used; no hosted, live-money, push, or release proof is claimed. Production `gate:release` remains blocked at the deployment manifest above.

## Phase 2 closure — accepted

The accepted P2-c product head is `588b15c9a672f44f2d62011328f14a1697f9b52f`; it is an ancestor of these closure docs. Final porcelain/stash status is intentionally not fabricated here; the committer supplies that receipt.

Under exact Node `v22.22.0`, all reported stages exited 0:

- `npm run test:release:source:after-codegen`: source unit `505 / 4307`, integration `86 / 722`, types `1 / 4`, imports `15 / 61`, TypeScript standards `1 / 1`, SEO `6 / 35`, UI `1 / 1`, eval `13 / 15` (`failedCases=0`, `failedScoreCases=0`, minimum score `9.5 / 9`, average `9.87`, p95 `1257ms`); kernel-retirement, product-frontier, and client/SSR/Nitro build all passed.
- `npm run test:conformance`: `24 / 396` in `8.50s`.
- `npm run check:convex-codegen`: all generation, bundling, upload, binding, and TypeScript stages passed in `5.53s`.

Focused proof: demand projection `8 files / 104 tests`; evidence action `2 files / 29 tests` plus registry `25 tests`; boundary guard `1 / 7`; Node 22 typecheck; and independent correctness/boundary reviews PASS after TSX, alias/relative, and static-re-export corrections.

No hosted, provider, live-money, push, or release claim is made. The deployment-manifest blocker is retained.

## Phase 3 founder scope decision — lean atomic proof

**Founder directive:** `slim and refactor if there is no home. simplify, dont drag in legacy complexity`

**Source facts recorded before implementation:**

- The current conformance floor is 24 paths. Exactly three are Customer Request files: `tests/unit/customer-request/route-execution/transport-canonical.test.ts` (6 assertions), `tests/unit/customer-request/route-execution/cancellation-canonical.test.ts` (4 assertions), and `tests/integration/customer-request-v2-multi-capability-route.test.ts` (36 assertions), for 46 assertions total.
- `>=10` is only the manifest path-count floor; it is not permission to drop a named path or weaken an assertion.
- The atomic kernel owns one-operation admission/authority/idempotency/claim/dispatch/output/settlement/recovery/call.
- Customer Request-only planning/DAG/confirmation, repeat permissions, the customer problem/support/evidence workspace, multi-step provider cancellation, and progress/history have no atomic home and will not be bridged or reimplemented.

The conformance cutover ports proof at the test/manifest boundary. It does not add a temporary Customer Request → `operation.invoke` runtime compatibility bridge. P3 performs no deletion or quarantine; Phase 5 deprecation/retention gates still govern removal.

**Exact proof-card disposition and stop condition:**

- `P3-transport-proof` ports only market-owned claim/release/registered-transport/output/redaction invariants from the transport canonical worker into atomic worker/transport proof.
- `P3-cancel-proof` maps only atomic status/cancel/reconcile invariants from the cancellation canonical worker and excludes Customer Request provider-cancellation orchestration.
- `P3-invoke-proof` maps only single-operation identity/authority/replay/settlement/recovery invariants from the multi-capability route and excludes planning/DAG/confirmation/repeat/problem/support/progress semantics.
- `P3-cutover` removes those three Customer Request entries from the conformance command and product-frontier manifest and adds these seven atomic successors, only after the three proof cards are complete: `tests/unit/convex/capability-operation-worker.test.ts`, `tests/integration/capability-operation-workpool.test.ts`, `tests/unit/capability-execution/operation-recovery-actions.test.ts`, `tests/unit/capability-execution/operation-invoke.test.ts`, `tests/unit/server/operation-invoke-api.test.ts`, `tests/unit/action-invocation/durable-action-invocation.test.ts`, `tests/unit/convex/capability-operation-recovery.test.ts` (24→27 paths; `durable-action-invocation.test.ts` is already one of the 24, so six new atomic paths replace three Customer Request paths).
- If an atomic invariant lacks production code, test it and fix the source at the atomic seam. If behavior is Customer Request-only, classify it for Phase 5; never fabricate equivalence.

No test command was run; this receipt records scope and source facts only.

## Phase 3 atomic proof ports — accepted

Accepted at HEAD/commit `ca212e9c0911ccdccd0acc9641995a915f124d6a` (`ca212e9`): `test: prove durable atomic operation ordering`.

The exact seven successor suites and role mapping are:

- **Transport:** `tests/unit/convex/capability-operation-worker.test.ts`; `tests/integration/capability-operation-workpool.test.ts`.
- **Cancellation/recovery:** `tests/unit/capability-execution/operation-recovery-actions.test.ts`; `tests/unit/action-invocation/durable-action-invocation.test.ts`; `tests/unit/convex/capability-operation-recovery.test.ts`.
- **Direct invoke/API:** `tests/unit/capability-execution/operation-invoke.test.ts`; `tests/unit/server/operation-invoke-api.test.ts`.

Observed Node `v22.22.0` focused proof: 7 files / 89 tests PASS. The Workpool durable proof uses convex-test real persistence; its history is `claim_before_effect` → `release_fence_before_network` → `terminal_returned`, versions 1 → 2 → 3, with a provider-time fence, exact output, public replay without a second effect, and canonical redaction. Durable cancellation covers both origins (`request_owned` and `standalone`) plus interrupted outer projection. The direct invoke, API, and recovery suites cover their mapped atomic proof.

Independent reviewer: PASS `0.98`. This receipt claims no product behavior change, Customer Request runtime bridge or deletion, hosted proof, live-money proof, or push. P3 cutover, P3 validation, and P3 review remain pending.

## Phase 3 cutover, validation, and review — accepted
**Accepted commit:** `363338ca629a7483188db634f0a021a918420533` — `test: cut over phase three conformance`.
The exact cutover arithmetic is `24-3+6=27`. The three removed Customer Request list paths are `tests/unit/customer-request/route-execution/transport-canonical.test.ts`, `tests/unit/customer-request/route-execution/cancellation-canonical.test.ts`, and `tests/integration/customer-request-v2-multi-capability-route.test.ts`.
The three files and Customer Request runtime remain retained; only their list entries were removed. Existing `tests/unit/action-invocation/durable-action-invocation.test.ts` remains retained, and the six successor additions are already enumerated above.
The package `test:conformance` list and product-frontier manifest `requiredConformancePaths` list are identical, ordered, unique, and all listed files exist.
**Validators (Node 22):**
- `test:conformance`: 27 files / 423 tests PASS.
- `check:product-frontier`: `{ok:true,errors:[]}`.
- `tests/imports/product-frontier-manifest.test.ts`: 1 file / 5 tests PASS.
- `typecheck` / `diff-check`: PASS.
Review: PASS 0.99; no assertion weakening or fixture substitution. Evidence includes real `convex-test` persistence, stateful both-origin cancellation (`request_owned` and `standalone`), and the prior 7-files / 89-tests mapping.
Phase 3 is complete. No quarantine, deprecation, production-runtime, hosted, live-money, or push claim is made; Phase 4 is the next gate.

## Phase 4 model-loop specification and red baseline
Accepted P4-a commit `1a2303c18aae0c0849d8f88a33a3ca0a4ae0572a` (`1a2303c`): `test: specify model-chosen answer tool loop`.
Static Node22 coverage PASS: 13 cases (11 turn, 2 thread), 16 tags including `model-chosen-tool-loop` and `bounded-tool-loop`.
`typecheck`: PASS.
Focused `answer-tool-use-agent` helper regression: 1 file / 21 tests PASS.
Independent reviewer: PASS.
P4-b executed `npm run test:eval:report` and is intentionally RED at the current staged runtime.
Exact error: `unexpected_unstructured_tool_request: expected capability_operation_v1_3e80c2a3a9b09f6a53b90856f1e077e173b2a151c6bc2530fe3478b76b2d8b31`.
After model-planned registry operation search/detail, the current router requests its separate navigation decision instead of exposing the pending dynamic capability in the same loop.
The eval case contract contains no `navigationOperationRef` / `stageOperationReads` / `stageBusinessRecovery` / `direct-retrieval-fast-path` metadata.
P4-b is a committed red target, not a green eval claim; P4-c/P4-d must make it green.
No runtime/product behavior changed.