---
# ADR-014: Customer Request V2 write-family ports
Status: Accepted
Date: 2026-07-18
Scope: Wave 41 design unlock for Wave 42 `commitAggregate` / `refreshRoutePlanGeneration` / `recordRoutePlanGenerationRetry` deepen on `convex/customerRequestV2.ts` (~1492 lines)
Supersedes: nothing
Related: `.planning/adr/ADR-011-journal-write-plan-ports.md`; `.planning/adr/ADR-012-route-cancel-problem-ports.md`; `.planning/adr/ADR-013-route-dispatch-lifecycle-ports.md` (same deepen pattern; different host); `.planning/codebase/CONCERNS.md` (`customerRequestV2` host bulk); `.planning/codebase/WAVES-38-42-PLAN.md`; gold deepen pattern (provide-facts / Application action ports)

## Context

`convex/customerRequestV2.ts` remains the largest undeepened Customer Request host after the
route-execution campaign (ADR-011 → ADR-013). CONCERNS names it as optional ports-per-family
residual: aggregate persistence, route-plan generation commands, evaluation wiring, reads, and
legacy integrity still concentrate in one file. ADR-013 explicitly parked this family for
ADR-014 / Waves 41–42.

This ADR covers **one write family only**. Three correctness-critical `internalMutation`
surfaces remain host-owned orchestration today:

| Export | Host | Role |
|--------|------|------|
| `commitAggregate` | `convex/customerRequestV2.ts` (~`:216`) | Durable V2 aggregate commit (optional co-committed route-plan generation). Command-key idempotency / replay; aggregate + generation consistency gates; capability-graph currency check; revision / route-generation / identity / command conflicts; supersede active route mandate on store; insert revision (+ generation) + head(s) + command row |
| `refreshRoutePlanGeneration` | `same` (~`:418`) | Idempotent route-plan generation refresh against a pinned request revision + generation head. Replay via generation-command log; candidate validation + graph currency; result kinds `unchanged` / `superseded` / `needs_information` / `unsupported`; mandate supersession when generation material changes or falls away; decision-command bookkeeping on the route head |
| `recordRoutePlanGenerationRetry` | `same` (~`:590`) | Record a retryable refresh failure without advancing generation. Shares the generation-command log and replay path with refresh |

Pure decision helpers already live outside the host and MUST remain the authority for generation /
aggregate matching (do not re-encode):

| Concern | Pure home | Role |
|---------|-----------|------|
| Route-plan generation predicates | `src/modules/customer-request/route-plan-generation.ts` | Ownership of decision snapshot + cancellation posture, material digest, consistency |
| Aggregate / compile domain | `src/modules/customer-request/compiler.ts`, `runtime.ts`, evaluation modules | Aggregate shape, compile composition, registry snapshot digests |
| Application orchestration (callers) | `application/interpret-compile/`, `application/compare-resume/`, `application/provide-facts/`, `application/refine/` | Compile-then-commit and refresh/retry UX; already call V2 via action ports |

`supersedeCurrentRouteMandate` already lives in
`convex/customerRequestRouteMandateLifecycle.ts`. Machines MUST call it only through
**CustomerRequestV2WritePorts** (adapter invokes the lifecycle helper) — not by importing
Convex mandate lifecycle into `src/modules/**`.

Callers today (must keep working through the same Convex export identities):

- Application interpret-compile / provide-facts / refine → `internal.customerRequestV2.commitAggregate`
- Application compare-resume → `refreshRoutePlanGeneration` / `recordRoutePlanGenerationRetry`
- Integration suites call the three exports directly

CONCERNS and the campaign hard bans forbid:

1. **Shallow Convex sibling chops** — e.g. `customerRequestV2Commit.ts` without module ports.
2. **Write-plan DTOs in pure modules** — `WritePlan` / `intendedPatches` / patch arrays.

Wave 41’s design half is this ADR. Wave 42 implements under these constraints.

## Decision

### 1. Dedicated CustomerRequestV2WritePorts (Wave 42) — one family only

Wave 42 SHALL deepen the three exports so that:

1. The Convex host exports remain the sole public registrations (same names, same
   `internal.customerRequestV2.*` paths). All three stay `internalMutation`.
2. Handler bodies become thin: validate args (host validators), construct write ports, call one
   module machine function, return its result.
3. Orchestration lives under `src/modules/customer-request/` (illustrative `v2-write/`),
   **reusing** existing `compiler`, `route-plan-generation`, `runtime`, and evaluation helpers.
4. Persistence, capability-supply / contract reads for graph validation, and mandate
   supersession go only through **CustomerRequestV2WritePorts**, implemented by
   `convex/customerRequestV2WritePorts.ts`.

**Locked names**

- Ports type: `CustomerRequestV2WritePorts`
- Adapter file: `convex/customerRequestV2WritePorts.ts`
- Factory: `customerRequestV2WritePorts(ctx)`

**Do not** invent a parallel Customer Request compiler or re-thicken Application actions.

**Stop condition:** if the write adapter approaches ~1k lines mid-wave, split graph-validation
reads into a second ports file under **this same ADR** — do not open read-projection deepen.

### 2. No parallel compiler; no Application re-thickening

Wave 42 MUST keep Application action ports as the seam that continues to
`ctx.runMutation(internal.customerRequestV2.*)`, and MUST NOT create a second compiler.

