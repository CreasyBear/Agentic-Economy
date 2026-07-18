---
# ADR-011: Journal mutation ports for route-execution start / lease / outcome
Status: Accepted
Date: 2026-07-18
Scope: Wave 27 design unlock for Wave 29 journal-machine deepen; god-file residual on `convex/customerRequestRouteExecution.ts`
Supersedes: nothing
Related: `.planning/codebase/CONCERNS.md` (journal write-plan / deferred machines); `tests/unit/customer-request/route-execution/journal-thinness.test.ts`; gold deepen pattern (provide-facts ports)

## Context

Route-execution **predicates**, integrity digests, evidence projection, and cancel/lease/recover
**decisions** already live in the pure module
`src/modules/customer-request/route-execution/journal/` and are locked by
`tests/unit/customer-request/route-execution/journal-thinness.test.ts`.

Three correctness-critical **mutation machines** remain host-owned by design:

| Export | Host | Role |
|--------|------|------|
| `startOrResume` | `convex/customerRequestRouteExecution.ts` (~`:138`) | Idempotent run create/resume under an active mandate; seeds attempt + dispatch outbox; schedules transport |
| `leaseNextDispatch` | same (~`:515`) | Worker lease grant: pending outbox scan → atomic outbox+attempt lease → schedule `recoverExpiredDispatch` |
| `recordOutcome` | same (~`:954`) | Record succeeded/partial/failed/unknown outcome; advance or fail the run; preserve integrity digests |

Callers today (must keep working through the same Convex export identities):

- `convex/customerRequestApplication.ts` `runRoute` → `internal.customerRequestRouteExecution.startOrResume`
- `convex/customerRequestRouteTransportWorker.ts` `runNext` → `leaseNextDispatch` then later `recordOutcome` (and sibling dispatch helpers)

CONCERNS forbids two failure modes that look like progress but are not:

1. **Shallow Convex sibling chops** — splitting the host into
   `customerRequestRouteExecutionStart.ts` / `…Lease.ts` / `…Outcome.ts` without a designed seam.
   That only moves lines; it does not deepen write authority and risks duplicated write sequences.
2. **Write-plan DTOs in pure journal** — introducing `WritePlan`, `intendedPatches`, or patch arrays
   into `src/modules/customer-request/route-execution/journal/`. That couples predicates to
   persistence shape and invites a “plan then apply in another transaction” split that breaks
   lease/outcome atomicity and can desync integrity digests from durable state.

Campaign gold pattern (Application / capability-supply / inquiry deepen): module-owned **ports
type + pure orchestration** → thin `convex/*Ports.ts` adapter → host keeps validators and thin
registration. Journal machines need the same **dependency direction**, adapted for
`internalMutation` + `MutationCtx` (not ActionCtx).

Wave 27 is design-only. This ADR does **not** move machine code. Wave 29 may deepen only under
these constraints.

## Decision

### 1. Extract the three machines behind mutation ports (Wave 29)

Wave 29 SHALL deepen `startOrResume`, `leaseNextDispatch`, and `recordOutcome` so that:

1. The Convex host exports remain the sole public mutation registrations (same names, same
   `internal.customerRequestRouteExecution.*` paths).
2. Handler bodies become thin: validate args (host validators), construct ports, call one
   module machine function, return its result.
3. Orchestration (idempotency, mandate/head integrity checks, lease grant sequencing, outcome
   branching, digest recomputation rules) lives in module code under
   `src/modules/customer-request/route-execution/`, **outside** the pure `journal/` package.
4. Persistence and scheduling go only through an explicit **JournalMutationPorts** (name may
   vary; contract shape below) implemented by a thin Convex adapter such as
   `convex/customerRequestRouteExecutionJournalPorts.ts`.

Suggested module layout (illustrative, not a file-move mandate):

```text
src/modules/customer-request/route-execution/
  journal/                    # EXISTING — predicates, integrity, evidence, decisions ONLY
  machines/                   # NEW (Wave 29) — start / lease / outcome orchestration
    ports.ts                  # JournalMutationPorts type (semantic ops, no Convex types)
    start-or-resume.ts
    lease-next-dispatch.ts
    record-outcome.ts
    index.ts
convex/
  customerRequestRouteExecution.ts              # validators + thin internalMutation shells
  customerRequestRouteExecutionJournalPorts.ts  # MutationCtx → ports adapter
```

The pure `journal/` package continues to supply `leaseArgsInvalid`, `leasePendingCandidateValid`,
`leaseGrantExpired`, integrity helpers, and related decisions. Machines **import** journal;
journal MUST NOT import machines or ports adapters.

### 2. No `WritePlan` / `intendedPatches` in pure `journal/`

The pure journal module MUST remain free of:

