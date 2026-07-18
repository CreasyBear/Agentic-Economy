---
# ADR-012: Cancel and problem mutation ports for route-execution
Status: Accepted
Date: 2026-07-18
Scope: Wave 33 design unlock for Wave 33 cancel machines and Wave 34 problem mutation family; residual host authority on `convex/customerRequestRouteExecution.ts` after ADR-011
Supersedes: nothing
Related: `.planning/adr/ADR-011-journal-write-plan-ports.md` (start / lease / outcome; deferred cancel); `.planning/codebase/CONCERNS.md` (cancel / problem host residual); `tests/unit/customer-request/route-execution/machines-thinness.test.ts`; `tests/unit/customer-request/route-execution/journal-thinness.test.ts`; gold deepen pattern (provide-facts ports + ADR-011 journal machines)

## Context

ADR-011 deepened route-execution **start / lease / outcome** behind `JournalMutationPorts` and
`src/modules/customer-request/route-execution/machines/`. Host exports
`startOrResume`, `leaseNextDispatch`, and `recordOutcome` are thin shells. ADR-011 explicitly
deferred cancel, recover, mark, and open helpers as non-goals for that wave.

Cancel and problem **predicates** already live in pure modules:

| Concern | Pure home | Role |
|---------|-----------|------|
| Cancel / recover decisions | `route-execution/journal/` (`decisions.ts` and peers) | `canPreReleaseCancel`, `canRequestAdapterCancellation`, `cancelDisposition`, command conflict/replay helpers, recover lease decisions |
| Problem commands / projections | `route-execution/problem-support/` | `decideCustomerProblemReport`, business claim / support status / reply decisions, support projections |

Three correctness-critical **cancel** surfaces remain host-owned:

| Export | Host | Role |
|--------|------|------|
| `cancelCurrent` | `convex/customerRequestRouteExecution.ts` (~`:153`) | Idempotent cancel command; pre-release patch vs adapter-cancel schedule |
| `openCancellationAttempt` | same (~`:344`) | `internalQuery`: bind pending cancel → supply/mandate invocation |
| `resolveCancellationAttempt` | same (~`:406`) | Record adapter disposition; may cancel run or advance / mark unknown |

Host-private helper used by resolve (must move with the machines, not remain an opaque host blob):

| Helper | Host | Role |
|--------|------|------|
| `resolveCancellationCommand` | same (~`:1510`) | Patch pending cancel-command result for the run |

Problem **mutation** family remains host-owned (Application `problem-route/` +
`customerRequestProblemRoutePorts.ts` are already thin for **actions** only):

| Export | Host | Role |
|--------|------|------|
| `reportProblem` | `convex/customerRequestRouteExecution.ts` (~`:699`) | Customer problem report + idempotent replay |
| `recordProblemBusinessReport` | same (~`:952`) | Owner/business claim |
| `updateProblemStatus` | same (~`:1054`) | Support/admin status update |
| `replyProblem` | same (~`:1115`) | Customer reply append |
| `exportProblemForSupport` (optional thin) | same (~`:1336`) | Fat support export query — thin if ports stay under 1k |

Callers today (must keep working through the same Convex export identities):

- Application / cancel-route actions → `internal.customerRequestRouteExecution.cancelCurrent`
- `convex/customerRequestRouteCancellationWorker.ts` → `openCancellationAttempt` then
  `resolveCancellationAttempt`
- Application problem-route actions → `reportProblem` / business / support / reply mutations

CONCERNS and the campaign hard bans forbid two failure modes that look like progress but are not:

1. **Shallow Convex sibling chops** — splitting the host into
   `customerRequestRouteExecutionCancel.ts` / `…Problem.ts` without a designed seam.
2. **Write-plan DTOs in pure modules** — introducing `WritePlan`, `intendedPatches`, or patch
   arrays into `journal/` or `machines/`.

