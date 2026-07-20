# Agentic Economy — Current Product Roadmap

**Status:** active
**Rebaselined:** 2026-07-20
**Authority:** `PRODUCT.md` → `DESIGN.md` → accepted ADRs → this roadmap

## Roadmap rule

A phase exists only when it turns source-owned capability into a demonstrable
customer outcome. Historical marketplace phases and bootstrap gates are
provenance, not current sequencing authority.

## Phase graph

```text
Phase 1 — Action Invocation foundation (complete)
                         ↓
Phase 2 — One action plane (accepted_narrowed)
                         ↓
Phase 3 — Protocol/kernel → product conversion (complete)
                         ↓
Future exposure decision
```

## Phase 1 — Action Invocation foundation

**Status:** complete
**ADR:** ADR-009
**Outcome:** one registered action can be invoked from Request-owned or
standalone lineage with exact authority, attempt, uncertainty, cancellation,
reconciliation and durable continuation semantics.

## Phase 2 — One action plane across human and agent hosts

**Status:** accepted_narrowed
**ADR:** ADR-010
**Outcome:** Request-owned and standalone hosts use the same source transition
and structured semantic projection.

Gate 10 remains `NARROW_OR_REDESIGN`: the measured embedded path did not reduce
human effort. The architecture survives; the payoff hypothesis does not.

## Phase 3A — One reliable paid operation

**Status:** complete at labelled local/mock evidence boundary
**Goal:** safely obtain and explain one BTC/USD result from one named mock
provider for no more than $0.01.

Phase 3A makes payment preparation/submission reconstructable, separates
payment and quote truth, normalizes the operation result and projects one
versioned semantic object through compact human and structured-agent hosts.

Exit requires success, pre-release refusal, possible paid submission,
attributable reconciliation, duplicate delivery and cold restoration to remain
truthful with no unresolved P0/P1 inside the local mock boundary.

## Phase 3B — Second-provider plug-in test

**Status:** deferred; next product decision

Add one second provider for the same operation without changing host workflow
or shared semantics. Do not add automatic fallback while provider A is
uncertain; changing providers creates a new authority and charge boundary.

## Deferred decisions

Hosted sandbox exposure, independently operated supply, real-customer evidence,
broader authority modes and workflow composition are separate gates after the
Phase 3A local product proof.
