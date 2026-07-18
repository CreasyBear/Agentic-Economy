---
# ADR-013: Dispatch lifecycle ports for route-execution
Status: Accepted
Date: 2026-07-18
Scope: Wave 38 design unlock for Wave 39 recover / mark / openLeased dispatch lifecycle; residual host authority on `convex/customerRequestRouteExecution.ts` after ADR-011 and ADR-012
Supersedes: nothing
Related: `.planning/adr/ADR-011-journal-write-plan-ports.md` (start / lease / outcome; deferred recover/mark/open); `.planning/adr/ADR-012-route-cancel-problem-ports.md` (cancel / problem; same deferred set); `.planning/codebase/CONCERNS.md`; `.planning/codebase/WAVES-38-42-PLAN.md`; `tests/unit/customer-request/route-execution/machines-thinness.test.ts`; gold deepen pattern (provide-facts ports + ADR-011 journal machines)

## Context

ADR-011 deepened route-execution **start / lease / outcome** behind `JournalMutationPorts` and
`src/modules/customer-request/route-execution/machines/`. ADR-012 deepened **cancel** and
**problem** behind `CancelMutationPorts` / `ProblemMutationPorts`. Both ADRs explicitly deferred
the worker-facing **dispatch lifecycle** residual:

| Export | Host | Role |
|--------|------|------|
| `openLeasedDispatch` | `convex/customerRequestRouteExecution.ts` | `internalQuery`: materialize leased invocation for the transport worker |
| `recoverExpiredDispatch` | same | Lease expiry recovery — requeue vs `outcome_unknown` vs unchanged; may schedule `TransportWorker.runNext` |
| `markDispatched` | same | Post-prepare release mark (outbox delivered + attempt dispatched + run running) |
| `recordNotReleased` | same | Pre-release transport refuse — fail dispatch/attempt/run |
| `markAccepted` | same | Post-dispatch accept; replay-safe |
| `currentLeasedInvocation` | host-private helper | Shared by open + markDispatched lease gate (mandate / supply / publication) |

Recover / lease **predicates** already live in pure `route-execution/journal/` (`decisions.ts`
and peers): `recoverDispatchLeaseStillCurrent`, `recoverDispatchAttemptAligned`,
`recoverExpiredDispatchKind`, plus integrity helpers. Do not re-encode those decisions in the
host or invent alternate formulas in ports.

Callers today (must keep working through the same Convex export identities):

- `convex/customerRequestRouteTransportWorker.ts` → `openLeasedDispatch` → `markDispatched` /
  `recordNotReleased` → existing `recordOutcome`
- Lease grant path (ADR-011) already schedules `recoverExpiredDispatch`
- Integration suites call `markDispatched` / `markAccepted` / recover paths directly

`JournalMutationPorts` / `customerRequestRouteExecutionJournalPorts.ts` already sit at **~979**
lines — the campaign ~1k adapter ceiling. Growing that type (or Cancel/Problem ports) with
recover/mark/open would mix unrelated matrices and block further splits. Dispatch lifecycle
therefore needs a **dedicated** port family.

Wave 38’s design half is this ADR. This ADR does **not** move machine code by itself. Wave 39
implements under these constraints.

## Decision

### 1. Dedicated DispatchLifecyclePorts (Wave 39) — do not grow Journal / Cancel / Problem

Wave 39 SHALL deepen the five exports so that:

1. The Convex host exports remain the sole public registrations (same names, same
   `internal.customerRequestRouteExecution.*` paths). `openLeasedDispatch` stays an
   `internalQuery`; the other four stay `internalMutation`.
2. Handler bodies become thin: validate args (host validators), construct dispatch lifecycle
   ports, call one module machine function, return its result.
3. Orchestration lives in module code under
   `src/modules/customer-request/route-execution/machines/`, **outside** the pure `journal/`
   package.
4. Persistence, mandate/supply/publication reads for leased-open, and scheduling go only through
   an explicit **DispatchLifecyclePorts** type implemented by the locked thin Convex adapter
   `convex/customerRequestRouteExecutionDispatchPorts.ts`.

**Locked names**

- Ports type: `DispatchLifecyclePorts`
- Adapter file: `convex/customerRequestRouteExecutionDispatchPorts.ts`
- Factory: `dispatchLifecyclePorts(ctx)` (MutationCtx and/or QueryCtx as needed)

**Do not** extend `JournalMutationPorts`, `CancelMutationPorts`, or `ProblemMutationPorts` with
this family’s commits. Reuse of private Convex helpers already living in the journal adapter
file (e.g. `markUnknownOutcome`, `readRunProjection`) is allowed **inside** the Dispatch adapter
only — machines MUST NOT import Convex journal-port helpers, and the JournalPorts **public type
surface** MUST NOT grow to absorb this family.

