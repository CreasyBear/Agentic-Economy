---
status: proposed
date: 2026-07-17
decision_owner: Founder
review_by: 2026-08-17
---

# Allow partial entry without requiring Customer Request ownership

AE proposes that a caller may ask AE to perform one bounded task—such as finding
businesses, qualifying supplied businesses, obtaining quotes, sending an
approved order, checking an outcome or attempting recovery—without first
creating a synthetic end-to-end Customer Request.

Customer Request remains the durable statement of a larger customer outcome and
may coordinate several such tasks. It is not required to own work that began
elsewhere.

This ADR deliberately does **not** introduce an `EconomicOperation` schema,
table, base class, endpoint, lifecycle or kernel primitive. “Bounded task” is
descriptive language for the unit a caller is trying to complete. Evals must
first establish whether different tasks share enough implementation structure
to justify any common type.

## Selected engineering architecture under evaluation

AE will evaluate **Action Invocation** as the narrow durable control record for
one independently resumable call to one registered action and action version.
It is an engineering execution record, not a universal business-task schema.
It does not contain wedge meaning, replace the action-specific result, or imply
that every read-only call must be persisted.

An Action Invocation has:

- a stable `invocationRef`;
- the registered action identifier and immutable action version;
- caller, principal, ownership scope and optional parent Request or bundle
  reference;
- an immutable prepared-input digest and material input provenance;
- desired state, observed resolution and freshness/reachability as separate
  values;
- the current invocation version and effect generation;
- expected evidence and the action-declared retry/reconciliation class;
- references to authority, attempts, observations, results and allowed
  continuations.

An external-effect attempt has its own `attemptRef`, idempotency identity and
generation. A lease prevents simultaneous workers from owning the same attempt.
A generation fence prevents a late worker, cancellation or provider observation
from overwriting newer state. State changes use compare-and-swap against the
expected invocation version or generation.

Existing Action Attempt, authority, evidence and reconciliation machinery
remains authoritative. The first implementation question is whether Action
Invocation can be expressed by generalizing an existing source-owned record.
A new table is permitted only when the source map and eval traces show that an
existing record would mix incompatible meanings or force optional Request
lineage back into the design.

Customer Request becomes an orchestrating client of Action Invocations. A
complete route or bundle stores invocation and result references plus declared
dependencies and completion conditions. It does not copy constituent status,
inherit their authority, or implement another attempt and recovery lifecycle.

Lineage is discriminated rather than weakened:

```text
request_owned(requestRef, revision)
standalone(callerRef, principalRef)
bundle_owned(bundleRef, nodeRef)
```

Existing Request-owned traces remain valid. Fields on existing records do not
become broadly optional as a migration shortcut.

This direction is proposed because the neutral engine is internally
compositional while current durable lineage is Request-owned. Action preparation
requires Request, revision, plan and action lineage; structured quote
preparation requires a Customer Request owner; route authority requires an
AE-generated route; inspection and recovery address AE-created runs. Wrapping
partial entry in synthetic Requests would preserve this coupling and create
misleading lineage.

The primary-source lifecycle review in
[Partial-entry lifecycle crosswalk](../research/2026-07-17-partial-entry-lifecycle-crosswalk.md)
supports the shape of this proposal. OCDS, UBL, Peppol and the FAR divide
procurement differently, but repeatedly preserve separately meaningful,
referenced interactions such as qualification, quotation, order response,
change, inspection, acceptance, invoice query and termination. The review is
supporting evidence, not sufficient evidence to accept this ADR.

## Decision constraints

Regardless of its entry point, each independently callable task must preserve:

- the exact capability contract and operation;
- the caller, principal and ownership scope;
- its origin and every imported claim's provenance and freshness;
- the supplied provider or candidate scope;
- preparation, data, spend and external-effect authority;
- idempotent attempts and provider releases;
- expected evidence, cancellation and recovery semantics;
- an honest resolution, including an unresolved or unknown external effect.

Work may begin from a Customer Request, a direct invocation, a bundle step or an
external observation. That entry context changes provenance only. It must not
change the meaning of authority, execution, evidence, cancellation or recovery.

