# Action Invocation engineering specification

**Status:** Proposed implementation specification
**Decision owners:** Engineering and Product
**Implements:** ADR-009 and ADR-010
**Evidence:** Production agent execution patterns
**Tracking:** [GitHub issue #193](https://github.com/CreasyBear/Agentic-Economy/issues/193)
**Review by:** 2026-08-17

## Problem Statement

AE can currently preserve strong authority, idempotency, provider-release,
evidence and recovery rules for work derived from a Customer Request. Those
controls are attached to Request, revision, plan and action lineage.

That prevents an external agent or person from using AE for one independently
valuable action without manufacturing a complete Customer Request history. It
also leaves the first-party conversational experience at risk of becoming a
second workflow system if its pending questions, approvals and progress exist
only in chat or component state.

The engineering problem is not insufficient guardrails. The guardrails are
attached to an aggregate that is too broad for partial entry.

## Solution

Introduce Action Invocation as the narrow durable control identity for one
independently resumable use of one registered action and action version.

The registered-action module becomes the single seam through which a human
surface, embedded AE agent, external agent or Customer Request prepares,
authorizes, invokes, inspects and continues supported work.

Action Invocation owns continuity and execution control. It does not own wedge
meaning or replace action-specific business records. Existing Action Attempt,
authority, provider-release, evidence and reconciliation records remain
authoritative.

Customer Request becomes one orchestrating caller of Action Invocation. A
Bundle or Route references constituent invocations and results rather than
copying their state or inheriting their authority.

The first implementation slice is one consequential registered action exercised
through one human host and one external-agent host. It must prove the common
seam, persisted authority gate, interruption recovery and semantic parity before
the model is expanded.

## User Stories

1. As a person, I want AE to help with one useful action without requiring me to describe an entire project, so that I receive value before committing to a complete route.

2. As an external agent, I want to invoke one registered AE action by a stable reference, so that I can stop and resume without retaining hidden conversation state.

3. As a calling agent, I want to supply attributable prior work, so that AE does not pretend it performed work completed elsewhere.

4. As a principal, I want to see the exact action, target, information, spend and consequence before approving it, so that my authority remains bounded.

5. As a principal, I want an approval to expire after a material change, so that stale permission cannot authorize different work.

6. As a person using AE's interface, I want my approval to resume the same invocation an external agent prepared, so that human intervention does not create a second workflow.

7. As an external agent, I want a structured representation of the same approval or recovery choice shown in AE's interface, so that I can continue safely without rendering AE's UI.

8. As a caller, I want AE to distinguish what I requested from what it has observed, so that a pending cancellation is not presented as a completed cancellation.

9. As a caller, I want AE to state when provider information is stale or unreachable, so that absence of a current observation is not mistaken for failure.

10. As a caller, I want every communication attempt to remain attributable, so that retries do not erase what was previously sent.

11. As a principal, I want an uncertain external effect reconciled before retry, so that AE does not accidentally duplicate consequential work.

12. As an operator, I want a late worker or provider response prevented from overwriting newer truth, so that recovery remains deterministic.

13. As an operator, I want expired worker ownership to be reclaimable, so that an invocation can continue after a process failure.

14. As a provider, I want repeated delivery to carry a stable provider idempotency identity when my contract supports it, so that I can suppress duplicates.

15. As a provider, I want separate attempts to remain distinguishable when replay is not safe, so that AE does not conceal repeated contact.

16. As a customer, I want a completed standalone action to become input to a broader Request without being repeated, so that AE preserves useful prior work.

17. As a customer, I want each action inside a Bundle to remain independently inspectable, so that I can understand what succeeded, failed or remains uncertain.

18. As a principal, I want approval of one Bundle action to grant no authority to another, so that composition does not become blanket permission.

19. As a calling agent, I want structured failures and safe continuations, so that I can distinguish correction, retry, reconciliation and human intervention.

20. As a human user, I want the interface reconstructed from authoritative work state after reopening AE, so that closing a session does not lose the work.

21. As an external agent, I want to continue from a scoped reference rather than a transcript, so that transfer does not expose unrelated conversation or customer data.

22. As a security reviewer, I want caller, principal, owner scope and delegated authority checked at preparation and again before execution, so that possession of a reference is not treated as permission.

23. As an engineer, I want one action definition to own schemas, consequences, authority, retry and evidence semantics, so that human and agent hosts cannot drift.

24. As an engineer, I want host adapters limited to transport, conversation and rendering, so that they cannot become hidden business-logic implementations.

25. As an engineer, I want existing Request-owned traces to remain valid, so that partial entry does not force a flag-day migration.

26. As an engineer, I want read-only actions excluded from mandatory persistence unless continuity requires it, so that the control model does not burden simple discovery.

27. As a product manager, I want direct booking or checkout to bypass AE orchestration when AE adds no coordination value, so that the negative control remains simple.

28. As an evaluator, I want identical scenarios exercised through human and agent hosts, so that parity is demonstrated through outcomes rather than shared code claims.

29. As an evaluator, I want process interruption after provider dispatch, so that recovery behavior is proven where duplicate effects are most dangerous.

30. As an evaluator, I want competing generation updates raced deliberately, so that stale-worker protection is executable evidence rather than a schema claim.

## Implementation Decisions

### 1. External seam

The Action Invocation module exposes one interface to every caller:

- prepare an invocation;
- inspect the current invocation view;
- decide a pending authority request;
- invoke or continue authorized work;
- request cancellation;
- reconcile an uncertain effect.

The interface returns structured results and never requires a caller to inspect
internal tables, replay a transcript or understand Request-owned routing
objects.

The module hides admission, action lookup, schema validation, ownership,
authority, idempotency, worker claims, provider release, evidence validation,
projection and reconciliation.

### 2. Action contract

Every persistable registered action declares:

- immutable action identifier and action-contract version;
- input and output schemas;
- consequence class: read-only, communication or external effect;
- preparation requirements and material input paths;
- authority and data-use requirements;
- retry class: replayable, attributable retry or reconcile before retry;
- expected evidence;
- structured result, refusal, failure and unknown-effect outcomes;
- allowed continuations and their invalidation conditions.

`readOnly` remains supported during migration. New consequence metadata is added
without changing current public action claims. A compatibility rule derives
read-only behavior for existing actions until they are deliberately classified.

### 3. Durable identity

An Action Invocation has one stable caller-visible reference and immutable
action identity. Each prepared material revision increments its invocation
version.

Every external-effect delivery has a distinct attempt reference, idempotency
identity and monotonic effect generation.

Invocation identity is not used as an authority token. Inspection and mutation
remain ownership- or grant-scoped.

### 4. Lineage

Invocation lineage is a discriminated value:

- Request-owned: exact Request and revision;
- standalone: exact caller and principal;
- Bundle-owned: exact Bundle and node.

The first implementation supports Request-owned and standalone lineage.
Bundle-owned lineage is reserved until reference-only composition passes its
eval.

Existing Request fields do not become optional. Migration creates an adapter
from existing Request lineage to the new interface and preserves historical
records unchanged.

### 5. State model

The durable control projection separates:

| Dimension | Meaning |
|---|---|
| Desired state | What the currently authorized caller asks AE to do |
| Observed resolution | What attributable evidence says happened |
| Freshness | Whether the observation is current and reachable |
| Control state | Whether work is prepared, awaiting authority, claimable, in progress, reconciling or terminal |

No single status enum may collapse these dimensions.

Terminal resolution is limited to outcomes supported by attributable evidence.
An interrupted or invalid provider response may produce an unknown external
state rather than failure.

### 6. Concurrency and worker ownership

Mutation uses compare-and-swap against the expected invocation version or effect
generation.

A worker claims one invocation generation through an expiring lease. Claim
renewal and takeover are explicit. A stale lease owner may record an
attributable observation but cannot make it current.

Background messages carry only scoped identifiers and generation—not copied
authority or mutable invocation state.

### 7. Preparation and authority

Preparation freezes the exact action version, material inputs, target,
consequence, data-use scope, evidence expectation and freshness window.

A consequential invocation enters an awaiting-authority state containing an
opaque authority reference. An approval or rejection addresses that reference
and produces an attributable decision.

Authority binds the invocation reference, invocation version, prepared-input
digest, principal, target, allowed effect, spend/data limits and expiry.

A material input, target, action version, provider suitability or freshness
change invalidates the prepared version and authority reference.

### 8. Attempts, retry and reconciliation

Replayable computation may retry the same generation under bounded delivery
backoff.

A communication retry creates a new attributable attempt even when the provider
supports transport idempotency.

An uncertain external effect enters reconcile-before-retry. No generic worker
may convert it to failure or begin another effect attempt.

An adapter may permit safe replay only when the registered provider contract
declares and tests an idempotency guarantee for that exact operation.

### 9. Current projection and attributable history

AE keeps an efficient current invocation projection and append-only,
attributable transition, attempt, authority and evidence records.

The first slice does not event-source all business state. Action-specific
records remain authoritative for business facts and results.

### 10. Host architecture

Human UI, embedded conversation and external-agent transports are adapters over
the same Action Invocation interface.

Host state may contain transport cursors, presentation preferences and a
pending interaction reference. It is disposable and reconstructable.

Every rich decision or recovery projection has a structured non-visual form
addressed to the same invocation and version.

No host may recompute prepared inputs, eligibility, target, authority,
resolution or recovery behavior.

### 11. Composition

A Customer Request or Bundle references invocation and result identities plus
declared dependencies and completion conditions.

Composition owns ordering and roll-up only. It cannot:

- copy constituent control state;
- inherit constituent authority;
- rewrite imported claims as AE observations;
- rerun completed work without a new explicit invocation;
- implement separate attempt, evidence or recovery logic.

### 12. Initial implementation slice

The first slice uses one existing consequential action with:

- a current registered action definition;
- existing preparation and authority semantics;
- a provider or source-owned external effect;
- existing evidence and recovery behavior;
- both a human and external-agent path.

Qualified inquiry is the preferred low-risk candidate if its current contract
can express a paused authority gate and attributable delivery without implying
booking or fulfilment. If it cannot exercise uncertain-effect reconciliation,
a provider simulator supplies that fault path without expanding the public
claim.

The slice proceeds in this order:

1. Add action consequence, material-field, retry and evidence metadata.
2. Define the Action Invocation interface and an in-memory adapter for evals.
3. Adapt one existing Request-owned action to the interface without changing its
   stored lineage.
4. Add standalone lineage for the same action.
5. Persist the invocation control projection only after the interface and
   transition evals pass.
6. Add a human authority projection and structured external-agent equivalent.
7. Prove restart, stale-generation and reconcile-before-retry behavior.
8. Evaluate reference-only reuse inside a Customer Request.

## Testing Decisions

Tests cross the Action Invocation interface and assert observable contracts.
They do not assert internal table layout or call private helpers.

The first test adapter is in-memory and deterministic. The production adapter
uses AE's current persistence and provider seams. This is a real seam because
both adapters exercise the same interface.

Required behavior suites:

1. Prepare the same action through human and external-agent hosts and compare
   structured invocation views.
2. Approve in the human host and resume from a cold external agent.
3. Approve through an external-agent handoff and reopen the human workspace.
4. Change one material input after approval and prove invalidation.
5. Change one non-material presentation input and prove authority remains valid.
6. Attempt cross-principal inspection and mutation and prove refusal.
7. Race two workers for the same generation and prove one lease owner.
8. Apply a late observation from generation N after generation N+1 and prove it
   cannot become current.
9. Interrupt before provider release and prove retry is safe.
10. Interrupt after provider release but before acknowledgement and prove
    reconciliation occurs before retry.
11. Return malformed provider evidence and preserve unknown external state.
12. Resume after process restart without transcript or component state.
13. Reuse one completed standalone result inside a Customer Request without
    repeating the external effect.
14. Render the same authority and recovery state in rich and structured forms.
15. Run the direct-path negative control and prove no unnecessary invocation
    persistence or approval is introduced.

Existing Action Attempt, Customer Request hosted-journey, cancellation,
idempotency, provider denial and unknown-effect tests are prior art. The new
suite should call through the Action Invocation interface and reuse their
fixtures rather than clone their lifecycle.

Passing the test suite establishes contract behavior only. It does not prove
useful real supply, customer value or production fulfilment.

## Out of Scope

- A universal Task, Economic Operation or workflow schema.
- Replacing Customer Request, RoutePlan or RouteMandate.
- Making all read-only discovery calls durable.
- A general event-sourced rewrite.
- A new orchestration engine or generic DAG runtime.
- Domain-specific fields in the neutral action contract.
- Payment, booking, dispatch or fulfilment claims.
- Phone transfer, background delegation or universal channel handoff.
- Automatic retry of uncertain external effects.
- A public Action Invocation endpoint before auth, privacy and abuse review.
- Migrating every registered action in the first slice.
- Selecting the first commercial wedge.

## Further Notes

The principal migration risk is making existing Request lineage optional across
many tables. The implementation must use discriminated lineage at the seam and
an adapter for historical Request-owned records.

The principal product risk is asking customers to supervise internal execution.
Human projections should show the decision, consequence, progress, next owner
and recovery—not invocation generations or worker leases.

The principal security risk is treating possession of an invocation or approval
reference as authority. Every consequential transition checks authenticated
principal and scoped grant independently.

The principal schema risk is turning the control projection into another source
of business truth. Action-specific records own business facts and results;
Action Invocation owns continuity and execution control.

The specification remains proposed until the initial interface, in-memory eval
and current-source mapping establish the lowest-blast-radius persistence design.