`currentLeasedInvocation` SHALL become a module-visible shared helper (or a ports method used by
open + mark) — not an opaque host-only blob.

Suggested module layout (illustrative):

```text
src/modules/customer-request/route-execution/
  journal/                         # EXISTING — predicates / integrity ONLY
  machines/
    ports.ts                       # EXISTING JournalMutationPorts — do not absorb
    cancel-ports.ts                # EXISTING — do not absorb
    problem-ports.ts               # EXISTING — do not absorb
    dispatch-lifecycle-ports.ts    # NEW — DispatchLifecyclePorts
    recover-expired-dispatch.ts    # NEW
    mark-dispatched.ts             # NEW
    record-not-released.ts         # NEW
    mark-accepted.ts               # NEW
    open-leased-dispatch.ts        # NEW
    current-leased-invocation.ts   # NEW shared helper
convex/
  customerRequestRouteExecution.ts                 # validators + thin shells
  customerRequestRouteExecutionDispatchPorts.ts    # NEW adapter
```

Pure `journal/` continues to supply recover decision helpers. Machines **import** journal;
journal MUST NOT import machines or ports adapters.

Illustrative ports shape (semantic, immediately executed — Wave 39 may refine names):

```ts
type DispatchLifecyclePorts = Readonly<{
  now: () => number
  // reads — domain snapshots, never Doc<> on the type surface
  loadDispatchByRef: (...) => Promise<DispatchRecordSnapshot | null>
  loadAttemptByRef: (...) => Promise<AttemptRecordSnapshot | null>
  loadRunByRef: (...) => Promise<RunRecordSnapshot | null>
  loadRunProjection: (...) => Promise<RunProjection | null>
  // leased-open graph as domain snapshots
  loadActiveMandateForPrincipal: (...) => Promise<MandateLoadResult>
  loadEligibleExactCapabilitySupply: (...) => Promise<SupplySnapshot | Unavailable>
  loadPublicationAtRevision: (...) => Promise<PublicationSnapshot | null>

  // commits — each method performs its writes inside the caller's MutationCtx transaction
  commitDispatchRequeued: (...) => Promise<'requeued'>
  commitDispatchOutcomeUnknown: (...) => Promise<'outcome_unknown'>
  commitMarkDispatched: (...) => Promise<'recorded'>
  commitNotReleasedFailed: (...) => Promise<{ kind: 'failed'; run: RunProjection }>
  commitMarkAccepted: (...) => Promise<'recorded'>
}>
```

**Stop condition:** if the Dispatch adapter approaches ~1k lines mid-wave, split **read**
leased-open helpers into a second ports file under **this same ADR** — do **not** dump into
JournalPorts.

### 2. No `WritePlan` / `intendedPatches` in `journal/` or `machines/`

Same ban as ADR-011 / ADR-012. Ports expose **semantic, immediately executed** operations.
Thinness tests SHALL keep forbidding write-plan DTO tokens under `journal/` and `machines/`.
Wave 39 MAY extend `machines-thinness.test.ts` and/or add `dispatch-lifecycle-thinness.test.ts`.

### 3. Convex validators stay in the host forever

Dispatch lifecycle `v.*` argument/return validators remain in
`convex/customerRequestRouteExecution.ts`. They MUST NOT move into `src/modules/**`.

### 4. Preserve atomicity, integrity digests, and worker boundaries

Within a single handler invocation:

- All port-backed reads and writes share the same `MutationCtx` / `QueryCtx` transaction.
- Recover **requeue** MUST keep dispatch + attempt consistent **before** scheduling
  `customerRequestRouteTransportWorker.runNext`.
- Recover **outcome_unknown** MUST reuse existing `markUnknownOutcome` semantics via the
  adapter — not fork new formulas.
- `markDispatched` / `recordNotReleased` / `markAccepted` MUST preserve today’s refuse /
  replay / integrity-throw behavior.
- `openLeasedDispatch` remains query-only (no durable writes).

Intentional cross-mutation scheduling remains allowed as a **side effect after** durable rows
for that mutation are consistent.

### 5. Forbid shallow Convex sibling chops

Rejected as deepen substitutes:

- `convex/customerRequestRouteExecutionRecover.ts`
- `convex/customerRequestRouteExecutionDispatch.ts`
- `convex/customerRequestRouteExecutionMark.ts`
- any similarly named pass-through that only relocates exports without module ports

Allowed Convex surface growth: thin `customerRequestRouteExecutionDispatchPorts.ts` plus the
existing host register.

