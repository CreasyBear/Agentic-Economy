# ADR-009 / ADR-010 master execution ledger

**Master task:** `019f790d-9a97-7012-a009-2140c0d6fdba`  
**Branch:** `codex/shared-tree-checkpoint-20260714`  
**Current accepted revision:** `0d5131a3`
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

## Accepted slices

### P1-A/B — registered-action compatibility and two-origin read tracer

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

### P1-C — exact in-memory authority for `inquiry.submit`

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

### P1-D — attributable attempt and uncertainty

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

### P1-E — concurrency fencing, cancellation, and in-memory recovery

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

### P1-F — earned durable control and cold resume

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

## Active slice

### P1-G — completed standalone result reference in Customer Request

**Status:** ready to dispatch from `0d5131a3`

Target transition:

`completed standalone result -> immutable Request reference -> replay without repeated effect`

The Request aggregate may attach only a same-principal, standalone, terminal,
source-verified result identity. It must reference rather than copy the result,
must inherit no authority or control state, and must not fabricate a plan
action, Request fact, capability result, or legacy V1 output mapping. The eval
must prove one runner call, idempotent replay/attachment, cold reconstruction,
historical Request replay compatibility, and refusal for cross-principal,
nonterminal, or tampered identities.

## Evidence position

`Proven` below means executable development evidence for the gate as written.
It never means hosted, production, provider-fulfilment, or customer-value proof.
`Partial` cannot support ADR acceptance.

### ADR-009 — eleven gates

| # | Gate | Position | Current evidence / next failed transition |
|---|---|---|---|
| 1 | Supplied-candidate qualification reuses contracts and supply evidence | Missing | No supplied-candidate tracer through current capability, eligibility, provenance, and freshness seams. |
| 2 | Supplied-candidate quote collection reuses preparation, disclosure authority, provider attempts, and reconciliation | Missing | P1-C proves generic exact authority only; no provider quote attempt or reconciliation trace. |
| 3 | Imported commitments remain attributable claims without fresh admitted-provider evidence | Missing | No imported-commitment observation tracer. |
| 4 | Request-owned and standalone calls retain identical authority, idempotency, evidence, and recovery meaning | Partial | Same registered actions, exact authority, effect identity, retry, uncertainty, reconciliation, fencing, cancellation, and snapshot reconstruction are proven in memory; durable transaction and cold-process evidence remain open. |
| 5 | Historical Customer Request traces replay without semantic regression | Missing | Discriminated lineage preserves the type boundary, but no historical replay regression has run. |
| 6 | Composition contains inspectable references and declared dependencies only | Missing | No invocation composition or dependency projection. |
| 7 | Direct-booking negative control remains unburdened | Missing | No contrasting direct-path measurement. |
| 8 | Person or cold agent can stop and continue from a durable result | Partial | Control-only snapshot reconstruction is proven in memory; durable storage, fresh-process readback, and result continuation remain open. |
| 9 | Full-route projection explains completed, current, optional, and blocked work without kernel machinery | Missing | No Action Invocation route roll-up. |
| 10 | Authority never crosses tasks | Partial | P1-C refuses cross-origin, cross-principal, stale-version, expired, and material-change reuse for one in-memory action; cross-invocation and durable reuse still require executable proof. |
| 11 | No domain nouns enter neutral contracts | Partial | Current invocation contracts use neutral action/control vocabulary; later attempt, persistence, composition, and projection contracts remain unaudited. |

### ADR-010 — ten gates

| # | Gate | Position | Current evidence / next failed transition |
|---|---|---|---|
| 1 | One registered action is semantically equivalent through embedded and external-agent surfaces | Missing | Both caller origins currently cross the interface directly, not two real host adapters. |
| 2 | Both hosts use the same source-owned transition without duplicated rules | Missing | Registered-runner reuse is proven; host import/boundary enforcement is not. |
| 3 | Task-shaped view reconstructs from records without transcript replay | Missing | No durable record or reconstruction evaluator. |
| 4 | Non-visual form carries the same options, consequences, evidence, and continuations | Missing | No invocation-scoped structured/rich projection pair. |
| 5 | Corrections update authoritative work and invalidate stale projections | Partial | Material input change invalidates authority in memory; authoritative correction and projection invalidation are absent. |
| 6 | Missing information is gathered without unnecessary interrogation | Missing | No clarification loop through the action plane. |
| 7 | Authority binds the exact action and fails after material change | Proven | P1-C binds action/version, actor, origin, invocation, digest, target, consequence, limits, expiry, and CAS version; changed material input is refused before runner execution. |
| 8 | Interruption, refusal, timeout, uncertain effect, and recovery retain parity | Partial | Local pre-release failure, possible release, replay refusal, reconciliation, cancellation, stale-worker fencing, and late-completion refusal are proven; timeout, durable recovery, and cross-host parity remain open. |
| 9 | Cold agent continues without hidden first-party context | Missing | No durable reconstruction or cold-host continuation. |
| 10 | Human effort improves without worsening correctness, control, privacy, accessibility, or operator burden | Missing | Requires the frozen direct comparison and real host surfaces; local control tests alone are insufficient. |

Customer/provider/operating value remains external evidence and is not an ADR
implementation gate substitute.

## Next decision

Dispatch earned durable control and cold resume. Persist only the neutral
control/history and source references proven by both origins; action-specific
business facts and results remain source-owned.
