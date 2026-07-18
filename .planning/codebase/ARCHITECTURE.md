<!-- refreshed: 2026-07-18 -->
# Architecture

**Analysis Date:** 2026-07-18
**last_mapped_commit:** `3463c1d4` (post Waves 33–37)

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
│ `src/modules/registry/`   │  │ Application          │  │ `capability-supply/`│
│ `src/modules/inquiries/`  │  │ `application/*`      │  │ ports + commands    │
└───────────────┬───────────┘  └──────────┬───────────┘  └─────────┬──────────┘
                │                         │                        │
                ▼                         ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Convex host (validators + thin shells + *Ports adapters)                    │
│  `convex/customerRequestApplication.ts`                                      │
│  `convex/customerRequestRouteExecution.ts` + Journal/Cancel/Problem ports    │
│  `convex/inquiry*.ts` · `notificationOutbox*.ts` · `capabilitySupply*.ts`    │
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
| Application Convex host | Auth, validators, ActionCtx → application ports | `convex/customerRequestApplication.ts` |
| Route-execution host | Validators + thin `internalMutation`/`internalQuery` shells | `convex/customerRequestRouteExecution.ts` (~1178 lines) |
| Journal machines | start / lease / outcome orchestration | `src/modules/customer-request/route-execution/machines/` |
| Journal ports adapter | `MutationCtx` → `JournalMutationPorts` | `convex/customerRequestRouteExecutionJournalPorts.ts` (~979 lines) |
| Cancel machines + ports | cancel / open / resolve | machines + `convex/customerRequestRouteExecutionCancelPorts.ts` |
| Problem machines + ports | report / business claim / status / reply | machines + `convex/customerRequestRouteExecutionProblemPorts.ts` |
| Pure journal | Predicates, integrity digests, cancel/lease decisions | `src/modules/customer-request/route-execution/journal/` |
| Problem-support | `decide*` / `project*` for problems (no Convex) | `src/modules/customer-request/route-execution/problem-support/` |
| Evidence load | Assemble customer/support evidence exports | `src/modules/customer-request/route-execution/evidence-load/` |
| Inquiry dual-path | `source` vs `local-e2e` server backends | `src/modules/inquiries/inquiry.functions.ts` |
| Local E2E inquiry adapter | Fail-closed fixture backend for auth bypass | `src/modules/inquiries/internal/local-e2e-adapter.ts` |
| Notification outbox | Enqueue / dispatch / webhook / retry commands | `src/modules/notification-outbox/` |
| Outbox persistence helpers | Row ↔ domain record mapping + upsert | `convex/notificationOutboxPersistence.ts` |
| Schema composition | Spread module `*Tables` into one schema | `convex/schema.ts` |

## Pattern Overview

**Overall:** Ports-and-adapters deepen campaign — module-owned ports types + pure orchestration; Convex hosts stay validators + thin shells; adapters implement ports against `MutationCtx` / `ActionCtx` / `RuntimeDb`.

**Key Characteristics:**
- **One action plane** across human and agent surfaces (`ADR-010`); domain ops declared in `*.actions.ts`, registered in `src/modules/actions/index.ts`.
- **Semantic commits, not WritePlans** — machines call ports that execute writes inside the caller's transaction (`ADR-011`, `ADR-012`). Forbidden tokens: `WritePlan`, `writePlan`, `intendedPatches` under `journal/` and `machines/`.
- **Dedicated port families** — do not grow `JournalMutationPorts` with cancel/problem; use `CancelMutationPorts` / `ProblemMutationPorts`.
- **Validators stay in Convex forever** — `v.*` args/returns live in host files; modules use TypeScript domain types.
- **Thinness locked by tests** — `tests/unit/customer-request/route-execution/journal-thinness.test.ts`, `machines-thinness.test.ts`, `problem-mutation-thinness.test.ts`, inquiry host thinness tests.

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

**Route-execution machines layer:**
- Purpose: Mutation orchestration for start/lease/outcome/cancel/problem
- Location: `src/modules/customer-request/route-execution/machines/`
- Contains: machine functions + port type files (`ports.ts`, `cancel-ports.ts`, `problem-ports.ts`)
- Depends on: `journal/`, `problem-support/`, capability-contract types
- Used by: thin handlers in `convex/customerRequestRouteExecution.ts` only

