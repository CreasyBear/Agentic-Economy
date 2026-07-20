# Phase 1/2 control-plane hardening contract

**Status:** active
**Decision owner:** Founder
**Updated:** 2026-07-20
**Architecture:** ADR-009 accepted; ADR-010 accepted with Gate 10 narrowed

## Outcome

Retain the implemented Action Invocation and one-action-plane architecture while
making its authority and evidence boundaries safe enough for future exposure.
This contract adds no public endpoint, Convex persistence, deployment or
production claim.

## Required transitions

1. Reject malformed mandate, policy, reservation, offset and restored-snapshot
   material before digest or capacity calculation.
2. Keep host observation non-authoritative and make pre-execution failure a
   truthful durable outcome.
3. Bind official evidence to a clean checkout of an explicit commit and
   independently recompute every advertised disposition.
4. Remove the provider-operation fixture from production module ownership and
   global Action Context.
5. Preserve Gate 10 as a negative product finding while retiring its comparator
   from active commands and acceptance.
6. Reconcile Phase 1, Phase 2, ADR-009, ADR-010, STATE and the execution ledger
   to this contract.

## Product and architecture decisions

| Prior instruction | Current disposition | Current meaning |
| --- | --- | --- |
| Qualified inquiry as first slice | historical | Useful early tracer; not the product ceiling or current consequential target. |
| Registered AE booking module | retired | Booking may be a provider-defined operation; AE does not require a booking bounded context. |
| Generic paid PublishedOperation | current | Proportional consequential operation used by both origins and hosts. |
| Cancellable provider-operation harness | fixture-only | Local authority, cancellation and recovery evidence; never registered or customer reachable. |
| Action Invocation | current | Narrow control record for one registered action call. |
| Customer Request ownership for every action | rejected | Standalone work retains discriminated lineage; broader outcomes may compose references. |
| Gate 10 payoff claim | rejected for measured class | Equal human effort produced `NARROW_OR_REDESIGN`; no embedded-experience payoff is claimed. |

## Completion gates

- invalid, non-finite, fractional, unsafe or negative authority material fails
  closed at issue, policy, reserve, release, settlement and restore;
- observer failure cannot turn a completed effect into an apparent retryable
  failure;
- official packets refuse dirty or revision-mismatched source and recompute
  their semantic claims;
- production source, routes, registered actions and Convex do not import the
  development provider fixture;
- active planning documents contain no booking mandate or conflicting Gate 10
  instruction;
- an independent source review finds no unresolved P0/P1 issue in the
  exposure-ready source boundary.

## Verification policy

Use focused tests to steer each changed transition. At closeout run the Action
Invocation unit suites, provider-fixture suites, import boundaries, typecheck
and lint. Regressions caused by this work must pass; unrelated existing failures
are recorded without becoming a new implementation program.

Official evidence runs only from a clean detached checkout of the integrated
commit. Evidence classes remain distinct:

1. source inspection;
2. unit/integration fixtures;
3. labelled local/mock execution;
4. clean-revision local evidence;
5. hosted readback;
6. independent provider evidence;
7. customer and operating evidence.

One class never silently upgrades another.

## Stop conditions

Stop or narrow if hardening requires a public endpoint, Convex schema, universal
business-operation model, booking module or unrelated Customer Request
refactor. The earliest reproducible blocker and smallest required product
decision end that loop.
