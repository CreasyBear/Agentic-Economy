---
# ADR-017: Customer Request V2 read-projection ports
Status: Accepted
Date: 2026-07-18
Scope: Wave 47 design unlock + implement deepen for correctness-critical V2 read projections on `convex/customerRequestV2.ts`
Supersedes: nothing
Related: `.planning/adr/ADR-014-customer-request-v2-write-ports.md` (write family closed; **untouched**); `.planning/adr/ADR-016-customer-request-v2-preparation-ports.md` (prep family closed; **untouched**); `.planning/adr/ADR-013-route-dispatch-lifecycle-ports.md` (same deepen pattern; different host); `.planning/codebase/CONCERNS.md` (V2 read residual); `.planning/codebase/WAVES-43-49-PLAN.md` (Wave 47 reads after prep); gold deepen pattern (`v2-write` / `v2-preparation` / Application compare-resume ports)

## Context

ADR-014 closed the Customer Request V2 **write** residual behind `CustomerRequestV2WritePorts`.
ADR-016 closed the **preparation** residual behind PreparationPorts / PreparationEgressPorts.
CONCERNS and WAVES-43–49 still park **read projections** on the V2 host: verified aggregate /
generation / refresh-replay readbacks that Application compare-resume, refine, provide-facts,
and integration suites call through `internal.customerRequestV2.*`.

Three correctness-critical `internalQuery` surfaces remain host-owned orchestration today:

| Export | Host | Role |
|--------|------|------|
| `getCurrentAggregate` | `convex/customerRequestV2.ts` | Current V2 aggregate readback with legacy / historical `needs_attention`, aggregate + route-plan head integrity, optional current decision aggregate overlay |
| `getRoutePlanGeneration` | same | Exact route-plan generation read by `generationRef` with generation-row integrity |
| `getRoutePlanGenerationRefreshReplay` | same | Idempotent refresh-command replay (`not_found` / `command_conflict` / stored result) |

Shared verified-projection helpers already live next to the write adapter and are used by both
write machines and these reads (plus undeepened sibling queries):

| Helper (today in WritePorts file) | Role |
|-----------------------------------|------|
| `readExactRoutePlanGeneration` | Load + integrity-check one generation row |
| `readGenerationRefreshCommandResult` | Rebuild refresh result from a generation-command row |
| `readCurrentDecisionAggregate` | Resolve current decision overlay from route head + command |
| `readVerifiedCommandReplay` | Verify commit-command replay material (sibling `getCommandReplay`; write replay) |

Pure decision helpers already live outside the host and MUST remain the authority
(do not re-encode):

| Concern | Pure home | Role |
|---------|-----------|------|
| Aggregate consistency | `src/modules/customer-request/v2-write/aggregate-consistency.ts` | `aggregateIsInternallyConsistent` / `legacyAggregateIsInternallyConsistent` |
| Route-plan generation predicates | `src/modules/customer-request/route-plan-generation.ts` | Match / internal consistency for generation overlays |
| Application orchestration (callers) | `application/compare-resume/`, `application/refine/`, `application/provide-facts/` | Already `runQuery` the public V2 read exports via Application ports |

Callers today (must keep working through the **same Convex export identities**):

- Application compare-resume → `getCurrentAggregate` / `getRoutePlanGenerationRefreshReplay`
- Application refine / provide-facts → `getRoutePlanGeneration`
- Integration suites call the three exports directly

CONCERNS and the campaign hard bans forbid:

1. **Shallow Convex sibling chops** — e.g. `customerRequestV2GetCurrent.ts` without module ports.
2. **Write-plan DTOs in pure modules** — `WritePlan` / `intendedPatches` / patch arrays.
3. **Growing ADR-014 WritePorts** — do not absorb read orchestration into
   `CustomerRequestV2WritePorts` / `v2-write/` / `customerRequestV2WritePorts.ts`.
4. **Reopening ADR-016 preparation** — do not fold reads into PreparationPorts / EgressPorts.
5. **Parallel compilers** — do not invent a second Customer Request compile path for reads.

Wave 47 implements under these constraints (design + deepen in one wave per WAVES-43–49).

## Decision

### 1. Dedicated CustomerRequestV2ReadPorts (Wave 47) — one family only

Wave 47 SHALL deepen the three exports so that:

1. The Convex host exports remain the sole public registrations (same names, same
   `internal.customerRequestV2.*` paths). All three stay `internalQuery`.
