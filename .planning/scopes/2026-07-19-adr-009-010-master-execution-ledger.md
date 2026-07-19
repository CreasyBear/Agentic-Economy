# ADR-009 / ADR-010 master execution ledger

**Master task:** `019f790d-9a97-7012-a009-2140c0d6fdba`  
**Branch:** `codex/shared-tree-checkpoint-20260714`  
**Current accepted revision:** `2cc23984`
**Evidence ceiling:** source and labelled development behavior unless a row says otherwise  
**Production deployment:** not authorized

## Operating contract

The master owns sequence, dirty-tree arbitration, integration, evidence level,
and ADR disposition. A fresh child owns one vertical implementation slice.

Child loop:

`trace once -> source change -> focused check -> labelled demonstration -> receipt`

Three iterations without a source delta return the earliest reproducible
blocker. Broad unrelated test failures are recorded rather than adopted as a
cleanup project.

Hard stops:

- a second Customer Request, authority, attempt, evidence, or recovery
  lifecycle;
- host-owned business rules;
- broadly optional historical Request lineage;
- persistence before both caller origins demonstrate shared meaning;
- generic retry after a possibly released effect;
- a god file combining contracts, state machines, adapters, persistence, and
  projections;
- promotion of fixture, mock, sandbox, or local evidence into production,
  independent-supply, provider-fulfilment, or customer-value proof.

## Shared-tree ownership

These pre-existing modifications are outside the master program unless the
owner explicitly hands them over:

- `convex/_generated/api.d.ts`
- `tests/unit/customer-request/direct-agent-baseline.test.ts`

Every child records its base revision and uses an isolated worktree. Child
commits are reviewed and cherry-picked by the master.

## Canonical Phase 1 execution map

The governing sequence is the thirteen Phase 1 vertical slices in
`2026-07-18-phase-1-2-completion-contract.md`. Earlier `P1-A` through `P1-J`
labels were temporary master bookkeeping and are retired. They do not define a
parallel plan.

| Canonical slice | Current position | Accepted source |
|---|---|---|
| 1. Registered-action contract | Implemented; final audit still required | `72351a80`, `ccd21ad2`, `f744e943` |
| 2. Supplied-candidate qualification tracer | Implemented and focused-eval green | `4c27d371`, `27e885f6` |
| 3. Supplied-candidate quote-collection tracer | Implemented and focused-eval green | `f744e943` through `e5079e23` |
| 4. Imported-commitment observation tracer | Partial: claim custody/refusal proven; admitted-provider observation transition missing | `0cf42307`, `b8942e8b` |
| 5. Two-caller in-memory tracer | Implemented | `72351a80` |
| 6. Preparation and exact authority | Implemented | `ccd21ad2` |
| 7. Attributable effect attempt | Implemented | `f4b77026`, `f1cc1fb6` |
| 8. Interruption and uncertainty | Implemented in deterministic labelled development execution | `f4b77026`, `8d3fe91a`, `e5079e23`, `2bb08013`, `98ccb155` |
| 9. Concurrency and recovery | Implemented in deterministic labelled development execution | `f1cc1fb6`, `8d3fe91a`, `0d5131a3`, `4a8e215b`, `8b57b2f1`, `890404d4`, `8ac11190` |
| 10. Earned persistence | Implemented and re-audited in labelled development execution; private Convex runtime not invoked | `622115e9`, `0d5131a3`, `98ccb155`, `d916d28d`, `d7ee9fe1` |
| 11. Request reuse | Implemented and re-audited in labelled development execution | `92d57aeb`, `f7c978b5`, `f1808da0`, `249a247f` |
| 12. Composition and direct control | Partial: initial projection/control eval integrated; authoritative record resolution missing | `0dc146e8` |
| 13. Transfer | Partial: initial transfer eval integrated; executed measurement instrumentation missing | `edc82390`, `9dd406be` |

Phase 2 may not start until slices 1–13, all eleven ADR-009 gates, and the
Founder ADR-009 decision are complete. Existing reconstruction or projection
work is Phase 1 evidence only; it is not early Phase 2 completion.

## Accepted slices

### Canonical slices 1 and 5 — registered-action contract and two-caller tracer

**Accepted commit:** `72351a80`  
**Child commit:** `1a797e77715731c82d56c6c3dedd394f2cade273`  
**Evidence class:** labelled mock/development, read-only, in-memory

Implemented:

- backward-compatible registered-action invocation metadata;
- explicit `registry.detail:v1` read-only contract;
- exact `request_owned(requestRef, revision)` and
  `standalone(callerRef, principalRef)` origins;
- separate desired, observed-resolution, freshness, and control projections;
- both origins invoke the same registered `registry.detail` runner;
- focused action/tracer/registry checks passed 19/19.

Not established:

- consequential-action semantics;
- exact authority;
- attempts, idempotency, uncertainty, leases, generations, or recovery;
- durability or restart;
- hosted or production behavior;
- ADR acceptance.

