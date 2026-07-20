---
status: accepted
date: 2026-07-19
amended: 2026-07-20
decision_owner: Founder
supersedes:
  - inquiry-only target posture
  - booking-specific implementation target
---

# Authority modes for consequential operations

## Decision

AE supports consequential business-published operations through the registered
action and Action Invocation plane. The operation may be exposed by an exact
provider endpoint or adapter. Booking is one possible provider-defined API
surface; it is not a mandatory AE bounded context, aggregate or lifecycle.

AE supports four authority modes:

| Mode | Consequence authority |
| --- | --- |
| `inspect_only` | Read, compare and prepare; no external consequence may be released. |
| `approve_each` | The principal makes a fresh exact decision for each consequential action. |
| `bounded_mandate` | A standing mandate permits repeated exact uses inside declared bounds. |
| `full_yolo` | A broad explicit mandate permits autonomous pursuit inside attributable, revocable bounds. |

Every release consumes one exact authority use bound to principal, mandate
generation, objective, action/version, prepared material, provider, recipient,
purpose, data, spend, currency, count, time, concurrency, fallback and risk.
Inapplicable fields are explicitly absent rather than unconstrained.

Reservations and settlement are atomic at the source boundary. Uncertain
release holds capacity until reconciliation. Revocation, expiry, exhaustion,
generation drift or material widening fails closed. Cancellation never claims
reversal without provider evidence.

`full_yolo` is never ambient authenticated-agent access. It remains explicit,
attributable, inspectable and revocable. Widening the objective or any material
limit requires a new mandate or principal step-up.

## Current implementation and evidence

- `approve_each`, `bounded_mandate` and explicit `full_yolo` share exact-use
  semantics in labelled local development execution;
- the paid x402 PublishedOperation is the current proportional operation;
- an unregistered provider-operation fixture preserves cancellation,
  exposure-release, fallback and process-recovery evals;
- malformed mandate and reservation material now fails closed under the
  completed hardening contract; customer exposure remains blocked by the
  product-projection contract in proposed ADR-020.

This ADR establishes product direction and control semantics. It does not prove
public reachability, deployment, provider fulfilment, settlement, customer
value or production safety.

## Relationship to ADR-009/010

ADR-009 permits standalone entry without synthetic Request ownership. ADR-010
requires human and external-agent hosts to use the same action plane. Both use
the authority modes here without turning a mandate, identity, invocation,
result or receipt into transferable authority.

## History

The original accepted ADR selected booking as the first consequential evidence
target. Founder direction replaced that implementation target with a generic
business-published operation while preserving all authority-mode rules. The
complete prior text is archived at
[`ADR-019 pre-hardening`](../archive/adr-009-010-pre-hardening/adrs/ADR-019-authority-modes-and-consequential-operations-target.md).
