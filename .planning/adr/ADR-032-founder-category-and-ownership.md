---
# ADR-032: Founder category and ownership boundary
Status: Accepted
Date: 2026-08-08
Supersedes: D-008 as category/ICP authority; old framework and local-wedge destinations
---

## Context

The founder rebaseline replaces the historical local-coordination, trades and
Australian-SMB/BAS framing with a market for supplier-hosted agent services.
Without one durable ownership boundary, later maps and copy could again treat a
consuming agent as the customer/principal, or treat a local service wedge as
AE's category. The repository has useful admission, execution, evidence and
money primitives, but they do not prove the public market claim or production
settlement.

## Decision

The canonical category sentence is:

> **Agentic Economy is the market and controlled transaction layer where authorized agents discover, buy and invoke admitted third-party Market Operations, and suppliers are paid after contract-valid delivery.**

A **Principal** is the human or organization that owns authority and budget.
A **Consuming Agent** is the Principal's delegated shopper and distribution
interface. It discovers, compares, buys and invokes only within delegated
authority and policy; it is never the Principal and cannot expand its own spend
or effects.

Suppliers host implementations wherever they choose. AE owns admission,
Market Operation projection, invocation identity, authority and policy,
evidence, Qualified Use metering and payment reconciliation—not supplier
runtime hosting. A **Market Operation** is the admitted, versioned
third-party operation and competitive unit. An **Agent Service** is its
market-facing representation for authorized Consuming Agents.

V1 is closed to one family—public-document structured extraction with
field-level provenance—with curated suppliers and AE-owned admission,
verification and reconciliation. Any later opening to more families or
delegated evidence issuers requires a published policy and proof from the
first family.

## Consequences

- `Principal`, `Consuming Agent`, `Agent Service` and `Market Operation` are
  canonical terms in `UBIQUITOUS_LANGUAGE.md` and must retain these ownership
  relationships in maps, copy, schemas and product surfaces.
- The active category/destination authority is the founder decision here,
  `.planning/VISION-conceptual-map.md`, `.planning/PROJECT.md` and
  `.planning/wayfinder/MAP.md`; the category thesis supplies rationale and
  proof gates, not a replacement destination.
- Supplier-hosted implementations, rather than repositories or Skills, are
  the supply boundary. AE's first-party demand application remains a proving
  ground, not the category definition.

## Rejected alternatives

- **Agent as principal:** rejected because the human or organization owns the
  budget, authority, data policy and effects; delegation does not transfer
  ownership.
- **Trades/local businesses/Australian SMB/BAS or human-service coordination
  as the category, ICP or default wedge:** rejected. These may be future
  suppliers or use cases, not the category.
- **AE-hosted runtime, general-purpose platform, or an open universal market at
  launch:** rejected. Supplier hosting stays external and V1 remains one
  curated contract family until the controls are proven.
- **Old PM framework or engine destination as the product destination:**
  rejected; those maps remain mechanics and execution history only.

## Proof boundary

This ADR records a founder-confirmed destination, not earned market proof. The
category thesis's one-family pilot must show an eight-week transaction spine
with independent suppliers, an anchor consuming runtime, unrelated paying
Principals, repeat buyer and supplier demand, retained purchases after direct
alternatives are disclosed, and contribution-positive economics without a
transaction-spine failure. Contract-valid delivery is distinct from semantic
correctness: schema conformance never proves truth or buyer utility.

## Superseded authorities

D-008 in `.planning/records/PROJECT-RECORDS.md` is superseded as a category,
ICP and ownership authority; its historical decision record remains
provenance. The old local-wedge and framework destinations in
`.planning/wayfinder/MAP-framework.md`, `MAP-engine.md`, `JOURNEYS.md` and
prior MAP framing are historical/mechanics records only. No active authority
may revive them as AE's category or default product frame.

## References

- `.planning/PROJECT.md` — product charter and current-vs-target maturity
- `.planning/VISION-conceptual-map.md` — confirmed product vision
- `.planning/wayfinder/MAP.md` — active category/destination map
- `.planning/research/2026-08-08-agent-services-market-category-thesis.md` — rationale and proof boundary
- `UBIQUITOUS_LANGUAGE.md` — canonical vocabulary