Carried residue:

- the read tracer currently describes a returned `not_found` result as
  invocation execution `succeeded`; consequential work must distinguish
  returned, refused, failed, and unknown outcomes before persistence.

### Skill governance — AE project skills

**Accepted commit:** `2cb32c8a`  
**Evidence class:** source-grounded operating instructions

Ten `ae-*` skills and the cold-agent proof contract were reconciled to live
source and made trackable so future worktree children inherit them. Vendored
skills remain ignored.

Governance discrepancy:

- `AGENTS.md` still describes `agentTools` and `/api/agent/tools`;
- live `ActionSurface`, routes, and retirement tests do not expose that generic
  contract.

Until resolved, children trace live source and report the discrepancy rather
than implementing the stale route inventory.

### Operating governance — implementation-forward AGENTS.md

**Accepted commit:** `b3372462`  

Replaced stale surface inventories and permission-gate behavior with a
source-first vertical implementation loop, explicit evidence classes,
reversible proposed-ADR choices, reconstructability and concurrency invariants,
no-god-file discipline, and safe parent/child isolation. The live surface is now
discovered from source rather than frozen into this instruction file.

### Canonical slice 6 — exact authority for `inquiry.submit`

**Accepted commit:** `ccd21ad2`  
**Child commit:** `041be4dabd6e48d986fe32977bec6351fc9b0577`  
**Child task:** `019f7931-9f74-7e20-87cb-d3ae1e8d3502`  
**Assigned base:** `72351a80`  
**Evidence class:** labelled mock/development, consequential action, in-memory

Target transition:

`prepare -> awaiting_authority -> exact decision -> invoke registered communication action`

Scope:

- classified `inquiry.submit` as principal-authorized communication with an
  attributable-retry contract;
- froze exact material inputs and issued an opaque, expiring authority
  reference bound to actor, origin, invocation, action/version, and digest;
- refused stale CAS versions, expired authority, cross-principal,
  cross-origin, unaccepted authority, and material-change reuse;
- ran no registered action runner before accepted authority;
- exercised the same registered `inquiry.submit` runner from Request-owned and
  standalone origins through a controlled development adapter;
- distinguished runner return/throw from queued communication, refusal, and
  not-found business outcomes;
- split contracts, preparation, and in-memory control rather than creating a
  combined lifecycle god file;
- passed focused Action Invocation checks 4/4, scoped lint, and diff checks in
  the accepted parent checkout.

Not established:

- an attributable attempt or idempotency identity;
- pre-release versus post-release uncertainty;
- reconcile-before-retry;
- leases, generations, cancellation, recovery, durability, or restart;
- network send, provider delivery, fulfilment, hosted, or production behavior.

### Canonical slices 7 and 8 — attributable attempt and uncertainty

**Accepted commit:** `f4b77026`
**Child commit:** `95716836689479ae5c0c0fb765be312db5dc4e8f`
**Child task:** `019f793d-43dc-7c32-a0a5-9a9885f54825`
**Assigned base:** `0e341878`
**Evidence class:** labelled mock/development, consequential attempt, in-memory

Target transition:

`authorized communication -> attributable attempt -> pre-release retry or post-release reconcile-before-retry`

Implemented:

- both origins continue through the same registered `inquiry.submit` runner;
- attempt identity binds action id, actor, `operationKey`, and prepared material
  digest into a stable effect identity;
- only an explicit pre-release observation permits retry;
- absent or post-release evidence becomes `reconciliation_required`;
- generic replay is refused while reconciliation is required;
- reconciliation updates the exact attributable attempt;
- confirmed release remains terminal with external outcome explicitly unknown;
- attempt construction, effect execution, contracts, and in-memory orchestration
  have separate reasons to change;
- focused checks passed 7/7 with scoped lint and diff checks in the accepted
  parent checkout.

Not established:

- leases, effect generations, competing workers, late observations, or fencing;
- cancellation before or after release;
- restart, cold resume, or durable persistence;
- provider/network execution, delivery, fulfilment, hosted, or production
  behavior.

### Canonical slice 8 completion — timeout and attributable reconciliation

**Accepted commits:** `2bb08013`, `98ccb155`, `d916d28d`
**Child commits:** `056f043b06d7f33718cf9760bc07d49a73d6704b`,
`cce208d67098f6f1cf97d096ce6d396b272c4069`,
`835f023e72efc6d7c2f90ed6633c53d7bf39ff81`
**Child task:** `019f79c1-3ca4-76d3-b5d7-be5aed587365`
**Assigned base:** `087ceada`
**Evidence class:** source plus deterministic labelled local-development
control execution; private Convex handlers statically checked but not invoked

Implemented:

- a manually triggered, action-parameterized development timeout transition
  that never claims elapsed-time enforcement or cancellation of the runner;
