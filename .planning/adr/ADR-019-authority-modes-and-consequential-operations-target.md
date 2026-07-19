---
status: accepted
date: 2026-07-19
decision_owner: Founder
supersedes:
  - inquiry-only target posture
  - no-booking target posture
---

# Authority modes and consequential operations target

## Status

Accepted

## Founder decision

On 2026-07-19 the Founder decided that AE's target product includes registered
consequential operations, beginning with booking and extending ultimately to
high-autonomy operation. The existing inquiry-only and no-booking language
remains accurate for the **current evidenced state** but is superseded as a
target constraint.

This decision changes what AE will build. It does not change what exists today:
AE has no customer-reachable booking, payment, dispatch, or independently proven
fulfilment path at this revision.

## Decision

AE will expose four authority modes over the same registered-action and Action
Invocation plane:

| Mode | Consequence authority |
|---|---|
| `inspect_only` | Read, compare, and prepare. No external consequence may be released. |
| `approve_each` | The principal makes a fresh exact authority decision for each consequential action. |
| `bounded_mandate` | A standing mandate permits repeated actions only while every use remains inside its exact declared bounds. |
| `full_yolo` | A broad, explicit standing mandate permits high-autonomy operation inside declared bounds and stop conditions. It is never ambient, unlimited, irrevocable, or transferable authority. |

Every consequential release consumes one exact **authority use**. The use binds
the principal, authority mode and mandate generation; objective; registered
action and immutable version; prepared-input digest and material provenance;
recipient or counterparty; purpose; allowed data; spend ceiling; currency;
action-count ceiling; validity window; parallelism ceiling; permitted fallback
set; and risk ceiling. Fields that do not apply are explicitly absent under the
action contract, not silently unconstrained.

A mandate has expiry, revocation state, and a monotonically increasing
generation. Revocation or material revision fences out stale workers. Every
effect attempt proves that it reserved capacity from the current generation
immediately before release.

Reservation and settlement are atomic at the source-owned boundary. A use
reserves spend, count, parallelism, recipient, data, fallback, and risk capacity
before provider release, then settles as released, not released, or uncertain.
An uncertain settlement keeps the reservation held until reconciliation proves
whether capacity can be released. A stale, revoked, exhausted, expired, or
scope-mismatched use fails closed.

Stable idempotency binds the exact operation payload and authority use.
Possibly released effects reconcile before retry. Cancellation records the stop
request and observed provider state; it never claims reversal without provider
evidence. Every decision, reservation, release, observation, reconciliation,
revocation, and cancellation remains attributable and auditable without a
transcript or component state.

The system steps up to a fresh principal decision when a proposed action
materially widens the objective, action or version, recipient, purpose, data,
spend, currency, count, time, parallelism, fallback, or risk ceiling. A model,
host, provider, retry worker, prior success, or possession of an invocation
reference cannot perform that widening.

## Booking and composition

Booking is an intended consequential action. A simple provider-supported
booking uses one registered booking action and one Action Invocation. It does
not require a synthetic Customer Request, RoutePlan, or route orchestration.
A coordinated booking may compose multiple registered actions when the
customer outcome genuinely requires dependencies, alternatives, or recovery
across providers.

`inquiry.submit` remains a qualified first-contact communication. It must never
be relabelled or stretched into booking, payment, dispatch, acceptance, or
fulfilment. Those consequences enter through separate registered actions with
their own contracts, authority uses, attempts, evidence, and continuations.

## Relationship to existing decisions

ADR-002's governed intent remains the committed subject; it is not authority.
ADR-003's identity-versus-authority separation remains. ADR-005's
proposal/transaction/receipt distinctions remain. ADR-009's partial-entry
architecture and ADR-010's one-action-plane parity now consume the authority
modes defined here. ADR-018 remains the source-owned issue/revoke port for
RouteMandate and becomes an architectural precedent for generation-fenced
standing mandates rather than the only mandate shape.

## Alternatives considered

**Keep inquiry-only as the permanent product boundary.** Rejected because it
prevents AE from carrying an agent's chosen option into the real operation the
customer asked it to complete.

**Treat YOLO as unrestricted authenticated-agent access.** Rejected because
identity is attribution, not authority, and unrestricted access destroys
revocation, loss limits, auditability, and safe recovery.

**Require a Customer Request and RoutePlan for every booking.** Rejected because
a single provider-supported booking does not earn orchestration overhead or
fabricated outcome lineage.

**Create host-specific autonomy rules.** Rejected because human, embedded-agent,
and external-agent hosts would then disagree about authority, retry, evidence,
and recovery.

## Staged consequences

1. Development first closes ADR-009 Gate 7 with one registered booking action,
   a provider adapter or labelled simulator, both caller origins, and direct
   Action Invocation control without synthetic route machinery.
2. The same booking action becomes ADR-010's first consequential host-parity
   proof, including mode, revocation, uncertainty, cancellation, and step-up.
3. `approve_each` establishes the exact-use baseline. `bounded_mandate` extends
   it only after reservation, settlement, expiry, revocation, generation
   fencing, and widening evals pass.
4. `full_yolo` remains target-only until broad standing-mandate evals prove
   bounded loss, immediate stop/revoke behavior, reconstructability, parity,
   and honest unknown-effect recovery.

No stage changes the public claim ceiling without intended-surface evidence.

## Amendment — 2026-07-20: operation-generic target

Founder direction supersedes “beginning with booking” and the booking-specific
staged sequence as implementation authority. AE's primitive is a
business-published operation with an exact contract, endpoint or adapter,
price and payment terms where applicable, authority requirement, attempt,
receipt and recovery semantics. Booking is one possible provider-defined API
surface; it is not an AE bounded context, aggregate or privileged lifecycle.

The four authority modes and every exact-use, reservation, settlement,
revocation, generation-fencing, uncertainty and step-up rule remain unchanged.
The current development reference uses the paid x402 quote endpoint. A separate
unregistered provider-operation fixture preserves cancellation and exposure
release evidence for an operation that supports those continuations.

Historical booking evidence remains attributable provenance. The development
booking module and its globally registered actions are retired. No amendment
claim makes booking, payment, dispatch, fulfilment or high-autonomy operation
customer-reachable.
