---
# ADR-016: Customer Request V2 preparation-family ports
Status: Accepted
Date: 2026-07-18
Scope: Wave 44 design unlock for Waves 45–46 deepen of preparation / egress / prepared-action hosts (~2005 LOC across four Convex files)
Supersedes: nothing
Related: `.planning/adr/ADR-014-customer-request-v2-write-ports.md` (write family closed; **untouched**); `.planning/adr/ADR-013-route-dispatch-lifecycle-ports.md` / `.planning/adr/ADR-015-notification-outbox-operator-ports.md` (same deepen pattern; different hosts); `.planning/adr/ADR-002-governed-action-bounded-contexts.md` / `.planning/adr/ADR-007-canonical-governed-action-wire-format.md` (preparation authority + consequential digests); `.planning/codebase/CONCERNS.md` (V2 prep residual); `.planning/codebase/WAVES-43-49-PLAN.md` (prep band after outbox); gold deepen pattern (provide-facts / `v2-write` / Application authorize-preparation ports)

## Context

ADR-014 closed the Customer Request V2 **write** residual behind `CustomerRequestV2WritePorts`
and left preparation siblings parked. CONCERNS still names four undeepened hosts:

| Host | ~LOC | Role today |
|------|------|------------|
| `convex/customerRequestV2Preparation.ts` | ~436 | Durable action preparation `prepare` + `resume` |
| `convex/customerRequestV2PreparationEgress.ts` | ~444 | `"use node"` egress `internalAction`s: allocate → dispatch HTTP → resolve / reconcile |
| `convex/customerRequestV2PreparationEgressState.ts` | ~622 | Egress allocation, dispatch lease, resolve, reconcile mutations + status queries; shared integrity / authority helpers |
| `convex/customerRequestV2PreparedAction.ts` | ~503 | Prepared-action material digest query + `prepare` mutation (options from released egress) |

Pure decision helpers already live outside these hosts and MUST remain the authority
(do not re-encode):

| Concern | Pure home | Role |
|---------|-----------|------|
| Action preparation project / authorize | `src/modules/customer-request/action-preparation.ts` | Lineage, disclosure review, authority reservation, `needs_authority` / `ready_for_routing` kinds |
| Preparation authority / disclosure | `src/modules/customer-request/preparation-authority.ts`, `preparation.ts` | Authority verification and disclosure release semantics (legacy + shared vocabulary) |
| Prepared action compile | `src/modules/customer-request/prepared-action-v2.ts` | `compilePreparedActionOptions` and prepared-action digests / recovery reasons |
| Application orchestration (callers) | `application/authorize-preparation/`, `application/preparation-egress/`, `application/compare-resume/` | UX seams that already `runMutation` / `runAction` / `runQuery` the Convex prep exports via Application ports |

**Wave 45 correctness-critical surfaces** (first slice — preparation host only):

| Export | Host | Kind | Role |
|--------|------|------|------|
| `prepare` | `customerRequestV2Preparation.ts` (~`:65`) | `internalMutation` | Command-key idempotent durable preparation store; aggregate revision / graph / authority gates; conflict and needs-attention kinds |
| `resume` | same (~`:245`) | `internalQuery` | Resume current preparation by ref; `current` / `not_found` / `stale` |

**Wave 46 correctness-critical surfaces** (egress + prepared-action slice):

| Export | Host | Kind | Role |
|--------|------|------|------|
| `run` / `resume` / `resumeRequest` / `reconcile` | `customerRequestV2PreparationEgress.ts` | `internalAction` | Orchestrate allocation + guarded HTTP dispatch + resolve / reconcile against egress state |
| `allocate` / `beginDispatch` / `resolveDispatch` / `reconcileUncertain` | `customerRequestV2PreparationEgressState.ts` | `internalMutation` | Durable egress command + operation + exposure ledger; dispatch lease; terminal resolve; uncertain reconcile |
| `status` / `unresolvedForRequest` / `openReconciliation` | same | `internalQuery` | Worker / resume readbacks used by egress actions |
| `preparationMaterialDigest` | `customerRequestV2PreparedAction.ts` | `internalQuery` | Terminal material digest over preparation + egress operations |
| `prepare` | same | `internalMutation` | Idempotent prepared-action store or recovery; option compile from released operations |