- every timeout of a still-running consequential attempt remains
  `possibly_released` and `reconciliation_required`, including when the runner
  had not yet signalled release at the timeout boundary;
- late runner completion cannot overwrite the timed-out control view or create
  retry permission;
- reconciliation evidence binds source, invocation, attempt, effect generation,
  observation time, evidence identity, and canonical digest;
- shape and digest are insufficient: a dependency-injected source verifier must
  attest the evidence before either release or non-release can move control;
- malformed, tampered, wrong-source, cross-attempt, stale-generation,
  pre-uncertainty, future, and correctly shaped but forged evidence fail closed
  without control mutation;
- exact evidence replay is idempotent and conflicting material under the same
  evidence identity is refused;
- the durable current attempt projection advances with reconciliation while
  append-only neutral history retains the prior and next attribution digests
  and release/outcome states;
- fresh processes reconstruct exact current attempt release, outcome, effect
  generation, and control after both released and proven-not-released evidence
  for Request-owned and standalone origins;
- the private Convex transaction contract accepts the same current-attempt
  write and transition-history shape as the development port, with immutable
  attribution checks before writes and existing CAS/idempotency fences retained.

Master verification:

- focused Action Invocation, private-handler contract, supplied-quote, and
  Request-reuse checks passed 49/49;
- scoped Oxlint and `git diff --check` passed;
- no live Convex call, code generation, deployment, hosted endpoint, seed, or
  provider effect was run.

Not established:

- a production elapsed-time timeout mechanism or worker termination;
- production evidence credentials or provider-origin authentication;
- execution of the private Convex handlers or deployed cold resume;
- provider fulfilment, production safety, or customer value.

### Canonical slice 9 — concurrency fencing, cancellation, and recovery

**Accepted commits:** `f1cc1fb6`, `8d3fe91a`
**Child commits:** `3e88da6f84e4b020c8dd7f77f261e8d1a404a0fb`,
`402ae0fadb45e09cb2e8bb198573d6374d82ee82`
**Child task:** `019f7944-fb65-7862-9254-51c960388d9f`
**Assigned base:** `d68f15af`
**Evidence class:** labelled mock/development, fenced consequential control,
in-memory snapshot/reconstruction

Target transitions:

`ready attempt -> leased generation -> release -> fenced observation`

`cancel before release -> no effect`

`cancel after possible release -> reconcile, never erase uncertainty`

Implemented:

- explicit lease owner, expiry, attempt identity, and monotonic effect
  generation;
- invocation-version and generation fencing immediately before the registered
  runner;
- synchronous release-start before awaiting the runner and a second CAS/fence
  before completion becomes current;
- stale workers cannot call the runner, publish an observation, or overwrite a
  newer cancellation with a late completion;
- proven non-release permits a new owner/generation, while expired work without
  positive non-release evidence fails closed to reconciliation;
- cancellation before release records no effect; cancellation after possible
  release preserves reconciliation;
- typed control snapshot excludes inquiry body/contact and copied business
  results, retains a source reference, and reconstructs source state through an
  injected resolver;
- the in-memory adapter is 329 lines, with fenced execution, lease control,
  resolution control, and record storage in focused modules;
- focused checks passed 10/10 with scoped lint and diff checks in the accepted
  parent checkout.

Not established:

- durable storage or a real process restart;
- append-only durable attribution for late non-current observations;
- completed-result reuse inside Customer Request;
- provider/network release, delivery, fulfilment, hosted, or production
  behavior.

### Canonical slice 9 completion — durable expiry and single effect permit

**Accepted commits:** `4a8e215b`, `8b57b2f1`, `890404d4`, `8ac11190`
**Child commits:** `a1da4819dc0999ed1efb891124472d2c3bdccedb`,
`9c991b851aacf63590379c16dbae65e40d4bae2b`,
`ba0af72f2d6102fa5bd5d17f804900f2697411b7`,
`c1eb7e27ae1c3bee3def8b0a60ef9917f3527412`
**Child task:** `019f79df-dc57-7581-8f4b-eb1f123d63bd`
**Assigned base:** `eec3bb1e`
**Evidence class:** deterministic labelled local-development concurrency and
recovery; private Convex transaction contract inspected but not invoked

Implemented:

- real lease expiry moves the attributable attempt to
  `possibly_released`/`reconciliation_required`; it is not represented as
  ordinary retry or a synthetic takeover;
- source-verified non-release is required before a new owner can acquire a
  strictly higher effect generation;
- stale invocation versions, owners, attempts, and effect generations cannot
  release, run, publish current evidence, or overwrite a newer state;
- the durable `begin_release` transition is accepted before `action.run`, and
  completion is a separate transaction fenced to the exact acquired token;
- only a newly applied `begin_release` transaction grants one effect permit;
  exact duplicate release commands fail closed and never call the runner;
- sync and async persistence rehydrate the exact durable winner after a CAS
  loss rather than exposing locally advanced state;
