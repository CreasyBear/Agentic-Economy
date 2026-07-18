<!-- refreshed: 2026-07-18 -->
# Architecture

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `9d8faa04` (post Waves 38–42 CLOSED)

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Surfaces (TanStack Start)                                                   │
│  `src/routes/*`  ·  React UI  ·  HTTP/API  ·  quiet agent door               │
│  Actions fan-out: `src/modules/actions/index.ts` + `*.actions.ts`            │
└───────────────┬─────────────────────────┬───────────────────┬───────────────┘
                │                         │                   │
                ▼                         ▼                   ▼
┌───────────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│ Registry / Inquiry        │  │ Customer Request     │  │ Capability Supply  │
│ `src/modules/registry/`   │  │ Application + V2     │  │ `capability-supply/`│
│ `src/modules/inquiries/`  │  │ `application/*`      │  │ ports + commands    │
│                           │  │ `v2-write/` (ADR-014) │  │                    │
└───────────────┬───────────┘  └──────────┬───────────┘  └─────────┬──────────┘
                │                         │                        │
                ▼                         ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Convex host (validators + thin shells + *Ports adapters)                    │
│  `convex/customerRequestApplication.ts` (~1749)                              │
│  `convex/customerRequestRouteExecution.ts` (~939) + Journal/Cancel/Problem/  │
│    Dispatch ports                                                            │
│  `convex/customerRequestV2.ts` (~644) + `customerRequestV2WritePorts.ts`     │
│  `convex/inquiry*.ts` · `notificationOutbox*.ts` · `capabilitySupply*.ts`    │
│  `convex/registry.ts` (~1622) · `convex/discovery.ts` (~1565)                 │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Convex tables (module-owned schema fragments → `convex/schema.ts`)          │
│  Workers: `customerRequestRouteTransportWorker.ts`                           │
│           `customerRequestRouteCancellationWorker.ts`                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Action registry | One operation definition → UI / HTTP / agent JSON / agentTools | `src/modules/actions/index.ts` |
| Customer Request Application | Domain orchestration for interpret/compile, facts, confirm, run, problem, standing | `src/modules/customer-request/application/` |
| Application Convex host | Auth, validators, ActionCtx → application ports | `convex/customerRequestApplication.ts` (~1749) |
| V2 write machines | Aggregate commit + route-plan generation refresh/retry | `src/modules/customer-request/v2-write/` |
| V2 write ports adapter | `MutationCtx` → `CustomerRequestV2WritePorts` | `convex/customerRequestV2WritePorts.ts` (~856) |
| V2 Convex host | Validators + thin `commitAggregate` / refresh / retry shells | `convex/customerRequestV2.ts` (~644) |
| Route-execution host | Validators + thin `internalMutation`/`internalQuery` shells | `convex/customerRequestRouteExecution.ts` (~939) |
| Journal machines | start / lease / outcome orchestration | `src/modules/customer-request/route-execution/machines/` |
| Journal ports adapter | `MutationCtx` → `JournalMutationPorts` | `convex/customerRequestRouteExecutionJournalPorts.ts` (~981) |
| Cancel machines + ports | cancel / open / resolve | machines + `convex/customerRequestRouteExecutionCancelPorts.ts` (~394) |
| Problem machines + ports | report / business claim / status / reply | machines + `convex/customerRequestRouteExecutionProblemPorts.ts` (~349) |
| Problem support-read ports | `exportProblemForSupport` load assembly (`ProblemSupportReadPorts`) | same ProblemPorts adapter + `machines/problem-ports.ts` |
| Dispatch lifecycle machines + ports | recover / mark / openLeased / notReleased / accepted | machines + `convex/customerRequestRouteExecutionDispatchPorts.ts` (~286) |
| Pure journal | Predicates, integrity digests, cancel/lease/recover decisions | `src/modules/customer-request/route-execution/journal/` |
| Problem-support | `decide*` / `project*` for problems (no Convex) | `src/modules/customer-request/route-execution/problem-support/` |
| Evidence load | Assemble customer/support evidence exports | `src/modules/customer-request/route-execution/evidence-load/` |
| Inquiry dual-path | `source` vs `local-e2e` server backends | `src/modules/inquiries/inquiry.functions.ts` |
| Local E2E inquiry adapter | Fail-closed fixture backend for auth bypass | `src/modules/inquiries/internal/local-e2e-adapter.ts` |
| Notification outbox | Enqueue / dispatch / webhook / retry commands | `src/modules/notification-outbox/` |
| Outbox persistence helpers | Row ↔ domain record mapping + upsert (shared) | `convex/notificationOutboxPersistence.ts` |
| Outbox Convex host | Dispatch / webhook / operator surfaces | `convex/notificationOutbox.ts` (~1287) |
| Schema composition | Spread module `*Tables` into one schema | `convex/schema.ts` |

