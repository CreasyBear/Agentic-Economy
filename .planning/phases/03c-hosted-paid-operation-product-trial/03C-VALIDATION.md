# Phase 3C validation contract

This file maps every implementation loop to the command and evidence required
before the next dependent wave may claim completion. It does not authorize
implementation, deployment, Convex control-plane calls, or hosted readback.

## Evidence ladder and stop rule

Source inspection, classified REDs, local unit/integration fixtures, local
browser execution, human comprehension, and authenticated exact-revision
hosted readback are separate evidence classes. No class upgrades another.

Every command sequence stops at its first failure. All plans use
`03C-AGENT-RUNBOOK.md` for runtime, custody manifest, exact ownership, ignored
context, protected-action posture, expanded handoff and resumption. Commands are
not looped to manufacture a pass.

## Wave 0 — pre-implementation RED dependency

Plan 03C-01 is execution Wave 1, but its contract suite is the mandatory Wave 0
validation dependency for every production task.

| Gate | Automated command | Required evidence | Stop condition |
|---|---|---|---|
| Founder/base custody | `git rev-parse HEAD && git status --short` | Explicit founder acceptance plus exact base revision and inherited-work boundary | Acceptance withheld or custody differs |
| RED classifier unit contract | `npm run test -- tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts` | Classifier rejects parse, import, config, timeout, infrastructure, unrelated, missing-test and unexpected-pass cases | Any non-contract failure is accepted as RED |
| Classified contract REDs | `npx tsx tools/dev/verify-phase-3c-red-contract.ts --report .planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json` | Every allowlisted test full name fails for its declared absent-contract reason; no extra failure | Missing/unexpected test or mismatched failure reason |
| Ownership boundary | `AE_SCAN_MODE=clean npx vitest run tests/imports/hosted-paid-operation-boundaries.test.ts` | Thin-host/no-second-lifecycle direction is executable | Import/config/infrastructure failure |

Production work in Plans 03C-02 through 03C-07 must not start until all four
gates have the expected disposition recorded in 03C-01-SUMMARY.md.

## Implementation task matrix

| Wave / task | Requirements | Automated commands | Observable evidence and ceiling |
|---|---|---|---|
| 2 / 03C-02 Task 1 — bounded persistence/admission | P3C-R1, R2, R3, R7 | `npm run test -- tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/convex-handler-contract.test.ts && npm run check:convex-codegen` | Exact indexed/capped/paginated aggregate, cap+1 `aggregate_incomplete`, atomic kill-switch/count/concurrency/rate admission; local fixtures only |
| 2 / 03C-02 Task 2 — cold and post-command composition | P3C-R1, R3, R7 | `npm run test -- tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/paid-operation-application-service.test.ts tests/unit/action-invocation/paid-operation-projection.test.ts && npm run test:imports && npm run typecheck` | Warm/cold and refreshed post-command digest/version/payment/continuation equality; local reconstruction only |
| 3 / 03C-03 Task 1 — evaluator setup creation/provider switch | P3C-R1, R6, R7, R10 | `npm run test -- tests/unit/action-invocation/hosted-paid-operation-creation.test.ts tests/unit/action-invocation/paid-operation-provider-selection.test.ts` | Setup accepts only providerKey; source resolves material and binds before authority; switch lineage is pairwise distinct; labelled local fixture only |
| 3 / 03C-03 Task 2 — durable mock effect/custody | P3C-R1, R7 | `npm run test -- tests/unit/action-invocation/hosted-sandbox-effect-adapter.test.ts tests/unit/action-invocation/x402-payment-execution.test.ts && npm run typecheck` | Prepared and submission-started precede labelled release; every crash point preserves possible-effect truth; local mock only |
| 3 / 03C-03 Task 3 — trusted reconciliation | P3C-R1, R6, R7, R10 | `npm run test -- tests/unit/action-invocation/hosted-paid-operation-reconciliation.test.ts tests/unit/action-invocation/x402-payment-reconciliation.test.ts && npm run typecheck` | Public body is intent/version only; caller evidence rejected; labelled trusted mock evidence only |
| 4 / 03C-04 Task 1 — authenticated setup APIs and frozen host/card inputs | P3C-R2, R3, R4, R5, R7, R10 | `npm run test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-agent-auth.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts` | Setup accepts only providerKey; public reconcile is intent-only; host supplies frozen disclosure/command/pending/ambiguity/truth/evidence inputs; local fixtures only |
| 4 / 03C-04 Task 2 — setup and paid Action Detail routes | P3C-R2, R3, R4, R5, R7, R10 | `npm run test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts && npm run test:imports && npm run test:copy && npm run typecheck` | `/` unchanged; evaluator-only `/actions/paid/new`; reusable `/actions/paid/:invocationRef`; provider selection outside card; agent create/inspect/command share one seam; local only |
| 5 / 03C-05 Task 1 — paid-operation UI contract | P3C-R3, R4, R7, R8, R10 | `npm run test:ui-contract && npm run test -- tests/unit/action-invocation/paid-operation-card.test.tsx tests/unit/action-invocation/paid-operation-projection.test.ts && npm run test:copy` | Query/provider agnostic within paid operations, non-BTC fixture, frozen reading order, runtime evidence labels; local automated UI evidence only, no non-paid compatibility claim |
| 5 / 03C-05 Task 2 — golden/goblin protected browser loop | P3C-R3, R4, R7, R8, R10 | `npx playwright test --config=playwright.paid-operation-hosted.config.ts tests/e2e/paid-operation-hosted-sandbox.spec.ts && npm run test:ui-contract` | Ordered forward golden tape plus every named goblin branch/rejoin/stop, parity and zero duplicates; local browser sandbox only |
| 6 / 03C-06 Task 1 — frozen cohort/runbook | P3C-R4, R8, R10 | UI contract, scorer instrument check, documented non-mutating preflight | Hashed instrument, minimum 3 independent eligible evaluators, no coaching/PII, both journeys; no result yet |
| 6 / 03C-06 Task 2 — comprehension sessions | P3C-R4, R8, R10 | Independent scorer over frozen raw-answer JSON | Mandatory correctness, 90%, no retry; declared-evaluator comprehension only |
| 7 / 03C-07 Task 1 — custody/packet/source/residue gate | P3C-R1, R2, R3, R5, R7, R9, R10, R11 | Clean proof worktree: focused release test, residue/import test and source gate | Manifest and commit chain bound; packet falsifiers; artifact classification, removal/import boundary, retention/kill-switch/retirement posture; no hosted claim |
| 7 / 03C-07 Task 2 — deployment discovery | P3C-R9 | Read-only source/config inspection; no external command | Exact command/component/target/current revision/Convex identity/credential owner/rollback target or blocking RED |
| 7 / 03C-07 Task 3 — hosted proof | P3C-R1, R2, R3, R5, R7, R9, R10 | Source-proven named deploy once, served-revision check, human smoke, agent smoke, collect, verify | Ordered authenticated exact-revision hosted sandbox proof; rollback once only if pre-recorded/authorized |