- async operations use operation-local command queues and refusal state, so
  concurrent invocations cannot flush, discard, or consume each other's
  persistence commands;
- cancellation before release records no effect; cancellation after durable
  possible release preserves reconciliation, and late completion cannot become
  current;
- late evidence remains attributable, append-only, and non-current;
- Request-owned and standalone origins reconstruct owner, origin, authority,
  current attempt, generation, uncertainty/cancellation, and safe continuation
  through fresh sync and async development ports;
- the current attempt remains reconstructable beyond the bounded first 100
  attempt rows through an exact indexed read;
- non-duplicate control writes must advance invocation version, while exact
  non-effect command replay remains idempotent.

Master verification:

- focused Action Invocation, private-handler contract, supplied-quote, and
  Request-reuse checks passed 67/67;
- scoped Oxlint and `git diff --check` passed;
- protected dirty files remained untouched.

Not established:

- execution of the private Convex handlers or deployed process-kill recovery;
- production worker isolation, provider idempotency, fulfilment, or safety;
- hosted or customer-value evidence.

### Canonical slice 10 — earned durable control and cold resume

**Accepted commits:** `622115e9`, `0d5131a3`
**Child commits:** `82805c97c3e00349067d7c8af7ac1cacc67c4080`,
`3800a167a32b2efd2f4a1c8558bff8656a12c55d`
**Child task:** `019f7957-a084-78e3-961e-1f76c8b95fa8`
**Assigned base:** `19dc48b5`
**Evidence class:** source plus labelled local/mock durable-control execution;
private Convex handlers inspected but not invoked

Target transition:

`typed control snapshot -> transactional durable control/history -> fresh process reconstruction`

Implemented:

- module-owned current control, immutable attempt, and append-only history
  tables with indexed bounded reads;
- transactional invocation-version and effect-generation fencing, stable
  command identity, idempotent duplicates, and conflict refusal;
- typed late observations remain attributable and non-current;
- a separate asynchronous runtime port matches private Convex handlers while
  the deterministic development port remains explicitly a test double;
- fresh port/process reconstruction works for Request-owned and standalone
  origins through source references rather than transcript or copied input;
- cryptographic canonical SHA-256 digests protect material, target, effect,
  command, and source-result identities;
- persisted failure and uncertainty records contain typed state and optional
  error digest, never raw adapter error text, body, contact, access key, or
  copied provider result;
- competing-process CAS refusal rehydrates the losing process to exact current
  durable control;
- standalone completed-result identity is same-principal, terminal,
  source-verified, allowed-outcome constrained, and carries no authority;
- master focused checks passed 17/17, scoped lint and diff checks passed, and
  the persistence boundary contains no `stableHash`, `v.any()`, raw-message
  validator, or unbounded attempt write.

Not established:

- execution of the private Convex handlers, deployment, code generation, or
  hosted cold-process behavior;
- Customer Request attachment or reuse of a completed standalone result;
- provider/network release, delivery, fulfilment, or customer value;
- ADR acceptance.

## Persistence source map

Static source inspection under the AE Convex guardrails established:

- existing Customer Request prepared-action, authority, attempt, release,
  reconciliation, route-run, and dispatch tables hard-own `requestId` and
  Request revisions;
- broad reuse for standalone lineage would force the optional historical
  Request ownership ADR-009 forbids;
- inquiry `operationKeys`, governed-send receipts, notification records, and
  inquiry records already own action-specific idempotency and business outcome;
- Action Invocation therefore earns a module-owned neutral current control
  projection plus append-only control/authority/attempt observations that
  reference source-owned action records and never copy inquiry body, contact,
  provider outcome, or fulfilment state.

This is a source-level development persistence decision. It authorizes no
deployment or hosted readback.

### Canonical slice 10 completion — earned neutral persistence

**Accepted commit:** `d7ee9fe1`
**Child commit:** `3cf38b9e13ccd00c251e8e122dd508d7fe2d3f44`
**Child task:** `019f79fd-8653-7192-a4db-4a02dd5b67d5`
**Assigned base:** `755556bb`
**Evidence class:** source inspection plus deterministic labelled local/mock
execution and static private-handler validation

Re-audit disposition:

- Request-owned and standalone callers use the same durable schema, ports,
  transition engine, authority/attempt/evidence meanings, and cold-resume path;
- neutral persistence contains control identity, exact attribution, digests,
  source references, bounded authority and attempt projections, and append-only
  history, not raw action input, inquiry contact/body/access keys, quote or
  provider payload, transcript, host state, or copied business results;
- source-owned action records remain authoritative for business facts and
  result identity;
- removing the neutral control projection leaves the source-owned result and
  its digest intact, while removing process/transcript/cache does not lose
  reconstructable control meaning;
- fresh sync and async development processes reconstruct current authority,
  attempt, generation, uncertainty, cancellation, reconciliation, terminal
  result reference, and safe continuation;
