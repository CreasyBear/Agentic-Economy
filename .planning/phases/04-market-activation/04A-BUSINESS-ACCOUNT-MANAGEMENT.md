# Phase 4 Business Account product contract

**Status:** Accepted target contract under D-011
**Accepted:** 2026-07-21
**Implementation:** Pending

## Outcome

A business team can onboard, operate, support and close its AE relationship
without engineering narration. The current business is always legible.
Operators know whether customers can find the business, which named work can be
requested now, what requires attention, which Work is waiting and which
conversations need a response.

This is mature Business Account/customer-management functionality. It is not a
listing wizard, capability console or minimum viable account.

## Current versus target

Current source supports public business identity, published services, narrow
inquiry admission, a single-owner Inbox and deep registered-action/supply
facts. It does not yet provide memberships, relationship lifecycle, business
Work list, account Home, domain availability, Business Account support,
commercial context or closure.

| Area | Current classification | Target |
|---|---|---|
| Home | proposed removable projection | source-referenced visibility, availability, attention, Work, Inbox and onboarding |
| Work list | proposed removable projection | business-affinity references; exact detail rehydrates source owners |
| Work detail | existing, bounded extension | membership scope and domain-detail dispatch |
| Inbox/conversation | existing, bounded extension | business membership, cursor pages and Work links |
| Offerings/service | existing, bounded extension | revisioned drafts, publication, ordering, pause/retire |
| Availability | new domain source/read model | narrow shared disposition only |
| Integrations | existing, bounded extension | business scope, many-to-many offering links and diagnostics |
| Team/access | new source/read model | memberships, invitations, responsibilities and Ownership |
| Business settings | new owners/read models | notifications, commercial references, export and closure |
| Help/support | new source/read model | customer-visible support cases/messages |
| Founder account | new owners/read models | relationship, tasks, private notes and bounded summaries |
| `/owner/**` | retire/redirect | membership-resolved `/businesses/:businessId/**` routes |

## Customer information architecture

```text
Current business [switch]

Home
Work
Inbox
Offerings
Business settings
Help
```

Canonical routes:

- `/businesses/:businessId`
- `/businesses/:businessId/work[/:workRef]`
- `/businesses/:businessId/inbox[/:threadRef]`
- `/businesses/:businessId/offerings[/:serviceRef]`
- `/businesses/:businessId/offerings/:serviceRef/availability`
- `/businesses/:businessId/settings`
- `/businesses/:businessId/settings/integrations[/:integrationRef]`
- `/businesses/:businessId/settings/team`
- `/businesses/:businessId/settings/notifications`
- `/businesses/:businessId/settings/security`
- `/businesses/:businessId/settings/plan-data`
- `/businesses/:businessId/settings/closure`
- `/businesses/:businessId/history`
- `/businesses/:businessId/help[/:caseRef]`

The URL and fresh server membership determine current business. Switching
accounts moves to Home unless the equivalent destination is permitted and
meaningful. Browser preference is convenience only.

## Customer loops

### Onboarding

The business can establish identity, profile and services; configure
domain-supported availability; connect required Integrations; invite people;
preview customer-visible changes; and resume every step by direct URL.
Completion is source-issued, never an inferred percentage.

### Daily operation

Home presents one ranked operating brief:

1. visibility and per-offering availability;
2. one deduplicated attention feed;
3. waiting Work;
4. conversations needing response;
5. the next onboarding/account task when relevant.

Work is the sole operational queue. Inbox is conversation. Help owns
customer-visible support. History is secondary evidence.

### Exception and recovery

Every consequential view uses the source-issued safe continuation. Stale state
requires refresh/recheck. Possible external effect permits inspect/reconcile
only. Transport acceptance never becomes durable success.

### Team and access

Membership is business-bound. Responsibilities are additive and initially
presented as Owner, Administrator, Operations, Billing, Developer and Viewer
presets. The server evaluates the union. Protected Ownership remains separate.

Invitations are expiring, single-use and business-bound. Permission changes are
revisioned and attributable. The last Owner is protected. Ordinary transfer
requires receiving-member acceptance. Suspension/removal revokes future access
while preserving history.

### Business settings

Business settings contains Integrations, Team, notifications, security links,
truthful commercial references, data/export and closure.

Personal identity, sessions and personal security remain under `/settings`.
Commercial state may be no-charge, manual or provider-managed. No absent
provider source is converted into invoices, paid status, earnings or
settlement.