2. Handler bodies become thin: validate args (host validators), construct read ports, call one
   module machine function, return its result.
3. Orchestration lives under `src/modules/customer-request/v2-read/`, **reusing** existing
   aggregate-consistency and route-plan-generation predicates — not duplicating digest formulas.
4. Persistence reads and verified-projection reconstruction go only through
   **CustomerRequestV2ReadPorts**, implemented by `convex/customerRequestV2ReadPorts.ts`.

**Locked names**

- Ports type: `CustomerRequestV2ReadPorts`
- Adapter file: `convex/customerRequestV2ReadPorts.ts`
- Factory: `customerRequestV2ReadPorts(ctx)`

**Do not** invent a parallel Customer Request compiler or re-thicken Application actions.

**Stop condition:** if the read adapter approaches ~1k lines mid-wave, split verified-projection
helpers into a second file under **this same ADR** — do not fold helpers into WritePorts or
PreparationPorts, and do not open mandate issue/revoke deepen.

### 2. Shared verified-projection helpers move to the read adapter home

The shared helpers listed above SHALL live in (or adjacent to)
`convex/customerRequestV2ReadPorts.ts` as the verified-projection authority for V2 reads.

- WritePorts MAY **import and call** those helpers for write-side replay / exact-generation loads.
- WritePorts MUST NOT re-absorb read orchestration or grow new read-machine APIs.
- Undeepened sibling queries on the V2 host (`getCurrentRoutePlanGeneration`,
  `getCurrentRoutePlanProjectionMaterial`, `getCommandReplay`, graph-status helpers) MAY keep
  calling the shared helpers directly until a later wave — they are **out of Wave 47 scope**.

### 3. No parallel compiler; no Application re-thickening

Wave 47 MUST keep Application action ports as the seam that continues to
`ctx.runQuery(internal.customerRequestV2.*)`, and MUST NOT create a second compiler or fold
read machines into Application modules.

### 4. No `WritePlan` / `intendedPatches` in the read module

Ports expose **semantic, immediately executed** load / verify operations. Thinness tests SHALL
forbid write-plan DTO tokens and Convex runtime under the read module home.

### 5. Convex validators stay in the V2 host forever

All `v.*` validators for these three exports remain in `convex/customerRequestV2.ts`.

### 6. Preserve integrity digests, conflicts, and historical refusal semantics

Within a single query handler invocation, all port-backed reads share the same `QueryCtx`
transaction. Integrity throws, `needs_attention` historical refusal, refresh-command conflict
kinds, and generation-row verification MUST match pre-deepen semantics. Wave 47 does **not**
retire legacy rows or compilers and does **not** change ADR-014 write or ADR-016 prep semantics.

### 7. Forbid shallow Convex sibling chops; WritePorts and prep untouched

Rejected: `customerRequestV2GetCurrent.ts`, `customerRequestV2Read.ts` query-host siblings, or
any pass-through without module ports.

Allowed Convex growth: thin `customerRequestV2ReadPorts.ts` plus the existing host register.

**Explicitly forbidden:** extending `CustomerRequestV2WritePorts`, editing `v2-write/` machines
for read work, relocating read orchestration into `customerRequestV2WritePorts.ts`, or folding
reads into ADR-016 preparation adapters.

### 8. How callers use the seam

**Call sites do not change.**

```text
Application compare-resume / refine / provide-facts
  → ctx.runQuery(internal.customerRequestV2.getCurrentAggregate, args)
      → host validator + customerRequestV2ReadPorts(ctx)
      → v2-read.getCurrentAggregate(args, ports)     // Wave 47
      → result

  → getRoutePlanGeneration | getRoutePlanGenerationRefreshReplay
      → v2-read.* via CustomerRequestV2ReadPorts
```

Application MUST NOT import read machines or construct read ports.
Machines MUST NOT import Convex `_generated` or host files.

### 9. Status and wave gating

**Status: Accepted.** This ADR is the design unlock and implement authority for Wave 47.

| Wave | Allowed work |
|------|----------------|
| **47 (this ADR)** | Design + implement ports + machines + adapter; thin host shells for the three queries; move shared verified-projection helpers to the read adapter home; thinness locks; integration green |
| **48+** | Out of this ADR (mandate issue/revoke, remaining undeepened V2 read siblings, legacy retirement) |