Callers today (must keep working through the **same Convex export identities**):

- Application authorize-preparation → `internal.customerRequestV2Preparation.prepare` (+ egress / prepared-action via Application ports)
- Application preparation-egress / compare-resume → egress actions + prepared-action prepare / material digest + preparation resume / egress status
- Egress actions → egress-state mutations/queries via `ctx.runMutation` / `ctx.runQuery`
- Integration suites call the public prep / egress / prepared-action exports directly

CONCERNS and the campaign hard bans forbid:

1. **Shallow Convex sibling chops** — e.g. `customerRequestV2PreparationPrepare.ts` without module ports.
2. **Write-plan DTOs in pure modules** — `WritePlan` / `intendedPatches` / patch arrays.
3. **Reopening ADR-014** — do not grow `CustomerRequestV2WritePorts` / `v2-write/` / `customerRequestV2WritePorts.ts` to absorb preparation.
4. **Parallel compilers** — do not invent a second Customer Request compile path for preparation.

Wave 44’s design half is this ADR. Waves 45–46 implement under these constraints.

## Decision

### 1. Two dedicated port families (Waves 45 then 46) — not one mega-adapter

Preparation and egress/prepared-action share vocabulary but differ in transaction shape
(mutation/query vs node action + HTTP + leased dispatch). They SHALL deepen as **two** port
families under this ADR:

| Wave | Ports type | Adapter file | Factory | Hosts deepened |
|------|------------|--------------|---------|----------------|
| **45** | `CustomerRequestV2PreparationPorts` | `convex/customerRequestV2PreparationPorts.ts` | `customerRequestV2PreparationPorts(ctx)` | `customerRequestV2Preparation.ts` only |
| **46** | `CustomerRequestV2PreparationEgressPorts` | `convex/customerRequestV2PreparationEgressPorts.ts` | `customerRequestV2PreparationEgressPorts(ctx)` | `customerRequestV2PreparationEgress.ts`, `customerRequestV2PreparationEgressState.ts`, `customerRequestV2PreparedAction.ts` |

**Locked names** — use exactly these identifiers. Do not invent synonyms
(`PrepPorts`, `V2PrepMutationPorts`, `EgressStatePorts`, etc.).

**Stop condition:** if either adapter approaches ~1k lines mid-wave, split **reconstruction /
integrity helpers** into a second file under **this same ADR** — do not open V2 read-projection
deepen, and do not fold helpers into `customerRequestV2WritePorts.ts`.

### 2. Wave 45 — deepen preparation host behind PreparationPorts

Wave 45 SHALL deepen `prepare` and `resume` so that:

1. Host exports remain the sole public registrations (same names, same
   `internal.customerRequestV2Preparation.*` paths). `prepare` stays `internalMutation`;
   `resume` stays `internalQuery`.
2. Handler bodies become thin: validate args (host validators), construct preparation ports,
   call one module machine function, return its result.
3. Orchestration lives under `src/modules/customer-request/` (illustrative `v2-preparation/`),
   **reusing** `action-preparation.ts`, `preparation.ts`, and existing evaluation / runtime
   digest helpers — not duplicating authorize/project formulas.
4. Persistence, aggregate head reads, capability-supply / contract reads for graph validation,
   and authority-reservation reads/writes go only through **CustomerRequestV2PreparationPorts**,
   implemented by `convex/customerRequestV2PreparationPorts.ts`.

**Do not** invent a parallel Customer Request compiler or re-thicken Application
`authorizePreparation` / compare-resume actions.

### 3. Wave 46 — deepen egress + prepared-action behind PreparationEgressPorts

