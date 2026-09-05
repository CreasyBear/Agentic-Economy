# Rename the generic Action Invocation family to Action execution

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee: /root/vocabulary_11 (GPT-5.6 Luna, max; source released after issue 10)
Assigned role: Luna Max / generic Action execution owner, max reasoning
Parent: ../map.md
Blocked by: 08, 09, 10, 29, 30

## Outcome

Rename the generic administrative/runtime Action Invocation implementation to
Action execution, including its module boundary, durable controls, attempts,
history, imports, tests, evidence producers and architecture declarations.
Preserve the existing execution contract and behavior: leasing, concurrency,
effect generations, cancellation, reconciliation, late observations,
idempotency, authority evidence and result classification.

This issue covers the complete generic execution propagation listed below. It
does not rename a purchased capability Invocation into a Call; paid
`capabilityOperationInvocations`, operation-invoke routes/actions, Call rows,
Quote rows and their operation references remain with issues 15–18 and 19.
Where a paid worker imports the generic execution module, change only that
import and generic type/table adapter; do not rename the paid worker's
operation/invocation state in this issue.

## Exact mappings

Apply these mappings only to the generic Action execution family:

- `action-invocation` -> `action-execution` for the module directory, import
  paths, module-boundary name and test-boundary target.
- `ActionInvocation` -> `ActionExecution` in generic types, interfaces and
  exported contracts.
- `actionInvocation` -> `actionExecution` in generic values, functions,
  context fields, telemetry labels and table-map exports.
- Exact compound-name exception: `ActionBaseContext.actionInvocationExecution`
  in `src/modules/common/action.ts` becomes `actionExecution`, not
  `actionExecutionExecution`; its generic nested `invocationRef` becomes
  `executionRef`. Preserve the optional attribution-only shape and its
  prohibition on caller-supplied authority. No field removal or new behavior.
- Generic `invocationRef` -> `executionRef` and generic `invocationVersion` ->
  `executionVersion`; preserve paid invocation/call refs and all protected
  identity/hash material described below.
- The generic expiry-control fence `controlInvocationVersion` becomes
  `controlExecutionVersion` in the exact three propagation files below:
  `convex/capabilityOperationX402AuthorizationExpiry.ts`,
  `src/modules/capability-execution/invocation-worker/recovery/expiry.ts`, and
  `tests/unit/convex/money-x402-payment-attempts.test.ts`. Keep their paid
  `invocationRef` and financial/evidence values unchanged.
- `ActionInvocationTracer`, `DurableActionInvocationTracer`,
  `DurableActionInvocationPort`, `ActionInvocationOrigin`,
  `ActionInvocationView`, `ActionInvocationLimits`,
  `ActionInvocationResultClassification`, `ActionInvocationPreparation`,
  `ActionInvocationContract` and `InvocationDecision` -> their
  `ActionExecution*`, `ExecutionDecision` equivalents.
- The additional generic contract stems `PreparedInvocation` and
  `InvocationActor` become `PreparedExecution` and `ExecutionActor`;
  `PublicInvocation*` types and public read/cancel/reconcile functions become
  `PublicExecution*` equivalents. Generic `invocation_not_found` becomes
  `execution_not_found`; paid refusal codes remain unchanged for later owners.
- Retain generic `ActionInvocationTracer.invoke` and `InvokeActionInput`.
  `invoke` is an existing generic programming verb distinct from the paid
  Invocation noun, and the tracer already has separate `execute` and
  `executeAcquired` operations. Rename only their generic ref/version fields,
  including `expectedInvocationVersion` -> `expectedExecutionVersion`.
- `createInMemoryActionInvocationTracer` /
  `createDurableActionInvocationTracer` -> corresponding
  `*ActionExecutionTracer` functions; `inspectPublicInvocation`,
  `cancelInvocation` and `reconcileInvocation` -> corresponding public
  execution names.
- Generic `actionInvocationControls`, `actionInvocationAttempts` and
  `actionInvocationHistory` -> the exact physical tables
  `actionExecutionControls`, `actionExecutionAttempts` and
  `actionExecutionHistory`.
- Their generic indexes and fields change literally from
  `by_invocationRef...`/`invocationRef`/`invocationVersion` to
  `by_executionRef...`/`executionRef`/`executionVersion`; retain
  `principalRef`, `operationKey`, `effectIdentity`, amount fields, evidence
  fields and all other meanings.
- `actionInvocationControl` Convex module/binding -> `actionExecutionControl`.
  `evidence:action-invocation:development` and the corresponding producer
  filenames/imports -> `evidence:action-execution:development` and their
  `action-execution` names. Do not add an old command alias.

The generic module's standing-mandate files move with the module in this
issue, preserving their basenames and semantics. Issue 12 performs the
separate Spending policy/Request authorization rename after this path move;
issue 11 must not silently rename or merge that policy family.

## Finite source and contract allowlist

### Generic module files and exact target paths

The directory relocation is bounded to these literal files; no other file in
the repository is implied:

- `src/modules/action-invocation/attempt-execution.ts` ->
  `src/modules/action-execution/attempt-execution.ts`
- `src/modules/action-invocation/attempts.ts` ->
  `src/modules/action-execution/attempts.ts`
- `src/modules/action-invocation/canonical-claim.ts` ->
  `src/modules/action-execution/canonical-claim.ts`
- `src/modules/action-invocation/contracts.ts` ->
  `src/modules/action-execution/contracts.ts`
- `src/modules/action-invocation/durable.ts` ->
  `src/modules/action-execution/durable.ts`
- `src/modules/action-invocation/exposure-offset-rules.ts` ->
  `src/modules/action-execution/exposure-offset-rules.ts`
- `src/modules/action-invocation/fenced-execution.ts` ->
  `src/modules/action-execution/fenced-execution.ts`