Closure is a durable resumable withdrawal of future work and access. Failed
withdrawals remain visible and retryable from source-issued progress. Closure
preserves attributable history.

### Help and support

General guidance remains available even when case data fails. Customer-visible
cases/messages are distinct from founder-only tasks and private notes. Support
may link to Work, Offerings or Integrations but cannot rewrite their truth.

## Offerings, Integrations and availability

Offerings own customer-recognizable services. Integrations own connections.
The relationship is many-to-many:

- one Integration may power several offerings;
- one offering may depend on several Integrations;
- account-wide identity, payment or notification Integrations may belong to no
  single offering.

Integrations is canonical under Business settings. Offerings link to affected
Integrations and Integration detail links back to affected offerings. A
technical-maintainer shortcut points to the same route.

Availability is domain-owned. Shared UI carries only:

```text
available | limited | paused | unavailable | unknown
customer impact
reason
observedAt / validUntil
source
allowed next actions
domain detail link
```

Appointment slots, dispatch capacity/zone and paid-operation price/payment
truth remain in their domain owners.

## Queue and attention contract

A conversation creates or links to Work only when a source-owned transition
creates a durable operational identity. Message interpretation alone is
insufficient. Conversation and Work store references, not copied state.

Each source owns its count. Home stores references with stable identity:

```text
sourceKind + sourceRef + reasonCode + sourceRevision
```

One underlying condition appears once on Home with related context. Closing a
conversation never completes Work; completing Work never marks a message read.

Priority is uncertainty, blocked Work, required customer response,
availability/Integration blockage, security/access, onboarding/account task,
then support follow-up.

## Source ownership and query contract

- Business identity/public lifecycle: business source.
- Services/publication: catalog source.
- Work consequence/result/continuation: Action Invocation plus domain owner.
- Conversation/delivery: inquiry source.
- Integration/readiness: capability-supply source.
- Availability policy: domain owner.
- Membership/responsibilities/Ownership: Business Account membership source.
- Relationship/tasks/support/commercial/closure: their Business Account owners.
- Home, Work list, History and founder portfolio: removable projections.

Home uses one revisioned summary plus cap-and-one attention, Work and Inbox
lists. Detail routes hydrate exact owners. Counts are maintained by bounded
events, not full-table reads. Projections carry source ref/revision,
observed/current-until time and incomplete/stale disposition.

## Founder and technical surfaces

Technical disclosure shows exact revisions, bindings, check history,
credential mode without secret value, evidence and retry posture. It is not
ordinary navigation.

Founder/customer-success routes own portfolio, relationship, onboarding tasks,
private notes, support administration, commercial references and lifecycle.
Release operations remain separate. Founder commands name the admin actor and
never borrow member authority.

## Compatibility

- `/owner/status` → Business Home
- `/owner/inquiries[/:threadId]` → Inbox/conversation
- `/owner/settings` → personal or business settings as appropriate
- `/owner/request-problems/:reportRef` → source-linked Work recovery

Zero memberships route to business selection/onboarding. Multiple memberships
require explicit selection unless the source record resolves one permitted
business. Phantom owner Actions/Billing links are retired.

## Mature completion behavior

Using labelled fixtures, an evaluator can:

1. establish and switch Business Accounts while refusing a guessed account;
2. complete/resume onboarding and repair blockers;
3. manage profile, services and three unlike availability shapes;
4. configure one-to-many, many-to-one and account-wide Integrations;
5. invite members, combine responsibilities and prove last-owner protection;
6. distinguish Home attention, Work, Inbox, Help and History;
7. respond to conversations and link only source-created Work;
8. inspect uncertainty and follow only safe continuation;
9. manage notifications and truthful commercial references;
10. export data and resume partial closure without losing history;
11. operate founder support without impersonation;
12. resume every view by direct URL at bounded query cost.

## Far-field boundary

Sales tactics, supplier/customer incentives, liquidity, retention and market
mechanisms are future product research. Phase 4 creates mature operations and
truthful source surfaces those mechanisms may later use. It does not add
rewards, commissions, rankings, loyalty mechanics, marketplace metrics or
growth dashboards.

## Claim ceiling

Completion can establish source, focused fixture and labelled sandbox behavior.
It cannot establish adoption, demand, provider quality, revenue, accessibility
in use, customer value, hosted availability or production safety.