Wave 46 SHALL deepen the egress action host, egress-state host, and prepared-action host so that:

1. All listed Convex exports remain the sole public registrations (same names/paths and
   function kinds: actions stay actions; mutations stay mutations; queries stay queries).
2. Handler bodies become thin: host validators → construct **CustomerRequestV2PreparationEgressPorts**
   → one module orchestration function → return result.
3. Orchestration lives under `src/modules/customer-request/` (illustrative `v2-preparation-egress/`
   or co-located under the same prep cluster with a clear egress subfolder), **reusing**
   `prepared-action-v2.ts`, `action-preparation.ts`, and `preparation.ts`.
4. Durable egress command/operation/exposure ledger, dispatch lease begin/resolve/reconcile,
   status/readback queries, prepared-action command/store/recovery, and **guarded HTTP dispatch**
   go only through **CustomerRequestV2PreparationEgressPorts**.
5. Shared integrity / authority helpers today imported across
   `customerRequestV2PreparedAction.ts` ← `customerRequestV2PreparationEgressState.ts`
   SHALL move to module-visible helpers or ports methods — machines MUST NOT import Convex
   egress-state host internals, and WritePorts MUST NOT absorb them.

Egress `internalAction` orchestration may keep calling the **same** egress-state /
prepared-action Convex export identities via ports (or via thin host shells that themselves
delegate to machines). Do not replace that seam with Application calling machines directly.

### 4. No parallel compiler; no Application re-thickening

Waves 45–46 MUST keep Application action ports as the seam that continues to
`ctx.runMutation` / `ctx.runAction` / `ctx.runQuery` the public prep / egress / prepared-action
exports, and MUST NOT create a second compiler or fold prep machines into Application modules.

Application `authorize-preparation` and `preparation-egress` thinness locks remain: those
modules stay free of Convex prep host imports and dual-compiler tokens.

### 5. No `WritePlan` / `intendedPatches` in preparation modules

Ports expose **semantic, immediately executed** operations (load aggregate, store preparation,
allocate egress operations, begin/resolve dispatch, compile/store prepared action, etc.).
Thinness tests SHALL forbid write-plan DTO tokens and Convex runtime under the preparation
module homes.

### 6. Convex validators stay in the preparation hosts forever

All `v.*` validators for Wave 45–46 exports remain in their respective Convex host files:

- `convex/customerRequestV2Preparation.ts`
- `convex/customerRequestV2PreparationEgress.ts`
- `convex/customerRequestV2PreparationEgressState.ts`
- `convex/customerRequestV2PreparedAction.ts`

Do not relocate validators into `src/modules`.

### 7. Preserve atomicity, integrity digests, conflicts, authority, and egress lease semantics

- Within a single mutation/query handler invocation, all port-backed reads and writes share the
  same Convex transaction (`MutationCtx` / `QueryCtx`).
- Replay, conflict kinds, integrity throws, capability-graph currency, authority-reservation
  alignment, egress allocation limits, dispatch lease windows, and prepared-action recovery
  kinds MUST match pre-deepen semantics.
- Egress HTTP remains network-guarded (public-target / DNS / timeout posture as today). Do not
  weaken SSRF guards while extracting orchestration.
- Waves 45–46 do **not** retire legacy aggregates/compilers and do **not** change ADR-014 write
  semantics.

### 8. Forbid shallow Convex sibling chops; ADR-014 write untouched

Rejected: `customerRequestV2PreparationPrepare.ts`, `customerRequestV2EgressAllocate.ts`,
`customerRequestV2PreparedActionPrepare.ts`, or any pass-through mutation/action host sibling
without module ports.

Allowed Convex growth: thin `customerRequestV2PreparationPorts.ts`, thin
`customerRequestV2PreparationEgressPorts.ts`, plus the existing four host registers.

**Explicitly forbidden:** extending `CustomerRequestV2WritePorts`, editing `v2-write/` machines
for prep work, or relocating prep orchestration into `customerRequestV2WritePorts.ts`.