`JournalMutationPorts` / `customerRequestRouteExecutionJournalPorts.ts` already approach the
~1k-line ports-adapter ceiling. Growing that type with cancel and problem commits would
concentrate unrelated tables and auth matrices into one mega-port and block further outcome
splits (Wave 35). Cancel and problem therefore need **dedicated** port families.

Wave 33’s design half is this ADR. This ADR does **not** move machine code by itself. Wave 33
implements cancel under these constraints; Wave 34 implements problem under the same ADR.

## Decision

### 1. Dedicated CancelMutationPorts (Wave 33) — do not grow JournalMutationPorts

Wave 33 SHALL deepen `cancelCurrent`, `openCancellationAttempt`, and
`resolveCancellationAttempt` so that:

1. The Convex host exports remain the sole public registrations (same names, same
   `internal.customerRequestRouteExecution.*` paths). `openCancellationAttempt` stays an
   `internalQuery`; the other two stay `internalMutation`.
2. Handler bodies become thin: validate args (host validators), construct cancel ports, call one
   module machine function, return its result.
3. Orchestration (idempotency, head/attempt/outbox integrity, pre-release vs adapter-cancel
   branching, resolve disposition, digest consistency) lives in module code under
   `src/modules/customer-request/route-execution/machines/`, **outside** the pure `journal/`
   package.
4. Persistence, supply/mandate reads for open, and scheduling go only through an explicit
   **CancelMutationPorts** type implemented by a thin Convex adapter such as
   `convex/customerRequestRouteExecutionCancelPorts.ts`.

**Do not** extend `JournalMutationPorts` with cancel-family commits for this deepen.
`cancelPriorUnreleasedRun` (and similar start-path helpers already on journal ports) may remain
where they are; new cancel-command / cancellation-attempt surfaces belong on
`CancelMutationPorts`.

`resolveCancellationCommand` SHALL become a module-visible helper (or a private ports method used
only by resolve machines) — not a free-standing host orchestration blob that machines cannot
call without Convex.

Suggested module layout (illustrative, not a file-move mandate):

```text
src/modules/customer-request/route-execution/
  journal/                    # EXISTING — predicates / integrity / cancel decisions ONLY
  problem-support/            # EXISTING — problem decide* / project* ONLY
  machines/
    ports.ts                  # EXISTING JournalMutationPorts (start / lease / outcome)
    cancel-ports.ts           # NEW — CancelMutationPorts (semantic ops, no Convex types)
    cancel-current.ts         # NEW — cancelCurrent orchestration
    cancel-open-attempt.ts    # NEW — openCancellationAttempt orchestration
    cancel-resolve-attempt.ts # NEW — resolveCancellationAttempt (+ resolveCancellationCommand)
    …                         # existing start / lease / outcome
convex/
  customerRequestRouteExecution.ts                 # validators + thin shells
  customerRequestRouteExecutionJournalPorts.ts     # EXISTING — do not absorb cancel family
  customerRequestRouteExecutionCancelPorts.ts      # NEW — MutationCtx/QueryCtx → CancelMutationPorts
```

Pure `journal/` continues to supply cancel decision helpers. Machines **import** journal;
journal MUST NOT import machines or ports adapters.

Illustrative cancel ports shape (semantic, immediately executed):

