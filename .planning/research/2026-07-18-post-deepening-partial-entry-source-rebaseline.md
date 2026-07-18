# Post-deepening partial-entry source rebaseline

**Owner:** Engineering
**Status:** Active
**Maturity:** Current evidence
**Question:** Map partial-entry constraints through the current AE source
**Decision affected:** D-006 / D-007
**Evidence cutoff:** 2026-07-18
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

## Executive finding

Current source supports one canonical Customer Request lifecycle with deep
application and machine modules behind transactional Convex adapters. Browser
and external-agent hosts already converge substantially on the same
`customerRequestApplication:*` transitions. However, the source does **not**
yet implement ADR-009 standalone lineage or ADR-010's registered-action
definition as the single engineering interface for every host.

Confidence is high for the ownership and coupling findings because they are
derived from current source at revision
`59990440f3273731494c12a9550a7ffc775e3bd2`. Confidence is deliberately low
for any proposed generalization: no selected standalone task has yet supplied
the second real caller needed to prove a shared Action Invocation seam.

The Phase 1 and Phase 2 plans therefore must not be executed as written.
Phase 1 Tasks 2 and 3 should be dropped and replaced by current-source
rebaselining plus one two-caller vertical tracer. Phase 1 Task 4 remains on
hold until that tracer and the security handoff establish a real shared seam.
Phase 2 should begin with an evaluator-local comparator; candidate comparison
must wait for a selected multi-candidate task, and Phase 2 must explicitly
depend on implemented Phase 1.

This research does not accept ADR-009 or ADR-010, authorize Action Invocation
implementation, change the public product contract, prove intended-surface
parity, or prove customer value, useful supply, fulfilment, or production
readiness.

## Observations

### One Customer Request application path