**Pure decision libraries:**
- Purpose: Predicates, integrity, projections without I/O
- Location: `journal/`, `problem-support/`, parts of `capability-supply/internal/*`
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
4. Confirm/run schedules or invokes `internal.customerRequestRouteExecution.startOrResume`.
5. Host shell: `startOrResumeMachine(args, journalMutationPorts(ctx))` (`convex/customerRequestRouteExecution.ts` ~146–151).
6. Transport worker leases via `leaseNextDispatch` → adapter invoke → `recordOutcome` (`convex/customerRequestRouteTransportWorker.ts`).

### Cancel path (ADR-012)

1. Application / cancel-route → `internal.customerRequestRouteExecution.cancelCurrent`.
2. Thin shell → `cancelCurrentMachine(args, cancelMutationPorts(ctx))`.
3. Pre-release cancel commits attempt+outbox+run; adapter-cancel schedules `customerRequestRouteCancellationWorker`.
4. Worker: `openCancellationAttempt` (`cancelOpenPorts`) → adapter → `resolveCancellationAttempt` (`cancelMutationPorts`).

### Problem path (ADR-012 Wave 34)

1. Application `problem-route/` actions use `ProblemRoutePorts` (`convex/customerRequestProblemRoutePorts.ts`) — action-layer seam only.
2. Durable mutations: `reportProblem` / `recordProblemBusinessReport` / `updateProblemStatus` / `replyProblem` → machines + `problemMutationPorts(ctx)`.
3. Machines call `problem-support/` `decide*` helpers; auth snapshots come from ports (Clerk stays host-side).

### Inquiry dual-path

1. Server entry resolves backend: `resolveInquiryServerBackend()` in `src/modules/inquiries/inquiry.functions.ts`.
2. Factory: `createInquiryServerBackend('source' | 'local-e2e')` — local-e2e only when `isLocalE2EAuthBypassEnabled()`.
3. Source path uses Convex inquiry hosts + `inquirySourceStatePorts` / `inquiryNotificationPorts`.
4. Local path uses `createLocalE2eInquiryServerBackend()` in `src/modules/inquiries/internal/local-e2e-adapter.ts` (fail-closed outside bypass).

### Notification outbox

1. Inquiry commands enqueue via `InquiryNotificationPorts.enqueueDispatches` → `convex/inquiryNotificationBridge.ts`.
2. Bridge persists through shared helpers in `convex/notificationOutboxPersistence.ts` (`toDispatchRecord`, `upsertNotificationDispatch`, …).
3. Source-state aggregate load/persist: `notificationOutboxSourceStatePorts(db)` → `convex/notificationOutboxSourceState.ts`.
4. Dispatch / webhook / retry: `convex/notificationOutbox.ts` + module commands in `src/modules/notification-outbox/internal/commands.ts`.

**State Management:**
- Durable run/attempt/outbox/problem rows in Convex tables owned by `customer-request` schema fragment.
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

**ProblemMutationPorts (ADR-012):**
- Purpose: Durable problem report/claim/status/reply commits + authority snapshots
- Examples: `machines/problem-ports.ts`, `convex/customerRequestRouteExecutionProblemPorts.ts`
- Pattern: Machines stay free of Clerk; host injects `resolveBusinessProblemAuthority` / `SupportAuthority`

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
- Responsibilities: Export identities for start/lease/outcome/cancel/problem + residual dispatch helpers

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
- **Circular imports:** `internal/` is private to its module (`tests/imports/private-imports.test.ts`). Machines may import `journal/` / `problem-support/`; those packages must not import machines or Convex adapters.
- **Port adapter size ceiling:** ~1k lines per `*Ports.ts` adapter — journal ports (~979) are near ceiling; cancel/problem are separate files by design.
- **Authority separation:** Mandate, preparation, and route stay separate (ADR-002 note in `application/public.ts`); Application composes them, does not merge helpers.
- **Public copy:** No internal architecture words on human surfaces (`AGENTS.md` / public-copy skill).

## Anti-Patterns

### Shallow Convex sibling chops

