# Agentic Economy — Product Charter

**Status:** active authority
**Decision owner:** Founder
**Rebaselined:** 2026-08-23

## Product

Agentic Economy is a market and transaction layer for tools that agents can
discover, compare, buy, invoke, and recover through one stable interface.

Developers host their own implementations and publish exact `Operation`
contracts. Agentic Economy owns admission, discovery, caller access, invocation
identity, delegated policy, delivery evidence, metering, reconciliation, and
the durable readback. It does not host supplier runtimes or own an agent's
planning loop.

The useful shorthand is **OpenRouter for agent tools**: one connection over many
supplier-hosted Operations, with price and evidence visible before a call.

## Core loop

`publish → admit → discover → inspect → invoke → validate → settle or release → recover`

The exact `Operation` is the commercial and execution unit. A capability family
is only a browse and comparison aid; it never implies interchangeability,
fallback, authority, price, readiness, or trust.

## Product surfaces

1. Public catalogue and search.
2. Exact Operation detail and invocation continuation.
3. Agent setup through HTTP, MCP, CLI, `llms.txt`, and the published skill.
4. Supplier workspace for publication, readiness, usage, money, and recovery.
5. Operator workspace for market health, runs, exceptions, and administration.

All surfaces consume the same source-owned Operation, invocation, money, and
evidence contracts. UI components receive view models, not raw transport DTOs.

## Evidence boundaries

- Imported Registry Entries are discovery metadata, not admitted Operations.
- An x402 transfer is payment evidence, not delivery or Qualified Use.
- Rating, completed calls, latency, readiness, settlement, and Qualified Use
  remain separate facts. Missing facts stay unknown.
- Public totals never combine external x402 activity with Agentic Economy
  activity.
- Production claims require exact-revision hosted evidence; source and local
  tests are labelled as such.

## Deliberately retired product frames

Customer Request, WorkTree, Study, Project Spine, inquiry, the general Agent
Engine, and the answer-first workspace no longer organize the product. Any
surviving lower-level code is an implementation seam or historical residue,
not a public destination or planning authority.

## Current proof frontier

The market, normalized external registry, first-party Operation catalogue,
public API projection, x402 observatory, agent-facing discovery, supplier
publication, and shared invocation boundary are implemented and source/local
verified.

The next proof is economic and external: independently operated supply, repeat
paid inter-party use, contract-valid delivery, durable recovery, and reconciled
supplier settlement on an exact hosted revision.

## Authorities

1. This charter owns product scope.
2. [`ADR-036`](adr/ADR-036-agent-tool-market-foundation.md) owns the current
   architecture decision and supersession set.
3. [`wayfinder/MAP.md`](wayfinder/MAP.md) owns the execution frontier.
4. [`DESIGN.md`](../DESIGN.md) owns UI composition and interaction rules.
5. [`UBIQUITOUS_LANGUAGE.md`](../UBIQUITOUS_LANGUAGE.md) owns vocabulary.
6. Source and tests decide what exists now.