A bundle may coordinate independently callable tasks, their dependencies and
completion conditions. It must not implement a second authority, attempt,
evidence or recovery lifecycle.

Customer Request remains the canonical customer-outcome aggregate. RoutePlan and
RouteMandate remain valid for complete AE-generated routes. This ADR does not
authorize weakening or replacing them before task-level evidence earns a
generalized mandate.

## Product journey and composition

Partial entry is the beginning of the product journey, not a lesser version of
the full route.

AE should first help the customer or calling agent complete the task they
recognize: find suitable businesses, obtain quotes, compare options, send an
approved instruction, inspect the result or recover from a problem. After each
result, AE may show the useful next tasks and offer to coordinate them.

For example:

> Quotes received → compare them → approve one option → send the order → track
> acknowledgement → inspect completion.

The customer may stop after any completed task, continue task by task, hand the
result to another system, or ask AE to coordinate the remaining route. Previous
work must remain usable whichever choice they make.

A full-route experience is therefore a customer-facing composition of
understandable tasks, decisions and handoffs. It must not expose an internal
dependency graph as the product, and it must not require the customer to specify
the entire project before receiving value.

Composition must preserve the identity and evidence of each constituent task.
The route may explain dependencies, propose what happens next and track overall
progress. It may not silently combine approvals, infer authority for later
tasks, or describe the route as complete when one task remains unresolved.

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

**Allow partial entry while preserving the same trust rules.** Proposed because
it permits independently useful work and optional composition without deciding
prematurely that every task must share one persisted object.

## Acceptance gates

This ADR may move from proposed to accepted only when evals demonstrate that:

1. supplied-candidate qualification reuses current contracts and supply evidence
   without a parallel eligibility model;
2. supplied-candidate quote collection reuses structured preparation, disclosure
   authority, provider attempts and uncertainty reconciliation;
3. external commitment observation preserves imported state as attributable
   claims unless an admitted provider adapter supplies current evidence;
4. Request-owned and directly invoked tasks retain identical authority,
   idempotency, evidence and recovery meaning;
5. existing Customer Request traces replay without semantic regression;
6. a bundle consists only of independently inspectable task references and
   declared dependencies;
7. the direct-booking negative control is not burdened with unnecessary
   orchestration;
8. a customer or cold agent can stop after one task and later continue from its
   durable result without reconstructing the prior conversation;
9. the full-route projection explains completed, current, optional and blocked
   tasks without exposing kernel machinery;
10. approval of one task is never treated as authority for a later task;
11. no domain nouns enter the neutral contracts.

Failure of these gates requires narrowing or superseding this ADR rather than
loosening the current guardrails.

## Consequences

If the evals pass, the likely engineering work is to remove unnecessary
Request ownership from existing lineage, preparation and inspection paths—not
to add a new universal engine object. The implementation might reuse an
existing action, run or receipt reference; use a small shared envelope; or keep
separate task records with common trust rules. This ADR does not choose among
those designs.

The minimum durable projection for an agent is therefore not a transcript or
one universal workflow status. It is the task reference, actor and
principal, input provenance and freshness, version, authority, attempt and
idempotency identity, attributed observations, resolution including `unknown`,
expected evidence, allowed continuations and next owner.

Retry policy follows the consequence of the task: computation may repeat;
communication creates a new attributable attempt; a possibly completed external
effect must be reconciled before retry unless the provider contract guarantees
safe idempotent replay.

Registered actions therefore declare one of three retry classes:

```text
replayable
attributable_retry
reconcile_before_retry
```

The worker may implement backoff and delivery, but it may not choose the retry
class or convert an unknown external effect into failure.

The product may progressively reveal a complete route, but the engineering
model must not depend on the customer selecting that route upfront. Route
coordination is earned through composition of useful tasks rather than imposed
as the entry contract.

Imported facts, offers and commitments remain claims made by their named source.
AE owns admission decisions, authority reservations, attempt records, transport
observations and resolutions. AE does not retroactively claim that it performed
or verified work completed elsewhere.

No current product claim, public endpoint or production capability changes as a
result of this proposed ADR.

Additional production-pattern evidence:

- [Production agent execution patterns](../research/2026-07-17-production-agent-execution-patterns.md).
