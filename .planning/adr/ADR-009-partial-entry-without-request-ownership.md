---
status: accepted
date: 2026-07-17
accepted: 2026-07-20
decision_owner: Founder
review_by: 2026-08-17
exposure: blocked_pending_control_plane_hardening
---

# Allow partial entry without requiring Customer Request ownership

## Decision

A caller may ask AE to perform one independently useful registered action
without first creating a synthetic Customer Request or RoutePlan. Customer
Request remains the canonical aggregate for a broader customer outcome and may
compose invocation and result references when genuine dependencies exist.

Action Invocation is the narrow durable control record for one call to one
registered action and immutable action version. It is not a universal business
task, `EconomicOperation`, business module or replacement for action-specific
results.

Each invocation preserves:

- `request_owned` lineage with exact Request reference and revision; or
- `standalone` lineage with exact caller and principal attribution.

These origins use the same authority, attempt, idempotency, generation,
uncertainty, reconciliation and recovery semantics. Authority never transfers
through an invocation, result reference, composition edge or prior approval.

## Accepted architecture

- business facts and results remain owned by their action/source;
- shared control state stores continuity and references only;
- exact authority binds action, version, invocation, prepared material,
  principal, target, limits, expiry and generation;
- every consequential attempt has stable idempotency and one current effect
  generation;
- possible release requires reconciliation before retry;
- completed standalone results may be referenced without copying state or
  repeating effects;
- domain variation remains in registered contracts and provider adapters.

The proportional reference operation is a generic business-published paid
operation. Booking is not a mandatory AE module. A provider-defined cancellable
operation may remain a labelled, unregistered fixture when needed to evaluate
cancellation and recovery semantics.

## Acceptance disposition

The eleven architectural gates have labelled local development evidence:

1. current supplied-candidate qualification;
2. quote preparation and disclosure authority;
3. attributable external commitments;
4. identical control meaning across both origins;
5. historical Request lineage preservation;
6. reference-only composition;
7. proportional direct consequential operation;
8. durable stop and continuation;
9. truthful route roll-up;
10. no authority crossing between tasks;
11. no domain noun in the neutral control plane.

ADR-009 is accepted as architecture. Exposure remains blocked until malformed
authority material fails closed and official evidence binds to exact committed
bytes. Current evidence does not prove deployment, provider fulfilment,
customer value or production safety.

## History

The inquiry-first and later booking-specific plans were implementation
experiments. Founder direction replaced booking as the mandatory evidence
adapter with a generic PublishedOperation. The complete pre-hardening ADR and
amendment history is preserved at
[`ADR-009 pre-hardening`](../archive/adr-009-010-pre-hardening/adrs/ADR-009-partial-entry-without-request-ownership.md).
