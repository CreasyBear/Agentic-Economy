---
phase: 01-action-invocation-decomposition
status: complete
decision_owner: Founder
updated: 2026-07-20
governing_adr: ADR-009
---

# Phase 1 — Action Invocation current state

Phase 1 selected and implemented Action Invocation as the narrow control record
for one call to one registered action. It supports both exact historical
Customer Request lineage and discriminated standalone lineage without creating
a synthetic Request or RoutePlan.

## Current implementation

- one source-owned transition engine owns preparation, exact authority,
  attempts, leases, effect generations, evidence, cancellation and recovery;
- Request-owned and standalone hosts use the same transition and retain
  different, reconstructable origins;
- uncertain external release remains `reconciliation_required` and refuses
  blind retry;
- result references can be composed without copying authority or task state;
- `approve_each`, `bounded_mandate` and explicit `full_yolo` use exact
  attributable authority material;
- the generic paid PublishedOperation is the proportional direct operation;
- an unregistered development fixture preserves cancellation, exposure-release
  and autonomous-objective evals that the selected x402 operation cannot
  express.

## Current decision

ADR-009 is accepted. Its eleven gates have labelled local development evidence.
Standing-mandate material now fails closed and official evidence binds exact
committed bytes at revision
`13158022c7462a7fdae346b548f0ea272a87cefe`. Exposure is blocked by the Phase 3
product-projection contract, not unfinished Phase 1 hardening.

## Evidence and non-claims

Current evidence proves source behavior and labelled local/mock execution only.
It does not prove public reachability, Convex persistence, deployment, real
provider operation, settlement, fulfilment, customer value or production
safety.

## Closeout

Phase 1 is complete at the labelled local control-plane evidence boundary.
Historical plans, research and validation are preserved under
[`adr-009-010-pre-hardening`](../../archive/adr-009-010-pre-hardening/).
The completion contract and execution ledger are preserved under
[`pre-product-conversion-rebaseline-20260720`](../../archive/pre-product-conversion-rebaseline-20260720/).
Phase 3 consumes this foundation without reopening it by default.