- `src/modules/action-invocation/in-memory-record-store.ts` ->
  `src/modules/action-execution/in-memory-record-store.ts`
- `src/modules/action-invocation/in-memory.ts` ->
  `src/modules/action-execution/in-memory.ts`
- `src/modules/action-invocation/index.ts` ->
  `src/modules/action-execution/index.ts`
- `src/modules/action-invocation/internal/convex-schema.ts` ->
  `src/modules/action-execution/internal/convex-schema.ts`
- `src/modules/action-invocation/internal/development-durable-port.ts` ->
  `src/modules/action-execution/internal/development-durable-port.ts`
- `src/modules/action-invocation/internal/durable-contracts.ts` ->
  `src/modules/action-execution/internal/durable-contracts.ts`
- `src/modules/action-invocation/internal/x402-convex-values.ts` ->
  `src/modules/action-execution/internal/x402-convex-values.ts`
- `src/modules/action-invocation/lease-control.ts` ->
  `src/modules/action-execution/lease-control.ts`
- `src/modules/action-invocation/operation-public.ts` ->
  `src/modules/action-execution/execution-public.ts`
- `src/modules/action-invocation/preparation.ts` ->
  `src/modules/action-execution/preparation.ts`
- `src/modules/action-invocation/public.ts` ->
  `src/modules/action-execution/public.ts`
- `src/modules/action-invocation/reconciliation-evidence.ts` ->
  `src/modules/action-execution/reconciliation-evidence.ts`
- `src/modules/action-invocation/resolution-control.ts` ->
  `src/modules/action-execution/resolution-control.ts`
- `src/modules/action-invocation/runtime.ts` ->
  `src/modules/action-execution/runtime.ts`
- `src/modules/action-invocation/schema.ts` ->
  `src/modules/action-execution/schema.ts`
- `src/modules/action-invocation/standing-mandate-grant.ts` ->
  `src/modules/action-execution/standing-mandate-grant.ts`
- `src/modules/action-invocation/standing-mandate-policy.ts` ->
  `src/modules/action-execution/standing-mandate-policy.ts`
- `src/modules/action-invocation/standing-mandate-validation.ts` ->
  `src/modules/action-execution/standing-mandate-validation.ts`
- `src/modules/action-invocation/standing-mandate.ts` ->
  `src/modules/action-execution/standing-mandate.ts`
- `src/modules/action-invocation/transfer-evaluator.ts` ->
  `src/modules/action-execution/transfer-evaluator.ts`
- `src/modules/action-invocation/x402-payment-attempt.ts` ->
  `src/modules/action-execution/x402-payment-attempt.ts`
- `src/modules/action-invocation/x402-payment-reconciliation-evidence.ts` ->
  `src/modules/action-execution/x402-payment-reconciliation-evidence.ts`

`operation-public.ts` is generic (it imports only the Action Invocation family)
and therefore has the explicit `execution-public.ts` target. The
`standing-mandate-*` basenames are intentionally left for issue 12.

### Convex tables, adapters and source consumers

- `convex/actionInvocationControl.ts` -> `convex/actionExecutionControl.ts`
  (all readers, writers, validators and internal mutation/query names).
- `convex/schema.ts` (module import, table-map spread and schema ownership).
- `convex/capabilityOperationInvocationProjection.ts` (generic durable-port
  types and `internal.actionInvocationControl` adapter calls only; preserve
  paid projection and its paid `invocationRef`).
- `convex/capabilityOperationX402AuthorizationExpiry.ts` (generic control
  table lookup and the generic `controlExecutionVersion` argument/fence only).
- `convex/lib/operationInvocations/authorityHandlers.ts` (generic control
  table read/type only; preserve paid handler and authority semantics).
- `convex/lib/operationInvocations/contracts.ts` (generic control contracts
  and imports only).
- `convex/lib/operationInvocations/dispatch.ts` (generic control/attempt table
  names, `Doc<>` types and internal adapter only; preserve paid row
  `operationInvocations` and its `invocationRef`).
- `convex/lib/operationInvocations/workComplete.ts` (generic control row type
  and lookup only; preserve paid invocation row).
- `src/modules/common/action.ts` (generic `actionInvocationExecution`,
  `ActionInvocationContract`, preparation and result-classification names).
- `src/modules/actions/index.ts` (generic contract imports/exports only).
- `src/modules/capability-execution/convex.ts` (generic runtime imports/types).
- `src/modules/capability-execution/internal/convex-schema.ts` (generic
  authority/control imports; preserve paid schema).
- `src/modules/capability-execution/invocation-worker/brokeredX402.ts`
- `src/modules/capability-execution/invocation-worker/charge.ts`
- `src/modules/capability-execution/invocation-worker/recovery/cancellation.ts`
- `src/modules/capability-execution/invocation-worker/recovery/contracts.ts`
- `src/modules/capability-execution/invocation-worker/recovery/expiry.ts`
  (generic control version reads, tracer `executionRef` and
  `expectedExecutionVersion` inputs, and `controlExecutionVersion` propagation
  only; preserve paid recovery refs, expiry transitions and payment behavior).
- `src/modules/capability-execution/invocation-worker/recovery/loading.ts`
- `src/modules/capability-execution/invocation-worker/recovery/managedSigning.ts`
- `src/modules/capability-execution/invocation-worker/recovery/preSubmission.ts`
- `src/modules/capability-execution/invocation-worker/recovery/reconciliation.ts`
- `src/modules/capability-execution/invocation-worker/recovery/status.ts`
- `src/modules/capability-execution/invocation-worker/recovery/x402.ts`
- `src/modules/capability-execution/invocation-worker/runPreparation.ts`
- `src/modules/capability-execution/invocation-worker/runRelease.ts`
- `src/modules/capability-execution/operation-invoke-admit.ts`
- `src/modules/capability-execution/operation-recovery.actions.ts`
- `src/modules/module-boundaries.ts` (module name, dependency declarations,
  entry surface and named test-boundary exceptions).
