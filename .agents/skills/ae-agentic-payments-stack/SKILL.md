---
name: ae-agentic-payments-stack
description: Audit or change money-adjacent AE behavior, spend authority, x402 capability transport, payment claims, or proposed payment integrations. Use when work mentions checkout, charging, payment, wallets, settlement, x402, ACP, AP2, UCP commerce, or provider costs.
---

# AE agentic payments stack

Start with the decision: is this work changing AE's customer product, a bounded
provider transport, or only evaluating an external rail? These are different
claim and authority boundaries.

## Ground current truth

1. Read `AGENTS.md`, `PRODUCT.md`, and the live source named by the task.
2. Search current `src`, `convex`, `tests`, and `package.json`; do not reuse a
   previous payment-stack inventory.
3. Name the principal, exact amount and currency ceiling, credential custodian,
   release point, idempotency identity, evidence returned, and behavior when the
   external effect is unknown.
4. Classify proof as source, fixture, labelled local/dev, hosted, independent
   provider, or real customer evidence.

This step is complete when the money movement, authority owner, and maximum
claim are explicit.

## Current source boundary

Current source contains a narrowly bounded x402 provider transport:

- `src/modules/capability-supply/route-transport-runtime.ts` admits an
  `x402-fetch:v2` binding, validates a payment challenge against exact route-step
  authority, and returns refused or outcome-unknown states rather than widening
  authority.
- `src/modules/capability-supply/internal/x402-payment-signer.ts` creates the
  EVM payment signature from a server-held credential.
- `src/modules/capability-supply/internal/transport-adapters.ts` owns adapter
  admission.
- Focused behavior lives in
  `tests/unit/capability-supply/route-transport-runtime.test.ts`,
  `tests/unit/capability-supply/x402-payment-signer.test.ts`, and
  `tests/unit/capability-supply/transport-adapter-registry.test.ts`.

This proves a source and fixture-level transport contract. It does not prove
customer-reachable payment, booking, checkout, settlement, provider
fulfilment, or production credential custody.

There is no current `src/modules/business-action` or `src/modules/billing`
payment stack and no Stripe provider-smoke script in `package.json`. Historical
tests or planning records bearing those names are not current product evidence.
ACP, AP2, and Google UCP are not implemented payment contracts unless live
source and intended-surface tests prove otherwise.

## Change a money-adjacent flow

1. Keep payment downstream of an exact admitted action or route step. The
   customer or agent cannot invent amount, currency, recipient, endpoint, or
   credential.
2. Keep credentials server-side and scoped to the admitted adapter. Never place
   secrets in logs, fixtures, receipts, browser state, or agent-visible JSON.
3. Bind the payment release to the same principal, prepared input or route
   revision, spend ceiling, expiry, attempt, and idempotency identity used by
   the action.
4. Before release, refusal may be retryable. After release begins, ambiguous
   network failure becomes outcome unknown and requires reconciliation before
   retry.
5. Return attributable provider evidence without translating a signature,
   challenge, transaction identifier, or receipt into proof that real-world
   work succeeded.
6. Keep transport-specific logic inside the registered adapter. The neutral
   compiler, Request API, customer projection, and UI must not change when a
   conformant payment rail is swapped.

This step is complete when no caller-controlled field widens spend or effect,
and post-release uncertainty cannot cause duplicate payment.

## Demonstrate and evaluate

Use labelled mock challenges and provider responses to show:

- challenge within the exact step ceiling;
- unsupported network or currency refusal;
- amount above authority refusal before signing;
- replay or retry behavior;
- failure after release represented as outcome unknown.

Run focused tests first:

```sh
npx vitest run tests/unit/capability-supply/route-transport-runtime.test.ts tests/unit/capability-supply/x402-payment-signer.test.ts tests/unit/capability-supply/transport-adapter-registry.test.ts
```

Run `npm run test:copy` when public or customer-visible language changes, and
`npm run test:imports` when transport dependencies or module boundaries change.
Tests guide the changed transition; unrelated suite failures are recorded, not
turned into a repository-wide gate.

## Completion and claims

Report the exact authority bound, release point, replay/reconciliation behavior,
credential owner, evidence returned, and proof class. Public claims remain at
AE's current contract: no customer-reachable booking or payment unless that
specific intended surface and real effect have been proven. A labelled sandbox
payment proves contract behavior only.