### 9. How callers use the seam

**Call sites do not change.**

```text
Application authorize-preparation / compare-resume
  → ctx.runMutation(internal.customerRequestV2Preparation.prepare, args)
      → host validator + customerRequestV2PreparationPorts(ctx)
      → v2-preparation.prepare(args, ports)          // Wave 45
      → result

Application preparation-egress / compare-resume
  → internal.customerRequestV2PreparationEgress.run | resume | resumeRequest | reconcile
      → host validator + customerRequestV2PreparationEgressPorts(ctx)
      → v2-preparation-egress.*(args, ports)         // Wave 46
      → (ports may runMutation allocate / beginDispatch / resolve / reconcileUncertain)
      → result

  → internal.customerRequestV2PreparedAction.prepare | preparationMaterialDigest
      → v2-preparation-egress.* via CustomerRequestV2PreparationEgressPorts
```

Application MUST NOT import preparation/egress machines or construct these ports.
Machines MUST NOT import Convex `_generated` or host files.

### 10. Status and wave gating

**Status: Accepted.** This ADR is the design unlock for Waves 45–46.

| Wave | Allowed work |
|------|----------------|
| **44 (this ADR)** | Design only; CONCERNS pointer; **no** machine/port code in the ADR-only commit |
| **45** | Implement `CustomerRequestV2PreparationPorts` + machines + adapter; thin `customerRequestV2Preparation.ts` shells; thinness locks; integration green |
| **46** | Implement `CustomerRequestV2PreparationEgressPorts` + machines + adapter; thin egress / egress-state / prepared-action shells; thinness locks; integration green |
| **47+** | Out of this ADR (V2 read projections, mandate issue/revoke, outbox reopen, legacy retirement) |

**Out of Waves 44–46:** V2 read projections (`getCurrentAggregate`, …), ADR-014 write reopen,
Application validator relocation, notification-outbox families, route-execution Journal /
Dispatch growth, legacy compiler retirement, public claim changes.

**Deletion tests**

- **Wave 45 exit:** removing preparation orchestration from `customerRequestV2Preparation.ts`
  must concentrate that complexity in the module preparation cluster + PreparationPorts adapter
  (or fail tests). A Convex sibling chop without ports fails this test.
- **Wave 46 exit:** removing egress / prepared-action orchestration from the three egress-related
  hosts must concentrate that complexity in the module egress cluster + PreparationEgressPorts
  adapter (or fail tests).

## Consequences

### Easier

- Waves 45–46 shrink prep / egress / prepared-action glue without write-plan DTOs or sibling chops.
- Prepare / resume / allocate / dispatch / prepared-action become testable with port fakes while
  production atomicity stays one mutation (and egress actions keep the same export seam).
- Existing `action-preparation`, `preparation`, and `prepared-action-v2` predicates remain
  decision authority.
- ADR-014 write adapter stays closed and below ceiling pressure.

### Harder / constrained

- Two adapters under one ADR — implementers must not merge Wave 45+46 into WritePorts or a
  single 2k-line adapter.
- Egress HTTP + lease semantics must stay ports-mediated without leaking Undici / Convex action
  types into pure module homes (network I/O behind ports).
- Shared integrity helpers spanning egress-state and prepared-action need an explicit home
  (module helper or ports method) to avoid cross-host imports after deepen.
- Application thinness tests already forbid hosting egress in Application modules — keep that.

### Explicit non-goals

- Moving V2 read projections in the same waves.
- Changing Application public behavior or Convex function paths.
- Retiring legacy aggregates / compilers.
- Growing `CustomerRequestV2WritePorts` or route-execution ports to absorb preparation.
- Relitigating ADR-014 write decisions.
- Synonym names — lock the two ports types and two adapter filenames above.

## Rejected alternatives

### A. Split hosts into shallow Convex siblings (`…Prepare.ts` / `…Allocate.ts`)

Rejected: shallow pass-through; CONCERNS hard ban; fails deletion test.