- `package.json` (read-only: provide the exact conformance/import/evidence
  command receipt to the sole root-package writer in issue 22, who applies it
  at the early checkpoint before this issue's accepting checks).

The capability-execution files above are shared consumers, not a license to
rename `operation-invoke`, paid invocation routes, Call tables or external
protocol names. Their only owned edits are generic imports/types/table
bindings, serialized with issues 15–18 where the same line also carries paid
state.

### Generic tests, fixtures and evidence producers

The worker owns these literal tests and fixtures, including path moves where
shown:

- `tests/unit/action-invocation/convex-handler-contract.test.ts` ->
  `tests/unit/action-execution/convex-handler-contract.test.ts`
- `tests/unit/action-invocation/development-file-x402-payment-attempt-port.test.ts` ->
  `tests/unit/action-execution/development-file-x402-payment-attempt-port.test.ts`
- `tests/unit/action-invocation/durable-action-invocation-cancel.test.ts` ->
  `tests/unit/action-execution/durable-action-execution-cancel.test.ts`
- `tests/unit/action-invocation/durable-action-invocation-harness.ts` ->
  `tests/unit/action-execution/durable-action-execution-harness.ts`
- `tests/unit/action-invocation/durable-action-invocation-lease.test.ts` ->
  `tests/unit/action-execution/durable-action-execution-lease.test.ts`
- `tests/unit/action-invocation/durable-action-invocation-observation.test.ts` ->
  `tests/unit/action-execution/durable-action-execution-observation.test.ts`
- `tests/unit/action-invocation/durable-action-invocation-release.test.ts` ->
  `tests/unit/action-execution/durable-action-execution-release.test.ts`
- `tests/unit/action-invocation/durable-action-invocation-result.test.ts` ->
  `tests/unit/action-execution/durable-action-execution-result.test.ts`
- `tests/unit/action-invocation/durable-action-invocation-transact.test.ts` ->
  `tests/unit/action-execution/durable-action-execution-transact.test.ts`
- `tests/unit/action-invocation/bounded-mandate-packet.test.ts` ->
  `tests/unit/action-execution/bounded-mandate-packet.test.ts`
- `tests/unit/action-invocation/evidence-provenance.test.ts` ->
  `tests/unit/action-execution/evidence-provenance.test.ts`
- `tests/unit/action-invocation/full-yolo.test.ts` ->
  `tests/unit/action-execution/full-yolo.test.ts`
- `tests/unit/action-invocation/in-memory-action-invocation.test.ts` ->
  `tests/unit/action-execution/in-memory-action-execution.test.ts`
- `tests/unit/action-invocation/neutral-contract-boundary.test.ts` ->
  `tests/unit/action-execution/neutral-contract-boundary.test.ts`
- `tests/unit/action-invocation/operation-public.test.ts` ->
  `tests/unit/action-execution/execution-public.test.ts`
- `tests/unit/action-invocation/standing-mandate.test.ts` ->
  `tests/unit/action-execution/standing-mandate.test.ts`
- `tests/eval/adr009-composition-direct-control.test.ts`
- `tests/eval/adr009-transfer-comparison.test.ts`
  (current generic trace refs/versions and `action_invocation` ->
  `action_execution`, `narrow_action_invocation_seam` ->
  `narrow_action_execution_seam` expectations only; preserve the dated
  research record, scenario meaning, metrics and acceptance assertions)
- `tests/eval/support/adr009-transfer-comparison.ts`
- `tests/helpers/x402-payment-attempt.ts`
- `tests/imports/action-invocation-host-boundaries.test.ts` ->
  `tests/imports/action-execution-host-boundaries.test.ts`
- `tests/imports/development-evidence-boundary.test.ts`
- `tests/integration/capability-operation-workpool.test.ts`
- `tests/unit/capability-execution/operation-invoke-recover.test.ts`
- `tests/unit/capability-supply/development-evidence-surface.test.ts`
- `tests/unit/capability-supply/supplied-candidate-qualification.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-authority.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-disclosure.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-qualification.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-harness.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-outcomes.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-reconciliation.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-transfer.test.ts`
- `tests/unit/convex/capability-operation-invocation-identity.test.ts`
- `tests/unit/convex/capability-operation-recovery.test.ts`
- `tests/unit/convex/capability-operation-worker-harness.ts`
- `tests/unit/convex/money-x402-payment-attempts.test.ts`
- `tests/unit/convex/source-write-admission.test.ts`
- `tests/unit/provider-operation-fixture/development-provider-operation-packet.test.ts`
- `tests/unit/provider-operation-fixture/development-provider-operation.test.ts`
  (generic `packet.idempotency.first/replay.executionRef` access only;
  preserve the same first-versus-replay identity assertion)
- `tests/unit/schema/convex-schema.test.ts`
- `tests/unit/server/mcp-api-operation-recovery.test.ts`

Evidence and fixture producers/importers are also bounded to:

- `tools/dev/action-invocation-development-evidence.ts` ->
  `tools/dev/action-execution-development-evidence.ts`
- `tools/dev/action-invocation-evidence-packet.ts` ->
  `tools/dev/action-execution-evidence-packet.ts`
- `tools/dev/development-provider-operation-evidence.ts`
- `tools/dev/x402-payment-attempt-child.ts`
- `tools/dev/fixtures/action-invocation/development-file-x402-payment-attempt-port.ts` ->
  `tools/dev/fixtures/action-execution/development-file-x402-payment-attempt-port.ts`
- `tools/dev/bounded-mandate-evidence-packet.ts`
- `tools/dev/full-yolo-evidence-packet.ts`
- `tools/dev/fixtures/capability-supply/development-evidence-continuity.ts`
- `tools/dev/fixtures/capability-supply/development-evidence-fixture.ts`
- `tools/dev/fixtures/capability-supply/development-evidence-invocations.ts` ->
  `tools/dev/fixtures/capability-supply/development-evidence-executions.ts`
- `tools/dev/fixtures/capability-supply/development-evidence-scenario.ts`
  (generic view refs/versions and the corresponding fixture import only)
- `tools/dev/fixtures/provider-operation/development-provider-operation-evidence.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-fixture.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-mandate.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-objective.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-packet.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-provider.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-recovery.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-runner.ts`

Issue 12 later owns the policy words in the bounded/full-yolo and provider
mandate fixtures; issue 11 updates their imports and generic execution names
only. Generated `convex/_generated/api.d.ts` and other generated output are
read-only evidence and are regenerated by issue 22.

The development evidence fixture above runs generic administrative executions
of supplied-quote collection, not purchased Calls. Its exact derived symbols
are `DevelopmentInvocationEvidence` -> `DevelopmentExecutionEvidence` and
`runDevelopmentInvocations` -> `runDevelopmentExecutions`. Update the existing
continuity/scenario imports and the exact file list in
`tests/imports/development-evidence-boundary.test.ts` together. The scenario's
generic `origins`/`observedTransitions` entries use `executionRef`, and generic
view/map reads use `executionRef`/`executionVersion`. In the two added quote
tests, only generic tracer refs/versions change. Preserve supplied Quotes,
protected material, request objects and their existing assertions.

## Explicit exclusions

The protected material below is explicitly excluded from the mechanical rename
unless the listed existing codec boundary permits a behavior-preserving field
adaptation.

- The three physical table mappings are exact and do not merge tables or
  change their behavior. Preserve all table indexes, queue arguments, leases,
  attempt transitions, history ordering, cancellation/reconciliation state and
  late-observation semantics.
- Preserve the existing generic cancellation command material and digest at
  `src/modules/action-invocation/durable.ts:43` (after relocation) and its
  exact vector in `tests/unit/action-invocation/durable-action-invocation-cancel.test.ts`
  (after relocation). Rename surrounding TypeScript fields through the existing
  serializer boundary only if the canonical bytes remain identical. Keep
  `operationKey`, effect identity, canonical hash keys, format literals and
  signatures stable. If no existing boundary can do so, stop with a concrete
  coordinator blocker; do not add a compatibility framework or new encoder.
- Do not rename paid `capabilityOperationInvocations`,
  `capabilityOperationCommitments`, `capabilityOperationCalls`, paid
  `operationInvocations` directory/state, `operationRef` in paid/protected
  material, route filenames, MCP methods, OpenAPI `operationId`, OAuth fields,
  x402 fields, external financial namespaces or opaque IDs.
- Preserve the complete existing signed/digested reconciliation material:
  `ReconciliationEvidenceMaterial.kind = 'action_invocation_reconciliation'`,
  `version: 1`, its `invocationRef` and optional `operationRef` keys, and every
  other canonical key/value in `reconciliation-evidence.ts`. Likewise preserve
  `X402PaymentReconciliationEvidenceMaterial.kind = 'x402_payment_reconciliation'`
  and its canonical `invocationRef` in `x402-payment-reconciliation-evidence.ts`.
  Both existing validators hash the material object itself; changing these
  keys would change issued evidence. This is a protected format exception,
  not a legacy-client alias or a parallel public API.
  Surrounding generic runtime inputs/attempts use `executionRef`; compare
  those to the retained `evidence.invocationRef` in the existing validators.
  Do not recursively rewrite `evidence` objects, change the proof discriminator,
  or add an envelope/translation framework. Existing paid recovery schemas,
  HTTP/MCP examples, CLI evidence examples and Provider fixtures retain these
  protected material keys even after their surrounding names are rationalised.
  Run the existing reconciliation integrity/source/attempt/generation/time
  tests and preserve their literal before/after bytes alongside cancellation
  vectors. If a generic caller outside the finite allowlist needs a surrounding
  field update, report its exact path; protected proof objects alone do not
  authorise editing that file.
- Do not rename `principals`, `accounts`, `businesses`, `operationKeys`, money
  tables or Convex component internals. Generic IAM and access-policy naming is
  issue 10/12 scope, not a generic action folder replacement.
- Do not edit generated files, package-lock/dependency metadata, database data,
  deployment state, external evidence or unrelated dirty/untracked files. Do
  not retain old source aliases or create a second execution API.

## Dependencies and sequencing

- Dispatch is blocked by baseline 08, canonical authorities 09, issue 10's
  role-boundary patch and independent reviews 29 and 30.
- Shared writers are serialized `10 -> 11 -> 12`. Issue 11 must complete the
  module/table move before issue 12 renames the policy files and authority
  basis. Issues 15–18 consume the generic execution types in their paid
  workers and must update only their explicitly owned paid slices.
- Issue 22 owns Convex/router/CLI/public generated artifacts. The coordinator
  may run issue 22's existing generator as an early type/import checkpoint
  after the source move; this issue never edits generated output and cannot
  close on stale generated bindings.

## Verification commands and expected results

Run after dispatch with Node 22/npm 11.5.1 via the repository runner:

1. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/action-execution/convex-handler-contract.test.ts tests/unit/action-execution/development-file-x402-payment-attempt-port.test.ts tests/unit/action-execution/durable-action-execution-cancel.test.ts tests/unit/action-execution/durable-action-execution-lease.test.ts tests/unit/action-execution/durable-action-execution-observation.test.ts tests/unit/action-execution/durable-action-execution-release.test.ts tests/unit/action-execution/durable-action-execution-result.test.ts tests/unit/action-execution/durable-action-execution-transact.test.ts tests/unit/action-execution/in-memory-action-execution.test.ts tests/unit/action-execution/neutral-contract-boundary.test.ts tests/unit/action-execution/execution-public.test.ts tests/unit/action-execution/standing-mandate.test.ts tests/integration/capability-operation-workpool.test.ts tests/unit/convex/capability-operation-recovery.test.ts tests/unit/convex/money-x402-payment-attempts.test.ts tests/unit/convex/source-write-admission.test.ts tests/unit/schema/convex-schema.test.ts tests/unit/server/mcp-api-operation-recovery.test.ts tests/imports/action-execution-host-boundaries.test.ts --no-file-parallelism` — generic controls, attempts, history, leases, cancel/reconcile, paid adapters and schema expectations pass.
2. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck` — pass with no stale action-invocation import or table type.
3. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check:convex-codegen` — pass after issue 22's generator checkpoint; generated names match the source schema.
4. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:conformance` — pass at the integration checkpoint, including action-execution and paid recovery invariants.
5. After issue 22 updates generated bindings and the CLI build: `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:imports` — pass; do not run this during issue preparation.
6. Scoped `rg` over the literal allowlist — no unprotected generic `action-invocation`, `ActionInvocation`, `actionInvocationControls`, `actionInvocationAttempts`, `actionInvocationHistory` or generic `invocationRef` remains. Any remaining match is a paid/protected occurrence named in the exclusions or a historical evidence path explicitly retained by its owner.
7. The existing cancellation-digest test records the pre-refactor and post-refactor canonical material/digest as equal; all lease, effect-generation, duplicate-command, cancellation, uncertain-outcome and reconciliation assertions remain unchanged.

The coordinator baseline is separate evidence: typecheck passed; unit passed
459 files/4,041 tests; integration passed 112 files/1,083 tests with one
skipped file and four skipped tests; `test:types` passed one file/four tests;
and `test:ts-standards` failed 26 pre-refactor findings. Do not weaken or
reclassify that baseline in this issue.

## Implementation receipt (source11, 2026-09-05)

Coordinator accepted local source closure after the independent issue22 owner
reported no findings in the frozen production-caller review (Convex dispatch,
workpool, expiry/recovery, durable hashes and public/runtime exports). Root
confirmed all changed source/test/tooling paths belong to the finite allowlist.
The scoped local commit includes this issue, its source patch and issue22's
matching generated binding and three package-command changes. Local source
acceptance is satisfied for the finite allowlist below. Broad
integration/conformance and live/deployment acceptance are explicitly deferred
under Joel's source-first override; this receipt makes no fresh conformance,
deployment, hosted-environment, or financial-operation claim.

### Exact command receipts

- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/eval/adr009-transfer-comparison.test.ts tests/unit/capability-supply/supplied-candidate-quote-reconciliation.test.ts tests/unit/provider-operation-fixture/development-provider-operation.test.ts tests/integration/capability-operation-workpool.test.ts tests/unit/convex/capability-operation-recovery.test.ts tests/unit/action-execution/standing-mandate.test.ts tests/unit/convex/source-write-admission.test.ts tests/unit/action-execution/durable-action-execution-result.test.ts tests/unit/convex/capability-operation-invocation-identity.test.ts --no-file-parallelism` — 9 files and 97 tests passed.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/action-execution/convex-handler-contract.test.ts tests/unit/action-execution/development-file-x402-payment-attempt-port.test.ts tests/unit/action-execution/durable-action-execution-cancel.test.ts tests/unit/action-execution/durable-action-execution-lease.test.ts tests/unit/action-execution/durable-action-execution-observation.test.ts tests/unit/action-execution/durable-action-execution-release.test.ts tests/unit/action-execution/durable-action-execution-result.test.ts tests/unit/action-execution/durable-action-execution-transact.test.ts tests/unit/action-execution/in-memory-action-execution.test.ts tests/unit/action-execution/neutral-contract-boundary.test.ts tests/unit/action-execution/execution-public.test.ts tests/unit/action-execution/standing-mandate.test.ts tests/integration/capability-operation-workpool.test.ts tests/unit/convex/capability-operation-recovery.test.ts tests/unit/convex/money-x402-payment-attempts.test.ts tests/unit/convex/source-write-admission.test.ts tests/unit/schema/convex-schema.test.ts tests/unit/server/mcp-api-operation-recovery.test.ts tests/imports/action-execution-host-boundaries.test.ts --no-file-parallelism` — 19 files and 212 tests passed.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck` (`tsc --noEmit`) — passed with exit 0.
- `git diff --check` — clean.
- Coordinator/issue22 receipt after source generation: affected binding generation/recheck passed; `test:types` passed 4/4; imports passed 49/49; the only reported API diff was the intended controller rename. Source11 did not edit generated output or rerun those package-owned checks.

### Corrective import-boundary receipt

The standing-mandate test's undeclared direct import of the internal
`policyDecisionIntegrityValid` helper was removed. The test now retains the
literal policy digest assertion and exercises the existing public store
boundary: it builds `policyDecisions: [decision.value]` on an
`issuedStore().exportSnapshot()` result, restores it, asserts the decision is
retained in the restored export, and verifies both the restore function and
the constructor refuse a tampered policy digest. The released source API is
`exportSnapshot()` (not `snapshot()`); no alias, export, manifest exception or
proof weakening was added.

- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/action-execution/standing-mandate.test.ts tests/imports/module-boundaries.test.ts tests/imports/action-execution-host-boundaries.test.ts --no-file-parallelism` — 3 files and 62 tests passed.
- No source, manifest, generated/package, Git, issue38, deployment or live
  acceptance work was performed in this corrective pass.

### Root-cause fixes and ownership closure

- Workpool claim/finalization was comparing the generic `actionExecutionControls`
  row, authority binding and attempt through the old `invocationRef` key. The
  bounded fix is in `commandMatchesDispatch`; paid operation rows and
  `persistedDispatchMatches` retain their paid `invocationRef` identity.
- Recovery status fixtures still supplied the old nested generic control and
  attempt key, so the adapter correctly failed closed as not found. The
  generic fixture fields now use `executionRef`; paid foreign-session output
  remains `invocationRef`.
- Standing v1 authority-use and policy-decision digests hash their complete
  material objects. Renaming the storage field changed the bytes and caused
  typed snapshot refusals. At the existing digest boundaries only, private
  projections emit the protected `invocationRef` key and preserve every other
  field; no alias, envelope, recursive mapper, or new behavior was added.
- The existing whole-attempt history hashes likewise use a private
  `canonicalAttemptMaterial` projection at the two existing transition hash
  sites, mapping only `executionRef` back to `invocationRef`. Residual generic
  compiler/test names and refusal literals were corrected without changing
  paid/protected meanings.

### Protected byte and literal-vector evidence

The cancellation material remains `format: 'action-invocation-cancel:v1'`
with its original canonical keys, including `invocationRef`, `operationKey`
and effect identity. The relocated cancellation test now asserts these exact
digests:

- `request_owned`: `sha256:09ba17db947c1214c75f8640a84b34f8abb349a1eed3dd1d76f3490ead70850f`
- `standalone`: `sha256:7ba3abd910f196cc348d2640480f31ca8ece24c4201a0044c42b57b74394762d`

The supplied-quote reconciliation test asserts the pre-refactor whole-attempt
history vectors after the execution-key rename:

| origin | transition | prior digest | next digest |
| --- | --- | --- | --- |
| `request_owned` | `execute_acquired` | `sha256:5273af0409a63ba24d22b835c814677c43dd565451723eaac6fc032065867bea` | `sha256:cfa8d62119c2b46214e6ef914ca539028e16a981c18a9f98546f7d5c96f0f39d` |
| `request_owned` | `released` | `sha256:cfa8d62119c2b46214e6ef914ca539028e16a981c18a9f98546f7d5c96f0f39d` | `sha256:c766c108ae4b7f360e832148fbaf4c13a24f4bc906d563d273b87dafdcd5570c` |
| `request_owned` | `not_released` | `sha256:cfa8d62119c2b46214e6ef914ca539028e16a981c18a9f98546f7d5c96f0f39d` | `sha256:775b86ce8b70b6c0466b46bd0f235f8f717c007844d8a9a5ac7fcbb5ec7290e9` |
| `standalone` | `execute_acquired` | `sha256:35a2d0dfa3edd4bf89b0f7da18a8cdfe26ef88ef3608063b7577335fad3b120b` | `sha256:1d297211ccf957ab0c95a7229ef17e6c9d8a67aefab51aa6932ad9f03c9e3863` |
| `standalone` | `released` | `sha256:1d297211ccf957ab0c95a7229ef17e6c9d8a67aefab51aa6932ad9f03c9e3863` | `sha256:9e2bcad120afe8cb0278898cae91c62a20076683862058fc778759e436889e31` |
| `standalone` | `not_released` | `sha256:1d297211ccf957ab0c95a7229ef17e6c9d8a67aefab51aa6932ad9f03c9e3863` | `sha256:a3deda934bad1878992531988f87899ef9f0d37c3a76d8b312f4fe07d16d79f1` |

The standing-mandate policy decision literal remains
`sha256:34ce24fe704c82059dda9fb39b88c4eac906eeb25e036a39b914cf9c57d90a62`,
and the legacy authority-use snapshot passes the existing integrity validator.
Reconciliation evidence keeps `kind: 'action_invocation_reconciliation'`,
`version: 1`, `invocationRef`, optional `operationRef`, and every other
canonical field; the X402 reconciliation body likewise keeps its original
`kind` and `invocationRef`. The focused acceptance suite covers these
validators and their existing assertions.

### Finite scoped staging path list

Stage only the following source11 paths (old and new sides of each move are
listed deliberately). Do not stage `package.json`, `convex/_generated/**`,
other generated output, or any unrelated planning/operations/workflow file.

Generic module moves:

```text
src/modules/action-invocation/attempt-execution.ts -> src/modules/action-execution/attempt-execution.ts
src/modules/action-invocation/attempts.ts -> src/modules/action-execution/attempts.ts
src/modules/action-invocation/canonical-claim.ts -> src/modules/action-execution/canonical-claim.ts
src/modules/action-invocation/contracts.ts -> src/modules/action-execution/contracts.ts
src/modules/action-invocation/durable.ts -> src/modules/action-execution/durable.ts
src/modules/action-invocation/exposure-offset-rules.ts -> src/modules/action-execution/exposure-offset-rules.ts
src/modules/action-invocation/fenced-execution.ts -> src/modules/action-execution/fenced-execution.ts
src/modules/action-invocation/in-memory-record-store.ts -> src/modules/action-execution/in-memory-record-store.ts
src/modules/action-invocation/in-memory.ts -> src/modules/action-execution/in-memory.ts
src/modules/action-invocation/index.ts -> src/modules/action-execution/index.ts
src/modules/action-invocation/internal/convex-schema.ts -> src/modules/action-execution/internal/convex-schema.ts
src/modules/action-invocation/internal/development-durable-port.ts -> src/modules/action-execution/internal/development-durable-port.ts
src/modules/action-invocation/internal/durable-contracts.ts -> src/modules/action-execution/internal/durable-contracts.ts
src/modules/action-invocation/internal/x402-convex-values.ts -> src/modules/action-execution/internal/x402-convex-values.ts
src/modules/action-invocation/lease-control.ts -> src/modules/action-execution/lease-control.ts
src/modules/action-invocation/operation-public.ts -> src/modules/action-execution/execution-public.ts
src/modules/action-invocation/preparation.ts -> src/modules/action-execution/preparation.ts
src/modules/action-invocation/public.ts -> src/modules/action-execution/public.ts
src/modules/action-invocation/reconciliation-evidence.ts -> src/modules/action-execution/reconciliation-evidence.ts
src/modules/action-invocation/resolution-control.ts -> src/modules/action-execution/resolution-control.ts
src/modules/action-invocation/runtime.ts -> src/modules/action-execution/runtime.ts
src/modules/action-invocation/schema.ts -> src/modules/action-execution/schema.ts
src/modules/action-invocation/standing-mandate-grant.ts -> src/modules/action-execution/standing-mandate-grant.ts
src/modules/action-invocation/standing-mandate-policy.ts -> src/modules/action-execution/standing-mandate-policy.ts
src/modules/action-invocation/standing-mandate-validation.ts -> src/modules/action-execution/standing-mandate-validation.ts
src/modules/action-invocation/standing-mandate.ts -> src/modules/action-execution/standing-mandate.ts
src/modules/action-invocation/transfer-evaluator.ts -> src/modules/action-execution/transfer-evaluator.ts
src/modules/action-invocation/x402-payment-attempt.ts -> src/modules/action-execution/x402-payment-attempt.ts
src/modules/action-invocation/x402-payment-reconciliation-evidence.ts -> src/modules/action-execution/x402-payment-reconciliation-evidence.ts
```

Convex and shared source consumers:

```text
convex/actionInvocationControl.ts -> convex/actionExecutionControl.ts
convex/schema.ts
convex/capabilityOperationInvocationProjection.ts
convex/capabilityOperationX402AuthorizationExpiry.ts
convex/lib/operationInvocations/authorityHandlers.ts
convex/lib/operationInvocations/contracts.ts
convex/lib/operationInvocations/dispatch.ts
convex/lib/operationInvocations/workComplete.ts
src/modules/actions/index.ts
src/modules/capability-execution/convex.ts
src/modules/capability-execution/internal/convex-schema.ts
src/modules/capability-execution/invocation-worker/brokeredX402.ts
src/modules/capability-execution/invocation-worker/charge.ts
src/modules/capability-execution/invocation-worker/recovery/cancellation.ts
src/modules/capability-execution/invocation-worker/recovery/contracts.ts
src/modules/capability-execution/invocation-worker/recovery/expiry.ts
src/modules/capability-execution/invocation-worker/recovery/loading.ts
src/modules/capability-execution/invocation-worker/recovery/managedSigning.ts
src/modules/capability-execution/invocation-worker/recovery/preSubmission.ts
src/modules/capability-execution/invocation-worker/recovery/reconciliation.ts
src/modules/capability-execution/invocation-worker/recovery/status.ts
src/modules/capability-execution/invocation-worker/recovery/x402.ts
src/modules/capability-execution/invocation-worker/runPreparation.ts
src/modules/capability-execution/invocation-worker/runRelease.ts
src/modules/capability-execution/operation-invoke-admit.ts
src/modules/capability-execution/operation-recovery.actions.ts
src/modules/common/action.ts
src/modules/module-boundaries.ts
```

Tests and fixtures:

```text
tests/unit/action-invocation/convex-handler-contract.test.ts -> tests/unit/action-execution/convex-handler-contract.test.ts
tests/unit/action-invocation/development-file-x402-payment-attempt-port.test.ts -> tests/unit/action-execution/development-file-x402-payment-attempt-port.test.ts
tests/unit/action-invocation/durable-action-invocation-cancel.test.ts -> tests/unit/action-execution/durable-action-execution-cancel.test.ts
tests/unit/action-invocation/durable-action-invocation-harness.ts -> tests/unit/action-execution/durable-action-execution-harness.ts
tests/unit/action-invocation/durable-action-invocation-lease.test.ts -> tests/unit/action-execution/durable-action-execution-lease.test.ts
tests/unit/action-invocation/durable-action-invocation-observation.test.ts -> tests/unit/action-execution/durable-action-execution-observation.test.ts
tests/unit/action-invocation/durable-action-invocation-release.test.ts -> tests/unit/action-execution/durable-action-execution-release.test.ts
tests/unit/action-invocation/durable-action-invocation-result.test.ts -> tests/unit/action-execution/durable-action-execution-result.test.ts
tests/unit/action-invocation/durable-action-invocation-transact.test.ts -> tests/unit/action-execution/durable-action-execution-transact.test.ts
tests/unit/action-invocation/bounded-mandate-packet.test.ts -> tests/unit/action-execution/bounded-mandate-packet.test.ts
tests/unit/action-invocation/evidence-provenance.test.ts -> tests/unit/action-execution/evidence-provenance.test.ts
tests/unit/action-invocation/full-yolo.test.ts -> tests/unit/action-execution/full-yolo.test.ts
tests/unit/action-invocation/in-memory-action-invocation.test.ts -> tests/unit/action-execution/in-memory-action-execution.test.ts
tests/unit/action-invocation/neutral-contract-boundary.test.ts -> tests/unit/action-execution/neutral-contract-boundary.test.ts
tests/unit/action-invocation/operation-public.test.ts -> tests/unit/action-execution/execution-public.test.ts
tests/unit/action-invocation/standing-mandate.test.ts -> tests/unit/action-execution/standing-mandate.test.ts
tests/imports/action-invocation-host-boundaries.test.ts -> tests/imports/action-execution-host-boundaries.test.ts
tests/eval/adr009-composition-direct-control.test.ts
tests/eval/adr009-transfer-comparison.test.ts
tests/eval/support/adr009-transfer-comparison.ts
tests/helpers/x402-payment-attempt.ts
tests/imports/development-evidence-boundary.test.ts
tests/integration/capability-operation-workpool.test.ts
tests/unit/capability-execution/operation-invoke-recover.test.ts
tests/unit/capability-supply/development-evidence-surface.test.ts
tests/unit/capability-supply/supplied-candidate-qualification.test.ts
tests/unit/capability-supply/supplied-candidate-quote-authority.test.ts
tests/unit/capability-supply/supplied-candidate-quote-disclosure.test.ts
tests/unit/capability-supply/supplied-candidate-quote-qualification.test.ts
tests/unit/capability-supply/supplied-candidate-quote-harness.ts
tests/unit/capability-supply/supplied-candidate-quote-outcomes.test.ts
tests/unit/capability-supply/supplied-candidate-quote-reconciliation.test.ts
tests/unit/capability-supply/supplied-candidate-quote-transfer.test.ts
tests/unit/convex/capability-operation-invocation-identity.test.ts
tests/unit/convex/capability-operation-recovery.test.ts
tests/unit/convex/capability-operation-worker-harness.ts
tests/unit/convex/money-x402-payment-attempts.test.ts
tests/unit/convex/source-write-admission.test.ts
tests/unit/provider-operation-fixture/development-provider-operation-packet.test.ts
tests/unit/provider-operation-fixture/development-provider-operation.test.ts
tests/unit/schema/convex-schema.test.ts
tests/unit/server/mcp-api-operation-recovery.test.ts
```

Evidence and development producers:

```text
tools/dev/action-invocation-development-evidence.ts -> tools/dev/action-execution-development-evidence.ts
tools/dev/action-invocation-evidence-packet.ts -> tools/dev/action-execution-evidence-packet.ts
tools/dev/development-provider-operation-evidence.ts
tools/dev/x402-payment-attempt-child.ts
tools/dev/fixtures/action-invocation/development-file-x402-payment-attempt-port.ts -> tools/dev/fixtures/action-execution/development-file-x402-payment-attempt-port.ts
tools/dev/bounded-mandate-evidence-packet.ts
tools/dev/full-yolo-evidence-packet.ts
tools/dev/fixtures/capability-supply/development-evidence-continuity.ts
tools/dev/fixtures/capability-supply/development-evidence-fixture.ts
tools/dev/fixtures/capability-supply/development-evidence-invocations.ts -> tools/dev/fixtures/capability-supply/development-evidence-executions.ts
tools/dev/fixtures/capability-supply/development-evidence-scenario.ts
tools/dev/fixtures/provider-operation/development-provider-operation-evidence.ts
tools/dev/fixtures/provider-operation/development-provider-operation-fixture.ts
tools/dev/fixtures/provider-operation/development-provider-operation-mandate.ts
tools/dev/fixtures/provider-operation/development-provider-operation-objective.ts
tools/dev/fixtures/provider-operation/development-provider-operation-packet.ts
tools/dev/fixtures/provider-operation/development-provider-operation-provider.ts
tools/dev/fixtures/provider-operation/development-provider-operation-recovery.ts
tools/dev/fixtures/provider-operation/development-provider-operation-runner.ts
```

The issue record itself is the only staged planning evidence path:
`.scratch/vocabulary-rationalisation/issues/11-rename-generic-action-execution.md`.
The package file and generated bindings remain issue22-owned, and unrelated
dirty/untracked planning, operations and workflow files remain excluded.

## Acceptance

- [x] Every literal generic module file, import, exported contract, table,
      index, Convex adapter, script, fixture and test in the allowlist uses
      Action execution naming and the generated module path is current.
- [x] `actionExecutionControls`, `actionExecutionAttempts` and
      `actionExecutionHistory` are the only current generic durable tables;
      indexes/readers/writers/queued arguments preserve behavior.
- [x] Generic execution refs use `executionRef`/`executionVersion`; paid
      `operationRef`/invocation/call identity remains with later owners and is
      not collapsed into generic execution.
- [x] Leasing, concurrency, cancellation, reconciliation, idempotency,
      authority ordering, uncertain outcomes and late observations pass their
      existing behavior tests; no duplicate purchase or Call is introduced.
- [x] Existing protected cancellation/hash/format vectors are byte-stable and
      no custom codec, compatibility layer, dependency or replacement runtime
      is introduced.
- [x] Issue 22's generated/codegen/import checkpoint passes, and no stale
      generated output or unowned source is included.
- [x] No database reset, deployment, public API redesign, paid Call rename,
      protocol rename, commit or unrelated cleanup is included.

The checked items are local source acceptance plus the coordinator's issue22
checkpoint receipt. Broad conformance/integration and live/deployment checks
remain intentionally deferred and are not represented as passing here.

## Closure evidence

Attach the literal before/after path map, semantic diff and ownership notes for
every shared consumer; focused test, typecheck, codegen, conformance and import
outputs; the table/index schema diff; the generic-vs-paid ref classification;
the cancellation/hash vector comparison; and a comparison against the Phase 0
source archive proving unrelated dirty/untracked bytes were preserved. List
every intentional old occurrence with its protected or historical reason. Do
not resolve this issue on a passing module unit test while paid adapters,
generated bindings or architecture declarations still use the old family.

## Comments

- 2026-09-05 — Prepared from the current action-family inventory and
  engineering findings F2/F3/F5. Generic execution maps to
  `executionRef`/`actionExecution*`; paid Quote/Call rows and protected
  operation refs remain separate.
- 2026-09-05 — This ticket is serialized after issue 10 and before issue 12.
  Issue 22 owns generated output and may provide an early supported generation
  checkpoint; no generated file is part of this ticket's editable allowlist.
