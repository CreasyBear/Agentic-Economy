---
phase: 06-agentic-business-action-receipts
reviewed: 2026-06-29T14:36:51Z
depth: deep
files_reviewed: 33
files_reviewed_list:
  - src/modules/business-action/public.ts
  - src/modules/business-action/internal/schema.ts
  - src/modules/business-action/internal/business-action.ts
  - src/modules/business-action/internal/stripe-checkout.ts
  - src/modules/business-action/business-action.functions.ts
  - convex/schema.ts
  - convex/businessActions.ts
  - convex/businessActionStore.ts
  - convex/observability.ts
  - src/routes/api.business-actions.stripe-webhook.ts
  - src/routes/owner.business-actions.tsx
  - src/routes/owner.business-actions.$requestId.tsx
  - src/routes/owner.business-actions.$requestId.receipt.tsx
  - src/routes/admin.business-actions.tsx
  - src/routes/admin.business-actions.$requestId.tsx
  - src/modules/observability/public.ts
  - src/modules/observability/internal/operator-controls.ts
  - tests/unit/business-action/business-action-contract.test.ts
  - tests/unit/business-action/mandate-request-checkpoint.test.ts
  - tests/unit/business-action/guardrail-decision-evidence.test.ts
  - tests/unit/business-action/hermes-evidence.test.ts
  - tests/unit/business-action/evidence-receipt-verifier.test.ts
  - tests/unit/business-action/stripe-checkout-evidence.test.ts
  - tests/integration/business-action-route-readbacks.test.ts
  - tests/types/business-action-contracts.test.ts
  - tests/imports/route-boundary.test.ts
  - tests/imports/private-imports.test.ts
  - tests/imports/source-mining.test.ts
  - tests/imports/scan-targets.ts
  - tests/imports/ts-standards.test.ts
  - tests/unit/convex/business-actions-runtime.test.ts
  - tests/unit/observability/business-action-events.test.ts
  - package.json
findings:
  critical: 5
  warning: 1
  info: 0
  total: 6
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-06-29T14:36:51Z
**Depth:** deep
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Reviewed the Phase 6 business-action receipt implementation across the domain module, Convex functions/store, owner/admin/readback routes, Stripe webhook route, observability controls, import-boundary tests, and business-action test suites. The public seam no longer exports the Node-only Stripe signature verifier, matching the recent `6161866` fix, but the implementation still has blocking runtime and integrity defects.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: BLOCKER - Owner and admin route readbacks call Convex functions that are not exported

**File:** `src/modules/business-action/business-action.functions.ts:165`

**Issue:** `readOwnerQueueSourceQuery`, `readOwnerDetailSourceQuery`, and `readAdminReconstructionSourceQuery` point to `businessActions:readCurrentOwnerBusinessActionQueue`, `businessActions:readCurrentOwnerBusinessActionDetail`, and `businessActions:readAdminBusinessActionReconstruction`, but `convex/businessActions.ts:599` through `convex/businessActions.ts:634` only exports `readCurrentOwnerBusinessActionReceipt`. The owner list route calls the missing queue query at `src/routes/owner.business-actions.tsx:94`, owner detail/receipt routes call the missing detail query at `src/routes/owner.business-actions.$requestId.tsx:18` and `src/routes/owner.business-actions.$requestId.receipt.tsx:18`, and the admin route calls the missing admin query at `src/routes/admin.business-actions.tsx:107`. Outside the local Clerk bypass, these routes cannot read their claimed source-owned state.

**Fix:**
```ts
export const readCurrentOwnerBusinessActionQueue = queryGeneric({
  args: { auth: authContextValidator },
  returns: businessActionQueueServerStateValidator,
  handler: async (ctx, args) => {
    const identity = await requireBusinessActionIdentity(ctx, args.auth);
    const slice = await loadOwnerBusinessActionSlice(ctx.db, {
      ownerId: identity.userId,
    });
    return buildBusinessActionQueueServerState(slice);
  },
});

export const readCurrentOwnerBusinessActionDetail = queryGeneric({ ... });
export const readAdminBusinessActionReconstruction = queryGeneric({ ... });
```
Add tests that invoke the exported source/server functions without `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`, rather than only testing pure route mapper helpers.

### CR-02: BLOCKER - Admin all-list reconstruction is hard-coded to an empty business id

**File:** `convex/businessActionStore.ts:389`

**Issue:** `loadAdminBusinessActionSlice` only works when `filters.requestId` is provided. For the normal admin list path, it loops statuses and calls `collectByIndex` with `{ field: 'businessId', value: '' }` at `convex/businessActionStore.ts:407` through `convex/businessActionStore.ts:412`. Real requests use non-empty business ids, so the admin all-list route returns an empty reconstruction set even after the missing Convex export in CR-01 is added. The integration coverage at `tests/integration/business-action-route-readbacks.test.ts:204` only passes prebuilt state into a pure mapper and never exercises the store/query path.

**Fix:**
```ts
// Add an admin listing index, for example by status or action/status.
businessActionCapabilityRequests: defineTable({ ... })
  .index('by_status', ['status'])
  .index('by_action_status', ['actionSlug', 'status']);

// Then page by real status/action criteria instead of businessId: ''.
const requests = await collectByIndex(
  db,
  'businessActionCapabilityRequests',
  'by_action_status',
  { field: 'actionSlug', value: businessActionSlug },
  { field: 'status', value: status },
  limit,
);
```
Add a store/query test that seeds a non-empty `businessId`, calls `loadAdminBusinessActionSlice({})`, and asserts the row is present.

### CR-03: BLOCKER - The production webhook route rejects every signed webhook by default

**File:** `src/routes/api.business-actions.stripe-webhook.ts:75`

