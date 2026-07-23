# Phase 3C Plan 07C — durable payment-prepared reconstruction

## Decision

Select one optional typed pre-attempt payment read on the shared
`PaidOperationReadPort`. The application service calls it only for an authorized
zero-attempt view whose accepted authority is current. Hosted composition and
the direct Convex projection adapt the already-loaded durable payment row into
that read. No payment, authority, evidence, attempt, or lifecycle state is
accepted from a caller or fabricated during projection.

This repairs the version-2 source contradiction: the hosted aggregate already
owns a durable `prepared` payment row before the first Action Attempt, while the
previous reconstruction path loaded payment only through the latest attempt.

## Source-owner decision

| Mapping evaluated | Disposition | Source reason and blast radius |
| --- | --- | --- |
| Optional typed `loadPreparedPaymentAttempt({ invocationRef })` on `PaidOperationReadPort` | Selected | The application service remains the single semantic owner. Hosted adapters expose one already-loaded business row; the existing attempt-bound read is unchanged. |
| Fabricate an Action Attempt or move payment into neutral invocation control | Rejected | Creation deliberately persists payment before any attempt. Fabrication would invent effect lineage; moving the row would duplicate business truth in neutral control. |
| Special-case version 2 in hosted composition or the Convex gateway | Rejected | It would branch payment and continuation semantics across hosts and bypass the shared projection owner. The adapters now supply data only; they do not derive product truth. |

## Custody and scope

The child started detached and clean at revision
`945b814bb30f15d4740e850805c2ec50cab1ae1c`, tree
`7bd7c71f00fbc1ccaa77819815350ddb0868c4db`. The parent branch is
`codex/phase3c-execution`.

The official custody verifier accepted
`/tmp/ae-phase3c-parent-custody-945b814b.json` with canonical SHA-256
`81a7539cfdcbc4b91e54bb7f05755cfa8093b12c45556b570c667bf58261c635`.
The self-containing JSON file's raw SHA-256 is
`c167caa06cebcab2c723639265c81920b3829ddc29fc42794107fd54e81eae80`.
It contains exactly 66 inherited entries. Their intersection with the exact
Plan 07C allowlist is zero.

Changed paths are limited to:

- `src/modules/action-invocation/paid-operation-application-service.ts`
- `src/modules/action-invocation/hosted-paid-operation-composition.ts`
- `convex/hostedPaidOperationGateway.ts`
- `tests/unit/action-invocation/paid-operation-application-service.test.ts`
- `tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts`
- `tests/unit/action-invocation/convex-handler-contract.test.ts`
- `.planning/phases/03c-hosted-paid-operation-product-trial/03C-07C-SUMMARY.md`

`tests/unit/action-invocation/paid-operation-projection.test.ts` was verified but
did not require modification. No schema, generated output, route, workflow,
hosted proof/collector/journey/smoke, UI, package, product, design, or inherited
custody path changed.

## RED disposition

The first test invocation stopped at `sh: vitest: command not found`; that was
dependency setup noise in the clean child, not a semantic RED. An ignored,
temporary `node_modules` symlink reused the existing local AE dependency tree;
there was no install or network access.

With dependencies resolved, the old source ran 55 tests across the four named
files. Fifty controls passed and five intended assertions failed:

- the direct application projection returned `paymentAuthorization:not_created`
  for authorized version 2;
- warm/cold hosted version-2 reconstruction returned the same incorrect state;
- the authenticated Convex version-2 projection returned the incorrect state;
- declared pre-attempt support did not fail closed for a missing row;
- declared pre-attempt support did not fail closed for a non-`prepared` row.

The primary diagnostics were semantic assertion differences or the absence of
the named invariant throw. There were no import, configuration, or fixture-shape
failures in the classified RED run.

## Implemented contract

`PaidOperationReadPort` now optionally declares
`loadPreparedPaymentAttempt({ invocationRef })`. Reconstruction uses it only
when all of the following are true:

1. `attempts.length === 0`;
2. control is `authorized`;
3. accepted authority is present and current; and
4. the adapter declares the optional read.

For approve-each authority, current means its accepted reference equals the
view's current authority reference. A declared read must return exactly
`state: 'prepared'`; missing or any other state throws
`paid_operation_pre_attempt_payment_invariant`.

If an attempt exists, reconstruction still uses only the prior keyed
`loadPaymentAttempt({ invocationRef, attemptRef, effectGeneration })` path. The
development adapter omits the optional method and retains its prior behavior.

## Observable local behavior

| View | Payment authorization | Submission | Settlement | Result | Only continuation |
| --- | --- | --- | --- | --- | --- |
| Version 1, awaiting authority, same durable prepared row | `not_created` | `not_submitted` | `no_evidence` | `not_delivered` | `authorize` |
| Version 2, authorized, zero attempts, current accepted authority | `created` | `not_submitted` | `no_evidence` | `not_delivered` | `execute` |

The version-2 authenticated Convex fixture renders the existing card label
`Payment prepared`. Warm reconstruction after authorization and cold
reconstruction from exported durable state are byte-equivalent at the semantic
projection boundary and have the same semantic digest. Missing/non-prepared
declared state fails with the named invariant. Existing cross-owner, stale
version, attempt-bound payment, response uncertainty, reconcile-only, and
development-adapter controls continue to pass.

## Verification

| Command | Result |
| --- | --- |
| `npm run test -- tests/unit/action-invocation/paid-operation-application-service.test.ts tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/convex-handler-contract.test.ts tests/unit/action-invocation/paid-operation-projection.test.ts` | GREEN: 4 files, 55 tests passed |
| `npm run test -- tests/unit/server/hosted-paid-operation-runtime.test.ts tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-agent-auth.test.ts tests/unit/action-invocation/paid-operation-card.test.tsx tests/ui-contract/hosted-paid-operation-contract.test.tsx tests/imports/hosted-paid-operation-boundaries.test.ts` | GREEN: 6 files, 32 tests passed |
| `npm run typecheck` | Inherited broad baseline remains red with 108 diagnostics; exact changed-path filter returned zero diagnostics. First inherited diagnostic is `convex/capabilitySupply.ts(583,3)`. |
| changed-path `oxlint --deny-warnings` | PASS, zero warnings |
| `git diff --check` | PASS |
| official custody-manifest verification | PASS: canonical digest `81a7539c...`, 66 entries |
| exact allowlist and custody intersection | PASS: zero out-of-allowlist paths; zero inherited overlap |

`check:convex-codegen` was not run because this task prohibited Convex CLI and
control-plane use. No browser, credentials, deployment, network, external
provider, payment, or settlement operation was attempted.

## Evidence and claim ceiling

Evidence is limited to source inspection, local unit/integration fixtures,
local Convex fixtures, and labelled local hosted-adapter mechanics. This proves
the reconstruction contract under those fixtures only.

It does not prove hosted reachability, an exact served revision, real
credentials, provider fulfilment, payment, settlement, production safety,
accessibility or comprehension in use, customer value, or demand.

## Remaining failure and next safe action

The inherited repository-wide TypeScript baseline remains red outside the
owned paths. Plan 07C does not adopt that unrelated repair surface.

The parent should audit and integrate the returned scoped commit into
`codex/phase3c-execution`, rerun the same local source gates at the integrated
revision, and only then decide whether the separately authorized exact-revision
hosted evidence loop may proceed. This summary intentionally leaves the
self-referential commit and result tree to the external handoff.