## Requirement closure

| Requirement | Closing evidence |
|---|---|
| P3C-R1 | 03C-02 cold durable reconstruction, 03C-03 trusted recovery, 03C-07 hosted cold readback |
| P3C-R2 | 03C-04 authenticated creation/read/command adapters and 03C-07 identity-bound readback |
| P3C-R3 | 03C-02 unchanged application composition, 03C-04 parity, 03C-05 no-branch UI, 03C-07 digest equality |
| P3C-R4 | 03C-04 protected human creation/detail, 03C-05 browser contract, 03C-06 comprehension |
| P3C-R5 | 03C-04 authenticated agent collection/inspect/command and 03C-07 hosted readback |
| P3C-R6 | 03C-03 source-owned default binding, evaluator-only override and distinct switch lineage; 03C-04 thin reachability |
| P3C-R7 | Classified REDs plus 03C-02 through 03C-07 ordered golden transitions and named goblin branch/rejoin checks |
| P3C-R8 | 03C-05 UI/browser checks and 03C-06 declared human evaluation |
| P3C-R9 | 03C-07 exact clean revision, named deployment, authenticated readback and independent packet verification |
| P3C-R10 | Exact labels throughout, 03C-06 comprehension, and 03C-07 fixed claim ceiling |
| P3C-R11 | 03C-07 closure classification, removal/import gate, retention, kill-switch owner, residual-record and retirement trigger |

## Hosted authorization distinction

Plans 03C-01 through 03C-06 and 03C-07 Task 1 authorize local/source work only.
They do not authorize deployment, Convex control-plane access, hosted probes, or
external state changes.

03C-07 Task 2 first discovers every deployment/identity/rollback field without
external calls, then presents a separate blocking founder decision. If absent
or authorization is
withheld, the phase retains its local and comprehension evidence but P3C-R9 and
the hosted portion of D-01 remain open. No command is guessed.

All Phase 3C source gates, deployment and hosted readback run from a separate
clean proof worktree or isolated checkout created from the exact integrated
Phase 3C revision. The handoff records:

- original custody base `2debf4b9f65ce228491f7d3d17ed1654a23bb496`;
- original custody tree `1b92b650e3e821b87619ba46a416b78c8e15ba76`;
- clean proof worktree path, revision and tree.

The original custody tree and its custody-manifested inherited modifications must never be
cleaned, restored, staged, committed, or used as the clean-tree gate target.
Leave the proof worktree in place for parent custody. If removal is later
explicitly directed, move it to Trash; never permanently delete it.