**Out of Wave 47:** ADR-014 write reopen, ADR-016 prep reopen, `getCurrentRoutePlanGeneration` /
`getCurrentRoutePlanProjectionMaterial` / `getCommandReplay` deepen, Application validator
relocation, notification-outbox families, route-execution Journal / Dispatch growth, legacy
compiler retirement, public claim changes.

**Deletion test (Wave 47 exit):** removing the three read-projection orchestration bodies from
`customerRequestV2.ts` must concentrate that complexity in the module read cluster + ReadPorts
adapter (or fail tests). A Convex sibling chop without ports fails this test.

## Consequences

### Easier

- Wave 47 shrinks `customerRequestV2.ts` read glue without write-plan DTOs or sibling chops.
- Current aggregate / exact generation / refresh replay stay testable with port fakes.
- Shared verified-projection helpers have one home; WritePorts can import without owning reads.
- Existing aggregate-consistency and route-plan-generation predicates remain decision authority.

### Harder / constrained

- Read adapter must not bleed into WritePorts or PreparationPorts.
- Shared helpers used by undeepened sibling queries must remain exported for those call sites.
- Application thinness remains: Application still only `runQuery` the public V2 exports.

### Explicit non-goals

- Deepening remaining V2 read siblings in the same wave.
- Changing Application public behavior or Convex function paths.
- Retiring legacy aggregates / compilers.
- Growing `CustomerRequestV2WritePorts` or preparation ports to absorb reads.
- Relitigating ADR-014 / ADR-016 decisions.
- Synonym names — lock `CustomerRequestV2ReadPorts` + `customerRequestV2ReadPorts.ts`.

## Rejected alternatives

### A. Split host into `customerRequestV2GetCurrent.ts` / read siblings

Rejected: shallow pass-through; CONCERNS hard ban; fails deletion test.

### B. Return `WritePlan` / `intendedPatches` from modules

Rejected: pollutes pure modules; multi-step apply risk; thinness bans.

### C. Move validators into `src/modules`

Rejected: validators stay in the V2 Convex host forever.

### D. Invent a parallel compiler for reads

Rejected: one canonical Customer Request path; duplicate consistency formulas are a known
failure mode.

### E. Application calls read machines directly (bypass queries)

Rejected: breaks existing Application port seams and Convex query authority.

### F. Fold V2 reads into `CustomerRequestV2WritePorts` / `v2-write/`

Rejected: ADR-014 explicitly parked reads; WritePorts must stay closed; wrong responsibility.

### G. Fold V2 reads into ADR-016 PreparationPorts / EgressPorts

Rejected: prep family closed; wrong command/table set and transaction shape.

### H. Deepen all V2 read siblings + writes + prep reopen in one wave

Rejected: one family per implement wave; write and prep families closed.

### I. Implement Wave 47 without Accepted ADR-017

Rejected: design unlock required before V2 read move.

### J. Retire legacy aggregates as part of the read deepen

Rejected: product/migration gate, not a ports deepen.

## Verification expectations (Wave 47)

1. Host still exports the three queries; bodies delegate via `CustomerRequestV2ReadPorts`.
2. Read-module home free of write-plan tokens and Convex runtime.
3. Thinness: thin handlers; ReadPorts adapter `<= 1000` lines; no `customerRequestV2GetCurrent.ts`.
4. Shared verified-projection helpers live under the read adapter home; WritePorts imports them
   rather than redefining or absorbing read machines.
5. Integration suites stay green (aggregate persistence, multi-capability, compare-resume refresh
   replay paths as covered today).
6. Integrity / historical refusal / command-conflict semantics match pre-deepen.
7. Application ports still only `runQuery` the public V2 exports.
8. ADR-014 write hosts/adapters and ADR-016 prep hosts/adapters untouched in behavior
   (WritePorts may only change to import shared helpers from the read adapter).
9. `npm run check:convex-codegen` green; Wave 47 deletion / thinness test passes.

## Decision record

Accepted 2026-07-18 as Wave 47 design unlock and implement authority. ADR-014 remains authority
for the V2 **write** residual and is not amended. ADR-016 remains authority for the V2
**preparation** residual and is not amended. This document covers the Customer Request V2
**read-projection** residual for the three named queries plus shared verified-projection
helpers. Remaining undeepened V2 read siblings, mandate issue/revoke, and legacy retirement
require later ADRs.
