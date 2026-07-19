# ADR-009 / ADR-010 master execution ledger

**Master task:** `019f790d-9a97-7012-a009-2140c0d6fdba`  
**Branch:** `codex/shared-tree-checkpoint-20260714`  
**Current accepted revision:** `f4b77026`
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

## Active slice

### P1-E — concurrency fencing, cancellation, and in-memory recovery

**Status:** ready to dispatch from `f4b77026`

Target transitions:

`ready attempt -> leased generation -> release -> fenced observation`

`cancel before release -> no effect`

`cancel after possible release -> reconcile, never erase uncertainty`

The slice must prove takeover after lease expiry, reject stale workers and late
observations by invocation version plus effect generation, and reconstruct the
same in-memory view after a simulated process boundary. It must not choose
durable storage yet.

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
| 4 | Request-owned and standalone calls retain identical authority, idempotency, evidence, and recovery meaning | Partial | Same registered actions, exact authority, effect identity, pre-release retry, uncertainty, and reconciliation are proven in memory; fencing, cancellation, restart, and durability remain open. |
| 5 | Historical Customer Request traces replay without semantic regression | Missing | Discriminated lineage preserves the type boundary, but no historical replay regression has run. |
| 6 | Composition contains inspectable references and declared dependencies only | Missing | No invocation composition or dependency projection. |
| 7 | Direct-booking negative control remains unburdened | Missing | No contrasting direct-path measurement. |
| 8 | Person or cold agent can stop and continue from a durable result | Missing | State is intentionally in-memory; restart and cold resume are unproven. |
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
| 8 | Interruption, refusal, timeout, uncertain effect, and recovery retain parity | Partial | P1-D proves local pre-release failure, possible release, replay refusal, and reconciliation meaning; timeout, cancellation, recovery, and cross-host parity remain open. |
| 9 | Cold agent continues without hidden first-party context | Missing | No durable reconstruction or cold-host continuation. |
| 10 | Human effort improves without worsening correctness, control, privacy, accessibility, or operator burden | Missing | Requires the frozen direct comparison and real host surfaces; local control tests alone are insufficient. |

Customer/provider/operating value remains external evidence and is not an ADR
implementation gate substitute.

## Next decision

Dispatch the concurrency/recovery slice. Do not introduce durable persistence
until fencing, cancellation, takeover, late-observation refusal, and simulated
restart demonstrate shared control meaning for both origins.