```ts
type CancelMutationPorts = Readonly<{
  now: () => number
  // reads — domain snapshots / plain records, never Doc<> in the type surface
  loadPriorCancelCommand: (...) => Promise<PriorCancelCommand | null>
  loadRunHead: (...) => Promise<RunHeadSnapshot | null>
  loadRunByRef: (...) => Promise<RunRecordSnapshot | null>
  loadAttemptAtPosition: (...) => Promise<AttemptRecordSnapshot | null>
  loadDispatchByAttemptRef: (...) => Promise<DispatchRecordSnapshot | null>
  loadCancellationAttempt: (...) => Promise<CancellationAttemptSnapshot | null>
  loadRunProjection: (...) => Promise<RunProjection | null>
  // open-path reads (mandate / eligible supply) as domain snapshots
  loadActiveMandateForPrincipal: (...) => Promise<MandateLoadResult>
  loadEligibleExactCapabilitySupply: (...) => Promise<SupplySnapshot | Unavailable>
  // ...

  // commits — each method performs its writes inside the caller's MutationCtx transaction
  commitCancelCommandReplay: (...) => Promise<CancelResult>
  commitPreReleaseCancel: (...) => Promise<CancelResult>  // attempt+outbox+run + command
  commitPendingAdapterCancellation: (...) => Promise<CancelResult> // attempt row + schedule worker
  commitCancelDispositionOnly: (...) => Promise<CancelResult>
  commitCancellationResolved: (...) => Promise<ResolveResult>
  resolveCancellationCommand: (...) => Promise<void>  // or private helper behind ports
  queueNextStepAfterRejectedCancel: (...) => Promise<boolean>
  markUnknownAfterRejectedCancel: (...) => Promise<void>
  // ...
}>
```

### 2. Problem family behind ProblemMutationPorts (Wave 34, same ADR)

Wave 34 SHALL deepen durable problem mutations under the same rules as cancel:

1. Host keeps `internalMutation` / `internalQuery` export identities and validators.
2. Orchestration lives in module machines (or a `machines/problem-*.ts` cluster) that call
   existing `problem-support/` `decide*` / `project*` helpers.
3. Persistence and auth-resolved snapshots go through **ProblemMutationPorts**, implemented by a
   thin Convex adapter (e.g. `convex/customerRequestRouteExecutionProblemPorts.ts` or a clearly
   named sibling under the same deepen pattern).

Minimum Wave-34 extract set:

- `reportProblem`
- `recordProblemBusinessReport`
- `updateProblemStatus`
- `replyProblem`

Prefer also thinning `exportProblemForSupport` when the adapter stays under the ~1k-line
ports-file ceiling.

**Auth stays at the Convex edge:** admin/owner Clerk (or equivalent) resolution is host-injected
via ports methods that return domain authority snapshots. Machines MUST NOT import Clerk or
Convex auth APIs.

Application `problem-route/` and `customerRequestProblemRoutePorts.ts` remain the action-layer
seam; Wave 34 MUST NOT re-embed durable mutation orchestration into Application actions.

Do **not** fold problem commits into `JournalMutationPorts` or `CancelMutationPorts`.

### 3. No `WritePlan` / `intendedPatches` in `journal/` or `machines/`

The pure journal module and all route-execution machines MUST remain free of:

- identifiers `WritePlan`, `writePlan`, `intendedPatches`
- Convex runtime (`MutationCtx`, `Doc<>`, `_generated`, `convex/server`)
- patch-list DTOs that describe intended DB rows for a later apply step

**Why:** same as ADR-011 — encoding durable writes as a portable plan tempts multi-step apply,
digest desync, and duplicated sequences across sibling hosts.

**Instead:** Cancel and problem ports expose **semantic, immediately executed** operations.
Private staging types inside `machines/` (if needed) MUST NOT use the forbidden names, MUST NOT
be exported into `journal/` or `problem-support/`, and MUST NOT cross a mutation boundary.

Thinness tests SHALL keep forbidding write-plan DTO tokens under `journal/` and `machines/`.
Wave 33/34 MAY extend `machines-thinness.test.ts` (and add `problem-mutation-thinness` if needed)
without weakening those bans.

### 4. Convex validators stay in the host forever

Cancel and problem `v.*` argument/return validators remain in
`convex/customerRequestRouteExecution.ts` (or a Convex-local validator module imported only by
Convex hosts). They MUST NOT move into `src/modules/**`.

Module machine functions take TypeScript domain inputs/results. The host is the anti-corruption
layer: `Infer<typeof …>` ↔ module types at the handler edge only.

### 5. Preserve cancel atomicity, integrity digests, and worker boundaries

Within a single handler invocation:

- All port-backed reads and writes for that export share the same `MutationCtx` / transaction
  (or the same `QueryCtx` for `openCancellationAttempt`).