- bounded reads retain the exact current attempt beyond the first 100 rows;
- stale-worker generation fencing is now explicitly awaited in the acceptance
  evaluator rather than relying on Vitest's deprecated implicit behavior;
- no new runtime, table, schema, Request lineage, or parallel persistence
  lifecycle was required.

Master verification:

- focused durable-control and private-handler checks passed 28/28;
- no live Convex call, code generation, network, deployment, seed, or provider
  effect was run.

Not established:

- execution of the private Convex handlers or deployed persistence;
- production recovery, provider fulfilment, safety, or customer value.

### Canonical slice 11 — completed standalone result reference in Customer Request

**Accepted commits:** `92d57aeb`, `f7c978b5`, `f1808da0`, `249a247f`
**Child commits:** `3caaf430ca976267b34b57c840f72f0c9a06e142`,
`46677c9819bb93db59afba4aad266e48f7628c64`,
`1a8f61e79858053f1e27db7847bfb9973ce559b9`
**Child task:** `019f7972-dc09-70f2-8a5e-f5567bbefada`
**Assigned base:** `d15f3b4b`
**Evidence class:** source plus labelled local/mock canonical Request revision
and cold-readback execution

Target transition:

`completed standalone result -> immutable Request reference -> replay without repeated effect`

Implemented:

- same-principal, same-caller, standalone, terminal, source-verified result
  identity is the only attachable input;
- the V2 aggregate stores an immutable provenance reference containing action,
  invocation, source-result, digest, outcome, and timestamp only;
- raw result, authority, attempt, control, body, contact, access key, Request
  fact, fabricated plan action, and V1 mapping never cross the boundary;
- attachment recompiles and commits canonical Request revision `N+1`, so prior
  route decision and authority are superseded rather than inherited;
- the internally derived semantic command digest binds exact Request,
  revision/generation, principal/caller, invocation, verified result identity,
  and reference timestamp;
- exact replay creates no new revision or effect; changed invocation/material
  under the same key conflicts, and missing or altered replay provenance fails
  integrity;
- persisted readback retains the reference and remains aggregate-consistent;
- matching effect is explicitly `provenance_only`: the reference is not yet an
  input to candidate selection;
- historical V2 aggregates remain valid without the additive reference;
- master focused checks passed 82/82 with scoped lint and diff checks.

Re-audit acceptance:

- the producer now runs the real registered `inquiry.submit` development action
  through durable Action Invocation exactly once before attachment;
- one attributable Action Attempt and one source-owned result identity exist
  before Request reuse;
- attachment, exact replay, and cold readback leave runner count, attempt count,
  and Action Invocation history count unchanged;
- the actual persistence/application seam refuses an unknown invocation before
  replay lookup, while changed referenced material under the same command
  identity remains an idempotency conflict;
- the committed Request advances exactly once to `N+1`, contains no source
  access key or raw result, and remains internally consistent after cold
  reconstruction;
- focused producer-plus-attachment checks passed 36/36.

Not established:

- matching or route composition that consumes the prior result;
- a production Convex adapter call, endpoint, deployment, or hosted cold-agent
  continuation;
- provider fulfilment or customer value.

## Active slice

### Canonical slice 2 — supplied-candidate qualification

**Accepted commits:** `4c27d371`, `27e885f6`
**Child commits:** `d993c6cc1f838a5b03da3893b4071a3871d97adf`,
`45f4d9506406d1496cfe612329d8f1806afe66d4`
**Child task:** `019f7988-85cc-7ec0-a559-5189f4ada69a`
**Assigned base:** `8db1ba9e`
**Evidence class:** source plus labelled local/development supply qualification

Target transition:

`registered supplied candidate -> current admission/evidence qualification -> inspectable eligible or blocked invocation dependency`

Implemented:

- exact publication revision, current business publication predicate, active
  contract registration, offering eligibility, binding admission/conformance,
  credential access, readiness evidence, and freshness are evaluated through
  existing source owners;
- the result is neutral `eligible` or deterministic `blocked` qualification
  with exact source references, evidence references, canonical digests, and
  validity horizon;
- listing-only, missing/inactive contract, missing offering/binding,
  non-current publication, candidate mismatch, unpublished business,
  ineligible offering, unadmitted/nonconformant binding, unavailable
  credentials, missing/unhealthy/stale readiness, and source-integrity
  failures fail closed;
- the business source exposes the exact predicate it proves: published claim,
  published public state, and unsuppressed current publication. It does not
  invent a separate business-admission claim;
- returned active-contract identity and registration time are digest-bound;
- Request-owned and standalone callers receive identical qualification
  meaning, and the operation has no runner or effect path;
- master qualification, graph integration, lifecycle, and thinness checks
  passed 45/45 with scoped lint and diff checks.

Not established:

- independently operated or useful real supply;
- quote preparation, disclosure authority, provider attempt, or quote result;
- deployment, hosted readback, provider fulfilment, or customer value.