## Pattern Overview

**Overall:** Ports-and-adapters deepen campaign (Waves 23–42 CLOSED) — module-owned ports types + pure orchestration; Convex hosts stay validators + thin shells; adapters implement ports against `MutationCtx` / `ActionCtx` / `RuntimeDb`.

**Key Characteristics:**
- **One action plane** across human and agent surfaces (`ADR-010`); domain ops declared in `*.actions.ts`, registered in `src/modules/actions/index.ts`.
- **Semantic commits, not WritePlans** — machines call ports that execute writes inside the caller's transaction (`ADR-011`–`ADR-014`). Forbidden tokens: `WritePlan`, `writePlan`, `intendedPatches` under `journal/`, `machines/`, and `v2-write/`.
- **Dedicated port families** — do not grow `JournalMutationPorts` with cancel/problem/dispatch/V2; use `CancelMutationPorts` / `ProblemMutationPorts` / `DispatchLifecyclePorts` / `CustomerRequestV2WritePorts`.
- **Validators stay in Convex forever** — `v.*` args/returns live in host files; modules use TypeScript domain types.
- **Thinness locked by tests** — `tests/unit/customer-request/route-execution/{journal,machines,problem-mutation,problem-support-read,dispatch-lifecycle,evidence-load}-thinness.test.ts`, `tests/unit/customer-request/v2-write-thinness.test.ts`, inquiry/application/capability-supply thinness suites.
- **~1k adapter ceiling** per `*Ports.ts` file — journal (~981) and V2 write (~856) are the largest; new families get new adapters.

## Layers

**Surface layer:**
- Purpose: HTTP routes, React pages, quiet agent tools door
- Location: `src/routes/`, `src/components/`, `src/views/`
- Contains: TanStack route files, operator UI under `src/routes/_operator/`
- Depends on: module `*.functions.ts` / actions / public barrels
- Used by: browsers, assistants, authenticated agents

**Action / functions layer:**
- Purpose: Boundary-honest operation contracts and TanStack server fns
- Location: `src/modules/<domain>/*.actions.ts`, `*.functions.ts`, `public.ts`
- Contains: `ActionDefinition`, Zod schemas, `*ThroughSource` bindings
- Depends on: module `internal/` (same module only), Convex API refs
- Used by: routes, agent tools, UI

**Application / command layer (Customer Request):**
- Purpose: Compose interpret → compile → confirm → run → inspect without merging authority helpers
- Location: `src/modules/customer-request/application/`
- Contains: `interpret-compile/`, `provide-facts/`, `confirm-route/`, `problem-route/`, `standing-route/`, …
- Depends on: domain pure modules + port interfaces (no Convex imports)
- Used by: `convex/customerRequestApplication.ts` via `*Ports(ctx)` adapters

**V2 write layer (ADR-014):**
- Purpose: Durable aggregate commit and route-plan generation refresh/retry orchestration
- Location: `src/modules/customer-request/v2-write/`
- Contains: `commit-aggregate.ts`, `refresh-route-plan-generation.ts`, `record-route-plan-generation-retry.ts`, `ports.ts`, `aggregate-consistency.ts`
- Depends on: `compiler`, `route-plan-generation`, domain types — no Convex
- Used by: thin handlers in `convex/customerRequestV2.ts` only