- Pre-release cancel MUST keep attempt, outbox, and run state consistent before returning
  `cancelled`.
- Adapter-cancel pending path MUST insert the cancellation attempt (when missing) and schedule
  `customerRequestRouteCancellationWorker` only when appropriate — no double-schedule on replay.
- Resolve accept MUST keep cancellation attempt, cancel command, attempt, and run digests /
  states consistent; reject paths that advance or mark unknown MUST reuse existing
  `queueNextStep` / `markUnknownOutcome` semantics (via ports), not fork new formulas.
- Integrity failures continue to throw named integrity errors rather than soft-success.

Machines MAY call pure journal / problem-support helpers before committing. Ports MUST NOT invent
alternate digest formulas.

Intentional cross-mutation scheduling (`scheduler.runAfter` → cancellation worker) remains
allowed as a **side effect after** durable rows for that mutation are consistent — not as a
substitute for splitting one logical cancel across two mutations.

### 6. Forbid shallow Convex sibling chops

The following are **out of scope and rejected** as deepen substitutes:

- `convex/customerRequestRouteExecutionCancel.ts`
- `convex/customerRequestRouteExecutionProblem.ts`
- any similarly named pass-through that only relocates mutation/query exports without module ports

Allowed Convex surface growth: thin `*CancelPorts.ts` / `*ProblemPorts.ts` adapters plus the
existing host register. Multiple machine files under `src/modules/.../machines/` are encouraged;
multiple Convex mutation-host siblings for these exports are not.

### 7. How callers use the seam

**Call sites do not change.** Deepening is invisible to Application and the cancellation worker:

```text
Application / cancel-route
  → ctx.runMutation(internal.customerRequestRouteExecution.cancelCurrent, args)
      → host validator + cancelMutationPorts(ctx)
      → machines.cancelCurrent(args, ports)          // Wave 33
      → result

CancellationWorker.run
  → ctx.runQuery(...openCancellationAttempt, { cancellationRef })
      → machines.openCancellationAttempt(...)
  → (adapter invoke — existing)
  → ctx.runMutation(...resolveCancellationAttempt, { cancellationRef, observation })
      → machines.resolveCancellationAttempt(...)

Application problem-route actions
  → ctx.runMutation(...reportProblem | recordProblemBusinessReport | …)
      → machines.problem*(...) via ProblemMutationPorts   // Wave 34
```

Rules for callers:

- Application and cancellation worker MUST NOT import cancel/problem machines or construct their
  ports themselves.
- They MUST NOT call port methods directly or open a second mutation to “apply” work that
  belongs inside cancel/resolve/problem exports.

### 8. Status and wave gating

**Status: Accepted.** This ADR is the design unlock for Waves 33–34.

| Wave | Allowed work |
|------|----------------|
| 33 (design half = this ADR) | Design only until ADR lands; then implement cancel machines + CancelMutationPorts; extend thinness tests; **no** machine code in the ADR-only commit |
| 34 | Implement ProblemMutationPorts + problem machines; keep Application action ports as-is; thinness locks |
| 35+ | Outside this ADR’s extract set (e.g. `commitSucceededOutcome` split) — may share practices but not this decision record’s scope |
| Until 33/34 land | Cancel/problem bodies remain host-exported; predicate changes continue via `journal/` / `problem-support/` only |

**Out of Waves 33–34 unless trivially co-located without expanding scope:**
`recoverExpiredDispatch`, `markDispatched`, `recordNotReleased`, `markAccepted`,
`openLeasedDispatch`. Prefer a later ADR or wave if they need the same deepen.

## Consequences

### Easier

- Waves 33–34 can shrink `customerRequestRouteExecution.ts` without inventing write-plan DTOs,
  sibling host files, or a bloated `JournalMutationPorts`.
- Cancel sequencing stays testable with port fakes while production atomicity stays a single
  Convex mutation/query.
