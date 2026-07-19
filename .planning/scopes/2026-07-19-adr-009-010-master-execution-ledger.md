# ADR-009 / ADR-010 master execution ledger

**Master task:** `019f790d-9a97-7012-a009-2140c0d6fdba`  
**Branch:** `codex/shared-tree-checkpoint-20260714`  
**Current accepted revision:** `ccd21ad2`  
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

## Active slice

### P1-D — attributable attempt and uncertainty

**Status:** ready to dispatch from `ccd21ad2`

Target transition:

`authorized communication -> attributable attempt -> pre-release retry or post-release reconcile-before-retry`

This slice must preserve both origin types, keep the state port in memory, and
show the distinction using a labelled development adapter. It must not infer a
successful external effect from runner return or queued communication.

## Evidence position

| ADR gate group | Current position |
|---|---|
| ADR-009 request-owned versus standalone seam | Positive development evidence through the same read and consequential registered actions |
| ADR-009 historical Request lineage | Preserved by the new discriminated seam; replay regression not yet exercised |
| ADR-009 supplied candidates, quotes, imported commitments | Untouched |
| ADR-009 composition, route roll-up, direct control | Untouched |
| ADR-009 no cross-task authority | Positive in-memory evidence for actor, origin, invocation, action/version, digest, expiry, and CAS binding |
| ADR-010 one action through two hosts | Untouched |
| ADR-010 reconstruction and structured parity | Untouched |
| ADR-010 failure/recovery parity | Untouched |
| Customer/provider/operating value | External evidence required |

## Next decision

Dispatch the attempt/uncertainty slice:

`authorized communication -> attributable attempt -> pre-release retry or post-release reconcile-before-retry`

Do not introduce durable persistence before that slice and the subsequent
concurrency/recovery slice demonstrate shared control meaning for both origins.