**Route-execution machines layer:**
- Purpose: Mutation orchestration for start/lease/outcome/cancel/problem/dispatch lifecycle
- Location: `src/modules/customer-request/route-execution/machines/`
- Contains: machine functions + port type files (`ports.ts`, `cancel-ports.ts`, `problem-ports.ts`, `dispatch-lifecycle-ports.ts`)
- Depends on: `journal/`, `problem-support/`, capability-contract types
- Used by: thin handlers in `convex/customerRequestRouteExecution.ts` only

**Pure decision libraries:**
- Purpose: Predicates, integrity, projections without I/O
- Location: `journal/`, `problem-support/`, parts of `capability-supply/internal/*`, `route-plan-generation.ts`
- Depends on: domain types only (no Convex, no ports adapters)
- Used by: machines and (where applicable) host queries that call projectors

**Convex adapter / host layer:**
- Purpose: Anti-corruption — validators, auth resolution, `Doc`/`Id` mapping, scheduling
- Location: `convex/*Ports.ts`, `convex/customerRequest*.ts`, `convex/inquiry*.ts`, `convex/notificationOutbox*.ts`
- Contains: port factories, workers (`"use node"` where required), crons
- Depends on: Convex runtime + module public/machine APIs
- Used by: Application actions, transport/cancellation workers, HTTP bridges

**Persistence:**
- Purpose: Durable tables and source-state aggregates
- Location: `src/modules/*/internal/*schema*`, composed in `convex/schema.ts`
- Contains: table fragments, indexes `by_field1_and_field2`
- Depends on: Convex `defineTable`
- Used by: all hosts via `ctx.db` / `runtimeDb`

## Data Flow

### Primary Customer Request path

1. Authenticated agent/UI hits Customer Request API routes under `src/routes/api.v1.requests*.ts` or legacy `api.requests*.ts`.
2. Route/server fn calls Convex actions in `convex/customerRequestApplication.ts` (service assertion + validators).
3. Host builds application ports (e.g. `provideFactsPorts`, `confirmRoutePorts`, `problemRoutePorts`) and calls `src/modules/customer-request/application/public`.
4. Interpret/compile / provide-facts / refine commit via `internal.customerRequestV2.commitAggregate` → `v2-write.commitAggregate` + `customerRequestV2WritePorts(ctx)`.
5. Confirm/run schedules or invokes `internal.customerRequestRouteExecution.startOrResume`.
6. Host shell: `startOrResumeMachine(args, journalMutationPorts(ctx))` (`convex/customerRequestRouteExecution.ts`).
7. Transport worker: `openLeasedDispatch` → `markDispatched` / `recordNotReleased` → `recordOutcome` (`convex/customerRequestRouteTransportWorker.ts`); lease expiry via `recoverExpiredDispatch`.

### V2 write path (ADR-014 Wave 42)

1. Application interpret-compile / provide-facts / refine → `internal.customerRequestV2.commitAggregate`.
2. Thin shell → `commitAggregateMachine(args, customerRequestV2WritePorts(ctx))`.
3. Compare-resume → `refreshRoutePlanGeneration` / `recordRoutePlanGenerationRetry` via the same write ports.
4. Mandate supersession goes through ports → `customerRequestRouteMandateLifecycle` (adapter only; modules never import Convex lifecycle).

### Cancel path (ADR-012)

1. Application / cancel-route → `internal.customerRequestRouteExecution.cancelCurrent`.
2. Thin shell → `cancelCurrentMachine(args, cancelMutationPorts(ctx))`.
3. Pre-release cancel commits attempt+outbox+run; adapter-cancel schedules `customerRequestRouteCancellationWorker`.
4. Worker: `openCancellationAttempt` (`cancelOpenPorts`) → adapter → `resolveCancellationAttempt` (`cancelMutationPorts`).

