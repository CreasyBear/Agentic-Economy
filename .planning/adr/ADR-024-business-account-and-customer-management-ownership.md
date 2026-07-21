# ADR-024 — Business Account and customer-management ownership

**Status:** Accepted as local planning authority
**Accepted:** 2026-07-21
**Decision:** D-011
**Implementation:** Pending

## Context

AE has public businesses, owner compatibility records, catalog facts, inquiries,
registered actions, capability supply and protected operator routes. These do
not yet constitute a mature Business Account product. Listing or capability
onboarding cannot become the account.

## Decision

### Owned concepts

Use **Business Account** for AE's ongoing relationship with a participating
business.

- `businesses` owns business identity and public lifecycle.
- `businessMemberships` owns person-to-business membership.
- `businessMemberInvitations` owns expiring, single-use invitations.
- additive Responsibility grants own effective member permissions.
- protected **Ownership** owns irreducible governance, transfer and closure.
- `businessRelationships` owns AE's relationship lifecycle and accountable
  customer-success owner.
- business support cases/messages own customer-visible support.
- onboarding tasks and private notes own backstage relationship work.
- Home, Work, History and founder summaries are removable reference
  projections. They never authorize, settle or rewrite source truth.

Responsibilities are Business administration, Work operations, Customer
communication, Offering management, Technical integration, Billing and
commercial, Reporting and viewing, and Support interaction.

Owner, Administrator, Operations, Billing, Developer and Viewer are familiar
presets. A member may hold several presets or a custom combination. The server
derives effective access. Ownership never emerges from permission union. The
last active Owner cannot be removed, suspended, demoted or stripped of
Ownership. Ordinary transfer requires explicit recipient acceptance.

### Preserved source ownership

- inquiry sources own conversation, messages, read state and delivery truth;
- Action Invocation and operation owners own Work consequence, attempts,
  uncertainty, result and safe continuation;
- business/catalog sources own profile, service and publication facts;
- capability-supply sources own integration binding, credential references,
  publication and readiness;
- each domain owns actual availability and fulfilment semantics;
- commercial/provider sources own financial/provider facts when they exist.

### Experience boundary

The accepted customer shell is:

```text
Home
Work
Inbox
Offerings
Business settings
Help
```

Current-business context is persistent and comes from the URL plus fresh
membership authority. Work is the operational queue; Inbox is conversation;
Help owns customer-visible support; History is evidence and never a queue.

Integrations is canonical under Business settings. Offerings and Integrations
are many-to-many and link contextually; neither owns the other. A role-aware
shortcut may point technical maintainers to the same canonical route.

Customer views, protected technical disclosure and founder/customer-success/
release operations remain separate. Founder commands use explicit admin
authority and never impersonate a member.

### Availability boundary

Availability remains domain-owned. Shared UI may project only disposition,
customer impact, reason, observed/current-until time, source, allowed next
actions and a domain detail link. It does not own calendars, slots, fleets,
zones, capacity units, price, payment provider or fulfilment lifecycle.

Paid digital information, appointment-shaped and dispatch-shaped offerings
must fit without widening the shared contract with vertical nouns.

### Independent decision dimensions

Application release, Business Account feature access, member permission,
publication/visibility and operational availability remain independent source
facts. None implies another. Navigation hiding is never authorization.

The relationship lifecycle is:

```text
prospect → onboarding → active ↔ paused
                         ↓
                      at_risk
                         ↓
                    offboarding → closed
```

Closure withdraws future work/access through durable resumable progress while
preserving attributable history. It is not deletion.

Commercial context may be `no_charge | manual | provider_managed` with source
references. It does not manufacture invoices, settlement, paid status or
feature access.

## Consequences

- A public business may exist without an active Business Account.
- Membership, relationship, publication and availability remain separate.
- Capability onboarding is a workflow, not the account identity or home.
- Home uses reason-coded references rather than a source-owning health score.
- A message links to Work only after a source-owned transition creates a
  durable operational identity.
- Market incentives, commissions, rankings, loyalty, liquidity and growth
  dashboards remain future research, not Phase 4 Account concepts.

## Acceptance

- server-derived membership and additive responsibility authority;
- protected Ownership, accepted transfer and last-owner protection;
- six-item shell with persistent business context;
- source-owned Work, conversation, Offerings, Integrations and availability;
- many-to-many Offering/Integration links;
- customer-visible support separated from private notes;
- source-issued safe continuations and no transport-derived success;
- bounded removable summaries;
- compatibility redirects that never use browser state as authority;
- paid-information, appointment and dispatch horizontal falsifiers;
- attributable, non-impersonating founder operations.

This ADR is accepted planning authority. Implementation, hosted behavior,
customer validation and production maturity remain pending.
