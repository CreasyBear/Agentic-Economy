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