### Problem path (ADR-012 Wave 34 + Wave 40 export)

1. Application `problem-route/` actions use `ProblemRoutePorts` (`convex/customerRequestProblemRoutePorts.ts`) — action-layer seam only.
2. Durable mutations: `reportProblem` / `recordProblemBusinessReport` / `updateProblemStatus` / `replyProblem` → machines + `problemMutationPorts(ctx)`.
3. Machines call `problem-support/` `decide*` helpers; auth snapshots come from ports (Clerk stays host-side).
4. Support export query: `exportProblemForSupport` resolves admin authority in host, then `problemSupportReadPorts(ctx).loadSupportExportMaterial` → `projectSupportProblemExport` (Wave 40 load on ProblemPorts; no new ADR).

### Dispatch lifecycle path (ADR-013 Wave 39)

1. Transport worker / lease path → `openLeasedDispatch` (`dispatchLifecycleOpenPorts` / shared leased-invocation helper).
2. Post-prepare: `markDispatched` or `recordNotReleased`; post-dispatch: `markAccepted`.
3. Lease expiry scheduler → `recoverExpiredDispatch` → requeue / `outcome_unknown` / unchanged via `dispatchLifecyclePorts(ctx)`.
4. Callers keep `internal.customerRequestRouteExecution.*` identities; machines live under `machines/recover-expired-dispatch.ts`, `mark-dispatched.ts`, `record-not-released.ts`, `mark-accepted.ts`, `open-leased-dispatch.ts`, `current-leased-invocation.ts`.

### Inquiry dual-path

1. Server entry resolves backend: `resolveInquiryServerBackend()` in `src/modules/inquiries/inquiry.functions.ts`.
2. Factory: `createInquiryServerBackend('source' | 'local-e2e')` — local-e2e only when `isLocalE2EAuthBypassEnabled()`.
3. Source path uses Convex inquiry hosts + `inquirySourceStatePorts` / `inquiryNotificationPorts`.
4. Local path uses `createLocalE2eInquiryServerBackend()` in `src/modules/inquiries/internal/local-e2e-adapter.ts` (fail-closed outside bypass).

### Notification outbox (shared persistence)

1. Inquiry commands enqueue via `InquiryNotificationPorts.enqueueDispatches` → `convex/inquiryNotificationBridge.ts` (thin).
2. Bridge persists through shared helpers in `convex/notificationOutboxPersistence.ts` (`toDispatchRecord`, `upsertNotificationDispatch`, …).
3. Source-state aggregate load/persist: `notificationOutboxSourceStatePorts(db)` → `convex/notificationOutboxSourceState.ts`.
4. Dispatch / webhook / retry / operator: `convex/notificationOutbox.ts` (~1287) + module commands in `src/modules/notification-outbox/internal/commands.ts`.

**State Management:**
- Durable run/attempt/outbox/problem rows in Convex tables owned by `customer-request` schema fragment.
- V2 request/revision/generation heads behind `CustomerRequestV2WritePorts`.
- Inquiry and notification “source state” aggregates behind load/persist ports (`InquirySourceStatePorts`, `NotificationOutboxSourceStatePorts`).
- No client-side authority for route execution; projections are readbacks of host state.

## Key Abstractions

**JournalMutationPorts (ADR-011):**
- Purpose: Semantic reads/commits for start, lease, outcome (and start-path `cancelPriorUnreleasedRun`)
- Examples: `src/modules/customer-request/route-execution/machines/ports.ts`, `convex/customerRequestRouteExecutionJournalPorts.ts`
- Pattern: Machine orchestration + immediate port commits in one `internalMutation`

**CancelMutationPorts / CancelOpenPorts (ADR-012):**
- Purpose: Cancel command, open cancellation attempt (query), resolve disposition
- Examples: `machines/cancel-ports.ts`, `convex/customerRequestRouteExecutionCancelPorts.ts`
- Pattern: Separate family — must not be folded into journal ports

