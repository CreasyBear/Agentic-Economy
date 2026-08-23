# ADR-005: Transactions and receipts

**Status:** Accepted; live-money launch remains separately gated
**Date:** 2026-07-03
**Reconciled:** 2026-08-23

## Decision

Every consequential paid Operation uses one durable transaction identity and a
receipt-backed lifecycle. Authorization, provider release, delivery evidence,
charge state, settlement, refund/dispute state, and recovery are separate facts
that converge through source-owned transitions.

- Reserve before contacting a metered provider.
- Settle observed cost or release the reservation.
- Return a refusal before provider contact when authority, budget, or payment
  prerequisites are absent.
- Replay the same idempotency identity without a second provider call or charge.
- Preserve unknown outcomes for explicit reconciliation; never infer success
  from transport or payment alone.
- Keep public receipt projections redacted and bounded.

## Launch boundary

Source and labelled-local evidence cannot authorize live money. Production
release still requires operator-owned configuration, an exact hosted revision,
hard spend caps, reconciled delivery/settlement evidence, replay proof, and a
named operational owner for refunds and disputes.

ADR-034 owns Qualified Use and supplier settlement policy. ADR-035 owns the
caller-key gateway. ADR-036 owns the current market product destination.