- identifiers `WritePlan`, `writePlan`, `intendedPatches`
- Convex runtime (`MutationCtx`, `Doc<>`, `_generated`, `convex/server`)
- patch-list DTOs that describe intended DB rows for a later apply step

**Why:** Journal owns epistemic and integrity **decisions**. Encoding durable writes as a
portable plan object tempts hosts to apply plans outside the originating mutation, duplicate
apply logic across sibling files, or drift digests when only a subset of patches land.

**Instead:** Ports expose **semantic, immediately executed** operations, for example
(illustrative):

```ts
type JournalMutationPorts = Readonly<{
  // reads — domain snapshots / plain records, never Doc<> in the type surface
  loadActiveMandateForPrincipal: (...) => Promise<MandateSnapshot | Expired | Missing>
  loadPriorRunCommand: (...) => Promise<PriorCommand | null>
  loadRunHead: (...) => Promise<RunHeadSnapshot | null>
  loadRunProjection: (...) => Promise<RunProjection | null>
  scanPendingDispatches: (...) => Promise<PendingDispatchCandidate[]>
  loadAttemptByRef: (...) => Promise<AttemptSnapshot | null>
  // ...

  // commits — each method performs its writes inside the caller's MutationCtx transaction
  commitCommandReplay: (...) => Promise<StartResult>
  commitResumedRun: (...) => Promise<StartResult>
  commitStartedRun: (...) => Promise<StartResult>  // run + attempt + outbox + command + schedule
  grantDispatchLease: (...) => Promise<LeaseResult> // outbox+attempt patches + recover schedule
  failExpiredUnreleasedAttempt: (...) => Promise<void>
  commitSucceededOutcome: (...) => Promise<OutcomeResult>
  commitFailedOutcome: (...) => Promise<OutcomeResult>
  commitUnknownOrPartialOutcome: (...) => Promise<OutcomeResult>
  // ...
}>
```

Machines call ports for effect. They do not return a write plan for the host to interpret.
If a Wave-29 implementer needs a private helper type inside `machines/` to stage values before a
single port commit, that type MUST NOT be named `WritePlan` / `intendedPatches`, MUST NOT be
exported into `journal/`, and MUST NOT cross a mutation boundary.

Thinness tests SHALL keep forbidding write-plan DTO tokens under `journal/`. Wave 29 MAY add a
sibling thinness test for `machines/` (no Convex imports; ports-only effects) without weakening
the journal ban.

### 3. Convex validators stay in the host forever

`startCommand`, `startResult`, `dispatchLease`, `outcomeResult`, `exportedStepState`, and all
other `v.*` argument/return validators for these mutations remain in
`convex/customerRequestRouteExecution.ts` (or a Convex-local validator module imported only by
Convex hosts). They MUST NOT move into `src/modules/**`.

Module machine functions take TypeScript domain inputs/results. The host is the anti-corruption
layer: `Infer<typeof …>` ↔ module types at the handler edge only.

`parseBoundedJson` and other host-local parse helpers that feed validators may remain host-side
or move only into a Convex-adjacent helper — never into pure `journal/`.

### 4. Preserve lease / outcome atomicity and integrity digests

Each of the three exports remains **one** `internalMutation`. Within a single handler invocation:

- All port-backed reads and writes share the same `MutationCtx` / transaction.
- Lease grant MUST continue to patch outbox and attempt together before returning `leased`, and
  MUST continue to schedule `recoverExpiredDispatch` for the granted lease window.
- Outcome recording MUST keep attempt state, run state, result/output digests, and transport
  observation digests consistent; integrity failures continue to throw named integrity errors
  rather than returning soft success.
- Idempotent replay paths (`priorCommand`, already-succeeded attempt) MUST return the same
  projection semantics as today.

Machines MAY call existing pure journal integrity helpers (`routeRunIdentityDigest`,
`routeAttemptIntegrityValid`, `routeDispatchIntegrityValid`, lease/cancel decision helpers)
before committing. Digests remain computed from the same canonical inputs; ports MUST NOT
invent alternate digest formulas.

Intentional cross-mutation scheduling already in the host (`scheduler.runAfter` → transport
worker / recover) remains allowed as **side effects after** the durable journal rows for that
mutation are consistent — not as a substitute for splitting one logical lease or outcome across
two mutations.

### 5. Forbid shallow Convex sibling chops

The following are **out of scope and rejected** as deepen substitutes:

- `convex/customerRequestRouteExecutionStart.ts`
- `convex/customerRequestRouteExecutionLease.ts`
- `convex/customerRequestRouteExecutionOutcome.ts`
- any similarly named pass-through that only relocates the mutation export without module ports

