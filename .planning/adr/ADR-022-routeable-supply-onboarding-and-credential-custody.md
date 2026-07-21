# ADR-022 — Routeable supply onboarding and credential custody

**Status:** proposed
**Date:** 2026-07-21
**Decision owner:** Founder
**Phase:** 4A

## Decision

Routeable supply onboarding is one workflow inside the Business Account defined
by ADR-024. It is not the complete provider/customer-management product.

AE will productize supply onboarding as a protected workflow over the existing
Business and Capability Supply source owners. It will not create another
provider, tool or executable-supply registry.

A business becomes routeable only when all current source facts agree:

```text
admitted business
  + active capability contract
  + active offering
  + admitted and conformant binding
  + current publication
  + opaque credential readiness
  + fresh healthy readiness evidence
  + reachable intended surface
```

An onboarding draft is resumable workflow state. It may collect and validate a
contract, offering and binding draft, but it never authorizes execution or
declares routeability.

Bindings declare `credentialMode: none | managed_ref`. Open endpoints do not
require credentials. Authenticated endpoints use a business-scoped opaque
custody port; the first founder-assisted adapter resolves a protected
deployment environment reference. Convex stores only a reference and
attributable readiness observations. Raw secrets,
authorization headers, signatures, payment payloads and private keys never
enter drafts, canonical supply rows, projections, logs, packets or handoffs.

The mode governs the live transport path. `none` admits, probes and executes
without credential resolution and without an Authorization header.
`managed_ref` admits, probes and executes only after exact custody resolution.
Callers cannot select or downgrade the mode at execution time. The mode is part
of canonical binding reconstruction and readiness identity; changing it
invalidates earlier readiness evidence.

Authenticated owner identity migrates to the Clerk token identifier as the
canonical authorization key. The current subject/clerk-user compatibility
field may remain during bounded dual-read migration, but it cannot remain the
authority source.

Public operation search uses a removable derived projection. Exact routing
revalidates the canonical publication revision, eligibility and readiness;
projection membership never grants authority.

## Consequences

- Existing `business`, `catalog`, `capability-contract-registry` and
  `capability-supply` records remain canonical.
- New UI may add owner/operator onboarding state without changing the meaning
  of a public listing.
- Publication can succeed while routeability remains inactive pending current
  readiness.
- Credential custody and readiness become replaceable ports. Phase 4 supports
  open endpoints and founder-provisioned managed references; later self-service
  secret intake can replace the adapter without schema reinterpretation.
- Deleting onboarding drafts or public projections cannot erase business,
  operation, authority, result or evidence truth.

## Rejected alternatives

- Treating a claimed or published listing as executable supply.
- Storing customer secrets or auth headers in Convex.
- Extending `serviceCapabilities`, a discovery inventory, into the operation
  registry.
- Allowing owners to self-assert admission, conformance or readiness.
- Hydrating the complete supply graph for every public search result.

## Acceptance

ADR-022 may become accepted only when Phase 4A source and evals prove each gate
can independently remove routeability; raw-credential substitution fails
closed; exact owner authorization uses canonical token identity; and a deleted
projection leaves canonical supply intact.

Evidence remains source and labelled fixture/mock mechanics until an
independently operated provider is onboarded later.