### Canonical slice 3 — supplied-candidate quote collection

**Accepted commits:** `f744e943`, `c4f20455`, `4f0941a7`, `31ec335e`,
`e5079e23`
**Child commits:** `8bac9420587a703f5935092995de8fa0734e6b1b`,
`0c0882e7f36a728ed4b0cb61db6bb47f9da7efbe`,
`2bacc7335e5cca1be62041f2704bf8a56a3544bc`,
`c02e22d38ed186f86ab3c0d1dae9a5fad2b23593`,
`c9c789b320041fe5897054152c84ed2009cd0d68`
**Child task:** `019f7996-e667-7b01-8bb2-a087a643e228`
**Assigned base:** `6fbb0d84`
**Evidence class:** source plus labelled local/development provider adapter
and durable-control execution

Target transition:

`eligible candidate -> exact quote preparation/disclosure authority -> attributable provider attempt -> returned quote or reconcile-before-retry`

Implemented:

- a registered development-only quote action with no public surface or network
  adapter; inquiry semantics remain untouched;
- preparation re-runs the real P1-H source qualifier and binds the exact
  candidate, qualification digest/horizon, quote request, disclosure, and
  operation key;
- immediately before release, the action-owned hook requalifies current source
  state and refuses changed or expired supply with no adapter call;
- the provider projection excludes locally requested output fields and contains
  only target/effect identity plus exact service/constraint data;
- every provider-visible customer-data path must appear once in disclosure,
  have one exact limit, and fit that limit; missing, extra, duplicate, or
  over-limit disclosure fails before effect;
- Request-owned and standalone origins use the same authority, attempt,
  idempotency, fencing, uncertainty, reconciliation, cancellation, and durable
  control source owners;
- structured development quote and provider refusal are returned outcomes;
  demonstrated pre-release failure permits retry;
- possible release survives fresh-port reconstruction, reconciled release
  becomes terminal with external outcome unknown, and another attempt is
  refused;
- neutral durable rows retain only control digests, effect identity, and
  disclosure-limit summary; request values, disclosure purpose, quote body, and
  result remain action-owned;
- pre-release refusal is labelled `pre_release_refused`, not falsely described
  as a runner return;
- master focused qualification, quote, invocation, durability, and publication
  checks passed 56/56 with scoped lint and diff checks.

Not established:

- a real provider call, independently operated quote, availability,
  commitment, fulfilment, or customer value;
- deployment, hosted readback, or public quote surface;
- imported-commitment attribution.

### Canonical slice 4 — imported commitment attribution

**Accepted commits:** `0cf42307`, `b8942e8b`
**Child commits:** `b3c4e25cee966cc991783150928529a941fc44c2`,
`461e6a5d478d52be78311665d7f8334b25c6d604`
**Child task:** `019f79b0-5217-7a12-98af-691a230e6776`
**Assigned base:** `7bca61c8`
**Evidence class:** source plus labelled local/development imported-claim
custody and reference execution

Target transition:

`externally supplied commitment claim -> attributable source observation -> inspectable reference without provider admission or executable authority`

Implemented:

- immutable imported claim identity binds principal/importer, issuer, observer,
  subject, commitment kind, bounded terms, exact source reference and raw-byte
  SHA-256 digest, observed/asserted time, validity, and evidence references;
- raw bytes and terms remain in claim-specific custody; Customer Request
  receives only a reference projection;
- verification and posture remain explicitly `imported_unverified` and
  `imported_claim_only`, with authority/effect absent and provider admission not
  established;
- duplicate import replays, changed material under one key conflicts, and
  cross-principal, tampered source identity/bytes/digest, and tampered Request
  reference replay fail closed;
- expired-at-boundary, withdrawn, and unknown validity remain explicit;
- temporal attribution refuses assertion or withdrawal timestamps later than
  the observation that imports them;
- historical Request replay remains compatible;
- the real P1-H qualification seam blocks the claim at missing publication, and
  there is no registered executable imported-commitment action;
- master imported-claim, Request-reference, qualification, and historical
  checks passed 86/86 with scoped lint and diff checks.

Not established:

- promotion into a current AE observation through an admitted provider adapter
  with fresh attributable evidence;
- production persistence of raw claim custody, endpoint, deployment, hosted
  readback, provider fulfilment, or customer value.

### Canonical slices 5–7 — accepted evidence audit

**Status:** source implemented; exact canonical requirements rechecked before
advancing to the first open slice-8 transition

- slice 5: both origins exercise the same registered action and source-owned
  minimum transition;
- slice 6: preparation, `awaiting_authority`, opaque exact decision,
  material-change/cross-principal refusal, and invocation-version CAS are
  executable;
- slice 7: effect identity, idempotency, lease owner, effect generation,
  release observation, attributable result, and action-declared retry class are
  source-owned.

