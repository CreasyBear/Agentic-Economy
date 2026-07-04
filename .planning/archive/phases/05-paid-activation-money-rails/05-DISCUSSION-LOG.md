# Phase 5: Paid Activation + Money Rails - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 05-paid-activation-money-rails
**Areas discussed:** production maturity, money rail choice, provider evidence, billing state, reconciliation, deferred multi-rail commerce

---

## Money rail posture

| Option | Description | Selected |
|--------|-------------|----------|
| Autumn Cloud + Stripe PSP | Autumn owns billing/product-ops and subscription lifecycle; Stripe handles payment collection, Checkout, invoices/receipts, refunds, and disputes beneath Autumn; AE mirrors admitted evidence. | ✓ |
| Direct Stripe Billing + Checkout Sessions | AE builds the subscription engine directly on Stripe. Fallback only after an evidence-backed Autumn blocker. | |
| Multi-rail commerce | Stripe Connect, x402, wallet, credits, request-market settlement together. | |

**User's choice:** User asked about Stripe/Autumn. The selected default is Autumn Cloud + Stripe PSP, not fake platform breadth and not a bespoke/direct Stripe subscription engine.
**Notes:** A separate decision record may override Autumn+Stripe only with an evidence-backed blocker. AE remains authority for endpoint-live posture, source-owned mirrors/readbacks, receipts, reconciliation, and public claims.

---

## Entitlement authority

| Option | Description | Selected |
|--------|-------------|----------|
| AE fail-closed billing mirror | Autumn/Stripe events are evidence; internal admitted billing state grants paid activation. | ✓ |
| Provider truth | Autumn or Stripe object state directly becomes AE entitlement. | |
| Client truth | Client supplies amount/plan/customer/entitlement. | |

**User's choice:** Locked by spec and production safety.
**Notes:** Webhook-only entitlement is unsafe; reconciliation is part of the product.

---

## the agent's Discretion

- Exact Autumn product/plan/feature IDs, Stripe PSP mapping, env naming, webhook secrets, and customer portal posture after current official docs review.
- Exact append-only ledger/event shape.
- Exact reconciliation UI layout and typed state names.

## Deferred Ideas

- Direct Stripe subscription engine, Connect, x402, wallet/credits/balance as cash-like settlement, custody, marketplace settlement, request-market payouts, multi-rail platform.
