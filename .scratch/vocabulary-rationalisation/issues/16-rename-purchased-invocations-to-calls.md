# Rename purchased Invocations to Calls

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / paid Call lifecycle and recovery implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 29, 30

## Outcome

Rename the AE-owned purchased invocation lifecycle to Call from Quote
admission through reservation, dispatch, provider effect, delivery/payment
observation, recovery, receipt/history and read models. A Call is one accepted
use of a Tool. Preserve effect identity, idempotency, leasing, concurrency,
cancellation, uncertain outcomes, reconciliation and all authority/money
boundaries. The worker must update definitions and every listed caller/test in
one coherent patch after the Quote checkpoint; a definition-only Call rename is
not complete.

## Fixed mappings

| Existing AE-owned name | Replacement | Rule |
| --- | --- | --- |
| Purchased Invocation | Call | One accepted Tool use; never create a second purchase object. |
| `invocationRef` on a purchased Call | `callRef` | Rename the API/storage field only at the paid lifecycle boundary. |
| purchased `commitmentRef` | `quoteRef` | Consume issue 15's Quote field; preserve opaque Quote identifier bytes. |
| purchased `operationRef` | `toolRef` | Consume issue 13's Tool field; preserve opaque Tool identifier bytes. |
| purchased `operationRevision` | `toolVersion` | Preserve revision/version value and stale-version refusal. |
| purchased `operationMaterialDigest` | `toolMaterialDigest` | Rename surrounding field; digest bytes stay unchanged. |
| purchased `operationJson` | `toolJson` | Rename API/storage field; use existing snapshot codecs. |
| purchased `operationLabel` | `toolLabel` | Rename the AE-owned presentation/read-model field. |
| `capabilityOperationInvocations` | `capabilityCalls` | Physical table, validators, indexes, readers, writers and queued payloads move together. |
| `capabilityOperationCallProjections` | `capabilityCallProjections` | Physical projection table/index and rebuild path move together. |
| `capabilityOperationInvocationIdentity.ts` | `capabilityCallIdentity.ts` | Rename AE-owned module; preserve attempt identity material bytes. |
| `capabilityOperationInvocationProjection.ts` | `capabilityCallProjection.ts` | Rename AE-owned projection module; preserve delivery/payment/provider states. |
| `capabilityOperationInvocationWorker.ts` | `capabilityCallWorker.ts` | Rename AE-owned worker module; preserve leases/retry/recovery. |
| `capabilityOperationLiveX402.ts` | `capabilityCallLiveX402.ts` | Rename AE-owned module; preserve x402 protocol fields. |
| `capabilityOperationX402AuthorizationExpiry.ts` | `capabilityCallX402AuthorizationExpiry.ts` | Rename AE-owned recovery module; preserve authorization/expiry semantics. |
| `operation-invoke` family in paid execution | `call` family | Exact file mappings below; public action IDs/routes are issue 19's cutover. |
| `operationInvocations` Convex helper family | `callLifecycle` | Rename the AE-owned helper boundary; retain file responsibilities and existing sequencing. |
| AE-owned budget `maximumSpendPerInvocation` | `maximumSpendPerCall` | Call-facing source/storage field; preserve the existing policy digest bytes through its current encoder. |
| AE-owned budget `maximumConcurrentInvocations` | `maximumConcurrentCalls` | Call-facing source/storage field; preserve limit and concurrency behaviour. |
| `per_invocation_exceeds_daily` | `per_call_exceeds_daily` | AE-owned validation error; preserve refusal semantics and existing canonical digest basis. |

Post-11 generic Action execution is not part of these replacements. Its
`actionExecution*` source/table family and `executionRef` remain generic
execution concepts (issue 11). Do not turn them into paid Calls. Any legacy
`invocationRef` still present inside the issue-11 generic implementation is
that ticket's execution field, not this ticket's `callRef`; only an explicitly
paid Call record is mapped to `callRef`.

## Exact owned file mapping

All paths are literal. Rename the paid execution file stems and update their
known importers/tests in the same patch. Do not use a directory-wide wildcard.

### Paid execution source

