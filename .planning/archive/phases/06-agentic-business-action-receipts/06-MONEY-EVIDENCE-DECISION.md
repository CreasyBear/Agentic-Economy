# Phase 6 Money Evidence Decision

**Created:** 2026-06-29
**Status:** Accepted for Phase 6 test-mode planning
**Decision owner:** Agentic Economy source authority

## Decision

Phase 6 may use direct Stripe test-mode evidence for the `provision-paid-intake-endpoint` paid-intake demo, but only as evidence downstream of AE source authority.

The first implementation plan must default to a server-created Stripe Checkout Session in `payment` mode. PaymentIntent, Payment Link, Link CLI, and Shared Payment Tokens are out of the first implementation unless this decision record is amended with equivalent binding, credential, webhook, readback, reconciliation, and copy-safety proof.

## Why Not P5 Seam

Phase 5 is owner paid activation through Autumn Cloud plus Stripe PSP. It is not buyer-to-business paid intake, seller payout, marketplace settlement, direct Stripe subscription authority, or a customer payment rail for Phase 6.

Phase 6 cannot borrow P5 as paid-intake authority. P5 remains prior art for money evidence discipline only.

## Scope

Allowed:

- Stripe test mode only.
- Server-created Checkout Session in `payment` mode.
- Server-owned amount and currency.
- Server-owned success/cancel URLs.
- AE request/checkpoint/receipt refs stored through `client_reference_id`, metadata, and source-owned state.
- Raw-body webhook signature verification.
- Provider readback and receipt/reconciliation rows as evidence.
- Public-safe hashes/statuses after source-owned receipt reconstruction.

Forbidden:

- live mode,
- direct Stripe subscription authority,
- Connect,
- x402,
- MPP,
- custody,
- wallet,
- credits,
- balances,
- stored value,
- split payout,
- seller payout,
- marketplace settlement,
- client-supplied amount/currency/customer/provider IDs,
- raw payment credentials,
- raw Stripe payloads in public output,
- public payment claim without receipt, reconciliation, support/kill rule, and copy scan.

## Credential Ownership

Stripe credentials are server secrets:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

`.env.example` should be updated only in the implementation PR that first reads these values. No `VITE_` Stripe secret is allowed.

The credential owner is the AE server/operator for the test-mode demo. Hermes is never handed an unrestricted Stripe key.

## Binding Contract

Every Checkout Session must bind:

- `businessActionRequestId`,
- `authorizationCheckpointId`,
- `actionSlug = provision-paid-intake-endpoint`,
- `mandateHash`,
- `requestHash`,
- `cardHash`,
- amount,
- currency,
- idempotency key,
- correlation ID.

Every webhook/readback event must bind:

- Stripe event ID,
- Checkout Session ID,
- PaymentIntent ID when present,
- payload hash,
- signature status,
- request/checkpoint IDs,
- amount/currency,
- correlation ID.

## Webhook And Readback Rules

Stripe webhook admission must:

- preserve raw body bytes for signature verification;
- verify `Stripe-Signature` with the endpoint secret;
- reject missing, malformed, expired, or invalid signatures before admission;
- dedupe by Stripe event ID plus object refs plus AE request/checkpoint refs;
- hold unbound or duplicate-conflicting events for operator review;
- return `2xx` quickly only after safe admission/queueing semantics are defined;
- discard raw body after verification/hash/normalization unless private evidence retention is explicitly designed.

Official Stripe docs checked on 2026-06-29:

- Checkout Sessions create API: https://docs.stripe.com/api/checkout/sessions/create
- Webhook receiving and raw-body signature verification: https://docs.stripe.com/webhooks
- Idempotent requests: https://docs.stripe.com/api/idempotent_requests

## Reconciliation

Phase 6 reconciliation must not grant authority. It records whether Stripe evidence matches the accepted request and receipt:

- `matched`,
- `missing`,
- `mismatched`,
- `provider_unavailable`,
- `retry_available`,
- `retry_exhausted`,
- `no_repair`.

Mismatch, missing, unbound, or provider-unavailable states keep the request in proof-gap or operator-review posture until source-owned repair/no-repair is recorded.

## Coexistence With Autumn/P5

Autumn/P5 remains the paid activation authority for owner subscription/activation. Phase 6 Stripe evidence is test-mode paid-intake evidence only and cannot create:

- paid activation,
- subscription entitlement,
- plan access,
- billing-center state,
- customer portal state,
- public paid availability.

## Acceptance Gates

Before direct Stripe code:

- this file exists and is cited by the plan;
- the plan names exact Stripe object type and webhook event types;
- the plan names tests for binding, idempotency, invalid signatures, duplicate events, unbound events, amount/currency mismatch, proof-gap, and public redaction;
- copy scans reject direct Stripe authority, wallet, credits, custody, settlement, Connect, x402, seller payout, and production payment claims.