### Canonical slice 12 — composition and direct control

**Accepted commit:** `0dc146e8`
**Child commit:** `8c4d7e90c1e4efb082da01e8ee3d9f93f0268c3f`
**Child task:** `019f7a07-71b5-7d80-84ec-e9bd86a068ff`
**Assigned base:** `f14e48ae`
**Evidence class:** source plus labelled local/development projection and
direct-path control; no persistence or external effects

Implemented:

- a pure, deletable Customer Request application projection over one exact
  Request reference and revision;
- exact registered action/version validation, unique node references, declared
  dependency endpoints, acyclicity, and completed-task reference binding;
- independently inspectable completed-task and invocation references without
  copying authority, attempts, evidence, results, leases, generations, or
  recovery state;
- exactly `completed`, `current`, `optional`, and `blocked` task states, with
  required unresolved work preventing a complete roll-up;
- per-action authority isolation across two independently qualified
  `supply.collectDevelopmentQuote:v1` invocations: authority for A cannot
  authorize B, and materially changed input cannot reuse A;
- a registered read-only `registry.detail:v1` direct first-contact control with
  no Action Invocation control, attempt, history, invocation, or approval
  records;
- no schema, persisted Bundle, RoutePlan, provider routing, or copied lifecycle;
- parent-focused demonstration passed 26/26; child expanded relevant checks
  passed 65/65, with scoped lint and diff checks green.

Execution-policy note:

- before the parent dependency-reuse correction arrived, the isolated child ran
  `npm ci --ignore-scripts`; it made no source or Convex change, but may have
  used npm cache/network. The child moved that local dependency tree to Trash
  and reused the existing master dependency tree. This is not product evidence.

Not established:

- persisted composition, a RoutePlan, public route choice, provider routing,
  direct booking, deployment, hosted readback, external fulfilment, or customer
  value;
- authoritative resolution of invocation state, continuation, outcome, and
  ownership. The initial projector accepts these as caller-authored node input,
  so it cannot yet support gates 6 or 9.

### Canonical slice 13 — transfer

**Accepted commits:** `edc82390`, `9dd406be`
**Child commits:** `a6a6a68b79375a387e8af584eff17dde7f0689d6`,
`070c7d28edb4b105557a21e7604b5aad1efe8b8a`
**Child task:** `019f7a11-9bfb-7af2-be94-807a7c665301`
**Assigned base:** `c19f8e96`
**Evidence class:** deterministic labelled local/development transfer fixture;
no network, provider, Convex, or production execution

Decision:

- retain Action Invocation for consequential quote release because exact
  authority, attributable release, reconcile-before-retry, durable cold
  continuation, and no-effect result reuse earn the added control;
- bypass Action Invocation for read-only/direct work. The seam is not a
  universal orchestration layer.

Measured contrast:

| Measure | Direct read | Direct consequential | Action Invocation |
|---|---:|---:|---:|
| Control records | 0 | 0 | 1 |
| Attributable attempts | 0 | 0 | 1 |
| Effect calls | 0 | 1 | 1 |
| Authority/supervisor decisions | 0 | 0 | 1 |
| Required continuations | 0 | 0 | 2 |
| Deterministic logical transitions | 1 | 1 | 5 |
| Durable history records | 0 | 0 | 5 |

Implemented proof:

- a labelled strata-repair quote fixture reuses the registered
  `supply.collectDevelopmentQuote:v1` action, exact qualification/disclosure,
  authority, attempt, idempotency, and durable control source owners;
- the read-only `registry.detail:v1` arm remains direct with zero invocation,
  authority, attempt, history, or supervisor burden;
- cold resume reconstructs the completed consequential result;
- the source-owned completed-result identity is verified and attached to a
  canonical Customer Request as one immutable reference;
- cold Request readback and reference-only composition expose one completed
  quote node and one current next-review node without copying quote, authority,
  attempt, control, evidence, or recovery fields;
- effect count remains exactly one before and after attachment, cold readback,
  and composition;
- no RoutePlan, persisted Bundle, schema, or neutral domain-specific contract
  was added;
- parent-focused transfer, result-reference, composition, and direct-control
  checks passed 38/38 with diff checks green.

Not established:

- wall-clock or provider latency, real strata-repair supply, provider response,
  fulfilment, deployment, hosted behavior, or customer value;
- reusable execution instrumentation for control, supervision, and logical
  transitions. The initial evaluator derives some counts from stores/calls but
  still embeds other metrics and the recommendation inside test data.

## Evidence position

`Proven` below means executable development evidence for the gate as written.
It never means hosted, production, provider-fulfilment, or customer-value proof.
`Partial` cannot support ADR acceptance.

### ADR-009 — eleven gates

