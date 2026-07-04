---
phase: 06-agentic-business-action-receipts
reviewed: 2026-06-29T15:14:42Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/modules/business-action/internal/stripe-webhook-source.ts
  - convex/businessActions.ts
  - tests/unit/business-action/stripe-checkout-evidence.test.ts
  - tests/unit/convex/business-actions-runtime.test.ts
  - src/modules/business-action/internal/business-action.ts
  - tests/unit/business-action/evidence-receipt-verifier.test.ts
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 6: Code Review Report, Round 3

**Reviewed:** 2026-06-29T15:14:42Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Narrow re-review of the Phase 6 CR-06 and WR-01 fixes. WR-01 is resolved. CR-06 is still present in a narrower form: normalized checkout-session hold cases are now persisted, but held webhooks that cannot be normalized as checkout sessions are still acknowledged without durable operator evidence.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-06: BLOCKER - Unnormalized held Stripe events are still acknowledged without durable evidence

**File:** `src/modules/business-action/internal/stripe-webhook-source.ts:347`

**Issue:** The fix persists held evidence only when `optionalStripeSession` can normalize the event into a `StripeCheckoutCompletedSession`. `payment_intent.payment_failed` and unsupported event types call `holdStripeWebhook` at `src/modules/business-action/internal/stripe-webhook-source.ts:104` and `src/modules/business-action/internal/stripe-webhook-source.ts:108`, but `optionalStripeSession` delegates to `normalizeCheckoutSessionCompleted` at `src/modules/business-action/internal/stripe-webhook-source.ts:240`. That normalizer requires checkout-session fields like `payment_intent`, `client_reference_id`, and `amount_total` at `src/modules/business-action/internal/stripe-webhook-source.ts:192` through `src/modules/business-action/internal/stripe-webhook-source.ts:206`. Real `payment_intent.payment_failed` objects do not have that checkout-session shape, so `heldEvidence` becomes `undefined`, `holdStripeWebhook` returns `kind: 'ok'` with `business_action_stripe_webhook_held`, and the returned `state` is unchanged at `src/modules/business-action/internal/stripe-webhook-source.ts:347` through `src/modules/business-action/internal/stripe-webhook-source.ts:349`. The Convex mutation then persists only that unchanged state at `convex/businessActions.ts:851`, so the webhook can still be 200-acknowledged with no stored `held_for_operator` row. The current tests miss this because the failed and unknown cases use `stripeEventBody`, which always emits a checkout-session-shaped object at `tests/unit/business-action/stripe-checkout-evidence.test.ts:516` through `tests/unit/business-action/stripe-checkout-evidence.test.ts:540`.

**Fix:** Do not return a successful held result with unchanged state. Either build a durable held record from generic Stripe event metadata when request/checkpoint refs are present, or return a retryable non-2xx/error until a webhook-inbox/support record can capture unbound events. Add tests with real `payment_intent.payment_failed` and non-checkout unsupported event shapes, then assert the Convex readback contains a persisted operator-review record or the route does not acknowledge the event.

## Warnings

No warnings.

## Prior Finding Status

**CR-06:** Still present, narrowed to unnormalized held event shapes. Checkout-session-shaped held cases are fixed and covered.

**WR-01:** Resolved. `verifyReceiptStatus` now returns `evidence_mismatch` when the source card row is missing at `src/modules/business-action/internal/business-action.ts:922`, and the verifier test removes `cards` and asserts `evidence_mismatch` at `tests/unit/business-action/evidence-receipt-verifier.test.ts:127`.

---

_Reviewed: 2026-06-29T15:14:42Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