**ProblemMutationPorts + ProblemSupportReadPorts (ADR-012 + Wave 40):**
- Purpose: Durable problem report/claim/status/reply commits + support-export material load
- Examples: `machines/problem-ports.ts`, `convex/customerRequestRouteExecutionProblemPorts.ts`
- Pattern: Machines stay free of Clerk; host injects `resolveBusinessProblemAuthority` / `SupportAuthority`; `exportProblemForSupport` uses `problemSupportReadPorts` + `projectSupportProblemExport`

**DispatchLifecyclePorts / DispatchLifecycleOpenPorts (ADR-013):**
- Purpose: recoverExpiredDispatch, markDispatched, recordNotReleased, markAccepted, openLeasedDispatch
- Examples: `machines/dispatch-lifecycle-ports.ts`, `convex/customerRequestRouteExecutionDispatchPorts.ts`
- Pattern: Dedicated family — do not absorb into Journal/Cancel/Problem ports; factory `dispatchLifecyclePorts(ctx)`

**CustomerRequestV2WritePorts (ADR-014):**
- Purpose: `commitAggregate`, `refreshRoutePlanGeneration`, `recordRoutePlanGenerationRetry`
- Examples: `src/modules/customer-request/v2-write/ports.ts`, `convex/customerRequestV2WritePorts.ts`
- Pattern: One write family only; Application keeps calling `internal.customerRequestV2.*`; no parallel compiler

**Application *Ports (ActionCtx):**
- Purpose: Application layer I/O without Convex types in `application/`
- Examples: `customerRequestProvideFactsPorts.ts`, `customerRequestConfirmRoutePorts.ts`, `customerRequestProblemRoutePorts.ts`, `customerRequestStandingRoutePorts.ts`
- Pattern: Gold deepen from Waves 23–32 — thin Convex action host, fat module

**Capability-supply ports:**
- Purpose: Eligible inventory, publication, graph/probe, writers behind ports
- Examples: `src/modules/capability-supply/internal/eligibility/ports.ts`, `publication/ports.ts`, `graph/ports.ts`; Convex `capabilitySupply*Ports.ts`
- Pattern: Same deepen campaign as Application / inquiry

**InquiryServerBackend factory:**
- Purpose: Dual-path `source` vs `local-e2e` without leaking fixtures into production path
- Examples: `inquiry.functions.ts` (`createInquiryServerBackend`), `internal/local-e2e-adapter.ts`
- Pattern: Kind discriminant + fail-closed local constructor

## Entry Points

**Quiet agent tools:**
- Location: `GET/POST` via routes wired to harness + `src/modules/actions/index.ts`
- Triggers: External assistants
- Responsibilities: List/invoke allowlisted actions (`registry.*`, `inquiry.submit`, …); respect `boundaries`

**Customer Request Convex actions:**
- Location: `convex/customerRequestApplication.ts`
- Triggers: API routes / authenticated agents
- Responsibilities: Interpret/compile, facts, refine, confirm, run, cancel, problem, standing permissions

**Route-execution internal API:**
- Location: `convex/customerRequestRouteExecution.ts`
- Triggers: Application + transport/cancellation workers
- Responsibilities: Export identities for start/lease/outcome/cancel/problem/dispatch lifecycle + support/business queries

**V2 internal API:**
- Location: `convex/customerRequestV2.ts`
- Triggers: Application interpret-compile / compare-resume / provide-facts / refine
- Responsibilities: Aggregate commit + generation refresh/retry (write family deepened); remaining reads/prep stay host-side

**Inquiry server fns:**
- Location: `src/modules/inquiries/inquiry.functions.ts`
- Triggers: Public submit, owner inbox, customer record
- Responsibilities: Resolve dual-path backend; admission-gated writes

**Schema composition:**
- Location: `convex/schema.ts`
- Triggers: Deploy / codegen
- Responsibilities: Spread module table fragments only — no inline tables