| # | Gate | Position | Current evidence / next failed transition |
|---|---|---|---|
| 1 | Supplied-candidate qualification reuses contracts and supply evidence | Proven | Labelled development qualification reuses exact publication, business currentness, active contract, offering, binding, eligibility, credential, readiness, and freshness sources with deterministic blockers and no effect. |
| 2 | Supplied-candidate quote collection reuses preparation, disclosure authority, provider attempts, and reconciliation | Proven | A labelled development quote action requalifies current supply at preparation and pre-release, binds exact disclosure, reuses shared durable attempts/fencing/reconciliation for both origins, and keeps quote data source-owned. |
| 3 | Imported commitments remain attributable claims without fresh admitted-provider evidence | Partial | Claim custody, attribution, Request reference, and refusal without admitted supply are proven. No positive admitted-provider adapter transition demonstrates when fresh attributable evidence may create a current AE observation. |
| 4 | Request-owned and standalone calls retain identical authority, idempotency, evidence, and recovery meaning | Proven | Both origins share the registered runner, authority, effect identity, uncertainty, reconciliation, fencing, transactional durable control, and fresh-process reconstruction in labelled development execution. |
| 5 | Historical Customer Request traces replay without semantic regression | Partial | Additive optional fields and current compatibility checks are green, but no frozen pre-change V2 aggregate/head/command fixture has been replayed through current persistence and readback. |
| 6 | Composition contains inspectable references and declared dependencies only | Contradicted | Completed references and graph shape are validated, but invocation references are not resolved and caller-authored owner/continuation/outcome prose is copied into the projection. |
| 7 | Direct-booking negative control remains unburdened | Governance disposition required | AE explicitly does not book. The current eval uses read-only first contact and an unrelated empty development store; it neither proves direct booking nor observes a shared instrumentation boundary. Supersede the stale gate to the selected direct-path control rather than invent booking. |
| 8 | Person or cold agent can stop and continue from a durable result | Proven | Fresh development processes reconstruct durable control and a verified completed result can advance a canonical Request revision without repeating the effect. |
| 9 | Full-route projection explains completed, current, optional, and blocked work without kernel machinery | Contradicted | Four labels exist, but `current` is inferred from caller-declared dependencies without resolving actual invocation control/resolution/freshness; caller prose can therefore invent route truth. |
| 10 | Authority never crosses tasks | Proven | Cross-origin/principal/material reuse is refused, completed-result attachment carries no authority, and authority accepted for quote A cannot authorize independently prepared quote B. |
| 11 | No domain nouns enter neutral contracts | Contradicted | Neutral Action Invocation preparation/result classification still hard-codes `inquiry.submit`, `body`, `contact`, `notificationStatus`, `queued_communication`, and inquiry-specific errors. Move these rules to registered action/source adapters. |

### ADR-010 — ten gates

| # | Gate | Position | Current evidence / next failed transition |
|---|---|---|---|
| 1 | One registered action is semantically equivalent through embedded and external-agent surfaces | Missing | Both caller origins currently cross the interface directly, not two real host adapters. |
| 2 | Both hosts use the same source-owned transition without duplicated rules | Missing | Registered-runner reuse is proven; host import/boundary enforcement is not. |
| 3 | Task-shaped view reconstructs from records without transcript replay | Proven | Fresh development processes reconstruct control, attempts, uncertainty, cancellation, and completed-result continuity from durable/source records without transcript replay. |
| 4 | Non-visual form carries the same options, consequences, evidence, and continuations | Missing | No invocation-scoped structured/rich projection pair. |
| 5 | Corrections update authoritative work and invalidate stale projections | Partial | Material input change invalidates authority in memory; authoritative correction and projection invalidation are absent. |
| 6 | Missing information is gathered without unnecessary interrogation | Missing | No clarification loop through the action plane. |
| 7 | Authority binds the exact action and fails after material change | Proven | P1-C binds action/version, actor, origin, invocation, digest, target, consequence, limits, expiry, and CAS version; changed material input is refused before runner execution. |
| 8 | Interruption, refusal, timeout, uncertain effect, and recovery retain parity | Partial | Local pre-release failure, possible release, replay refusal, reconciliation, cancellation, stale-worker fencing, and late-completion refusal are proven; timeout, durable recovery, and cross-host parity remain open. |
| 9 | Cold agent continues without hidden first-party context | Partial | Cold development reconstruction and Request continuation are proven; an actual external-agent host has not yet exercised them. |
| 10 | Human effort improves without worsening correctness, control, privacy, accessibility, or operator burden | Missing | Requires the frozen direct comparison and real host surfaces; local control tests alone are insufficient. |

Customer/provider/operating value remains external evidence and is not an ADR
implementation gate substitute.

## Next decision

Repair the five bounded audit failures: admitted-provider imported observation,
frozen historical V2 replay, authoritative composition resolution, neutral
action-owned data-use/outcome classification, and executed transfer/direct
instrumentation. Then re-run the eleven-gate audit. The stale direct-booking
wording remains a Founder governance disposition; implementation must not
invent booking to make the document green.