**What happens:** Split host into `customerRequestRouteExecutionStart.ts` / `…Cancel.ts` / `…Problem.ts` without module ports.
**Why it's wrong:** Moves lines without deepening write authority; duplicates sequences; banned by ADR-011/012 and CONCERNS.
**Do this instead:** Thin shells in `customerRequestRouteExecution.ts` + `*JournalPorts.ts` / `*CancelPorts.ts` / `*ProblemPorts.ts` + machines under `route-execution/machines/`.

### WritePlan / intendedPatches in pure modules

**What happens:** Return patch DTOs from `journal/` or `machines/` for the host to apply later.
**Why it's wrong:** Breaks lease/outcome/cancel atomicity; digests desync; thinness tests forbid tokens.
**Do this instead:** Semantic port methods that commit inside the same `MutationCtx` transaction.

### Growing JournalMutationPorts with cancel/problem

**What happens:** Add cancel/problem commits onto journal ports to “finish” the god file.
**Why it's wrong:** Exceeds adapter ceiling; mixes auth matrices and table sets (ADR-012).
**Do this instead:** Dedicated `CancelMutationPorts` / `ProblemMutationPorts`.

### Application or workers constructing mutation ports

**What happens:** Callers import machines or open a second mutation to “apply” work.
**Why it's wrong:** Breaks transactional boundary and Node bundling rules.
**Do this instead:** Always go through `internal.customerRequestRouteExecution.*` export identities.

### Local-e2e backend without bypass

**What happens:** Construct `createLocalE2eInquiryServerBackend()` outside auth bypass.
**Why it's wrong:** Fixture path must be fail-closed (`local-e2e-adapter.ts`).
**Do this instead:** Only via `createInquiryServerBackend` when `isLocalE2EAuthBypassEnabled()`.

## Error Handling

**Strategy:** Domain results as discriminated unions (`kind: 'refused' | 'conflict' | …`); integrity failures throw named errors rather than soft-success.

**Patterns:**
- Machines return refuse/conflict/replayed results for expected control flow.
- Integrity helpers in `journal/integrity.ts` — host/machines throw on digest/state mismatch.
- Application wraps outcomes via `toActionResult` / `CustomerRequestActionResult` in `application/action-result.ts`.
- Inquiry source errors mapped through `inquirySourceError` in functions layer.

## Cross-Cutting Concerns

**Logging:** Observability module + audit events (`src/modules/observability/`); avoid console-only authority.
**Validation:** Zod at TanStack/action boundaries; Convex `v.*` at mutation/action edges; bounded JSON parsers at host/machine edge.
**Authentication:** Clerk identity on host queries/mutations; service assertion envelopes for Customer Request actions (`service-auth-envelope.ts`); admin via `convex/authz.ts` `resolveAdminAuthority`.
**Thinness enforcement:** Unit tests that read host/ports/machine sources and assert wiring + purity (no Convex imports in machines).

## Post-campaign deepen map (Waves 23–37)

| Wave band | Landed deepen | Primary seams |
|-----------|---------------|---------------|
| 23–32 | Application slices (provide-facts, authorize-preparation, refine, confirm-route, action-projection, standing); capability-supply eligible/publish/withdraw/graph/probe; inquiry source-state + notification bridge; evidence-load ports; ADR-011 journal machines (start/lease/outcome) | `application/*`, `capabilitySupply*Ports.ts`, `inquirySourceStatePorts.ts`, `inquiryNotificationPorts.ts`, `customerRequestEvidenceLoadPorts.ts`, Journal ports + machines |
| 33–34 | ADR-012 cancel + problem mutation machines | Cancel/Problem ports + machines |
| 35–37 | Success-outcome deepen residual + inquiry dual-path factory + shared `notificationOutboxPersistence`; campaign close at `3463c1d4` | `record-outcome` / journal commits; `inquiry.functions.ts` factory; outbox persistence helpers |

**Still host-owned (not deepen-extracted under ADR-011/012):** `recoverExpiredDispatch`, `markDispatched`, `recordNotReleased`, `markAccepted`, `openLeasedDispatch`, plus fat support/business read queries that still resolve auth inline in `customerRequestRouteExecution.ts`. Prefer a later ADR before sibling chops.

---

*Architecture analysis: 2026-07-18 · last_mapped_commit `3463c1d4`*
