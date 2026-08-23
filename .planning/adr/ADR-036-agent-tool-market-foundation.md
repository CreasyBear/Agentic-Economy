# ADR-036: Agent tool market foundation

**Status:** Accepted
**Date:** 2026-08-23
**Decision owner:** Founder

## Context

Agentic Economy accumulated several product spines: Customer Request, inquiry,
WorkTree, Study, an answer-first workspace, a general Agent Engine, a business
account dashboard, and multiple catalogue representations. Although many
underlying authority and evidence mechanisms were sound, the public product
did not offer one familiar reason to use it.

The founder reset the product around the market itself and selected mature
agent-tool marketplace patterns as the structural donor. The implementation
now has one public catalogue, exact Operation detail, thin agent onboarding,
supplier and operator workspaces, and one shared invocation boundary.

## Decision

Agentic Economy is the market and controlled transaction layer for
supplier-hosted tools that agents can discover, compare, buy, invoke, and
recover.

1. `Operation` is the exact admitted commercial, execution, and evidence unit.
2. Capability families organize browsing and comparison only.
3. Registry Entries normalize public metadata but never gain admission,
   routeability, verification, delivery, settlement, or Qualified Use by import.
4. HTTP, MCP, CLI, and human UI are adapters over one invocation service.
5. Suppliers host implementations; AE owns admission, delegated access,
   invocation identity, evidence, metering, reconciliation, and recovery.
6. External x402 evidence remains source-labelled and separate from AE
   execution and economic evidence.
7. The public, supplier, operator, and conversation surfaces use one modular
   shadcn-based design system and receive presentation view models.
8. Specialist experiences may be added only as projections over this market
   and transaction boundary.

## Supersession

This decision supersedes the product destination, UI destination, or retired
implementation host in:

- ADR-001, ADR-003, the communications-rail ADR-004, and ADR-006;
- ADR-011 through ADR-018;
- ADR-020 and ADR-022 through ADR-024;
- ADR-031 and ADR-032; and
- the capability-registry ADR-002, already superseded by ADR-026.

ADR-030 remains authoritative only for the registry-to-execution machine
contract; its general engine destination is superseded. ADR-025 remains
authoritative only where ADR-034 and this decision do not replace it.

## Consequences

- Customer Request, WorkTree, Study, Project Spine, inquiry, and the general
  Agent Engine cannot reappear as top-level product or planning spines without
  a new founder decision and ADR.
- Catalogue size, external payments, and source presence cannot be presented as
  delivery, demand, or market liquidity.
- New UI work composes the design contract in `DESIGN.md`; temporary plans and
  gates are deleted when their durable decisions and evidence are recorded.
- The next milestone is an independently supplied, repeat paid market loop on
  an exact hosted revision, not another horizontal feature system.
