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

**Decision-Changing Information**:
Missing information whose answer changes which registered options are viable or comparable at the current decision point.
_Avoid_: Required form field, collect everything upfront

**Commitment-Only Information**:
Information required only after viable options exist and the customer is approaching commitment. It remains deferred until that boundary.
_Avoid_: Missing planning data

**Completion Requirement**:
The registered evidence role and value type that must be produced for AE to claim the requested outcome reached its defined completion point.
_Avoid_: Tool success, run completed

**Prepared Action**:
An exact, expiring business option with bound provider, cost, data use, terms, cancellation posture, evidence, and comparison context, ready for a customer decision.
_Avoid_: Plan, quote preview

**Approval Grant**:
Authenticated, expiring authority bound to one exact Prepared Action and its material consequences.
_Avoid_: Confirmation flag, model approval

**Action Attempt**:
The durable lifecycle of releasing one approved action to a provider, including uncertainty, reconciliation, cancellation, and outcome evidence.
_Avoid_: API call, execution result
