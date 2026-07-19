# ADR-009 / ADR-010 master execution ledger

**Master task:** `019f790d-9a97-7012-a009-2140c0d6fdba`  
**Branch:** `codex/shared-tree-checkpoint-20260714`  
**Current accepted revision:** `b3372462`  
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

## Active slice

### P1-C — exact in-memory authority for `inquiry.submit`

**Child task:** `019f7931-9f74-7e20-87cb-d3ae1e8d3502`  
**Assigned base:** `72351a80`  
**Status:** active

Target transition:

`prepare -> awaiting_authority -> exact decision -> invoke registered communication action`

Scope:

- classify `inquiry.submit` without inventing external-effect meaning;
- freeze exact material inputs and issue an opaque authority reference;
- refuse stale, expired, cross-principal, cross-invocation, and
  material-change reuse;
- run no source write before accepted authority;
- use a controlled labelled mock source adapter and distinguish queued delivery
  from fulfilment;
- no persistence, attempts, leases, generations, or real external send.

## Evidence position

| ADR gate group | Current position |
|---|---|
| ADR-009 request-owned versus standalone seam | Partial positive development evidence from a read-only action |
| ADR-009 historical Request lineage | Preserved by the new discriminated seam; replay regression not yet exercised |
| ADR-009 supplied candidates, quotes, imported commitments | Untouched |
| ADR-009 composition, route roll-up, direct control | Untouched |
| ADR-009 no cross-task authority | Design invariant only; P1-C is the first executable contribution |
| ADR-010 one action through two hosts | Untouched |
| ADR-010 reconstruction and structured parity | Untouched |
| ADR-010 failure/recovery parity | Untouched |
| Customer/provider/operating value | External evidence required |

## Next decision

Review P1-C against the exact-authority and no-god-file invariants. If accepted,
dispatch the attempt/uncertainty slice:

`authorized communication -> attributable attempt -> pre-release retry or post-release reconcile-before-retry`

Do not introduce durable persistence before that slice and the subsequent
concurrency/recovery slice demonstrate shared control meaning for both origins.
