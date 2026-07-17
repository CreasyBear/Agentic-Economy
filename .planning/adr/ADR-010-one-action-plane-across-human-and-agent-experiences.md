---
status: proposed
date: 2026-07-17
decision_owner: Founder
review_by: 2026-08-17
---

# Use one action plane across human and agent experiences

AE's embedded conversational agent and external calling agents will use the same
registered actions and authoritative AE work records. The first-party human
experience may add conversational clarification and task-shaped generative UI,
but it will not own a separate search, recommendation, authority, execution,
evidence or recovery system.

This decision prevents the human product and agent network from producing
different answers that later require reconciliation. It also preserves the
product advantage of an outcome-oriented human experience without forcing every
agent host to reproduce AE's visual interface.

## Decision

The embedded AE agent follows the same fundamental loop as an external agent:

> understand the current task → inspect supported actions → gather material
> missing information → invoke the action → inspect the attributable result →
> propose a safe continuation.

Conversation interprets, gathers and explains. Generated UI presents stable
options, comparisons, approvals, progress and recovery choices. Authoritative AE
records determine what is known, proposed, authorized, attempted and returned.
Neither the transcript nor component-local state is durable product truth.

For a broader outcome, Customer Request remains canonical and composes the work.
An independently useful bounded task does not require a synthetic Customer
Request when existing action and result lineage can represent it truthfully.
This ADR does not introduce a universal task schema or change ADR-009's proposed
partial-entry boundary.

Human and external-agent experiences require **semantic outcome parity**, not
identical presentation. For the same supported work and admissible inputs, they
must preserve the same:

- business information, source and freshness;
- available actions and required information;
- suitability and comparison rules;
- authority and data-use boundaries;
- attempt, idempotency and retry meaning;
- evidence, refusal, contradiction and unknown state;
- allowed continuations and final outcome.

A rich first-party comparison, approval or recovery view must have a complete
semantic representation for callers that cannot render it. A host limitation
may reduce presentation or make a task unsupported; it may not silently change
business meaning.

## Selected engineering architecture under evaluation

The registered action definition is the single engineering interface consumed
by every host. For consequential actions it declares:

- input and structured result schemas;
- read-only, communication or external-effect classification;
- material fields and preparation rules;
- authority and data-use requirements;
- idempotency and retry/reconciliation class;
- expected evidence, structured failure and unknown-effect outcomes;
- safe continuations and invalidation conditions.

The embedded agent, external-agent adapter and human UI call the same
source-owned action implementation. Host adapters may translate conversation,
transport and rendering. They may not implement eligibility, preparation,
authority, execution, retry, evidence or recovery rules.

One prepared Action Invocation may enter an `awaiting_authority` control state.
That state contains an opaque authority reference bound to:

- `invocationRef` and invocation version;
- registered action and version;
- prepared-input digest;
- principal, target and consequence summary;
- spend and data-use limits where applicable;
- expiry and allowed decisions.

Approval or rejection produces an attributable authority decision addressed by
that reference. It does not edit a chat message into permission. A material
input, target, action-version or freshness change invalidates the reference and
requires preparation again.

The durable state model separates:

```text
desired state       what the authorized caller currently asks AE to do
observed resolution what AE or the provider has attributable evidence happened
freshness           whether the observation is current and reachable
```

Conversation state and component-local state are disposable host caches. They
may retain transport cursors, presentation preferences and a pending interaction,
but the current view must be reconstructable from Action Invocation, authority,
attempt, evidence and result records without replaying the transcript.

Every rich projection has a structured non-visual equivalent addressed to the
same invocation and version. A UI decision and an external-agent decision resume
the same paused invocation; neither host recomputes its business inputs.

## Interaction boundary

The agent may gather and prepare without repeatedly interrupting the person when
the work is supported, non-consequential and within applicable data-use
authority. It asks when missing information could materially change
suitability, cost, privacy, authority or recovery.

The agent may propose useful next tasks or a complete route. It may not silently
expand the objective, relax constraints, select optional work or infer authority
for later tasks.

