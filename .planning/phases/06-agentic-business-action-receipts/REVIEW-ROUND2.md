---
phase: 06-agentic-business-action-receipts
reviewed: 2026-06-29T15:05:23Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - convex/businessActions.ts
  - convex/businessActionStore.ts
  - convex/sourceWriteAdmission.ts
  - src/lib/server/convex-source.ts
  - src/lib/server/source-write-admission.ts
  - src/modules/security/source-write-admission.ts
  - src/modules/business-action/business-action.functions.ts
  - src/modules/business-action/public.ts
  - src/modules/business-action/internal/business-action.ts
  - src/modules/business-action/internal/schema.ts
  - src/modules/business-action/internal/stripe-checkout.ts
  - src/modules/business-action/internal/stripe-webhook-source.ts
  - src/routes/api.business-actions.stripe-webhook.ts
  - tests/helpers/source-write-admission.ts
  - tests/unit/business-action/evidence-receipt-verifier.test.ts
  - tests/unit/business-action/hermes-evidence.test.ts
  - tests/unit/business-action/stripe-checkout-evidence.test.ts
  - tests/unit/convex/business-actions-runtime.test.ts
findings:
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 6: Code Review Report, Round 2

**Reviewed:** 2026-06-29T15:05:23Z
**Depth:** deep
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Re-reviewed the Phase 6 business-action blocker fixes across the Convex source functions/store, server source adapters, Stripe webhook route, receipt verification, Hermes replay, and targeted unit coverage. Prior blockers CR-01 through CR-05 are resolved in the reviewed code. One new blocker remains in the Stripe webhook source admission path: held webhooks are acknowledged as handled but not durably recorded.

The worktree contains many unrelated dirty UI/design files, including `DESIGN.md`, `src/components/**`, `src/routes/$slug.tsx`, public landing assets, style files, and UI contract/e2e tests. Those files were not part of this blocker re-review and did not contaminate the source-level findings below.

## Prior Blocker Verification

| Prior ID | Status | Evidence |
| --- | --- | --- |
| CR-01 | Resolved | `convex/businessActions.ts:899`, `convex/businessActions.ts:916`, and `convex/businessActions.ts:939` now export the owner queue, owner detail, and admin reconstruction queries used by `src/modules/business-action/business-action.functions.ts:182` through `src/modules/business-action/business-action.functions.ts:191`. Runtime tests exercise these exports at `tests/unit/convex/business-actions-runtime.test.ts:397`. |
| CR-02 | Resolved | `convex/businessActionStore.ts:158` adds `by_status`, and `loadAdminBusinessActionSlice` now reads all-list rows via that index at `convex/businessActionStore.ts:407` through `convex/businessActionStore.ts:415`. Coverage asserts non-empty business ids are returned at `tests/unit/convex/business-actions-runtime.test.ts:271`. |
| CR-03 | Resolved | `src/routes/api.business-actions.stripe-webhook.ts:82` now defaults to `defaultSourceAdmission`, which calls `admitBusinessActionStripeWebhookThroughSource` at `src/routes/api.business-actions.stripe-webhook.ts:146` through `src/routes/api.business-actions.stripe-webhook.ts:158`. The server function forwards to `recordBusinessActionStripeWebhook` through public source mutation at `src/modules/business-action/business-action.functions.ts:298` through `src/modules/business-action/business-action.functions.ts:316`. |
| CR-04 | Resolved | `verifyReceiptStatus` recomputes expected outcome, reconstruction status, source hashes, signature hash, evidence hash sets, and payload hash from source request/checkpoint/artifact state at `src/modules/business-action/internal/business-action.ts:947` through `src/modules/business-action/internal/business-action.ts:986`. Self-consistent tampering is covered at `tests/unit/business-action/evidence-receipt-verifier.test.ts:158`. |
| CR-05 | Resolved | Hermes replay now compares the existing event hash with request/checkpoint hashes supplied at replay time in `src/modules/business-action/internal/business-action.ts:507` through `src/modules/business-action/internal/business-action.ts:510`. Replay and same-key drift tests were added at `tests/unit/business-action/hermes-evidence.test.ts:86`. |

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-06: BLOCKER - Held Stripe webhooks are acknowledged without durable operator evidence

**File:** `src/modules/business-action/internal/stripe-webhook-source.ts:327`

**Issue:** `holdStripeWebhook` returns `business_action_stripe_webhook_held` and an evidence payload, but it returns the original `state` unchanged at `src/modules/business-action/internal/stripe-webhook-source.ts:335` through `src/modules/business-action/internal/stripe-webhook-source.ts:354`. The Convex mutation then persists only `result.state` at `convex/businessActions.ts:851`. For wrong amount/currency/checkpoint, duplicate conflicts, expired sessions, failed payments, and unsupported events, the route can return 200 with a held response while storing no `held_for_operator` event in `businessActionExternalEvidenceEvents`, even though the schema supports that status at `src/modules/business-action/internal/schema.ts:69` through `src/modules/business-action/internal/schema.ts:74` and the store can persist event `reason` at `convex/businessActionStore.ts:590` through `convex/businessActionStore.ts:613`. This loses the very evidence operators need to review, and Stripe will not retry because the webhook was acknowledged.

**Fix:**
```ts
function holdStripeWebhook(
  state: BusinessActionSourceState,
  payloadHash: SourceHash,
  event: StripeParsedEvent,
  reason: string,
  session?: StripeCheckoutCompletedSession
): StripeWebhookAdmissionResult {
  const evidence = buildHeldStripeEvidence(payloadHash, event, reason, session)
  return {
    kind: 'ok',
    code: 'business_action_stripe_webhook_held',
    state: evidence === undefined
      ? state
      : { ...state, externalEvidenceEvents: [...state.externalEvidenceEvents, evidence] },
    evidence: toStripeWebhookAdmissionEvidence(evidence, payloadHash, event, reason, session),
  }
}
```

For events without request/checkpoint refs, add a durable webhook-inbox/support table or return a retryable non-2xx until the event can be captured. Add a Convex runtime test that sends a wrong-amount signed webhook through `recordBusinessActionStripeWebhook`, reloads the request slice, and asserts a `stripe_test_mode` event with `status: 'held_for_operator'` and the hold reason was persisted.

## Warnings

### WR-01: WARNING - Receipt verification can still report success when the source card row is missing

**File:** `src/modules/business-action/internal/business-action.ts:922`

**Issue:** `verifyReceiptStatus` only treats the card as stale when `context.card?.status` is `stale` or `disabled`. If the request exists but the referenced card row is missing from source state, `context.card` is `undefined`, the check is skipped, and a receipt can still verify as `complete` using only the card hash copied onto the request. Creation requires an active card at `src/modules/business-action/internal/business-action.ts:262` through `src/modules/business-action/internal/business-action.ts:267`, so a missing card during verification should be treated as stale or mismatched source state.

**Fix:** Add an explicit missing-card branch before the stale/disabled check:
```ts
if (context.card === undefined || context.card.id !== context.request.cardId) {
  return 'evidence_mismatch'
}
if (context.card.status === 'stale' || context.card.status === 'disabled') {
  return 'stale_source'
}
```
Add a receipt verifier test that removes `success.state.cards` and asserts the receipt no longer reconstructs as `complete`.

---

_Reviewed: 2026-06-29T15:05:23Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
