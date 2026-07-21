# ADR-025 — Commercial and Usage ownership

**Status:** Accepted as Phase 4 planning authority
**Accepted:** 2026-07-21
**Decision:** D-012
**Implementation:** Pending
**Source basis:** Phase 3D commit `63a451f43edea453d0a1a8d8502504433acf76fb`, tree `16fee2f5321d7917f7f0bccd5d59e3d6a018be64`

## Context

AE currently has provider prices, customer-to-business x402 payment attempts,
standing-mandate consumption and operational telemetry. None is AE Business
Account billing or account-attributed platform usage. Treating one as another
would manufacture financial truth and couple access to consequence authority.

Phase 4 needs enough Commercial and Usage source ownership for a business to
understand its AE arrangement and bounded product usage. It does not need a
checkout, payment processor, billing portal, tax engine or payout system.

## Decision

### Five independent truths

1. **AE Business Account billing** belongs to a new Commercial source owner.
2. **Customer-to-business operation payment** remains with the operation and
   its payment/effect owner.
3. **AE platform usage and quota** belong to a new Usage source owner.
4. **Operational metrics** remain telemetry and never determine commercial or
   command truth.
5. **Provider payouts** have no Phase 4 source owner and remain deferred.

No state transition in one category silently changes another.

### Commercial account

A Commercial Account is keyed by stable `accountRef`, not a Clerk subject,
organization, listing, owner or business ID. It carries:

- a revision and lifecycle status;
- arrangement `no_charge | manual | provider_managed`;
- billing contact and period;
- an effective offer/entitlement revision;
- opaque provider, invoice and payment references when a named source exists;
- observed/current-until time, completeness and reconciliation posture;
- source-issued safe continuations.

Arrangement and status are independent. `no_charge` may be complete. A
`provider_managed` label does not prove an invoice exists, is paid, or grants
access. Provider observations are attributable and currentness-bounded; they
never copy raw card, payment, credential, signature or secret material.

### Usage

Usage owns a closed, code-versioned meter registry. Public callers cannot
invent meter names, units, quantities, account identities or chargeability.

Usage events are immutable and bind account, meter/version, subject, quantity,
unit, occurred/recorded time, producer identity, producer event, idempotency
identity, entitlement revision and source revision. Exact replay returns the
prior event. Materially different replay conflicts. Corrections append an
attributable compensating event.

Where quota gates a consequence, Usage atomically reserves against the current
entitlement and period, then settles or releases. Unknown consumption remains
held until reconciled. Two concurrent claims for the last unit cannot both
succeed. This reuses Action Invocation's safety pattern, not its authority-use
records or meaning.

The Phase 4 reference meter is `routeable_operation_start:v1`, unit
`operation`. It is reserved after account, entitlement, membership, exact
authority and routeable-supply checks, immediately before creation of the
current attributable Action Invocation attempt. It settles when that attempt
identity is durably committed, independent of provider result or payment.
Labelled fixtures may use a manual arrangement and one-unit limit; they prove
mechanics only.

Raw events and reservations are canonical. Period summaries are bounded,
removable and rebuildable, with `asOf`, completeness and source revision.
Quota admission fails closed when an authoritative balance cannot be
established; reconstruction never resets usage to zero.

### Authority and closure

Commercial entitlement permits product access; it is not a mandate. Billing
responsibility cannot operate Work, create Ownership, settle operation payment
or authorize an external consequence. Founder/customer-success commands name
their actual actor and cannot rewrite Usage or declare provider truth.

Pause/offboarding stops new reservations and commercial widening while open
reservations, late events, corrections and reconciliation remain processable.
Closure preserves commercial, usage and operation-payment history.

## Consequences

- Business Account composes references to Commercial and Usage; it does not
  absorb their source truth.
- Capability-supply observations, standing-mandate uses and telemetry cannot
  be substituted for Usage.
- Operation payment never activates AE account access, and AE account state
  never proves an operation payment settled.
- Checkout, billing portal, invoices, pricing tiers, proration, tax, discounts,
  credits, provider metering, earnings, balances and payouts are optional later
  breadth, not Phase 4 completion requirements.

## Acceptance

- duplicate and conflicting usage delivery are distinguished;
- concurrent last-unit reservation accepts once;
- uncertain consumption remains held and reconcile-only;
- rebuilt summaries equal source history and can be deleted safely;
- late/correction events and plan changes preserve attributable period truth;
- failed, disputed, refunded or unavailable provider observations remain named
  currentness evidence rather than fabricated account truth;
- human and scoped-agent projections agree on account, entitlement revision,
  usage, `asOf`, completeness, refusal and safe continuation;
- closure preserves all five truth boundaries and history.

This ADR establishes source and planning meaning only. It proves no invoice,
payment, settlement, payout, revenue, provider operation, hosted behavior,
customer value or production safety.