### 3. No `WritePlan` / `intendedPatches` in the write module

Ports expose **semantic, immediately executed** operations. Thinness tests SHALL forbid
write-plan DTO tokens and Convex runtime under the write module home.

### 4. Convex validators stay in the V2 host forever

All `v.*` validators for these three exports remain in `convex/customerRequestV2.ts`.

### 5. Preserve atomicity, integrity digests, conflicts, and mandate supersession

Within a single handler invocation, all port-backed reads and writes share the same
`MutationCtx` transaction. Replay, conflict kinds, integrity throws, graph validation, and
mandate supersession MUST match pre-deepen semantics. Legacy aggregate refusal behavior is
preserved — Wave 42 does **not** retire legacy rows or compilers.

### 6. Forbid shallow Convex sibling chops

Rejected: `customerRequestV2Commit.ts`, `customerRequestV2Refresh.ts`,
`customerRequestV2Write.ts` mutation-host siblings, or any pass-through without module ports.

Allowed Convex growth: thin `customerRequestV2WritePorts.ts` plus the existing host register.

### 7. How callers use the seam

**Call sites do not change.**

```text
Application interpret-compile / provide-facts / refine
  → ctx.runMutation(internal.customerRequestV2.commitAggregate, args)
      → host validator + customerRequestV2WritePorts(ctx)
      → v2-write.commitAggregate(args, ports)     // Wave 42
      → result

Application compare-resume
  → refreshRoutePlanGeneration | recordRoutePlanGenerationRetry
      → v2-write.* via CustomerRequestV2WritePorts
```

Application MUST NOT import write machines or construct write ports.

### 8. Status and wave gating

**Status: Accepted.** This ADR is the design unlock for Wave 42.

| Wave | Allowed work |
|------|----------------|
| 41 (this ADR) | Design only; CONCERNS pointer; **no** machine/port code in the ADR-only commit |
| 42 | Implement ports + machines + adapter; thin host shells; thinness locks; integration green |
| 43+ | Out of this ADR (V2 reads, preparation siblings, outbox webhook, legacy retirement) |

**Out of Waves 41–42:** read projections, preparation siblings, full host collapse, legacy
retirement, Application validator relocation, relitigating ADR-011–013.

**Deletion test (Wave 42 exit):** removing write-family orchestration from
`customerRequestV2.ts` must concentrate that complexity in the module write cluster (or fail
tests). A Convex sibling chop without ports fails this test.

## Consequences

### Easier

- Wave 42 shrinks `customerRequestV2.ts` write glue without write-plan DTOs or sibling chops.
- Commit / refresh / retry stay testable with port fakes; production atomicity stays one mutation.
- Existing `route-plan-generation` and compiler predicates remain decision authority.

### Harder / constrained

- First ports ADR on the V2 host — do not bleed into preparation or read families.
- Graph validation must use domain snapshots on ports.
- Mandate supersession remains ports-only from the write machines.

### Explicit non-goals

- Moving read projections or preparation hosts in the same waves.
- Changing Application public behavior or Convex function paths.
- Retiring legacy aggregates / compilers.
- Growing route-execution ports to absorb V2 writes.
- Synonym names — lock `CustomerRequestV2WritePorts` + `customerRequestV2WritePorts.ts`.

## Rejected alternatives

### A. Split host into `customerRequestV2Commit.ts` / refresh siblings

Rejected: shallow pass-through; CONCERNS hard ban; fails deletion test.

### B. Return `WritePlan` / `intendedPatches` from modules

Rejected: pollutes pure modules; multi-step apply risk; thinness bans.

### C. Move validators into `src/modules`

Rejected: validators stay in the V2 Convex host forever.

### D. Invent a parallel compiler

Rejected: one canonical Customer Request path; duplicate compile formulas are a known failure mode.

### E. Application calls write machines directly (bypass mutations)

Rejected: breaks transactional atomicity and `internalMutation` authority.

### F. Fold V2 writes into route-execution Journal / Dispatch ports

Rejected: wrong host and table set; JournalPorts at ceiling pressure.

### G. Deepen reads + writes + preparation in one wave

Rejected: WAVES-38-42 locks one family.

### H. Implement Wave 42 without Accepted ADR-014

Rejected: design unlock required before V2 write move.

### I. Retire legacy aggregates as part of the write deepen

Rejected: product/migration gate, not a ports deepen.

## Verification expectations (Wave 42, not the ADR-only commit)

1. Host still exports the three mutations; bodies delegate via `CustomerRequestV2WritePorts`.
2. Write-module home free of write-plan tokens and Convex runtime.
3. Thinness: thin handlers; adapter `<= 1000` lines; no `customerRequestV2Commit.ts`.
4. Integration suites stay green (aggregate persistence, multi-capability, mandate commit paths).
5. Replay / conflict / integrity / graph / mandate supersession match pre-deepen semantics.
6. Application ports still only `runMutation` the public V2 exports.
7. Preparation hosts and read-projection handlers untouched.
8. `npm run check:convex-codegen` green.
9. Deletion test passes.

## Decision record

Accepted 2026-07-18 as Wave 41 design unlock. Wave 42 implements under this ADR only.
ADR-011–013 remain authority for route-execution families and are not amended. This document
covers the Customer Request V2 **write** residual. Read projections, preparation siblings, and
legacy retirement require later ADRs.