- **OBSERVED:** The submit action resolves the caller, establishes a durable
  submission reservation, and enters one interpret/compile/commit path.
  [Source](../../convex/customerRequestApplication.ts#L602-L665)
- **OBSERVED:** The interpret/compile application seam commits through the
  existing `customerRequestV2.commitAggregate` mutation; it does not persist
  through a second compiler or lifecycle.
  [Source](../../convex/customerRequestApplication.ts#L1579-L1624)
- **OBSERVED:** Refine, provide-facts, resume, and compare delegate to distinct
  application modules through injected ports rather than reimplementing their
  decisions in the Convex host.
  [Source](../../convex/customerRequestApplication.ts#L669-L769)

### Human and external-agent call paths

- **OBSERVED:** The external-agent host authenticates the caller and then
  injects the same named Application transitions for submit, facts, refine,
  compare, confirmation, run, cancellation, problem handling, evidence, and
  resume.
  [Source](../../src/lib/server/customer-request-agent-api.ts#L52-L121)
  [Source](../../src/lib/server/customer-request-agent-api.ts#L244-L306)
- **OBSERVED:** External-agent calls receive a signed service assertion before
  dispatch to the named source action.
  [Source](../../src/lib/server/customer-request-agent-api.ts#L309-L325)
- **OBSERVED:** Browser guest entry injects those same Application transitions
  for submit, facts, refine, compare, and resume.
  [Source](../../src/lib/server/customer-request-browser-api.ts#L42-L113)
  [Source](../../src/lib/server/customer-request-browser-api.ts#L134-L155)
- **OBSERVED:** Browser confirmation, run, cancellation, problem, evidence, and
  reply handlers reuse the same lower server handlers and vary guest admission
  rather than owning their own business lifecycle.
  [Source](../../src/lib/server/customer-request-browser-lifecycle-api.ts#L20-L104)
- **OBSERVED:** Shared server handlers own bounded request parsing and result
  mapping. For example, submit performs sensitive-input admission before its
  injected or source-owned transition, while run and cancellation share one
  route-action parser.
  [Source](../../src/lib/server/customer-request-api.ts#L15-L43)
  [Source](../../src/lib/server/customer-request-route-action-api.ts#L19-L70)

### Registered-action interface

- **OBSERVED:** The current action definition declares identifier, name,
  summary, boundaries, input/output schemas, parameters, read-only status,
  surfaces, and a runner.
  [Source](../../src/modules/common/action.ts#L88-L112)
- **OBSERVED:** It does not currently declare an immutable action version,
  consequence class, material-input fields, preparation rule, authority or
  data-use requirements, retry/reconciliation class, expected evidence,
  continuations, or invalidation conditions.
  [Source](../../src/modules/common/action.ts#L88-L102)
- **OBSERVED:** The registered Customer Request actions cover confirmation,
  run, cancellation, problem/evidence handling, and repeat permission, but do
  not register submit, facts, refine, compare, resume, or preparation
  authorization.
  [Source](../../src/modules/actions/index.ts#L38-L58)
- **OBSERVED:** Each registered Customer Request action declares UI, HTTP, and
  agent-JSON surfaces, while the external-agent route directly names
  `customerRequestApplication:*` transitions.
  [Source](../../src/modules/customer-request/customer-request.actions.ts#L47-L116)
  [Source](../../src/lib/server/customer-request-agent-api.ts#L52-L121)

### Preparation, provider contact, and prepared result

- **OBSERVED:** Preparation authorization loads the current Request, checks its
  principal and revision, requires exactly one Request action, prepares that
  action, and only then enters preparation egress.
  [Source](../../src/modules/customer-request/application/authorize-preparation/authorize.ts#L14-L76)
- **OBSERVED:** The preparation machine owns replay, current aggregate and
  action checks, capability-model loading, disclosure review, approval evidence,
  authority reservation, and the preparation command.
  [Source](../../src/modules/customer-request/v2-preparation/prepare.ts#L16-L164)
- **OBSERVED:** The Convex preparation host is a thin registration shell over
  the preparation and resume machines.
  [Source](../../convex/customerRequestV2Preparation.ts#L46-L68)
- **OBSERVED:** Preparation egress owns allocation, lease/begin-dispatch,
  registered-adapter dispatch, resolution, and uncertain-effect
  reconciliation.
  [Source](../../src/modules/customer-request/v2-preparation-egress/orchestrate.ts#L16-L68)
  [Source](../../src/modules/customer-request/v2-preparation-egress/orchestrate.ts#L90-L158)
- **OBSERVED:** Egress operations durably retain Request, principal, authority,
  business/offering/binding, adapter, projected-input, lease, response,
  evidence, and failure state.
  [Source](../../src/modules/customer-request/internal/convex-v2-schema.ts#L845-L887)
- **OBSERVED:** Application projection preserves uncertain or in-flight
  business contact and does not resend while reconciliation is pending.
  [Source](../../src/modules/customer-request/application/preparation-egress/resolve.ts#L28-L80)
  [Source](../../src/modules/customer-request/application/preparation-egress/resolve.ts#L159-L189)

### Authority

- **OBSERVED:** Exact route confirmation selects a current route, derives its
  maximum-spend and expiry limits, and delegates issuance through one
  `issueConfirmMandate` port.
  [Source](../../src/modules/customer-request/application/confirm-route/confirm.ts#L11-L71)
- **OBSERVED:** The confirmation adapter calls the canonical
  `customerRequestRouteMandate.issue` export.
  [Source](../../convex/customerRequestConfirmRoutePorts.ts#L7-L15)
- **OBSERVED:** RouteMandate issue owns authentication, replay, current
  generation and graph gates, active-head replacement checks, bounded mandate
  compilation, and persistence through its ports.
  [Source](../../src/modules/customer-request/route-mandate-mutation/issue.ts#L11-L167)
- **OBSERVED:** Revocation and history use the same mandate mutation port family.
  [Source](../../src/modules/customer-request/route-mandate-mutation/revoke.ts#L6-L58)
  [Source](../../src/modules/customer-request/route-mandate-mutation/get-history.ts#L4-L10)
- **OBSERVED:** A second legitimate authority caller exists: standing-route use
  resolves a bounded permission and issues a mandate.
  [Source](../../src/modules/customer-request/application/standing-route/use.ts#L14-L68)
- **OBSERVED:** Standing-route policy use has its own policy/use admission and
  replay, then persists a RouteMandate through the shared mandate persistence
  helper.
  [Source](../../convex/customerRequestStandingRoutePolicy.ts#L384-L610)

### Attempts, release, cancellation, and recovery

- **OBSERVED:** Starting work follows
  `customerRequestApplication.runRoute` to
  `customerRequestRouteExecution.startOrResume`.
  [Source](../../convex/customerRequestApplication.ts#L942-L973)
- **OBSERVED:** `startOrResume` owns active-mandate admission, command replay,
  prior-run handling, provider and input snapshots, step admission, attempt and
  dispatch identities, and the atomic start commit.
  [Source](../../src/modules/customer-request/route-execution/machines/start-or-resume.ts#L8-L194)
- **OBSERVED:** The current run, route step attempt, and dispatch outbox are
  durably Request-, mandate-, and run-owned.
  [Source](../../src/modules/customer-request/internal/route-mandate-convex-schema.ts#L490-L523)
  [Source](../../src/modules/customer-request/internal/route-mandate-convex-schema.ts#L649-L710)
- **OBSERVED:** The transport worker leases and opens one dispatch, marks the
  release boundary, invokes the provider transport, and records the resulting
  observation/outcome through the route-execution exports.
  [Source](../../convex/customerRequestRouteTransportWorker.ts#L26-L115)
- **OBSERVED:** Outcome recording preserves partial and unknown external
  effects instead of converting them to safe failures.
  [Source](../../src/modules/customer-request/route-execution/machines/record-outcome.ts#L8-L87)
- **OBSERVED:** Expired dispatch recovery distinguishes requeue from
  `outcome_unknown`.
  [Source](../../src/modules/customer-request/route-execution/machines/recover-expired-dispatch.ts#L14-L45)
- **OBSERVED:** Cancellation distinguishes a pre-release local stop, an
  adapter-managed cancellation attempt, and a too-late disposition.
  [Source](../../src/modules/customer-request/route-execution/machines/cancel-current.ts#L16-L97)
- **OBSERVED:** Provider cancellation has its own durable attempt and worker
  rather than rewriting the original action attempt.
  [Source](../../src/modules/customer-request/internal/route-mandate-convex-schema.ts#L543-L581)
  [Source](../../convex/customerRequestRouteCancellationWorker.ts#L17-L75)

### Evidence and projection

- **OBSERVED:** Customer evidence is assembled from the current run, its
  attempts, exact bindings, and Request problem reports.
  [Source](../../src/modules/customer-request/route-execution/evidence-load/assemble.ts#L22-L51)
- **OBSERVED:** The evidence projection validates attempt and binding integrity
  before returning customer-safe step evidence and problem claims.
  [Source](../../src/modules/customer-request/route-execution/journal/export-evidence.ts#L115-L161)
- **OBSERVED:** The Application evidence export first verifies Request ownership
  and then maps the durable evidence into the public result.
  [Source](../../src/modules/customer-request/application/problem-route/export-evidence.ts#L8-L41)
- **OBSERVED:** Run projection distinguishes completed, unknown, cancelled,
  failed, and in-progress states and preserves the cancellation boundary.
  [Source](../../src/modules/customer-request/application/route-plan-projection/project-run.ts#L79-L180)
- **OBSERVED:** Common customer projections retain `outcome_unknown`,
  `automaticRetry: false`, cancellation, and a safe next action.
  [Source](../../src/modules/customer-request/customer-projection.ts#L495-L705)

### Current lineage and unused persistence shapes

- **OBSERVED:** Current V2 preparation and prepared-action rows require
  `requestId`, Request revision, and action lineage.
  [Source](../../src/modules/customer-request/internal/convex-v2-schema.ts#L795-L808)
  [Source](../../src/modules/customer-request/internal/convex-v2-schema.ts#L889-L910)
- **OBSERVED:** Current runs and route attempts require Request and mandate
  lineage.
  [Source](../../src/modules/customer-request/internal/route-mandate-convex-schema.ts#L490-L523)
  [Source](../../src/modules/customer-request/internal/route-mandate-convex-schema.ts#L649-L686)
- **OBSERVED:** The schema declares V2 approval-grant and action-attempt tables.
  [Source](../../src/modules/customer-request/internal/convex-v2-schema.ts#L912-L955)
- **OBSERVED:** A current-source search found no runtime read or write of those
  V2 approval-grant/action-attempt tables outside their schema declaration.
  This is a negative source observation at the evidence cutoff, not proof that
  the shapes can never become useful.

## Source-constraint classification

This table classifies what a partial-entry tracer will encounter. “Kernel
limitation” is reserved for a constraint in the neutral execution semantics,
not merely an absent host, contract, provider, or cohort.

| Class | Current source finding | Treatment before implementation |
|---|---|---|
| Presentation | Human and agent hosts render or navigate differently, but both already reach the same Application transitions. | Keep host-specific rendering and authentication; compare semantic results, not pixels. |
| Contract-pack | Registered actions lack version, consequence, authority, retry, evidence, continuation, and invalidation declarations required by ADR-010. | Extend only fields proven necessary by a two-caller tracer; do not declare a universal task contract upfront. |
| Provider adapter | Preparation egress and route transport both depend on registered adapter facts, credentials, release observations, and reconciliation. | Select a real provider cohort and prove the existing adapter seam can express the task before changing the kernel. |
| Reusable module | Application modules, preparation machines, route-execution machines, evidence assembly, and customer projections concentrate real decisions behind ports. | Reuse these interfaces; extract a new shared module only when deletion would redistribute behavior to at least two callers. |
| Request coupling | Preparation, prepared actions, runs, attempts, problems, and evidence are keyed by Request lineage. | Preserve all existing traces; introduce a discriminated second lineage only in a vertical tracer, never by making Request fields broadly optional. |
| Genuine kernel limitation | No current durable invocation can truthfully begin standalone and later use the same authority/attempt/evidence/recovery meaning as a Request-owned call. | Treat this as a candidate limitation to test. It becomes proven only if a selected task cannot reuse an existing action/run/receipt seam without semantic distortion. |
| Operations/supply | Current source can represent admitted providers and transport observations but cannot establish independently operated, recruitable, fresh supply or low operator burden. | Measure in fieldwork; do not solve operational absence with a new lifecycle object. |
| Unsupported | Standalone Action Invocation, bundle-owned lineage, task transfer, and universal cross-host reconstruction are target concepts without current executable proof. | Keep unsupported and out of public claims until source plus intended-surface evidence exists. |

## Inferences

- **INFERRED:** Browser and external-agent experiences already share most
  business transitions because both inject the same Application action names
  into common lower handlers. The remaining ADR-010 gap is not a need for a
  second lifecycle; it is that the registered-action definition is not yet the
  sole, sufficiently expressive interface.
- **INFERRED:** A new generic Action Invocation module would currently fail the
  deletion test. Removing it would make no existing complexity reappear because
  preparation, authority, route execution, cancellation, evidence, and
  projection still own all current behavior.
- **INFERRED:** Preparation egress operations, route step attempts, and provider
  cancellation attempts cannot be merged solely because all have leases,
  observations, and uncertain outcomes. Their authority moments, targets,
  results, and recovery meanings differ.
- **INFERRED:** Direct confirmation and standing-route use form the strongest
  current two-caller seam for an authority-only parity tracer because both end
  in the same RouteMandate persistence and route execution without sharing the
  same initial approval workflow.
- **INFERRED:** Request-owned preparation plus a selected standalone task is
  still required to earn the broader partial-entry seam. Existing unused
  action-attempt schema is not evidence of such a seam.
- **INFERRED:** Making current `requestId` or revision fields optional would
  weaken historical lineage before replacement semantics have been proven and
  would violate ADR-009's stated migration constraint.

## Decision impact

### Phase-plan drift

The current Phase 1 and Phase 2 plans are design inputs, not executable
authority. Their assumptions predate the completed deepening work represented
by ADR-011 through ADR-018 and must be revalidated against the current source
and selected task.

| Planned area | Rebaseline decision | Reason |
|---|---|---|
| Phase 1 Task 2 | **Drop and replace.** Produce a current-source ownership/lineage tracer rather than implementing the prior assumed seam. | Deepening has relocated ownership; unused action-attempt schema is not an authoritative implementation base. |
| Phase 1 Task 3 | **Drop and replace.** Trace one Request-owned and one selected standalone caller through preparation, authority, attempt, evidence, interruption, and recovery. | Two real callers are required to earn the seam and expose incompatible meanings. |
| Phase 1 Task 4 | **Hold.** Do not persist or expose generalized Action Invocation until the two-caller tracer and security/architecture handoff pass. | Persistence would otherwise make a hypothetical seam expensive to unwind. |
| Phase 2 comparator | **Evaluator-local first.** Compare semantic projections in the eval harness before extracting a product module. | The comparator has one current consumer until transfer is demonstrated. |
| Phase 2 candidate comparison | **Wait for the selected multi-candidate task.** | Generic comparison work without a real candidate cohort risks encoding fictitious universality. |
| Phase 2 dependency | **Explicitly depend on implemented Phase 1.** | Cross-host and task comparison cannot validate a durable seam that does not yet exist. |

Required decision posture: do **not** execute either plan as written. Replace
their early tasks with the source and task rebaseline, then approve only the
minimum vertical slice supported by the evidence.

No ADR status changes as a result of this record. D-006 and D-007 should remain
implementation-gated until the hypotheses below are tested. If a resulting
decision changes the canonical lineage or registered-action contract, it will
require an ADR update or superseding ADR and a corresponding
`PROJECT-RECORDS.md` update by the decision owner.

## Recommended holistic execution order

1. Freeze the current ownership map and select one independently useful task,
   one real caller/coordinator cohort, and one participating provider cohort.
2. Capture the direct-path control and measure caller, provider, and operator
   burden, fact freshness, recruitable supply, and failure/recovery cases.
3. Trace the selected task through the current registered contract,
   preparation, authority, attempt, evidence, recovery, and projection seams.
4. Add a second real caller without changing existing Request lineage. Record
   every point where the same meaning can be reused and every point where it
   cannot.
5. Complete the security/architecture handoff for principal ownership,
   prepared-input binding, authority invalidation, idempotency, lease fencing,
   imported claims, cancellation, and unknown external effects.
6. Specify one minimum shared transition. Write a red evaluator against both
   callers before adding persistence.
7. Implement the transition behind the existing source owner or an earned new
   seam. Preserve existing public Application export identities and historical
   Request replay.
8. Execute the real development surface for both callers, including
   interruption, replay, cancellation, uncertain outcome, and cold resume.
9. Add the Phase 2 evaluator-local semantic comparator. Extract it only after a
   second workflow needs the same comparison interface.
10. Run the selected multi-candidate task before generalizing candidate
    comparison. Then run a cheaper contrasting workflow as the transfer test.
11. Review both architecture and product value. Narrow, stop, or supersede when
    a falsifier triggers; do not loosen existing guardrails to make the design
    pass.

## Source-complete criteria

Source completion for the approved vertical slice requires all of the
following:

- There is one source owner for each preparation, authority, attempt, release,
  observation, cancellation, recovery, evidence, and projection transition.
- Request-owned and standalone callers cross the same interface for the shared
  transition and retain the same authority, idempotency, evidence, and recovery
  meaning.
- Existing Request records retain their exact lineage and replay without
  semantic migration by optional-field shortcut.
- Human and external-agent hosts contain authentication, transport,
  conversation, navigation, and rendering only; no host owns eligibility,
  preparation, authority, retry, evidence, or recovery decisions.
- Material input, target, action version, provenance, or freshness changes
  invalidate stale preparation and authority.
- An external-effect attempt has one idempotency identity, lease owner,
  generation fence, attributable observation, and honest unknown state.
- Cancellation cannot rewrite evidence of a possibly released effect, and
  recovery cannot retry an unknown effect without the declared safe replay or
  reconciliation rule.
- Customer and non-visual projections reconstruct the same supported facts,
  consequences, evidence, refusal, unknown state, and continuations from
  authoritative records without replaying a transcript.
- No parallel lifecycle, universal task object, second compiler, or duplicate
  recommendation model is introduced.
- Focused unit/integration evals, exact historical replay evals, and real
  development-surface traces are green for both callers. Green source tests do
  not by themselves establish field value or production behavior.

## Deletion tests

| Candidate module or seam | Deletion-test expectation |
|---|---|
| Application modules | Deletion would redistribute multi-step validation, replay, projection, and orchestration into Convex hosts. They currently earn their locality. |
| Preparation and route-execution machines | Deletion would redistribute authority, lease, release, idempotency, uncertain-effect, and recovery decisions into adapters. They currently earn their locality. |
| Convex ports adapters | Deletion would leak transactional database, scheduler, auth, and network details into pure modules. They are real adapters even when their wiring is thin. |
| Current registered-action declaration | Deletion would remove registry metadata and first-party wrappers, but direct external-agent Request behavior would still dispatch by Application action name. It does not yet earn the claim of sole engineering interface. |
| Proposed Action Invocation | Before migration, deletion would redistribute nothing. It earns existence only after at least two real callers share a transition and deleting it would reintroduce the same control logic in both. |
| Evaluator comparator | Keep evaluator-local while it has one consumer. Extract only when deletion would duplicate semantic comparison across at least two workflows. |

## Unknowns

- **UNKNOWN:** Which independently useful task and caller/provider cohort will
  provide the first truthful standalone caller.
- **UNKNOWN:** Whether that task can reuse preparation egress as-is or exposes
  an incompatible authority, target, result, or reconciliation meaning.
- **UNKNOWN:** Whether a generalized existing run, attempt, or receipt can
  express discriminated standalone lineage without contaminating Request-owned
  records.
- **UNKNOWN:** Whether the registered-action interface can be extended
  incrementally or needs a versioned successor to avoid breaking existing
  declarations and hosts.
- **UNKNOWN:** Whether the selected task genuinely requires multi-candidate
  comparison.
- **UNKNOWN:** Whether cold human and cold-agent projections remain semantically
  equivalent after interruption and authority invalidation.
- **UNKNOWN:** Whether participating providers can maintain current facts and
  operate the adapter path without shifting the saved customer burden to AE
  operators.

## Hypotheses and falsifiers

| ID | Hypothesis | Baseline | Measurement | Falsifier | Owner | Review by |
|---|---|---|---|---|---|---|
| H-PE-01 | One selected standalone task can reuse an existing preparation/authority/attempt/evidence transition with the same meaning as a Request-owned caller. | Current Request-only path and the task's direct incumbent path. | Source tracer plus identical transition outcomes for both callers. | The standalone caller requires a second authority, attempt, evidence, or recovery lifecycle, or forces existing Request fields broadly optional. | Engineering | 2026-08-17 |
| H-PE-02 | Extending the registered-action interface can make it the sole host-consumed contract without moving business rules into hosts. | Current direct Application-name dispatch from the external-agent host. | Both human and external-agent hosts discover and invoke the same versioned declaration; deletion of host rule code does not change results. | Either host still names hidden transitions or must implement eligibility, preparation, authority, retry, evidence, or recovery rules. | Engineering | 2026-08-17 |
| H-PE-03 | Preparation egress and route execution share at least one deep control transition worth extracting while retaining their different domain meanings. | Separate current machines and tables. | A two-caller red eval requires the same interface and extraction reduces duplicated decisions. | The proposed interface is mostly optional fields, branching on attempt family, or a pass-through over distinct implementations. | Engineering | 2026-08-17 |
| H-PE-04 | A task-shaped result can be reconstructed with semantic human/agent parity after interruption without transcript replay. | Current Request projection and direct-path handoff. | Cold human and cold-agent comprehension plus exact authoritative-record reconstruction. | Either host needs hidden conversational/component state or presents different material facts, authority, unknown state, evidence, or continuations. | Product / Engineering | 2026-08-17 |
| H-PE-05 | The selected AE task reduces caller and provider burden without transferring the work to AE operators. | Measured direct-path control. | Caller time/steps, provider effort, operator interventions, fact freshness, successful cold continuation. | Customer or provider burden does not improve, operator burden absorbs the gain, supply cannot operate independently, or facts are not current enough for the decision. | Product | 2026-08-17 |
| H-PE-06 | The same seam transfers to one cheaper contrasting workflow without unnecessary orchestration. | Direct execution of the contrasting workflow. | Added steps, records, latency, and operator handling relative to the direct control. | The generalized path adds control records or supervision with no safety or continuity benefit. | Engineering / Product | 2026-08-17 |

### Stop and narrow rules

- Stop Action Invocation implementation if H-PE-01 fails. Narrow to the
  existing action-specific preparation, Attempt, Receipt, or authority seam.
- Stop interface generalization if H-PE-02 fails. Narrow the supported
  cross-host action set instead of building host-specific lifecycle rules.
- Do not merge attempt families if H-PE-03 fails. Retain separate modules and
  share only proven pure integrity helpers.
- Narrow presentation parity to the semantics both hosts can truthfully
  reconstruct if H-PE-04 fails; do not make transcript state authoritative.
- Stop or change the selected task/cohort if H-PE-05 fails. Source elegance
  cannot substitute for customer, provider, supply, and operator evidence.
- Reject the generalized seam or make the contrasting workflow bypass it if
  H-PE-06 fails.
- Supersede rather than weaken ADR-009/010 constraints if accepting a result
  would require a parallel lifecycle, universal task object, inferred later
  authority, hidden retry, or evidence-class inflation.

## Current-versus-target check

- **Current evidenced behavior:** AE has one Request-owned application
  lifecycle. Browser and external-agent hosts substantially share its
  Application transitions. Preparation egress and route execution preserve
  authority, idempotency, release observations, unknown outcomes, cancellation,
  recovery, and customer-safe evidence within Request lineage.
- **Target behavior informed by this research:** One selected standalone task
  may enter through a versioned registered action, reuse an earned shared
  transition, retain discriminated lineage, and reconstruct semantically
  equivalent human and agent projections. Customer Request remains the
  canonical broader-outcome aggregate and composes references rather than
  copying task lifecycle state.
- **Claims this research does not authorize:** This record does not authorize
  implementation of Action Invocation or a new table; acceptance of ADR-009 or
  ADR-010; modification of the public Customer Request contract; a production
  deployment; production readiness; independently operated supply; provider
  fulfilment; customer value; booking, payment, charge, dispatch, guarantees,
  or autonomous fulfilment; closure of a tracker issue; or promotion of
  development/sandbox results into intended-surface or market evidence.

## Sources

All material current-state claims cite the owning source inline. The principal
source families are:

- [`convex/customerRequestApplication.ts`](../../convex/customerRequestApplication.ts)
- [`src/modules/customer-request/application/`](../../src/modules/customer-request/application/)
- [`src/modules/customer-request/v2-preparation/`](../../src/modules/customer-request/v2-preparation/)
- [`src/modules/customer-request/v2-preparation-egress/`](../../src/modules/customer-request/v2-preparation-egress/)
- [`src/modules/customer-request/route-execution/`](../../src/modules/customer-request/route-execution/)
- [`src/modules/customer-request/internal/convex-v2-schema.ts`](../../src/modules/customer-request/internal/convex-v2-schema.ts)
- [`src/modules/customer-request/internal/route-mandate-convex-schema.ts`](../../src/modules/customer-request/internal/route-mandate-convex-schema.ts)
- [`src/lib/server/customer-request-agent-api.ts`](../../src/lib/server/customer-request-agent-api.ts)
- [`src/lib/server/customer-request-browser-api.ts`](../../src/lib/server/customer-request-browser-api.ts)
- [`src/modules/common/action.ts`](../../src/modules/common/action.ts)
- [`src/modules/actions/index.ts`](../../src/modules/actions/index.ts)
