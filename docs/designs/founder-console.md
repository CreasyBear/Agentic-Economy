# Founder console

Consolidated 5 October 2026 from founder source `8cd35d5be` and current main.
The [original design and implementation record](https://github.com/CreasyBear/Agentic-Economy/blob/8cd35d5be35ecc02def79bebbdc192b4e309b8a0/docs/designs/2026-10-01-founder-console.md)
preserves earlier decisions and licensed Arc provenance. This document is the
active bounded contract, not another product roadmap.

## Purpose and scope

The founder can see activity, recognize a material exception and open its
purchase or Account without memorizing identifiers. Preserve the Tool → Quote →
Call chain, existing commands, financial authority and AE shell. No additional
service, reporting engine or payment authority is introduced.

Overview prioritizes current readiness, purchases needing attention, funding-aware
activity and recent purchases. Exact-reference search and recent-record history
are disclosed on demand. Activity preserves paginated purchase evidence; Accounts
provides scoped investigation. Existing provider/audit/exception details, treasury
controls and Alpha learning remain available.

## Contracts

**Admin read boundary**

- Requires current Admin readback authority and a declared deployment environment.
- Ensures bounded native pagination, redacted Account summaries and references to
  original purchase records; unavailable or incomplete evidence remains explicit.
- Invariant: identity, Customer/Agent roles, funding, buyer Charges, Provider
  obligation, delivery and purchase resolution remain distinct.
- On violation: refuse the read. No financial or provider side effect is reachable.

**Marketplace metrics**

- Requires versioned daily snapshots, exact integer money units and established
  funding attribution. Purchased, promotional, refunded and unclassified activity
  are separate; purchased credit alone does not prove external Customer traction.
- Ensures complete-period totals only with complete coverage, deduplicated Account
  counts and gaps for missing daily observations. Every money inspection label
  uses the canonical exact formatter, including values beyond safe Number precision.
- Invariant: Number conversion is chart geometry only. No money, authority or
  original purchase record is changed by reporting.
- On unavailable/inconsistent evidence: withhold totals/comparisons, retain
  inspectable daily evidence and expose uncertainty rather than inventing zero.

**Refresh and recovery**

The existing nightly workload refreshes at most 90 days, overlaps two days and
continues after bounded groups of eight pages. Atomic daily replacement makes
replay safe; it never adds/subtracts financial postings. Protected reads and UI
render failures cannot authorize a retry of a purchase. Readiness expires from
source clocks and preserves the approved explicit screening deferral.

## Structure and interaction decisions

The existing Arc metrics dashboard also serves owner and treasury presenters.
The founder chart block has an incompatible data contract. Keeping a scoped
`arc/blocks/marketplace-dashboard` block adds two files and one data interface;
it preserves those existing callers and isolates funded-chart changes. Both
blocks have real callers. A union-prop compatibility wrapper would couple the
unrelated contracts and is rejected. The unused incoming LiquidTabBar is removed.

Current main's tables retain exact BigInt sorting, controlled sorting, evidence
drawers, native keyboard/selection behavior and focus restoration. Founder table
needs add only readonly inputs, compact density and an optional horizontal mobile
layout. Current shared Alert, filters and SearchField remain authoritative.

Four headline metric choices share one period selector. Operational Call metrics
remain in a labelled disclosure; they are not confused with customer-funded
activity. Three supporting comparisons each answer a named question. Evidence
links preserve exact underlying references. Mobile controls retain touch targets;
closed investigation panels leave keyboard navigation immediately.

## Verification

Focused coverage checks Admin denial and Account redaction; scoped native paging;
funding classification and refresh replay; unknown/missing days and withheld totals;
exact six-decimal labels beyond safe integer precision; CSV links; range changes
without stale values; keyboard navigation and focus; copy refusal; independent
Alpha-learning failure/retry; approved screening deferral and readiness expiry.

The consolidation source also runs `npm run check` and the full `npm run gate`.
Final source counts, backend/web identities and hosted desktop/mobile observations
belong to its release PR and [deployment map](../operations/deployments.md).
Historical isolated-branch test runs do not establish the combined release.