Every consequential action requires explicit authority bound to its exact
inputs, target, consequence and freshness window. Approval of one task does not
authorize another task, a material revision or a fallback branch.

## Generative UI boundary

Generative UI means selecting and populating an appropriate task-shaped
projection from registered actions and authoritative state. The model may adapt
explanation, ordering and presentation. It may not invent business facts,
available actions, controls, consequences or authority.

The first target projection families are:

- current objective, constraints and known unknowns;
- candidate and option comparison;
- material clarification;
- bounded approval;
- progress, ownership and waiting;
- contradiction, incident and recovery.

These are interaction hypotheses, not a mandated component library or persisted
schema. Their value and accessibility must be evaluated before implementation
scope is accepted.

## Session and channel boundary

Work should be reconstructable from authoritative AE records rather than the
conversation transcript. This ADR does not decide a universal transfer,
background-continuation or phone handoff mechanism.

Future channels may present the same work differently—for example, a visual
comparison, structured JSON or a voice summary—but they must retain the same
facts, consequences, authority and safe continuations. Any transfer of ownership
or delegated authority requires a separately justified scoped grant.

## Considered options

**Build a separate first-party agent product.** Rejected because it would
duplicate business logic and force reconciliation between human and external
agent outcomes.

**Make chat the canonical work record.** Rejected because model messages,
component state and business state can diverge, and later callers should not
need to reconstruct truth from a transcript.

**Require identical UI across every host.** Rejected because host affordances
differ. Semantic parity is achievable and testable; pixel parity is neither.

**Allow arbitrary model-generated interfaces.** Rejected because controls and
authority could outrun registered capabilities and source-owned state.

**Use shared actions with host-specific approval and recovery logic.** Rejected
because shared tools alone do not prevent consequential semantic drift.

## Acceptance gates

This ADR may move from proposed to accepted only when evals demonstrate that:

1. one registered action produces semantically equivalent results through the
   embedded AE agent and at least one external-agent surface;
2. the same source-owned transition implements each supported action on both
   surfaces without duplicated business rules;
3. a task-shaped view can be reconstructed from authoritative records without
   replaying the transcript;
4. a non-visual fallback communicates the same options, material consequences,
   evidence and safe continuations;
5. corrections update authoritative work and invalidate stale projections;
6. missing information is gathered without unnecessary interrogation;
7. approval binds the exact consequential action and cannot be reused after a
   material change;
8. interruption, refusal, timeout, uncertain effect and recovery retain
   semantic parity;
9. a cold agent can continue without hidden first-party context;
10. the human experience reduces effort without worsening correctness, control,
    privacy, accessibility or backstage operator burden.

Failure requires narrowing the supported cross-surface contract or superseding
this ADR. It does not justify building a second lifecycle.

## Consequences

Every new human interaction must begin from a registered action or authoritative
work projection, and every external-agent action must be evaluated against the
first-party meaning. Host adapters may own rendering and conversation style,
but not eligibility, recommendation, authority, attempt, evidence or recovery
semantics.

The principal engineering risk is state divergence among conversational
context, generated component state and authoritative AE records. The principal
product risk is replacing customer coordination with supervision of an agent.
The principal security risk is allowing a persuasive interface to stand in for
scoped authority.

This proposed ADR changes no current product claim or public capability. Its
supporting evidence is:

- [ADR-010 inverse premortem](../research/2026-07-17-adr-010-inverse-premortem.md);
- [conversational agentic workspace patterns](../research/2026-07-17-conversational-agentic-workspace-patterns.md);
- [capability-to-composable-work crosswalk](../research/2026-07-17-capability-to-composable-work-crosswalk.md);
- [production agent execution patterns](../research/2026-07-17-production-agent-execution-patterns.md);
- [ADR-009](./ADR-009-partial-entry-without-request-ownership.md).

Implementation specification:

- [Action Invocation engineering specification](../specs/ACTION-INVOCATION-ENGINEERING-SPEC.md).
