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
