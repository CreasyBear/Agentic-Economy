# Agentic Economy

Agentic Economy connects a customer job to registered business capabilities, preserves the customer's decision and authority boundaries, and records what happened without exposing routing machinery as the product.

## Language

**Customer Request**:
The durable statement of the outcome a principal wants, including known facts, hard constraints, preferences, substitution boundaries, completion requirements, and revision history.
_Avoid_: Prompt, household intent, job post

**Request Understanding**:
AE's untrusted, revisable interpretation of a Customer Request. It is decision material, never authority.
_Avoid_: Final intent, approved plan

**Plan Revision**:
An untrusted proposal composed only from registered capability contracts and typed inputs, bound to one Customer Request revision.
_Avoid_: Execution plan, authorization

**RoutePlan**:
An exact, immutable proposal for one or more ordered registered capability steps that can satisfy a Customer Request revision. It binds the selected businesses, capability contracts, costs, data use, effects, evidence, cancellation posture, recovery, expiry, and fallback choices. A RoutePlan is never authority.
_Avoid_: Execution permission, provider-specific workflow, approved route

**RouteMandate**:
Independently authenticated, expiring authority bound to one exact selected RoutePlan and its material limits. A different route, fallback, generation, recipient, purpose, effect, price ceiling, or expiry requires a new RouteMandate.
_Avoid_: Signed identity, blanket consent, reusable approval

**Decision-Changing Information**:
Missing information whose answer changes which registered options are viable or comparable at the current decision point.
_Avoid_: Required form field, collect everything upfront

**Commitment-Only Information**:
Information required only after viable options exist and the customer is approaching commitment. It remains deferred until that boundary.
_Avoid_: Missing planning data

**Completion Requirement**:
The registered evidence role and value type that must be produced for AE to claim the requested outcome reached its defined completion point.
_Avoid_: Tool success, run completed

**Action Preparation**:
The durable pre-route state for one exact Plan Revision action. It binds current Request and capability semantics, missing commitment information, disclosure review, and reserved preparation authority before any concrete business release or option exists.
_Avoid_: Prepared Action, quote, provider option

**Prepared Action**:
An exact, expiring business option with bound provider, cost, data use, terms, cancellation posture, evidence, and comparison context, ready for a customer decision.
_Avoid_: Plan, quote preview

**Preparation Authority**:
Independently verified, expiring customer permission for AE to share named data categories with bounded connected businesses for a declared comparison purpose. It may be single-use or standing, but always has cumulative recipient, exposure, and operation limits.
_Avoid_: Caller grant, consent flag, signed identity

**Preparation Disclosure Allocation**:
A durable, value-redacted reservation binding one preparation release to a concrete business, field set, purpose, Request revision, and idempotent operation before protected values cross the provider boundary.
_Avoid_: Post-call disclosure record, provider log

**Approval Grant**:
Legacy single-action authority bound to one exact Prepared Action and its material consequences. It does not authorize a composite RoutePlan; new route authority uses a RouteMandate.
_Avoid_: Confirmation flag, model approval

**Action Attempt**:
The durable lifecycle of releasing one approved action to a provider, including uncertainty, reconciliation, cancellation, and outcome evidence.
_Avoid_: API call, execution result