**Issue:** `handleBusinessActionStripeWebhookRequest` verifies the raw body/signature, then calls `options.admitWebhook ?? failClosedAdmission`. In the real route no `admitWebhook` option is supplied, so valid signed Stripe webhooks fall through to `failClosedAdmission` at `src/routes/api.business-actions.stripe-webhook.ts:106` through `src/routes/api.business-actions.stripe-webhook.ts:115` and return `503 business_action_stripe_source_admission_unavailable`. The source adapter exists in `src/modules/business-action/internal/stripe-checkout.ts:276`, but it is not wired into the route. Current webhook route coverage at `tests/unit/business-action/stripe-checkout-evidence.test.ts:207` through `tests/unit/business-action/stripe-checkout-evidence.test.ts:237` injects a test admission function and only checks invalid signatures, so the default production path is untested.

**Fix:**
```ts
const admission = options.admitWebhook ?? admitStripeWebhookThroughBusinessActionSource;
const result = await admission({ rawBody, signature, event, now });
```
Wire that default to a server-only source/Convex admission path, or keep the endpoint explicitly non-ready and unregister it until the admission path exists. Add a route-level happy-path test for a signed `checkout.session.completed` request without injecting `admitWebhook`.

### CR-04: BLOCKER - Receipt verification trusts mutable receipt fields instead of source state

**File:** `src/modules/business-action/internal/business-action.ts:937`

**Issue:** `verifyReceiptStatus` only checks whether `receipt.payloadHash` equals `recomputeReceiptPayloadHash(receipt)`. That recomputation at `src/modules/business-action/internal/business-action.ts:944` through `src/modules/business-action/internal/business-action.ts:960` hashes the fields already stored on the receipt row. It does not compare `cardHash`, `mandateHash`, `requestHash`, `checkpointHash`, `resultArtifactHash`, `outcome`, or `reconstructionStatus` against the current source request/checkpoint/artifact context, even though receipt creation hashes that source context at `src/modules/business-action/internal/business-action.ts:963` through `src/modules/business-action/internal/business-action.ts:990`. A self-consistent tampered receipt can pass verification by changing receipt fields and recomputing `payloadHash`. The existing tamper test at `tests/unit/business-action/evidence-receipt-verifier.test.ts:110` through `tests/unit/business-action/evidence-receipt-verifier.test.ts:118` only changes `payloadHash`, which misses the integrity failure.

**Fix:**
```ts
const expectedPayloadHash = stableHash(
  receiptPayloadHashValue({
    request,
    checkpoint,
    resultArtifact,
    receiptPayload,
    receiptId: receipt.receiptId,
    receiptVersion: receipt.receiptVersion,
    issuedAt: receipt.issuedAt,
  }),
);

if (
  receipt.requestHash !== request.requestHash ||
  receipt.checkpointHash !== checkpoint.checkpointHash ||
  receipt.resultArtifactHash !== resultArtifact.resultArtifactHash ||
  receipt.payloadHash !== expectedPayloadHash
) {
  return 'tampered';
}
```
Add tests that tamper `requestHash`, `resultArtifactHash`, and `outcome`, recompute `payloadHash`, and still expect verification to fail.

### CR-05: BLOCKER - Hermes evidence idempotent replay is impossible

**File:** `src/modules/business-action/internal/business-action.ts:507`

**Issue:** `recordHermesEvidenceEvent` stores `evidenceHash` using `requestHash` and `checkpointHash` at `src/modules/business-action/internal/business-action.ts:497` through `src/modules/business-action/internal/business-action.ts:506`. On replay, it compares the stored hash with `stableHash(hermesEventHashValue(existing))` at `src/modules/business-action/internal/business-action.ts:507` through `src/modules/business-action/internal/business-action.ts:510`, but `hermesEventHashValue(existing)` always uses `requestHash: null` and `checkpointHash: null` at `src/modules/business-action/internal/business-action.ts:992` through `src/modules/business-action/internal/business-action.ts:1002`. Identical retries with the same idempotency key are therefore classified as `business_action_idempotency_conflict` instead of replay, which can break retry-safe evidence admission. The Hermes tests at `tests/unit/business-action/hermes-evidence.test.ts:27` through `tests/unit/business-action/hermes-evidence.test.ts:85` do not cover replay/conflict behavior.

**Fix:**
```ts
const replayHash = stableHash(
  hermesEventHashValue({
    ...existing,
    requestHash: request.requestHash,
    checkpointHash: checkpoint.checkpointHash,
  }),
);
```
Alternatively persist the request/checkpoint hash fields on the Hermes event record and include them in the replay hash. Add tests for identical replay returning the existing event and changed replay returning a conflict.

## Warnings

### WR-01: WARNING - Business-action claim safety controls are pure helpers, not runtime gates

**File:** `src/modules/observability/public.ts:460`

**Issue:** `evaluateBusinessActionClaimSafety` implements support kill-rule evaluation at `src/modules/observability/public.ts:460` through `src/modules/observability/public.ts:516`, and Phase 6 controls are registered in `src/modules/observability/internal/operator-controls.ts:31` through `src/modules/observability/internal/operator-controls.ts:32`. However, the reviewed owner/admin routes and business-action module do not call the evaluator or route outputs through those controls; references are limited to tests and planning artifacts. The code supports testing the policy in isolation, but it does not yet enforce the policy on actual public/demo/route claim surfaces. That makes any claim that support controls actively gate Phase 6 readiness too strong.

**Fix:** Wire `evaluateBusinessActionClaimSafety` into the actual public/demo or route claim surface that emits business-action readiness language, using live operator controls as input. Add route/output tests that set `business_actions_enabled=false` and `business_action_attempts_enabled=false` and assert the surface suppresses or downgrades the claim.

---

_Reviewed: 2026-06-29T14:36:51Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