## Architectural Constraints

- **Threading:** Convex mutations/queries are single-transaction; Node workers (`customerRequestRouteTransportWorker.ts`, cancellation worker) use `"use node"` and must not be imported into mutation graphs (`npm run check:convex-codegen`).
- **Global state:** Module-level action registry array in `src/modules/actions/index.ts` (assert unique IDs at import). Local-e2e secrets/fixtures are process-local and fail-closed.
- **Circular imports:** `internal/` is private to its module (`tests/imports/private-imports.test.ts`). Machines may import `journal/` / `problem-support/`; those packages must not import machines or Convex adapters. `v2-write/` must not import Convex.
- **Port adapter size ceiling:** ~1k lines per `*Ports.ts` adapter — journal (~981) near ceiling; V2 write (~856); cancel/problem/dispatch are separate files by design.
- **Authority separation:** Mandate, preparation, and route stay separate (ADR-002 note in `application/public.ts`); Application composes them, does not merge helpers.
- **Public copy:** No internal architecture words on human surfaces (`AGENTS.md` / public-copy skill).
- **Schema:** New tables live in owning module fragments; compose only in `convex/schema.ts` (ae-convex-guardrails).

## Anti-Patterns

### Shallow Convex sibling chops

**What happens:** Split host into `customerRequestRouteExecutionStart.ts` / `…Cancel.ts` / `…Dispatch.ts` / `customerRequestV2Commit.ts` without module ports.
**Why it's wrong:** Moves lines without deepening write authority; duplicates sequences; banned by ADR-011–014 and CONCERNS.
**Do this instead:** Thin shells in the single host file + dedicated `*Ports.ts` + machines under `route-execution/machines/` or `v2-write/`.

### WritePlan / intendedPatches in pure modules

**What happens:** Return patch DTOs from `journal/`, `machines/`, or `v2-write/` for the host to apply later.
**Why it's wrong:** Breaks lease/outcome/cancel/V2 atomicity; digests desync; thinness tests forbid tokens.
**Do this instead:** Semantic port methods that commit inside the same `MutationCtx` transaction.

### Growing JournalMutationPorts with cancel/problem/dispatch/V2

**What happens:** Add unrelated family commits onto journal ports to “finish” a god file.
**Why it's wrong:** Exceeds adapter ceiling; mixes auth matrices and table sets (ADR-012–014).
**Do this instead:** Dedicated `CancelMutationPorts` / `ProblemMutationPorts` / `DispatchLifecyclePorts` / `CustomerRequestV2WritePorts`.

### Application or workers constructing mutation ports

**What happens:** Callers import machines or open a second mutation to “apply” work.
**Why it's wrong:** Breaks transactional boundary and Node bundling rules.
**Do this instead:** Always go through `internal.customerRequestRouteExecution.*` / `internal.customerRequestV2.*` export identities.

### Local-e2e backend without bypass

**What happens:** Construct `createLocalE2eInquiryServerBackend()` outside auth bypass.
**Why it's wrong:** Fixture path must be fail-closed (`local-e2e-adapter.ts`).
**Do this instead:** Only via `createInquiryServerBackend` when `isLocalE2EAuthBypassEnabled()`.

### Reopening closed deepens as line-count chops

**What happens:** Treat Application / journal / cancel / problem / dispatch / V2-write as reopen waves because a host is still “large.”
**Why it's wrong:** Validators forever and host-done status are intentional; size-only chops regress the campaign.
**Do this instead:** Deepen only when a new operation family needs a seam; park size residuals (see below).

## Error Handling

**Strategy:** Domain results as discriminated unions (`kind: 'refused' | 'conflict' | …`); integrity failures throw named errors rather than soft-success.

**Patterns:**
- Machines return refuse/conflict/replayed results for expected control flow.
- Integrity helpers in `journal/integrity.ts` — host/machines throw on digest/state mismatch.
- V2 write machines preserve command-key replay, revision/generation conflicts, and graph-validation refusal kinds.
- Application wraps outcomes via `toActionResult` / `CustomerRequestActionResult` in `application/action-result.ts`.
- Inquiry source errors mapped through `inquirySourceError` in functions layer.

