# ADR-024 — Business Account and customer-management ownership

**Status:** proposed

## Context

AE already has public businesses, owner compatibility records, catalog facts,
inquiries, capability supply and protected operator routes. Those records do
not constitute a mature Business Account product. Treating capability
onboarding as the account would collapse person identity, business identity,
team access, customer-success work and executable supply into one workflow.

“Customer” is also overloaded: AE has demand-side customers pursuing outcomes
and supply-side businesses participating in the network.

## Decision

Use **Business Account** for the ongoing relationship between AE and a
participating business.

- `businesses` continues to own business identity and public lifecycle.
- `businessMemberships` owns person-to-business access and roles.
- `businessRelationships` owns the AE relationship lifecycle and accountable
  customer-success owner.
- business profile, catalog, supply, inquiry, action and billing/provider facts
  remain with their existing source domains.
- relationship tasks, private notes and support cases are new source-owned
  business-account records.
- account dashboards and activity are removable reference projections; they do
  not authorize, settle or rewrite source truth.
- founder/customer-success actions use explicit admin authority and never
  impersonate a business member.

Business relationship lifecycle is:

```text
prospect → onboarding → active ↔ paused
                         ↓
                      at_risk
                         ↓
                    offboarding → closed
```

Transitions require expected revision, attributable actor, reason and evidence
when they reduce access or availability. Closure withdraws future work and
access but preserves attributable history; it is not physical deletion.

Commercial context may be `no_charge | manual | provider_managed`. It records
source-backed relationship facts and references only. It does not create a
payment processor, invoice ledger or settlement claim.

## Consequences

- A claimed or published business can exist without an active Business Account.
- One person may belong to multiple businesses and one business may have
  multiple members.
- Capability onboarding is a child workflow within the Business Account, not
  the account's identity or home.
- Founder portfolio management can be complete without waiting for real
  customer adoption or payment integration.
- Demand-side Customer Request and supply-side Business Account remain
  different aggregates and different public language.

## Acceptance

- server-derived membership authority and last-owner protection;
- complete relationship lifecycle with attributable transitions;
- source-owned support/tasks/notes with privacy separation;
- no profile, membership or relationship state manufactures routeability;
- no dashboard projection owns business, action or commercial truth;
- owner and founder surfaces resume from durable source state;
- intended list/detail queries remain bounded at 10,000 unrelated accounts;
- offboarding withdraws future work while preserving history.