A thin ports adapter file (`*JournalPorts.ts`) plus the existing host register is the allowed
Convex surface growth. Multiple machine files under `src/modules/.../machines/` are encouraged;
multiple Convex mutation-host siblings for the same three exports are not.

### 6. How transport worker and Application call the seam

**Call sites do not change.** Deepening is invisible to Application and the transport worker:

```text
Application.runRoute (action)
  → ctx.runMutation(internal.customerRequestRouteExecution.startOrResume, args)
      → host validator + journalMutationPorts(ctx)
      → machines.startOrResume(args, ports)     // Wave 29
      → result

TransportWorker.runNext (internalAction, "use node")
  → ctx.runMutation(...leaseNextDispatch, { workerId, leaseDurationMs })
      → machines.leaseNextDispatch(...)
  → (open / markDispatched / invoke transport — existing)
  → ctx.runMutation(...recordOutcome, { attemptRef, operationKeyDigest, observationJson, outcome })
      → machines.recordOutcome(...)
```

Rules for callers:

- Application and transport worker MUST NOT import `machines/` or construct journal mutation
  ports themselves.
- They MUST NOT call port methods directly or open a second mutation to “apply” work that
  belongs inside start/lease/outcome.
- Sibling dispatch mutations already used by the worker (`openLeasedDispatch`, `markDispatched`,
  `recordNotReleased`, recover/cancel helpers) are outside this ADR’s extract set unless a later
  ADR extends the same ports pattern; Wave 29 MUST NOT casually fold them into Start/Lease/Outcome
  chops.

### 7. Status and wave gating

**Status: Accepted.** This ADR is the design unlock for Wave 29.

| Wave | Allowed work |
|------|----------------|
| 27 (this ADR) | Design only; optional CONCERNS pointer; **no** machine code moves |
| 29 | Implement ports + machines; keep host exports; extend thinness tests; preserve integration coverage in `tests/integration/customer-request-v2-multi-capability-route.test.ts` |
| Until 29 lands | Machines remain host-exported; predicate/integrity changes continue via `journal/` only |

## Consequences

### Easier

- Wave 29 can reduce `customerRequestRouteExecution.ts` without inventing write-plan DTOs or
  sibling host files.
- Lease/outcome sequencing stays testable with port fakes while production atomicity stays a
  single Convex mutation.
- Pure `journal/` remains a decision/integrity library with a clear purity contract.

### Harder / constrained

- Implementers cannot “finish” the god file with a mechanical file split.
- Port surfaces must be designed as semantic commits, which takes more care than dumping
  `ctx.db.patch` lists into a DTO.
- Validators and Convex `Doc`/`Id` types stay host-side forever, so mapping boilerplate remains
  at the adapter edge.

### Explicit non-goals

- Moving cancel/recover/markDispatched/openLeasedDispatch in the same wave (unless trivially
  shared as private port helpers without changing their export hosts).
- Changing Application or transport-worker public behavior or Convex function paths.
- Relitigating already-deepened journal predicates.

## Rejected alternatives

### A. Split host into `…Start` / `…Lease` / `…Outcome.ts` Convex siblings

Rejected: shallow pass-through; duplicates write sequences; fails CONCERNS hard ban; does not
create a portable seam.

### B. Return `WritePlan` / `intendedPatches` from pure `journal/` for the host to apply

Rejected: pollutes the pure module; encourages multi-step apply; thinness test already forbids
these tokens; high risk of digest/state desync.

### C. Move validators into `src/modules` with the machines

Rejected: Convex validators are a host concern; campaign rule is “validators stay in Convex
forever.”

### D. Have Application / transport worker call module machines directly (bypass mutations)

Rejected: would break transactional atomicity, Node/`"use node"` bundling boundaries, and the
internalMutation authority boundary.

### E. Keep machines in-host indefinitely and only extract more predicates

Rejected as the long-term path: start/lease/outcome bodies are the residual authority
concentration CONCERNS names; predicates alone cannot shrink the deferred-machine floor.

## Verification expectations (Wave 29, not Wave 27)

When machines move:

1. `journal-thinness.test.ts` continues to lock host export names **until** Wave 29 updates it to
   assert thin handlers + ports wiring (or splits: host still exports the three symbols; bodies
   delegate).
2. `journal/` remains free of write-plan DTO tokens and Convex runtime.
3. Integration suite `tests/integration/customer-request-v2-multi-capability-route.test.ts`
   stays green for start → lease → outcome paths.
4. No new Convex files named `*Start.ts` / `*Lease.ts` / `*Outcome.ts` for these machines.
5. `npm run check:convex-codegen` remains green (ports adapters must not pull `node:` into
   mutation graphs).

## Decision record

Accepted 2026-07-18 as Wave 27 design unlock. Implementation is gated to Wave 29 under this ADR.
