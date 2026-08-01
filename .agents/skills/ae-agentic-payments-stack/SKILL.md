---
name: ae-agentic-payments-stack
description: Audit or change money-adjacent AE behavior, spend authority, x402 transport, payment claims, settlement, or provider costs.
---

# AE agentic payments stack

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Trace the money boundary

Read `.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, live
source, and focused tests. If an optional `AGENTS.md` exists, consult it.
Name the principal, exact amount/currency ceiling, recipient and endpoint,
credential custodian, release point, attempt, idempotency identity, evidence,
and outcome-unknown behavior. Distinguish the customer destination from the
current adapter and its proof class.

Current x402 transport is a bounded provider adapter: it validates a payment
challenge against exact route-step authority, signs with a server-held
credential, and returns refusal or outcome unknown. This is source/fixture
transport proof, not automatically customer-reachable payment, settlement,
booking, fulfilment, or production custody.

## Hard controls

Payment stays downstream of an admitted action or route step. Callers cannot
invent amount, currency, recipient, endpoint, effect, or credential. Keep
credentials server-side and scoped to the adapter; never expose them in logs,
fixtures, receipts, browser state, or agent JSON.

Bind release to the same principal, prepared input or route revision, spend
ceiling, expiry, attempt, and idempotency identity as the action. Before
release, refusal may be retryable. Once release begins, ambiguous failure is
outcome unknown and requires reconciliation before retry. Return attributable
provider evidence without translating a signature, challenge, transaction ID,
or receipt into proof that real-world work succeeded. Keep transport-specific
logic inside the registered adapter.

## Direct proof

Use labelled challenges/responses for within-ceiling success, unsupported
network/currency, amount-above-authority refusal before signing, replay, and
post-release outcome unknown. Run the focused transport tests and inspect the
result; add UI or import checks only when that boundary changes. Evidence
labels remain in internal reports and machine/admin output, while customer copy
states the useful result and the decision-specific responsibility or next step.