- `src/modules/capability-execution/invocation-material.ts` → `src/modules/capability-execution/call-material.ts`
- `src/modules/capability-execution/invocation-runtime.ts` → `src/modules/capability-execution/call-runtime.ts`
- `src/modules/capability-execution/invocation-receipt-view.ts` → `src/modules/capability-execution/call-receipt-view.ts`
- `src/modules/capability-execution/operation-invoke-admit.ts` → `src/modules/capability-execution/call-admit.ts`
- `src/modules/capability-execution/operation-invoke-contracts.ts` → `src/modules/capability-execution/call-contracts.ts`
- `src/modules/capability-execution/operation-invoke-entry.ts` → `src/modules/capability-execution/call-entry.ts`
- `src/modules/capability-execution/operation-invoke-recover.ts` → `src/modules/capability-execution/call-recover.ts`
- `src/modules/capability-execution/operation-invoke.actions.ts` → `src/modules/capability-execution/call.actions.ts`
- `src/modules/capability-execution/operation-invoke.ts` → `src/modules/capability-execution/call-authority.ts`
- `src/modules/capability-execution/operation-history.actions.ts` → `src/modules/capability-execution/call-history.actions.ts`
- `src/modules/capability-execution/operation-approval.functions.ts` → `src/modules/capability-execution/call-approval.functions.ts`
- `src/modules/capability-execution/operation-recovery-contracts.ts` → `src/modules/capability-execution/call-recovery-contracts.ts`
- `src/modules/capability-execution/operation-recovery.actions.ts` → `src/modules/capability-execution/call-recovery.actions.ts`
- `src/modules/capability-execution/operation-recovery.functions.ts` → `src/modules/capability-execution/call-recovery.functions.ts`
- `src/modules/capability-execution/invocation-worker/brokeredX402.ts` → `src/modules/capability-execution/call-worker/brokeredX402.ts`
- `src/modules/capability-execution/invocation-worker/charge.ts` → `src/modules/capability-execution/call-worker/charge.ts`
- `src/modules/capability-execution/invocation-worker/jitProviderConsequence.ts` → `src/modules/capability-execution/call-worker/jitProviderConsequence.ts`
- `src/modules/capability-execution/invocation-worker/lease.ts` → `src/modules/capability-execution/call-worker/lease.ts`
- `src/modules/capability-execution/invocation-worker/providerConsequenceBridge.ts` → `src/modules/capability-execution/call-worker/providerConsequenceBridge.ts`
- `src/modules/capability-execution/invocation-worker/recover.ts` → `src/modules/capability-execution/call-worker/recover.ts`
- `src/modules/capability-execution/invocation-worker/runPreparation.ts` → `src/modules/capability-execution/call-worker/runPreparation.ts`
- `src/modules/capability-execution/invocation-worker/runRelease.ts` → `src/modules/capability-execution/call-worker/runRelease.ts`
- `src/modules/capability-execution/invocation-worker/sellerCanaryReceipt.ts` → `src/modules/capability-execution/call-worker/sellerCanaryReceipt.ts`
- `src/modules/capability-execution/invocation-worker/x402Authorization.ts` → `src/modules/capability-execution/call-worker/x402Authorization.ts`
- `src/modules/capability-execution/invocation-worker/x402Route.ts` → `src/modules/capability-execution/call-worker/x402Route.ts`
- `src/modules/capability-execution/invocation-worker/x402Settlement.ts` → `src/modules/capability-execution/call-worker/x402Settlement.ts`
- `src/modules/capability-execution/invocation-worker/recovery/cancellation.ts` → `src/modules/capability-execution/call-worker/recovery/cancellation.ts`
- `src/modules/capability-execution/invocation-worker/recovery/contracts.ts` → `src/modules/capability-execution/call-worker/recovery/contracts.ts`
- `src/modules/capability-execution/invocation-worker/recovery/expiry.ts` → `src/modules/capability-execution/call-worker/recovery/expiry.ts`
- `src/modules/capability-execution/invocation-worker/recovery/index.ts` → `src/modules/capability-execution/call-worker/recovery/index.ts`
- `src/modules/capability-execution/invocation-worker/recovery/loading.ts` → `src/modules/capability-execution/call-worker/recovery/loading.ts`
- `src/modules/capability-execution/invocation-worker/recovery/managedSigning.ts` → `src/modules/capability-execution/call-worker/recovery/managedSigning.ts`
- `src/modules/capability-execution/invocation-worker/recovery/preSubmission.ts` → `src/modules/capability-execution/call-worker/recovery/preSubmission.ts`
- `src/modules/capability-execution/invocation-worker/recovery/reconciliation.ts` → `src/modules/capability-execution/call-worker/recovery/reconciliation.ts`
- `src/modules/capability-execution/invocation-worker/recovery/status.ts` → `src/modules/capability-execution/call-worker/recovery/status.ts`
- `src/modules/capability-execution/invocation-worker/recovery/x402.ts` → `src/modules/capability-execution/call-worker/recovery/x402.ts`
- `src/modules/capability-supply/internal/route-transport-invoke.ts` → `src/modules/capability-supply/internal/route-transport-call.ts` (Call transport boundary; preserve external MCP/x402 names)
- `src/modules/registry/operation-action-contracts.ts` → `src/modules/registry/tool-action-contracts.ts` (post-13 Tool path; issue 19 owns public action IDs)
- `src/modules/registry/operation-choice-contracts.ts` → `src/modules/registry/tool-choice-contracts.ts` (post-13 Tool path; issue 19 owns public action IDs)
- `src/modules/registry/operation-detail-route.functions.ts` → `src/modules/registry/tool-detail-route.functions.ts` (post-13 Tool path; issue 19 owns public route)
- `src/modules/registry/operations.actions.ts` → `src/modules/registry/tools.actions.ts` (post-13 Tool path; issue 19 owns public action IDs)
- `src/modules/registry/operation-entry.ts` → `src/modules/registry/tool-entry.ts` (post-13 Tool path; issue 19 owns public action IDs)
- `src/modules/common/operation-ref.ts` → `src/modules/common/tool-ref.ts` (post-13 Tool path; opaque prefix is protected)
- `src/modules/common/market-operation-paths.ts` → `src/modules/common/market-tool-paths.ts` (post-13 Tool path; route values remain issue 19's ownership)
- `src/modules/registry/operation-paths.ts` → `src/modules/registry/tool-paths.ts` (post-13 Tool path; route values remain issue 19's ownership)

The explicit worker mappings above are the complete worker allowlist;
`providerConsequence`, seller and x402 names retain their separate meanings.

### Convex Call tables, identity and workers

- `convex/capabilityOperationInvocations.ts` → `convex/capabilityCalls.ts`
- `convex/capabilityOperationCalls.ts` → `convex/capabilityCallProjections.ts`
- `convex/capabilityOperationInvocationIdentity.ts` → `convex/capabilityCallIdentity.ts`
- `convex/capabilityOperationInvocationProjection.ts` → `convex/capabilityCallProjection.ts`
- `convex/capabilityOperationInvocationWorker.ts` → `convex/capabilityCallWorker.ts`
- `convex/capabilityOperationLiveX402.ts` → `convex/capabilityCallLiveX402.ts`
- `convex/capabilityOperationX402AuthorizationExpiry.ts` → `convex/capabilityCallX402AuthorizationExpiry.ts`
- `convex/lib/operationInvocations/admission.ts` → `convex/lib/callLifecycle/admission.ts`
- `convex/lib/operationInvocations/authorityHandlers.ts` → `convex/lib/callLifecycle/authorityHandlers.ts`
- `convex/lib/operationInvocations/contracts.ts` → `convex/lib/callLifecycle/contracts.ts`
- `convex/lib/operationInvocations/dispatch.ts` → `convex/lib/callLifecycle/dispatch.ts`
- `convex/lib/operationInvocations/invokeActions.ts` → `convex/lib/callLifecycle/callActions.ts`
- `convex/lib/operationInvocations/reconciliation.ts` → `convex/lib/callLifecycle/reconciliation.ts`
- `convex/lib/operationInvocations/workComplete.ts` → `convex/lib/callLifecycle/workComplete.ts`
- `src/modules/capability-execution/internal/convex-schema.ts`
- `src/modules/capability-execution/convex.ts`
- `src/modules/capability-execution/schema.ts`
- `convex/schema.ts`
- `convex/convex.config.ts`
- `convex/marketDispatchWorkpool.ts` (Call payload field names only; preserve queue/retry infrastructure)
- `src/modules/agent-access/policy.ts` (Call budget source fields and existing policy-digest adapter)
- `src/modules/agent-access/production-policy.ts` (Call budget defaults/limits)
- `src/modules/agent-access/sandbox-policy.ts` (Call budget defaults/limits)
- `src/modules/agent-access/agent-access.ts` (Call budget readbacks)
- `src/modules/agent-access/agent-access.functions.ts` (Call budget validation/readbacks)
- `src/modules/agent-access/internal/convex-schema.ts` (Call budget schema fields)
- `src/modules/agent-access/internal/oauth-convex-schema.ts` (Call budget schema fields)
- `src/modules/agent-access/oauth-state.ts` (Call budget OAuth state)
- `src/lib/server/agent-access-oauth-api.ts` (Call budget contract consumer)
- `src/lib/server/agent-access-oauth-store.ts` (Call budget storage consumer)
- `src/lib/server/agent-access-oauth/protocol.ts` (Call budget protocol consumer)
- `convex/agentAccessPolicy.ts` (Call budget storage projection)
- `convex/agentAccessOAuth.ts` (Call budget grant consumer)
- `convex/capabilityQuotes.ts` (post-15 Quote consumer of Call budget)
- `convex/capabilitySupplyCanaryFunding.ts` (Call budget guard consumer)
- `convex/capabilitySupplyOwnerCanary.ts` (Call budget guard consumer)
- `convex/lib/callLifecycle/admission.ts` (post-16 Call budget admission consumer)
- `src/components/ae/console/AeAgentOperatorConsole.tsx` (Call budget UI field consumer)
- `tests/unit/agent-access-functions.test.ts`
- `tests/unit/agent-access-oauth-state.test.ts`
- `tests/unit/agent-access-policy.test.ts`
- `tests/unit/agent-access-production-policy.test.ts`
- `tests/unit/agent-access-sandbox-policy.test.ts`
- `tests/unit/agent-access.test.ts`
- `tests/unit/authority/context/consequence-authority.test.ts`
- `tests/unit/convex/authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-approval.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-reservation.test.ts`
- `tests/unit/convex/capability-supply-readiness-authority.test.ts`
- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/convex/seller-onboarding-canary-funding-readiness.test.ts`
- `tests/unit/routes/agent-access-caller-continuation.test.tsx`
- `tests/unit/routes/agent-access-console.test.ts`
- `tests/unit/server/agent-access-oauth-api.test.ts`
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/demand-console.test.tsx`
- `tests/integration/capability-operation-workpool.test.ts`
- `tests/integration/capability-supply-owner-funnel-harness.ts`
- `src/modules/module-boundaries.ts`
- `package.json` (only affected existing source/test paths; no new script or dependency)

The Convex schema mappings include all indexes and function references, not
only table declarations:

- `capabilityOperationInvocations` → `capabilityCalls`
- `capabilityOperationCallProjections` → `capabilityCallProjections`
- Call-row `invocationRef` → `callRef`
- Call-row `commitmentRef` → `quoteRef`
- Call-row `operationRef` → `toolRef`
- Call-row operation snapshot/version fields → Tool snapshot/version fields

Do not rename the generic action tables or Convex component internals. Issue
18 owns the operation-bearing `sellerOnboardingCanaryRearmAudits` and
`providerConsequenceJournal` audit/journal rows; this issue hands Call fields
to it without taking ownership of those tables.

### Known Call callers and tests

Update all listed paid Call callers. Rename the Call-focused test files as
shown and update downstream public/financial tests in place; do not leave
stale imports or fixtures merely because issue 19 or issue 18 owns later
semantics.

- `tests/unit/capability-execution/invocation-receipt-view.test.ts` → `tests/unit/capability-execution/call-receipt-view.test.ts`
- `tests/unit/capability-execution/operation-invoke-admit.test.ts` → `tests/unit/capability-execution/call-admit.test.ts`
- `tests/unit/capability-execution/operation-invoke-authority.test.ts` → `tests/unit/capability-execution/call-authority.test.ts`
- `tests/unit/capability-execution/operation-invoke-dispatch.test.ts` → `tests/unit/capability-execution/call-dispatch.test.ts`
- `tests/unit/capability-execution/operation-invoke-recover.test.ts` → `tests/unit/capability-execution/call-recover.test.ts`
- `tests/unit/capability-execution/operation-history-actions.test.ts` → `tests/unit/capability-execution/call-history-actions.test.ts`
- `tests/unit/capability-execution/operation-recovery-actions.test.ts` → `tests/unit/capability-execution/call-recovery-actions.test.ts`
- `tests/unit/capability-execution/operation-receipt-contract.test.ts` → `tests/unit/capability-execution/call-receipt-contract.test.ts`
- `tests/unit/capability-execution/operation-invoke-harness.ts` → `tests/unit/capability-execution/call-harness.ts`
- `tests/unit/capability-supply/route-transport-invoke.test.ts` → `tests/unit/capability-supply/route-transport-call.test.ts`
- `tests/unit/convex/capability-operation-approval.test.ts` → `tests/unit/convex/capability-call-approval.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts` → `tests/unit/convex/capability-call-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-call-projection.test.ts` → `tests/unit/convex/capability-call-projection.test.ts`
- `tests/unit/convex/capability-operation-history.test.ts` → `tests/unit/convex/capability-call-history.test.ts`
- `tests/unit/convex/capability-operation-invocation-identity.test.ts` → `tests/unit/convex/capability-call-identity.test.ts`
- `tests/unit/convex/capability-operation-recovery.test.ts` → `tests/unit/convex/capability-call-recovery.test.ts`
- `tests/unit/convex/capability-operation-reservation.test.ts` → `tests/unit/convex/capability-call-reservation.test.ts`
- `tests/unit/convex/capability-operation-work-completion.test.ts` → `tests/unit/convex/capability-call-work-completion.test.ts`
- `tests/unit/convex/capability-operation-worker-authority-boundary.test.ts` → `tests/unit/convex/capability-call-worker-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-worker-charge.test.ts` → `tests/unit/convex/capability-call-worker-charge.test.ts`
- `tests/unit/convex/capability-operation-worker-harness.ts` → `tests/unit/convex/capability-call-worker-harness.ts`
- `tests/unit/convex/capability-operation-worker-lease.test.ts` → `tests/unit/convex/capability-call-worker-lease.test.ts`
- `tests/unit/convex/capability-operation-worker-reconcile.test.ts` → `tests/unit/convex/capability-call-worker-reconcile.test.ts`
- `tests/unit/convex/capability-operation-worker-run.test.ts` → `tests/unit/convex/capability-call-worker-run.test.ts`
- `tests/integration/capability-operation-workpool.test.ts` → `tests/integration/capability-call-workpool.test.ts`
- `tests/integration/canonical-tool-reads.test.ts` (post-13 Tool consumer; update only paid Call fields)
- `tests/integration/capability-publication-publish.test.ts` (Call continuation consumer)
- `tests/integration/capability-supply-owner-funnel-read.test.ts` (Call read consumer)
- `tests/integration/money-formance-boundary.test.ts` (issue 18 financial consumer)
- `tests/unit/convex/money-managed-call.test.ts` (issue 18 financial consumer)
- `tests/unit/convex/money-x402-payment-attempts.test.ts` (issue 18 financial consumer)
- `tests/unit/convex/x402-orphan-unplug.test.ts`
- `tests/unit/convex/x402-route-authorization.test.ts`
- `tests/unit/convex/x402-route-rpc-consensus.test.ts`
- `tests/unit/capability-execution/jit-provider-consequence.test.ts`
- `tests/unit/capability-execution/provider-consequence-bridge.test.ts`
- `tests/unit/capability-execution/provider-consequence-http.test.ts`
- `tests/unit/capability-execution/seller-onboarding-canary.test.ts`
- `tests/helpers/convex-fixtures.ts`
- `tests/unit/schema/convex-schema.test.ts`

Known public and installed-client consumers must receive mechanical
`callRef`/`quoteRef`/`toolRef` updates even though later tickets own their
route, action ID, copy or package semantics:

- `src/lib/server/call-history.functions.ts`
- `src/lib/server/operation-invoke-api.ts`
- `src/lib/server/mcp-api.ts`
- `src/lib/server/gateway-telemetry.ts`
- `src/modules/registry/tool-action-contracts.ts` (post-13 Tool path)
- `src/modules/registry/tool-choice-contracts.ts` (post-13 Tool path)
- `src/modules/registry/tool-detail-route.functions.ts` (post-13 Tool path)
- `src/modules/registry/tool-entry.ts` (post-13 Tool path)
- `src/modules/registry/tools.actions.ts` (post-13 Tool path)
- `src/modules/registry/registry.actions.ts`
- `src/routes/api.v1.operations.call.ts`
- `src/routes/api.v1.operations.inspect.ts`
- `src/routes/api.v1.operations.$invocationRef.ts`
- `src/routes/api.v1.operations.$invocationRef.cancel.ts`
- `src/routes/api.v1.operations.$invocationRef.reconcile.ts`
- `src/routes/api.v1.operations.ts`
- `src/routes/operations.invocations.$invocationRef.tsx`
- `src/modules/market/suggested-continuation.ts`
- `src/modules/chat/tool-card.ts`
- `convex/chatTools.ts`
- `convex/catalogOfferingMutations.ts` (seller-canary/Call field consumer)
- `convex/capabilityProviderConsequenceJournal.ts` (issue 18 owns journal meaning; this ticket updates its paid `callRef`/`quoteRef`/`toolRef` consumer fields)
- `convex/moneyManagedCall.ts` (issue 18 owns money meaning; this ticket updates its paid Call refs for typecheck)
- `convex/moneyManagedCallLifecycle.ts` (issue 18 owns money meaning; this ticket updates its paid Call refs for typecheck)
- `convex/moneyProviderObligations.ts` (issue 18 owns obligation meaning; this ticket updates its paid Call refs for typecheck)

## Protected bytes, protocol fields and status boundaries

Use existing encoders/decoders. Renaming surrounding API/storage fields must
not change canonical JSON keys, field ordering, hash material, signatures,
format literals, opaque identifier prefixes or vector bytes:

- `src/modules/capability-execution/operation-invoke.ts` → post-rename
  `call-authority.ts`: preserve `operation-invoke-authority:v1`, including its
  accepted-basis canonical field names/values. Issue 12's AE permission mode
  names may change in source, but the existing authority encoder must map them
  to the old canonical basis payload before hashing.
- `convex/capabilityOperationInvocationIdentity.ts` → post-rename
  `capabilityCallIdentity.ts`: preserve `operation-invocation-attempt:v1`, its
  JSON keys/order, identity inputs and digest vectors.
- `src/modules/capability-execution/current-operation-commitment.ts` → post-15
  `current-tool-quote.ts`: preserve `current_operation_commitment:v1`, current
  digest material and vectors; issue 15 owns the codec boundary.
- `convex/capabilityOperationCommitments.ts` → post-15
  `capabilityQuotes.ts`: preserve `ae.operation-commitment:v1`, canonical
  Quote evidence keys/order and digest; issue 15 owns the codec boundary.
- `src/lib/server/operation-invoke-api.ts:81-90,114-126,184-242,618-632` has
  protected command-key material. When source fields become `quoteRef`,
  `toolRef` or `callRef`, project them back to the existing canonical
  `commitmentRef`, `operationRef` and `invocationRef` keys before
  `operationKeyFor`/recovery-body hashing and mismatch checks. Preserve the
  existing operation-key and recovery vectors in
  `tests/unit/server/operation-invoke-api.test.ts`; assert that nested
  `input.input` remains an opaque Tool/Provider argument payload and is never
  recursively renamed, even if it contains `operationRef`, `requestMandate` or
  another old term. `operationKeyFor` includes
  `contract: OPERATION_INVOKE_ACTION_ID`; issue 19 may expose `tool.call`, but
  the protected hash projection must retain the old `operation.invoke` literal.
  Public route/path names are issue 19's later surface, not permission to
  change these bytes.
- `src/modules/agent-access/policy.ts` and `convex/agentAccessPolicy.ts` own
  the protected `agentAccessPolicyDigest`. Call-facing source fields
  `maximumSpendPerCall` and `maximumConcurrentCalls`, plus
  `per_call_exceeds_daily`, must map through the existing digest owner to the
  old canonical budget keys `maximumSpendPerInvocation`,
  `maximumConcurrentInvocations` and `per_invocation_exceeds_daily` before
  hashing. Preserve the existing policy vectors in the listed agent-access
  tests. Issue 12 owns permission modes; no generic compatibility mapper is
  introduced.
- `operation-commitment:v1:<digest>` Quote identifier and
  `operation:v1:<digest>` Tool identifier prefixes remain exact opaque bytes,
  even when exposed through `quoteRef`/`toolRef`.

Preserve `attemptRef`, `effectGeneration`, idempotency keys, provider identity,
Seller/payment-recipient fields, charge/refund/settlement data, and x402/OAuth/
MCP/OpenAPI protocol fields. Keep these Call facts separate: `deliveryState`,
`paymentState`, `providerObligationState`, and purchase resolution/status.
Terminal failure, uncertain payment or pending delivery must not become
success, and recovery must not create a second purchase or duplicate charge.

## Explicit exclusions

- Do not rename or reshape generic Action execution files/tables under
  `src/modules/action-invocation/`, `convex/actionInvocationControl.ts`, or
  their generic `invocationRef`/`executionRef` fields; issue 11 owns them.
- Do not own money/financial tables, Provider-obligation accounting,
  `sellerOnboardingCanaryRearmAudits` or `providerConsequenceJournal`; issue
  18 consumes the explicit Call field handoff.
- Do not redesign public HTTP/MCP routes, action IDs, CLI/discovery/plugin
  output or UI copy; issue 19–27 own those consumers after this internal
  contract cutover.
- Do not edit generated `_generated` artifacts, deploy, reset data, add a
  dependency, create aliases or build a compatibility/migration engine.

## Dependencies and sequencing

- Baseline 08, reviews 29/30 and core identity/action/authorization issues
  10–12 must be closed before dispatch. Tool catalogue 13, Provider 14 and
  Quote 15 are strict predecessors.
- This ticket is the sole paid Call lifecycle/table/worker writer. Issue 17
  (next actions/outcomes) and issue 18 (money/durable records) wait for its
  `callRef`/`quoteRef`/`toolRef` schema checkpoint. Issue 19 owns public routes
  and action IDs, but cannot receive stale internal field names.
- Shared `convex/schema.ts`, capability-execution schema, module boundaries,
  workpool payloads and generated consumers are serialized. Issue 22 must run
  its intermediate generated checkpoint after table/function/file names and
  its final generator pass after public contracts; do not edit `_generated`.
- The operation-invoke API test is a shared serialized boundary established by
  issue 13 and extended by issue 15. Add only the paid Call/recovery envelope
  projections and vectors here; preserve the earlier opaque `input.input`
  assertion and Quote projection evidence.
- Generic Action execution remains issue 11's separate family. The coordinator
  must resolve any ambiguous cross-boundary `invocationRef` before dispatch;
  this ticket does not choose a new compatibility or migration strategy.
- Hosted cutover/live QA and Package 6/7 remain held by their accepted issues;
  no deployment, data reset or external financial mutation is authorized here.

## Verification commands and expected results

Run with Node `22.x` and npm `11.5.1`, using the existing runner only:

```sh
npm exec vitest run \
  tests/unit/capability-execution/call-receipt-view.test.ts \
  tests/unit/capability-execution/call-admit.test.ts \
  tests/unit/capability-execution/call-authority.test.ts \
  tests/unit/capability-execution/call-dispatch.test.ts \
  tests/unit/capability-execution/call-recover.test.ts \
  tests/unit/capability-execution/call-recovery-actions.test.ts \
  tests/unit/capability-execution/call-receipt-contract.test.ts \
  tests/unit/convex/capability-call-identity.test.ts \
  tests/unit/convex/capability-call-projection.test.ts \
  tests/unit/convex/capability-call-recovery.test.ts \
  tests/unit/convex/capability-call-reservation.test.ts \
  tests/unit/convex/capability-call-work-completion.test.ts \
  tests/unit/convex/capability-call-worker-run.test.ts \
  tests/unit/convex/capability-call-worker-reconcile.test.ts \
  tests/unit/convex/x402-route-authorization.test.ts \
  tests/integration/capability-call-workpool.test.ts \
  tests/unit/schema/convex-schema.test.ts \
  tests/unit/server/operation-invoke-api.test.ts
npm run typecheck
```

Expected: Call admission, reservation, dispatch, lease/retry, provider effect,
delivery/payment observation, cancellation, uncertain outcome and recovery
tests pass; repeated recovery remains idempotent and does not duplicate
charges; Call/Quote/Tool refs and table/index codecs round-trip; the
operation-invoke API test proves Call/recovery envelope projection preserves
canonical hash and recovery vectors while nested `input.input` remains opaque;
the protected `operation.invoke` contract literal remains unchanged for issue
19; protected authority, attempt and current/Quote digest vectors remain
byte-identical; typecheck passes. The 26 pre-existing `test:ts-standards` findings remain
separate baseline evidence. Issue 22 separately runs
`npm run check:convex-codegen` after generator checkpoints.

## Acceptance

- [ ] Every literal paid Call source, Convex table/index, worker, helper,
      caller, fixture and test path above is updated or explicitly handed off;
      no definition-only half or stale paid `invocationRef` remains.
- [ ] `capabilityOperationInvocations` → `capabilityCalls` and
      `capabilityOperationCallProjections` → `capabilityCallProjections` are
      complete with readers, writers, indexes, leases and queued arguments.
- [ ] Quote and Tool references use `quoteRef`/`toolRef`, Call uses `callRef`,
      and generic Action execution remains on its separate issue-11 fields and
      tables.
- [ ] Effect identity, idempotency, reservation, concurrency, cancellation,
      reconciliation, uncertain payment/delivery and recovery behaviour are
      unchanged; recovery cannot create a second purchase or duplicate charge.
- [ ] Delivery, payment, Provider obligation and purchase resolution/status
      remain separate; terminal failure is never projected as success.
- [ ] `operation-invoke-authority:v1`, `operation-invocation-attempt:v1`,
      `current_operation_commitment:v1`, `ae.operation-commitment:v1`, opaque
      prefixes, protocol fields and canonical vectors remain byte-stable.
- [ ] Issue 17, issue 18, issue 19 and issue 22 receive explicit handoffs;
      no alias, compatibility engine, migration, dependency, deployment or
      data reset is introduced.

## Closure evidence

Attach the reviewable Call source/schema/worker patch, focused test and
typecheck output, old→new file/table/field mapping, protected-vector receipt,
generic-action-versus-paid-Call classification, and the handoff to issue 17
and issue 18 plus issue 22's intermediate generator checkpoint. Record any
ambiguous occurrence for the coordinator instead of choosing a new term.

## Coordinator decision: Call web route and link propagation

Issue 16 owns the exact Call receipt/status route cutover, before issue 24's
presentation pass:

- `src/routes/operations.invocations.$invocationRef.tsx` → `src/routes/calls.$callRef.tsx`
- `tests/unit/routes/invocation-status-route.test.tsx` → `tests/unit/routes/call-status-route.test.tsx`

Use `/calls/$callRef` and the `callRef` route parameter. Preserve loader,
refresh, cancellation, reconciliation, duplicate-submission protection, focus
and feedback behavior. Keep the existing recovery identity digest's serialized
`invocationRef` and `operationRef` keys in the existing builder even though
its input fields become `callRef` and `toolRef`. Add an exact old/new vector
and opaque evidence-payload check in the existing renamed route test. Do not
add an old route alias or a new `/calls` web index.

The finite additional mechanical Call-link/import allowlist is:

- `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- `src/components/ae/command-panel/CommandPanelProvider.tsx`
- `src/components/ae/console/AeAgentOperatorConsole.tsx`
- `src/components/ae/console/AeOwnerCredit.tsx`
- `src/components/ae/market/AeMarketComparisonView.tsx`
- `src/components/ae/market/AeMarketPage.tsx`
- `src/components/ae/market/AeOperationCard.tsx`
- `src/components/ae/market/AeOperationTable.tsx`
- `src/components/ae/market/market-return-context.ts`
- `src/components/ae/market/operation-detail/AeOperationPosition.tsx`
- `src/components/ae/operation-chat/OperationCard.tsx`
- `src/components/ae/supply/AeSupplyAgentProof.tsx`
- `src/modules/capability-execution/call-entry.ts`
- `src/modules/market/suggested-continuation.ts`
- `src/routes/_operator/activity.tsx`
- `src/routes/api.v1.operations.$invocationRef.ts`
- `src/routes/api.v1.operations.$invocationRef.cancel.ts`
- `src/routes/api.v1.operations.$invocationRef.reconcile.ts`
- `tests/e2e/application-recovery.spec.ts`
- `tests/unit/chat/chat-system.test.ts`
- `tests/unit/chat/operation-call-handback.test.tsx`
- `tests/unit/command-panel/command-panel.test.tsx`
- `tests/unit/layout/public-shell-command-panel.test.tsx`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/unit/market/market-comparison-view.test.tsx`
- `tests/unit/market/market-page.test.tsx`
- `tests/unit/market/suggested-continuation.test.ts`
- `tests/unit/routes/home-catalogue.test.tsx`
- `tests/unit/server/operation-recovery-api.test.ts`
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/owner-operations-workspace.test.tsx`
- `tools/release/operation-gateway-production-smoke-invocation.ts`

Only the Call web URL/reference/import slice is owned here. Issue 13 already
owns `/tools/$toolRef` and the `/tools` redirect; issue 19 still owns the HTTP
API route/action cutover. Issue 22 generates route types before accepting this
source patch. Add the focused command:

`NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/routes/call-status-route.test.tsx tests/unit/chat/operation-call-handback.test.tsx tests/unit/ui/agent-access-owner-console.test.tsx --no-file-parallelism`

Expected: new receipt URL, existing status/recovery results and exact identity
vectors pass; no new purchase or duplicate recovery effect.