## Cross-Cutting Concerns

**Logging:** Observability module + audit events (`src/modules/observability/`); avoid console-only authority.
**Validation:** Zod at TanStack/action boundaries; Convex `v.*` at mutation/action edges; bounded JSON parsers at host/machine edge.
**Authentication:** Clerk identity on host queries/mutations; service assertion envelopes for Customer Request actions (`service-auth-envelope.ts`); admin via `convex/authz.ts` `resolveAdminAuthority` (e.g. support export).
**Thinness enforcement:** Unit tests that read host/ports/machine sources and assert wiring + purity (no Convex imports in machines / v2-write).

## Host size snapshot (verified at map)

| File | ~Lines | Status |
|------|------:|--------|
| `convex/customerRequestApplication.ts` | **1749** | Host-done; validators forever |
| `convex/registry.ts` | **1622** | Catalog-from-rows shared; size residual |
| `convex/discovery.ts` | **1565** | Catalog-from-rows shared; size residual |
| `convex/notificationOutbox.ts` | **1287** | Shared persist done; further families parked |
| `convex/customerRequestRouteExecutionJournalPorts.ts` | **981** | Under ~1k |
| `convex/customerRequestRouteExecution.ts` | **939** | ADR-011–013 + Wave 40 thin |
| `convex/customerRequestV2WritePorts.ts` | **856** | Wave 42 write adapter |
| `convex/customerRequestV2.ts` | **644** | Write family deepened |
| `convex/customerRequestRouteExecutionCancelPorts.ts` | **394** | Wave 33 |
| `convex/customerRequestRouteExecutionProblemPorts.ts` | **349** | Wave 34 + Wave 40 |
| `convex/customerRequestRouteExecutionDispatchPorts.ts` | **286** | Wave 39 |

## Campaign deepen map (Waves 23–42 CLOSED)

| Wave band | Landed deepen | Primary seams |
|-----------|---------------|---------------|
| 23–32 | Application slices; capability-supply ports; inquiry source-state + notification bridge; evidence-load; ADR-011 journal machines | `application/*`, `capabilitySupply*Ports.ts`, inquiry/outbox ports, Journal ports + machines |
| 33–34 | ADR-012 cancel + problem mutation machines | Cancel/Problem ports + machines |
| 35–37 | Success-outcome residual; inquiry dual-path factory; shared `notificationOutboxPersistence` | `record-outcome`; `inquiry.functions.ts` factory; outbox persistence helpers |
| 38–39 | ADR-013 dispatch lifecycle ports + recover/mark/open machines | `DispatchLifecyclePorts` + `…DispatchPorts.ts` |
| 40 | `exportProblemForSupport` load on ProblemPorts (`ProblemSupportReadPorts`) | `problemSupportReadPorts` + `projectSupportProblemExport` |
| 41–42 | ADR-014 V2 write-family design + `commitAggregate` / refresh / retry | `v2-write/` + `customerRequestV2WritePorts.ts` |

**ADRs Accepted:** ADR-011 (JournalMutationPorts), ADR-012 (Cancel + Problem), ADR-013 (DispatchLifecyclePorts), ADR-014 (CustomerRequestV2WritePorts).

## Parked leftovers (not reopen waves)

Size / optional residuals only — do **not** treat as closed-wave reopen work:

- Outbox webhook / retry / operator families (`notificationOutbox.ts` ~1287) — Wave 43+ if needed
- V2 read / preparation families — separate ADR after write pattern
- Optional `readProblemForBusiness` further thin
- Registry / discovery ~1.5k size-only; Application 1749 validators forever
- Inquiry dual-path parity harness (verification, not deepen)

---

*Architecture analysis: 2026-07-18 · last_mapped_commit `9d8faa04`*