### 6. How callers use the seam

**Call sites do not change.** Deepening is invisible to the transport worker:

```text
TransportWorker.runNext
  → leaseNextDispatch              // ADR-011
  → openLeasedDispatch             // Wave 39 → machines via DispatchLifecyclePorts
  → recordNotReleased | markDispatched
  → recordOutcome                  // ADR-011

Scheduler / lease grant
  → recoverExpiredDispatch         // Wave 39 → machines via DispatchLifecyclePorts
```

Rules for callers:

- Transport worker MUST NOT import dispatch machines or construct their ports.
- It MUST NOT call port methods directly or open a second mutation to “apply” work that belongs
  inside these exports.

### 7. Status and wave gating

**Status: Accepted.** This ADR is the design unlock for Wave 39.

| Wave | Allowed work |
|------|----------------|
| 38 (this ADR) | Design only; CONCERNS pointer; **no** machine/port code in the ADR-only commit |
| 39 | Implement DispatchLifecyclePorts + machines + adapter; thin host shells; thinness locks; integration green |
| 40+ | Outside this ADR (e.g. `exportProblemForSupport` load, V2 write family) |

**Out of Waves 38–39:** `exportProblemForSupport` (Wave 40), V2 write family (ADR-014 / 41–42),
outbox webhook/retry, Application validators, reopening Waves 23–37.

## Consequences

### Easier

- Wave 39 can shrink `customerRequestRouteExecution.ts` without inventing write-plan DTOs,
  sibling host files, or a bloated `JournalMutationPorts`.
- Recover/mark/open stay testable with port fakes while production atomicity stays a single
  Convex mutation/query.
- Pure `journal/` recover predicates remain the decision authority.

### Harder / constrained

- Fourth port family (journal / cancel / problem / dispatch-lifecycle) requires wiring discipline.
- Leased-open supply/mandate/publication reads must be domain snapshots on ports, not `Doc<>`.
- Adapter may reuse journal-adapter private helpers without growing JournalPorts’ public type.

### Explicit non-goals

- Moving `exportProblemForSupport` or V2 write family in the same waves.
- Changing transport-worker public behavior or Convex function paths.
- Relitigating ADR-011 start/lease/outcome or ADR-012 cancel/problem.
- Growing `JournalMutationPorts` / Cancel / Problem past the ~1k ceiling to absorb this family.
- Synonym type/file names (`RecoverPorts`, `MarkMutationPorts`, `…LifecyclePorts.ts` alone) —
  lock `DispatchLifecyclePorts` + `customerRequestRouteExecutionDispatchPorts.ts`.

## Rejected alternatives

### A. Extend `JournalMutationPorts` / JournalPorts adapter

Rejected: ADR-011/012 deferred this set; JournalPorts at ~979; wrong matrix mix.

### B. Split host into `…Recover.ts` / `…Dispatch.ts` / `…Mark.ts` Convex siblings

Rejected: shallow pass-through; CONCERNS hard ban; no portable seam.

### C. Return `WritePlan` / `intendedPatches` from journal or machines

Rejected: pollutes pure modules; multi-step apply risk; thinness bans.

### D. Fold into CancelMutationPorts or ProblemMutationPorts

Rejected: wrong family; those deepens are closed.

### E. Move validators into `src/modules` with the machines

Rejected: validators stay in Convex forever.

### F. Have the transport worker call module machines directly (bypass mutations)

Rejected: breaks transactional atomicity, `"use node"` bundling boundaries, and the
internalMutation / internalQuery authority boundary.

### G. Implement Wave 39 without an Accepted ADR-013

Rejected: CONCERNS / WAVES-38-42 require a design unlock before recover/mark move.

## Verification expectations (Wave 39, not the ADR-only commit)

1. Host still exports the five functions; bodies delegate via `DispatchLifecyclePorts`.
2. `currentLeasedInvocation` is no longer a thick host-private blob.
3. `journal/` and `machines/` remain free of write-plan DTO tokens and Convex runtime.
4. Thinness tests assert thin handlers, adapter `<= 1000` lines, and Journal/Cancel/Problem
   ports did **not** absorb this family.
5. Integration recover/mark paths and journal recover cases stay green.
6. No new Convex files named `*Recover.ts` / `*Dispatch.ts` / `*Mark.ts` for these hosts.
7. `npm run check:convex-codegen` remains green.

## Decision record

Accepted 2026-07-18 as Wave 38 design unlock. Wave 39 implements under this ADR only.
ADR-011 remains authority for start / lease / outcome; ADR-012 for cancel / problem. This
document covers the recover / mark / open / `currentLeasedInvocation` residual both prior ADRs
deferred.
