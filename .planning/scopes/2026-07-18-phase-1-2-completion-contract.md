# Phase 1 and Phase 2 completion contract

**Owner:** Founder
**Execution owner:** Engineering
**Status:** Active rebaseline
**Maturity:** Current execution contract
**Governs:** ADR-009 Phase 1 and ADR-010 Phase 2
**Tracker:** [Engineer Action Invocation seam for ADR-009 and ADR-010](https://github.com/CreasyBear/Agentic-Economy/issues/193)
**Evidence cutoff:** 2026-07-18
**Review by:** 2026-08-17

## Goal

Finish Phase 1 and Phase 2 in their entirety.

“Finish” means that the task-first prerequisites, implementation, real
development-surface execution, failure and recovery evals, cross-surface
semantic parity, direct-path control, transfer test, reviews, and exact evidence
all support one terminal decision:

- **invest** in the bounded product and prepare a separately authorized
  production decision;
- **narrow** to the smaller task, cohort, or information-only boundary the
  evidence supports;
- **operate deliberately as a service** with named and measured human work; or
- **stop** because a value, supply, safety, transfer, or leverage falsifier
  holds.

Green source tests, an in-memory adapter, a simulator, a fixture, a labelled
sandbox/development run, or a proposed architecture are not completion by
themselves. They do not prove independently operated supply, provider
fulfilment, production behavior, or customer value.

No production deployment is authorized by this contract.

## Why the previous phase plans cannot be executed

The post-deepening source rebaseline found that ADR-011 through ADR-018 moved
the owning Customer Request transitions after the original Phase 1 and Phase 2
plans were written. The original Phase 1 Tasks 2–3 assume an unearned common
lifecycle and Task 4 persists it. The original Phase 2 plan assumes that
lifecycle exists and leaves several ADR-010 gates deferred.

Those documents remain design evidence. Their `<tasks>` blocks are not current
execution authority. Completion is governed by this contract, the selected
task-first handoff, and refreshed per-slice plans produced after the prerequisite
decisions pass.

## Governing invariants

1. Customer Request remains the canonical broader-outcome aggregate.
2. Existing Request records retain exact lineage and historical replay.
3. Standalone lineage is discriminated; existing Request fields do not become
   broadly optional.
4. No parallel lifecycle, second compiler, universal task object, duplicate
   recommendation model, or host-owned business rules are introduced.
5. Preparation, authority, attempt, release, observation, cancellation,
   recovery, evidence, and projection each have one source owner.
6. Hosts own authentication, transport, conversation, navigation, and
   rendering only.
7. Approval binds the exact action, action version, principal, target, prepared
   input digest, consequence, data-use/spend limits, and expiry.
8. Material input, target, action version, suitability, provenance, or freshness
   changes invalidate stale preparation and authority.
9. Possibly released effects remain unknown until attributable evidence or
   reconciliation resolves them. Cancellation and recovery cannot rewrite that
   history.
10. Every mutation compares the expected invocation version or effect
    generation before changing current state; a stale writer may retain an
    attributable observation but cannot make it current.
11. Every persistable action declares exactly one retry class: `replayable`,
    `attributable_retry`, or `reconcile_before_retry`. A worker may implement
    delivery and backoff but may not choose or weaken that class.
12. Direct work remains direct when AE adds no coordination value.

## Dependency graph

```text
real task + caller/provider cohorts + incumbent control
  -> provider contract + continuation/recovery contract
  -> task journey + cross-industry/direct-path falsifier
  -> partial-entry threat model
  -> architecture + investment eval decision
  -> approved task-first product/engineering handoff
  -> Phase 1 two-caller vertical slices
  -> ADR-009 eleven-gate decision, including development booking Gate 7
  -> Phase 2 cross-surface vertical slices
  -> ADR-010 ten-gate decision
  -> cross-phase transfer/direct-control review
  -> invest | narrow | deliberate service | stop
```

## Gate 0 — earn implementation authority

Implementation may begin only when the following issue-owned decisions are
resolved in dependency order:

| Decision                     | Owning ticket                                                                                                                       | Required output                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Recurring human work         | [Distil the recurring human work across commercial lifecycles](https://github.com/CreasyBear/Agentic-Economy/issues/183)            | Independently useful task boundary and recurring work evidence                                                                   |
| Current-source constraints   | [Map partial-entry constraints through the current AE source](https://github.com/CreasyBear/Agentic-Economy/issues/184)             | Current ownership/lineage map and candidate shared transition                                                                    |
| Provider contract            | [Define the first agent-usable business capability contract](https://github.com/CreasyBear/Agentic-Economy/issues/185)              | Several real providers validate inputs, refusal, evidence, freshness, maintenance, and recovery                                  |
| Task journey                 | [Prototype the journey from one useful task to a composed route](https://github.com/CreasyBear/Agentic-Economy/issues/186)          | Recognizable task-to-result journey with optional composition                                                                    |
| Continuation contract        | [Define cold-agent continuation, retry and repair](https://github.com/CreasyBear/Agentic-Economy/issues/187)                        | Durable references, safe continuations, refusal, retry, reconciliation, and repair meanings                                      |
| Direct and transfer controls | [Falsify the model across industries and the direct-path control](https://github.com/CreasyBear/Agentic-Economy/issues/188)         | Selected task, contrasting workflow, and negative control with preregistered falsifiers                                          |
| Security                     | [Threat-model partial entry and composed authority](https://github.com/CreasyBear/Agentic-Economy/issues/192)                       | Principal, ownership, prepared-input binding, invalidation, idempotency, lease, claim, cancellation, and unknown-effect controls |
| Architecture                 | [Choose the architecture for independently usable and composable actions](https://github.com/CreasyBear/Agentic-Economy/issues/189) | Selected seam, rejected alternatives, migration/rollback, blast radius, and a non-accepting ADR recommendation                   |
| Investment evals             | [Define the investment evals and operating model](https://github.com/CreasyBear/Agentic-Economy/issues/190)                         | Customer, provider, operator, supply, transfer, and continuation metrics with owners and thresholds                              |
| Product/engineering approval | [Approve the task-first product and engineering specification](https://github.com/CreasyBear/Agentic-Economy/issues/191)            | One bounded package approved after security and architecture, or an explicit narrow/stop decision                                |

Gate 0 cannot accept ADR-009 or ADR-010. Its architecture recommendation is
limited to `remain proposed`, `recommend narrow`, `recommend supersede`, or
`stop`. Acceptance requires the executable ADR matrices below.

At the evidence cutoff, all ten tickets are open and unassigned. The existing
post-deepening source map materially advances the source-constraint ticket but
does not close it or resolve the real task, provider, security, architecture,
or investment decisions.

## Phase 1 — complete ADR-009

### Entry conditions

- Gate 0 has produced an approved task-first handoff.
- One consequential action, one Request-owned caller, one standalone caller,
  one real caller/coordinator cohort, and one participating provider cohort are
  named.
- The exact direct-path baseline, completion boundary, claim ceiling,
  falsifiers, and evidence owner are frozen.
- The security handoff approves the public seam and persistence design.
- The exact source revision and isolated implementation branch/worktree are
  recorded.

### Vertical execution order

Each slice uses one loop:

`spec -> red evaluator -> execute -> earliest failed transition -> smallest
source-owner change -> narrow verification -> real development surface ->
expanded verification -> standards/spec review -> scoped commit -> issue update`

The slices are:

1. **Registered-action contract.** Prove the selected action needs immutable
   version, consequence, material-field, preparation, authority, retry,
   evidence, continuation, and invalidation declarations. Preserve compatibility
   for existing read-only actions.
2. **Supplied-candidate qualification tracer.** Exercise caller-supplied
   candidates through current capability contracts, supply evidence,
   eligibility, provenance, and freshness. Fail if the standalone path creates
   a parallel eligibility model or upgrades a supplied claim into an AE
   observation.
3. **Supplied-candidate quote-collection tracer.** Exercise the selected
   provider/caller cohort through structured preparation, exact disclosure
   authority, attributable provider attempts, timeout/unknown state, and
   reconciliation. Record whether the existing seams retain the same meaning or
   the architecture must narrow.
4. **Imported-commitment observation tracer.** Import one externally created
   commitment as a claim attributed to its named source. It becomes a current
   AE observation only through an admitted provider adapter with fresh,
   attributable evidence. Never synthesize an AE attempt or fulfilment claim.
5. **Two-caller in-memory tracer.** Run one Request-owned and one standalone
   caller through the same minimum transition. Do not persist a generalized
   lifecycle until this tracer proves shared meaning.
6. **Preparation and exact authority.** Prepare, inspect awaiting authority,
   decide the opaque authority reference, and refuse material-change reuse or
   cross-principal access. Competing state changes must prove expected-version
   compare-and-swap refusal.
7. **Attributable effect attempt.** Continue the selected consequential action
   with one attempt identity, idempotency identity, lease owner, effect
   generation, release observation, and attributable result. Prove the action,
   not its worker, selects exactly one declared retry class.
8. **Interruption and uncertainty.** Prove pre-release retry, post-release
   reconcile-before-retry, malformed evidence, timeout, refusal, and honest
   unknown external effect.
9. **Concurrency and recovery.** Prove lease expiry/takeover,
   invocation-version and effect-generation fencing, late observations,
   cancellation before/after release, restart, and cold resume.
10. **Earned persistence.** Persist only the control identity and references
    whose meaning was proven by both callers. Keep action-specific records
    authoritative for business facts and results.
11. **Request reuse.** Reference a completed standalone result from Customer
    Request without repeating the external effect, copying task state, or
    inheriting authority.
12. **Composition and direct control.** Prove independently inspectable
    references and dependencies, per-action authority, a truthful route roll-up,
    and no unnecessary persistence/approval on the direct negative control.
13. **Booking and authority modes.** Run one simple provider-supported booking
    through one registered booking action and Action Invocation without a
    synthetic Request/Route. Prove `inspect_only`, `approve_each`, bounded
    standing use, expiry, revocation, generation fencing, atomic
    reservation/settlement, uncertainty holds, cancellation honesty, and
    material-widening step-up.
14. **Transfer.** Run the cheaper contrasting workflow and reject or narrow the
    seam if it adds control records, latency, or supervision without safety or
    continuity benefit.

### ADR-009 completion matrix

ADR-009 may be accepted only when executable evidence proves all eleven gates:

1. supplied-candidate qualification reuses current contracts and evidence;
2. supplied-candidate quote collection reuses preparation, disclosure
   authority, attempts, and uncertainty reconciliation;
3. external commitments remain attributable claims unless current admitted
   provider evidence exists;
4. Request-owned and standalone calls retain identical authority, idempotency,
   evidence, and recovery meaning;
5. historical Request traces replay without semantic regression;
6. composition contains inspectable references and declared dependencies only;
7. direct-booking proportionality is proven: one provider-supported booking
   crosses one registered booking action and Action Invocation without
   synthetic Request/Route orchestration; coordinated booking composes only
   when genuine dependencies require it;
8. a person or cold agent can stop and later continue from the durable result;
9. the full-route projection explains completed, current, optional, and blocked
   work without exposing kernel machinery;
10. authority never crosses from one task to another;
11. no domain nouns enter neutral contracts.

There are no silently deferred ADR-009 gates.

ADR-019 also extends Phase 1 with the authority-mode contract and evals for
exact use, reservation/settlement, expiry, revocation, generation fencing,
step-up, and uncertainty holds. `approve_each` is the implementation baseline;
standing modes do not pass on schema or fixture evidence alone.

Phase 2 uses the registered booking action from Gate 7 for consequential host
parity. `inquiry.submit` may remain a first-contact regression control, but it
cannot substitute for booking or discharge mode/revocation parity.

## Phase 2 — complete ADR-010

### Entry conditions

- Phase 1 has implemented and proven the two-caller seam.
- ADR-009 has executable evidence for all eleven gates and an evidence-backed
  acceptance decision. A narrow, supersede, or stop decision ends or recharts
  this contract instead of entering Phase 2 under the rejected architecture.
- The exact seven-dimension semantic parity contract is frozen for the selected
  action: facts/source/freshness; actions/required information; suitability and
  comparison; authority/data use; attempt/idempotency/retry; evidence/refusal/
  contradiction/unknown; continuations/outcome.
- Embedded-human and external-agent hosts reach the same registered action and
  source-owned transition.

### Vertical execution order

1. **Evaluator-local semantic comparator.** Compare authoritative structured
   projections keyed by invocation reference and version. Extract a product
   comparator only after a second workflow requires the same interface.
2. **Host boundary.** Enforce imports so hosts cannot own preparation,
   eligibility, authority, retry, evidence, or recovery.
3. **Bounded authority projection.** Produce rich and structured forms from the
   same authoritative record with identical material fields and continuations.
4. **Reconstruction.** Prove restart and transcript deletion do not change the
   seven dimensions; host caches retain presentation/transport state only.
5. **Corrections and clarification.** Material corrections invalidate stale
   projections and authority; non-material presentation changes do not cause
   unnecessary interrogation.
6. **Bidirectional handoff.** Prove human approval -> cold agent resume and
   external-agent preparation/approval -> reopened human continuation.
7. **Failure parity.** Prove refusal, timeout, pre-release interruption,
   post-release uncertainty, reconciliation, cancellation, and recovery expose
   the same semantics and safe continuations through both hosts.
8. **Candidate comparison.** Implement only if the selected task genuinely has
   multiple candidates. Enforce the invent-nothing rule against registered
   action descriptors and authoritative records.
9. **Human-effort and burden comparison.** Measure the same case against the
   frozen direct path. Include correctness, control, privacy, accessibility,
   caller effort, provider effort, and backstage operator burden.
10. **Contrasting-workflow parity.** Repeat the comparator and reconstruction
    proof on the transfer workflow; narrow the supported action plane if semantic
    equivalence requires host-specific business rules.

### ADR-010 completion matrix

ADR-010 may be accepted only when executable evidence proves all ten gates:

1. one registered action is semantically equivalent through embedded and
   external-agent surfaces;
2. both hosts use the same source-owned transition without duplicated rules;
3. the task-shaped view reconstructs from records without transcript replay;
4. the non-visual form carries the same options, consequences, evidence, and
   continuations;
5. corrections update authoritative work and invalidate stale projections;
6. missing information is gathered without unnecessary interrogation;
7. authority binds the exact action and fails after material change;
8. interruption, refusal, timeout, uncertain effect, and recovery retain parity;
9. a cold agent continues without hidden first-party context;
10. human effort improves without worsening correctness, control, privacy,
    accessibility, or operator burden.

There are no silently deferred ADR-010 gates.

## Verification ladder

Every vertical slice runs the narrowest relevant red/green evaluator first,
then expands according to the boundary crossed:

- TypeScript logic: affected unit/integration test plus `npm run typecheck`.
- Module ownership/imports: `npm run test:imports`.
- Convex schema/function: `npm run check:convex-codegen` plus focused Convex
  tests.
- Assistant-visible wording: `npm run test:copy`.
- Human UI: `npm run test:ui-contract` plus the relevant browser journey.
- Cross-surface behavior: exact human and external-agent development journeys
  against the same revision and origin.
- Historical safety: Request replay, cancellation, recovery, unknown-effect,
  and stale-generation suites.
- Broad source change: `npm run test:all`.

The final development revision also receives two independent review axes:
repository standards and governing specification/ADR coverage.

## Evidence packet

Every committed slice retains:

- issue and immutable commit/revision;
- origin and evidence class;
- task, caller, provider cohort, and direct-control case;
- red evaluator and earliest failed transition;
- changed source owner and blast radius;
- narrow and expanded command results;
- real development-surface observations;
- failure/recovery observations;
- two-axis review outcome;
- checksummed artifact;
- exact claim ceiling and unresolved falsifiers.

Issue updates may state only what that packet proves. Development proof remains
development proof.

## Stop and narrowing rules

- If the selected standalone caller requires a parallel authority, attempt,
  evidence, or recovery lifecycle, stop Action Invocation and narrow to the
  existing action-specific seam.
- If either host still needs hidden business transitions, narrow the supported
  cross-surface action set.
- If attempt families require mostly optional fields or branching by family,
  keep them separate and share only proven integrity helpers.
- If authoritative records cannot reconstruct the same material state, narrow
  parity to what both hosts can truthfully support.
- If customer/provider burden is not reduced, operator work absorbs the gain,
  facts are not current, or supply cannot operate independently, change the
  task/cohort or stop.
- If the contrasting workflow is burdened without safety or continuity benefit,
  reject the generalized seam or allow that workflow to bypass it.
- Supersede ADR-009/010 rather than weaken their constraints to obtain a pass.

## End conditions by evidence branch

### Accepted implementation path

The accepted path ends only when:

1. Gate 0 is resolved with real evidence;
2. every Phase 1 slice and all eleven ADR-009 gates have executable evidence,
   and the Founder accepts ADR-009;
3. every Phase 2 slice and all ten ADR-010 gates have executable evidence, and
   the Founder accepts ADR-010;
4. the direct and transfer controls have run;
5. customer, provider, supply, and operator claims do not exceed their evidence;
6. the final exact development revision passes proportionate verification and
   two-axis review; and
7. the Founder records **invest**.

### Narrow or deliberate-service path

A narrow or deliberate-service path ends only when the named falsifier and
measured evidence identify the smaller supported task, cohort, information
boundary, or human operating work; the relevant ADR remains proposed or is
superseded; rejected implementation and claims are removed from the active
plan; existing guardrails and historical traces remain intact; the replacement
scope, owners, costs, verification, and public claim ceiling are recorded; and
the Founder records **narrow** or **operate deliberately as a service**.
Downstream slices that assume the rejected architecture are explicitly
cancelled or recharted; they are not counted as missing proof for that rejected
path.

### Stop path

A stop path ends only when the named value, supply, safety, transfer, or
leverage falsifier is supported by the required evidence; no unsafe or
misleading implementation remains active; ADR-009/010 and project records
record the rejection or supersession; downstream execution is explicitly
cancelled; preserved source behavior and claim boundaries are verified; and
the Founder records **stop**.

An open backlog, an implementation-ready plan, an unexplained cancellation, or
a green simulator cannot end any branch.
