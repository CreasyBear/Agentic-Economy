---
status: proposed
date: 2026-07-17
decision_owner: Founder
review_by: 2026-08-17
---

# Make Economic Operation the reusable unit beneath Customer Request

AE proposes to treat an **Economic Operation**—one bounded interaction with one
declared business capability—as the reusable unit of preparation, authority,
attempt, evidence, inspection and recovery. Customer Request would remain the
durable statement of a larger customer outcome, but would become one
orchestrator of Economic Operations rather than the required owner of every
operation. Direct callers and bundles could create the same operation through
different origins without receiving weaker trust semantics.

This direction is proposed because the neutral engine is internally
compositional while current durable lineage is Request-owned. Action preparation
requires Request, revision, plan and action lineage; structured quote
preparation requires a Customer Request owner; route authority requires an
AE-generated route; inspection and recovery address AE-created runs. Wrapping
partial entry in synthetic Requests would preserve this coupling and create
misleading lineage.

The primary-source lifecycle review in
[Economic-operation lifecycle crosswalk](../research/2026-07-17-economic-operation-lifecycle-crosswalk.md)
supports the shape of this proposal. OCDS, UBL, Peppol and the FAR divide
procurement differently, but repeatedly preserve separately meaningful,
referenced interactions such as qualification, quotation, order response,
change, inspection, acceptance, invoice query and termination. The review is
supporting evidence, not sufficient evidence to accept this ADR.

## Decision constraints

An Economic Operation must bind:

- the exact capability contract and operation;
- the caller, principal and ownership scope;
- its origin and every imported claim's provenance and freshness;
- the supplied provider or candidate scope;
- preparation, data, spend and external-effect authority;
- idempotent attempts and provider releases;
- expected evidence, cancellation and recovery semantics;
- an honest resolution, including an unresolved or unknown external effect.

An operation origin may be a Customer Request action, direct invocation, bundle
step or external observation. Origin changes provenance only. It must not change
the meaning of authority, execution, evidence, cancellation or recovery.

A **Bundle** is a versioned graph of Economic Operation references and typed
input/output bindings. It may coordinate dependencies and completion conditions,
but it must not implement a second authority, attempt, evidence or recovery
lifecycle.

Customer Request remains the canonical customer-outcome aggregate. RoutePlan and
RouteMandate remain valid for complete AE-generated routes. This ADR does not
authorize weakening or replacing them before operation-level evidence earns a
generalized mandate.

## Considered options

**Keep Customer Request as the universal parent.** Rejected as the target
direction because agents cannot safely enter with caller-owned candidates,
offers or external commitments without manufacturing a false full-lifecycle
history.

**Expose the routing kernel directly.** Rejected because callers would need to
understand internal routing, authority and recovery ordering, producing a
shallow and difficult-to-use interface.

**Create separate qualification, quote and commitment products.** Rejected
because each product would tend to duplicate lineage, authority, attempts,
evidence and recovery, contaminating the wedge-neutral engine.

**Introduce a neutral Economic Operation beneath all entry paths.** Proposed
because it preserves one trust implementation while allowing independently
useful operations and optional compositions.

## Acceptance gates

This ADR may move from proposed to accepted only when evals demonstrate that:

1. supplied-candidate qualification reuses current contracts and supply evidence
   without a parallel eligibility model;
2. supplied-candidate quote collection reuses structured preparation, disclosure
   authority, provider attempts and uncertainty reconciliation;
3. external commitment observation preserves imported state as attributable
   claims unless an admitted provider adapter supplies current evidence;
4. Request-owned and direct-origin operations retain identical authority,
   idempotency, evidence and recovery meaning;
5. existing Customer Request traces replay without semantic regression;
6. a bundle consists only of independently inspectable operation references and
   typed dependencies;
7. the direct-booking negative control is not burdened with unnecessary
   orchestration;
8. no domain nouns enter the neutral contracts.

Failure of these gates requires narrowing or superseding this ADR rather than
loosening the current guardrails.

## Consequences

The likely engineering work is lineage generalization, not an engine rewrite:
add a neutral operation origin and ownership digest; allow structured
preparation to be operation-owned; scope inspection to operation ownership or an
explicit grant; and eventually allow Customer Request actions to compile into
the same operation interface.

The minimum durable projection for an agent is therefore not a transcript or
one universal workflow status. It is the operation reference, actor and
principal, input provenance and freshness, version, authority, attempt and
idempotency identity, attributed observations, resolution including `unknown`,
expected evidence, allowed continuations and next owner.

Retry policy follows the consequence of the operation: computation may repeat;
communication creates a new attributable attempt; a possibly completed external
effect must be reconciled before retry unless the provider contract guarantees
safe idempotent replay.

Imported facts, offers and commitments remain claims made by their named source.
AE owns admission decisions, authority reservations, attempt records, transport
observations and resolutions. AE does not retroactively claim that it performed
or verified an external operation.

No current product claim, public endpoint or production capability changes as a
result of this proposed ADR.