- Problem deepen reuses pure `problem-support/` decisions without pulling Clerk into modules.
- Pure `journal/` and `problem-support/` remain decision libraries with clear purity contracts.

### Harder / constrained

- Implementers cannot “finish” the residual with a mechanical Cancel/Problem file split.
- Three port families (journal / cancel / problem) require discipline at the host wiring edge.
- Validators and Convex `Doc`/`Id` types stay host-side forever, so mapping boilerplate remains
  at adapter edges.
- Cancel open-path supply/mandate reads must be expressed as domain snapshots on ports, not
  leaked `Doc<>` types into machines.

### Explicit non-goals

- Moving recover / markDispatched / openLeasedDispatch in the same waves (unless trivially
  shared as private port helpers without changing their export hosts).
- Changing Application or cancellation-worker public behavior or Convex function paths.
- Relitigating ADR-011 start/lease/outcome machines or already-pure journal / problem-support
  predicates.
- Growing `JournalMutationPorts` past the ~1k-line adapter ceiling to absorb cancel/problem.

## Rejected alternatives

### A. Extend ADR-011 / `JournalMutationPorts` to include cancel and problem

Rejected: ADR-011 deferred cancel by design; journal ports already near the size ceiling;
problem brings a different auth matrix and table set. A dedicated ADR keeps the decision
auditable and the port surfaces separable.

### B. Split host into `…Cancel.ts` / `…Problem.ts` Convex siblings

Rejected: shallow pass-through; duplicates write sequences; fails CONCERNS hard ban; does not
create a portable seam.

### C. Return `WritePlan` / `intendedPatches` from journal or machines for the host to apply

Rejected: pollutes pure modules; encourages multi-step apply; thinness tests forbid these tokens;
high risk of digest/state desync on cancel resolve and problem appends.

### D. Move validators into `src/modules` with the machines

Rejected: Convex validators are a host concern; campaign rule is “validators stay in Convex
forever.”

### E. Have Application / cancellation worker call module machines directly (bypass mutations)

Rejected: would break transactional atomicity, Node/`"use node"` bundling boundaries, and the
internalMutation / internalQuery authority boundary.

### F. Deepen cancel and problem in one implementation wave without an ADR

Rejected: CONCERNS asks for a dedicated ADR when cancel/problem scope expands; cancel-first then
problem reduces review risk while sharing one decision record.

## Verification expectations (Waves 33–34, not the ADR-only commit)

When cancel machines move (Wave 33):

1. Host still exports `cancelCurrent`, `openCancellationAttempt`, `resolveCancellationAttempt`;
   bodies delegate to machines via `CancelMutationPorts`.
2. `journal/` and `machines/` remain free of write-plan DTO tokens and Convex runtime.
3. `machines-thinness.test.ts` / `journal-thinness.test.ts` updated for thin cancel handlers
   (today’s journal-thinness may still expect cancel helpers inline until Wave 33 updates it).
4. Integration suite `tests/integration/customer-request-v2-multi-capability-route.test.ts`
   stays green for cancel / adapter-cancel / resolve paths.
5. No new Convex files named `*Cancel.ts` / `*Problem.ts` for these hosts.
6. `npm run check:convex-codegen` remains green (ports adapters must not pull `node:` into
   mutation/query graphs).
7. Cancel ports adapter stays under the campaign ~1k-line ceiling.

When problem machines move (Wave 34):

1. Same thinness / no-WritePlan / no-sibling-chop rules for the problem extract set.
2. `problem-support.test.ts` and problem integration cases stay green.
3. Auth resolution remains host-injected via ports; machines stay free of Clerk/Convex auth APIs.
4. Application `problem-route/` action thinness is preserved (not re-thickened).

## Decision record

Accepted 2026-07-18 as Wave 33 design unlock. Cancel implementation is gated to Wave 33 under
this ADR; problem mutation family to Wave 34 under the same ADR. ADR-011 remains the authority
for start / lease / outcome and is not amended — this document covers the cancel/problem residual
ADR-011 deferred.
