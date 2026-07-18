# AE Product Foundry and Primitive Refinery program

**Owner:** Product
**Status:** Active
**Maturity:** Target research
**Question:** Can AE deliver a valuable real workflow while discovering reusable primitives that lower the cost of creating later workflow products without contaminating the neutral kernel?
**Decision affected:** D-005
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

## Management decision

This program supports one investment decision:

> Does AE have both a first product customers value and a repeatable mechanism
> for turning further economic workflows into modular products?

The program does not assume that the existing kernel is complete. It also does
not permit a workflow-specific need to enter the kernel by intuition. Real
workflow evidence supplies primitive candidates; cross-wedge replay and the
promotion gate decide where they belong.

## Current status

**OBSERVED:** AE's product authority defines the neutral target lifecycle as
Request → Quote → Approve → Run → Inspect → Report. It requires quote before
authority, bounded data and spend, idempotency, evidence, and honest recovery.

**OBSERVED:** The current product-foundry portfolio, evidence contracts, and
replay scenario manifests exist in `eval/product-foundry/`. The four starting
packs are labelled simulated. They are not replay, customer, provider,
operational, hosted, or production evidence.

**INFERRED:** Low-risk public events are the strongest current commercial
candidate from the desk review. Ordinary strata repair is a useful transfer
test, small commercial fit-out is a dissimilar falsification case, and direct
booking is the negative control.

**UNKNOWN:** The actual burden, willingness to delegate, provider participation,
authority acceptance, product economics, and marginal cost of adding the second
wedge have not been measured.

## Product Foundry loop

For the commercial and transfer wedges, reconstruct at least five recent real
cases. A case must record:

1. the person's objective and the boundary at which the work is complete;
2. the actors, responsibilities, decisions, and authority boundaries;
3. facts, unknowns, candidate-selection rules, dependencies, and deadlines;
4. external effects, evidence, exceptions, cancellation, and recovery;
5. customer, provider, and backstage operator work;
6. repeated facts, manual contacts, waits, corrections, parallel trackers, and
   unresolved uncertainty.

The incumbent baseline is measured before the improvement threshold is
preregistered. The same bounded case is then rehearsed through AE. Private case
material is not committed to public fixtures; the pack contains redacted,
consented, or synthetic equivalents plus references to controlled evidence.

## Primitive Refinery loop

Each workflow transition is classified as:

- existing primitive;
- wedge contract or policy;
- provider adapter;
- reusable module;
- candidate kernel primitive;
- explicit human operation;
- unsupported or unsafe work.

The classification is a claim requiring a mechanism reference and replay
evidence. An unexplained transition remains residue; it is not silently forced
into an existing abstraction.

### Promotion rule

A need starts wedge-local. It becomes a reusable module only after the same
semantics survive two materially different workflow families behind one stable
interface.

Kernel promotion additionally requires three distinct workflow families,
neutral vocabulary, demonstrated failure of composition, a protected platform
invariant, no burden on the direct-booking control, human/agent parity, replay
regression, backwards compatibility, threat review, and an accepted ADR.

## Evals

The management scorecard has four independent gates:

| Gate | Evidence |
|---|---|
| Customer value | Lower measured coordination burden without worse correctness, elapsed time, cost, privacy, or control |
| Provider value | Better-formed work with less clarification and re-keying |
| Operational leverage | Customer savings are not shifted into equal or greater backstage work |
| Platform leverage | The transfer wedge uses no parallel lifecycle or bespoke orchestration and has lower marginal creation cost |

Calling-agent conformance covers cold discovery, creation and resume, missing
facts, stale revisions, duplicate calls, changed supply, uncertain external
effects, cancellation, recovery, and evidence inspection.

The portfolio remains `evidence_pending` until field observations exist.
Afterwards it may resolve to invest, narrow, refine the platform, operate as a
service deliberately, or stop.

## Falsifiers

**HYPOTHESIS PF-001:** The event product materially reduces customer burden
without shifting that burden to providers or operators.

**Falsifier:** The preregistered improvement threshold is missed, correctness or
control worsens, providers must reconstruct the request, or backstage operator
work equals or exceeds the customer work removed.

**HYPOTHESIS PF-002:** The strata transfer product can be expressed through the
same Customer Request lifecycle using contracts, policies, adapters, and shared
modules.

**Falsifier:** It requires a parallel intent, orchestration, persistence,
authority, evidence, or recovery state machine.

**HYPOTHESIS PF-003:** Repeated cross-wedge residue will identify a small set of
justified reusable primitives.

**Falsifier:** Candidate primitives remain wedge-named, can be composed from
existing semantics, break earlier replays, or add overhead to direct booking.

## Issue boundary

Issues #181–#187 remain dormant. They may be rewritten only after the program
has a selected commercial cohort, observed baseline, primitive coverage matrix,
promotion disposition for each missing primitive, product proof design, and
transfer test.

> **SUPERSEDED IN PART — 2026-07-18.** The Founder activated the ADR-009/010
> completion goal and its Gate 0 research frontier. Issues 183 and 184 are no
> longer dormant: they may resolve the recurring-work grammar and current-source
> constraint map without authorizing implementation or substituting for the
> still-required cohort, provider, burden, security, transfer, and investment
> evidence. The remaining implementation dependencies stay gated by
> [`2026-07-18-phase-1-2-completion-contract.md`](../scopes/2026-07-18-phase-1-2-completion-contract.md).
