---
phase: 03-protocol-kernel-product-conversion
status: implementing
decision_owner: Founder
updated: 2026-07-20
governing_adr: ADR-020
---

# Phase 3A — One reliable paid operation

## Outcome

Get the latest BTC price in USD from one named mock provider for no more than
$0.01 through equivalent human and structured-agent experiences.

## Implementation waves

1. Reconcile active Phase 3 authority to this narrow loop.
2. Durably separate query release, payment authorization/submission, settlement
   evidence and quote delivery.
3. Normalize exact BTC/USD output in the operation owner.
4. Project one `agentic-paid-operation:v1` semantic object through both hosts.
5. Demonstrate success, pre-release refusal, uncertainty, reconciliation,
   duplicate delivery and cold restoration with labelled local mock data.

## Product surface

The human surface is one compact operation card with progressive technical
detail. The agent surface is one typed structured contract with machine-actionable
errors and continuations. Both consume the same source-owned semantics. Chat may
host the human card, but the durable invocation owns state. Operation adapters
provide typed presentation blocks to one query-agnostic renderer; BTC/USD is
the first fixture, not a shared UI schema.

## Boundaries

No public endpoint, Convex persistence, real credential, real payment,
independent settlement, hosted evidence, provider comparison, automatic
fallback, workflow builder, booking module, standing mandate or Full autonomy
surface is added.

## Phase 3B

After Phase 3A closes, add a second provider as a plug-in test. It must not
change the host workflow. Uncertainty at provider A cannot trigger fallback to
provider B.

## Completion

Phase 3A closes only against `.planning/REQUIREMENTS.md`. Evidence remains
labelled local fixture behavior and product-comprehension proof.