### B. Return `WritePlan` / `intendedPatches` from modules

Rejected: pollutes pure modules; multi-step apply risk; thinness bans.

### C. Move validators into `src/modules`

Rejected: validators stay in the Convex prep / egress / prepared-action hosts forever.

### D. Invent a parallel compiler for preparation

Rejected: one canonical Customer Request path; duplicate authorize/project/compile formulas are a
known failure mode.

### E. Application calls preparation/egress machines directly (bypass mutations/actions)

Rejected: breaks transactional atomicity, egress action authority, and existing Application port
seams (`AuthorizePreparationPorts` / preparation-egress ports).

### F. Fold preparation into `CustomerRequestV2WritePorts` / `v2-write/`

Rejected: ADR-014 explicitly parked prep; WritePorts already ~856 and must stay closed; wrong
command/table set.

### G. One mega `CustomerRequestV2PreparationPorts` covering all four hosts in Wave 45

Rejected: egress is action+HTTP+lease; preparation is mutation/query. Locked plan slices Wave 45
(prep host) then Wave 46 (egress + prepared-action) with a dedicated egress ports type.

### H. Separate ADRs for egress vs preparation

Rejected for this band: WAVES-43–49 and the locked plan treat Waves 44–46 as one preparation
family under one design unlock; two implement waves, one ADR.

### I. Deepen reads + preparation + write reopen in one wave

Rejected: one family per implement wave; write family closed.

### J. Implement Waves 45–46 without Accepted ADR-016

Rejected: design unlock required before prep / egress move.

### K. Relocate network fetch into pure modules without a port

Rejected: SSRF guard / Undici agent / credential material belong behind egress ports, not in
decision modules.

### L. Retire legacy preparation paths as part of the deepen

Rejected: product/migration gate, not a ports deepen.

## Verification expectations (Waves 45–46, not the ADR-only commit)

### Wave 45

1. Host still exports `prepare` / `resume`; bodies delegate via `CustomerRequestV2PreparationPorts`.
2. Preparation-module home free of write-plan tokens and Convex runtime.
3. Thinness: thin handlers; PreparationPorts adapter `<= 1000` lines; no prep sibling host chops.
4. Integration suites stay green (authorize-preparation, preparation replay/conflict/integrity,
   graph / authority refusal paths as covered today).
5. Replay / conflict / integrity / graph / authority semantics match pre-deepen.
6. Application ports still only invoke the public Convex prep exports.
7. ADR-014 write hosts/adapters and V2 read handlers untouched.
8. `npm run check:convex-codegen` green; Wave 45 deletion test passes.

### Wave 46

1. Egress / egress-state / prepared-action exports remain; bodies delegate via
   `CustomerRequestV2PreparationEgressPorts`.
2. Egress-module home free of write-plan tokens and Convex runtime; HTTP only via ports.
3. Thinness: thin handlers; EgressPorts adapter `<= 1000` lines (or helper split under this ADR);
   no egress/prepared-action sibling host chops.
4. Integration suites stay green (egress run/resume/reconcile, prepared-action prepare/recovery,
   material digest, lease/uncertain paths as covered today).
5. Allocation limits, authority alignment, lease windows, integrity throws, and recovery kinds
   match pre-deepen.
6. Application preparation-egress / compare-resume still only invoke the public Convex exports.
7. PreparationPorts (Wave 45) and WritePorts remain closed — no bleed.
8. `npm run check:convex-codegen` green; Wave 46 deletion test passes.

## Decision record

Accepted 2026-07-18 as Wave 44 design unlock. Waves 45–46 implement under this ADR only.
ADR-014 remains authority for the V2 **write** residual and is not amended. ADR-015 remains
authority for notification-outbox operator deepen and is not amended. This document covers the
Customer Request V2 **preparation** residual (prepare/resume, then egress/prepared-action).
V2 read projections, mandate issue/revoke, and legacy retirement require later ADRs.
