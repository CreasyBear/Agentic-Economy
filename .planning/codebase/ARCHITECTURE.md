<!-- refreshed: 2026-07-18 -->
# Architecture

**Analysis Date:** 2026-07-18
**last_mapped_commit:** 19e988f5

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Surfaces (TanStack Start routes + actions)                                  │
│  `src/routes/**` · `src/modules/actions/index.ts` · React views              │
├──────────────────┬───────────────────────┬──────────────────────────────────┤
│  Registry /      │  Customer Request API │  Quiet agent door                │
│  Inquiry UI/HTTP │  `api.requests*`      │  `GET/POST /api/agent/tools`     │
│  `registry`      │  `api.v1.requests*`   │  `harness/tool-contract.ts`      │
│  `inquiries`     │                       │                                  │
└────────┬─────────┴───────────┬───────────┴──────────────────┬───────────────┘
         │                     │                              │
         ▼                     ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Domain modules (`src/modules/**`)                                           │
│  public.ts barrels · application/ · route-execution/ · internal/             │
├──────────────────┬───────────────────────┬──────────────────────────────────┤
│  customer-request│  capability-supply    │  contracts / kernel / harness    │
│  application/*   │  binding·offering·    │  capability-contract*            │
│  route-execution │  eligibility·pub·     │  routing-kernel · harness        │
│                  │  operation-ledger     │                                  │
└────────┬─────────┴───────────┬───────────┴──────────────────┬───────────────┘
         │                     │                              │
         ▼                     ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Thin Convex ports (`convex/*.ts` + `*Ports.ts`)                             │
│  Auth · validators · ActionCtx/MutationCtx wiring · DB adapters              │
│  Application ~1749 · capabilitySupply ~973 · RouteExecution ~2463            │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Convex data model                                                           │
│  `convex/schema.ts` ← module `internal/*schema*` fragments                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

Post god-file deepen Waves 1–22: orchestration and pure decisions live under
`src/modules/**`. Convex files keep transport, auth, Convex validators, and
port implementations that call `ctx.runQuery` / `ctx.runMutation` / table
access. Journal **machines** remain deferred inside
`convex/customerRequestRouteExecution.ts` (~2463 lines); integrity, cancel/
lease decisions, evidence export, and problem-support decisions already sit in
`src/modules/customer-request/route-execution/`.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Action registry | Declares boundary-honest operations once; fans out to UI/HTTP/agent surfaces | `src/modules/actions/index.ts` |
| Customer Request application | Interpret/compile, facts, refine, compare/resume, confirm, standing route, preparation egress, problem-route orchestration | `src/modules/customer-request/application/public.ts` |
| Customer Request Convex actions | Authenticated action adapters; inject `*Ports` into application fns | `convex/customerRequestApplication.ts` |
| Application ports | Wire `ActionCtx` to load/commit/replay helpers | `convex/customerRequest*Ports.ts` |
| Route execution journal logic | Integrity digests, cancel/lease decisions, customer evidence export | `src/modules/customer-request/route-execution/journal/` |
| Route problem support | Problem report/claim/status/reply decisions + projections | `src/modules/customer-request/route-execution/problem-support/` |
| Route execution Convex | Internal mutations/queries for run journal, dispatch, problems | `convex/customerRequestRouteExecution.ts` |
| Capability supply domain | Binding, offering, eligibility, publication, quarantine, operation ledger | `src/modules/capability-supply/internal/**` |
| Capability supply Convex | Mutations/queries; call module writers via supply ports | `convex/capabilitySupply.ts` |
| Supply ports | DB adapters for eligibility, writers, publication, operations | `convex/capabilitySupply*Ports.ts` |
| Capability contracts | Exact contract decision model + registry documents | `src/modules/capability-contract/public.ts`, `src/modules/capability-contract-registry/` |
| Routing kernel | Neutral routing tables/runtime (destination engine inventory) | `src/modules/routing-kernel/` |
| Harness | Tool contracts, approval policy, run loop, quiet-agent allowlist | `src/modules/harness/` |
| Registry / inquiries | Public catalog discovery + qualified inquiry write | `src/modules/registry/`, `src/modules/inquiries/` |
| Schema composition | Spreads module-owned table fragments only | `convex/schema.ts` |

## Pattern Overview

**Overall:** Ports-and-adapters (hexagonal) over domain modules, with Convex as
the persistence/runtime adapter and TanStack Start routes as HTTP adapters.

**Key Characteristics:**
- Domain orchestration is pure(ish) TypeScript under `src/modules/**`, taking
  explicit `*Ports` objects for IO.
- Convex files import from `application/public` or `internal/<slice>` and
  implement ports; they do not own business branching for deepened flows.
- One action definition (`defineAction` in `src/modules/common/action.ts`)
  fans out to multiple surfaces; quiet-agent exposure needs a second allowlist
  gate in `src/modules/harness/tool-contract.ts`.
- Module privacy: `internal/*` is importable only within the owning module
  (`tests/imports/private-imports.test.ts`).
- Schema ownership: tables live in module fragments; `convex/schema.ts` only
  composes.

## Layers

**Surface layer:**
- Purpose: HTTP/API routes, React pages, agent-tools door, operator UI
- Location: `src/routes/`, `src/views/`, `src/components/`
- Contains: TanStack route handlers, page compositions, Astryx UI
- Depends on: module `public.ts`, `*.functions.ts`, action registry
- Used by: browsers, authenticated agents, operators

**Action / server-function layer:**
- Purpose: Boundary-honest operation contracts and TanStack `createServerFn`
- Location: `src/modules/*/<module>.actions.ts`, `*.functions.ts`
- Contains: `ActionDefinition`, Zod schemas, source-adapter bindings
- Depends on: Convex client refs, module public APIs
- Used by: routes, UI, `GET/POST` agent tools

**Application / domain layer:**
- Purpose: Request lifecycle orchestration, projections, supply commands
- Location: `src/modules/customer-request/application/`,
  `src/modules/customer-request/route-execution/`,
  `src/modules/capability-supply/internal/`
- Contains: use-case functions, port types, pure decisions, projections
- Depends on: capability-contract public types, common digests/hashes
- Used by: Convex action/mutation adapters

**Convex adapter layer:**
- Purpose: Auth, validators, durable storage, scheduling, Node-isolated actions
- Location: `convex/`
- Contains: `action` / `mutation` / `query` / `internal*`, `*Ports.ts`
- Depends on: deepened modules; must not pull `node:*` into query/mutation graphs
- Used by: TanStack server fns, workers, crons

**Persistence layer:**
- Purpose: Document store + indexes
- Location: module `internal/convex-schema.ts` or `internal/schema.ts`, composed
  in `convex/schema.ts`
- Contains: `defineTable` fragments
- Depends on: Convex `defineSchema`
- Used by: all Convex functions via generated data model

## Data Flow

### Primary Customer Request path

1. HTTP entry at `src/routes/api.requests.ts` or
   `src/routes/api.v1.requests*.ts` (and sibling resource routes).
2. Server functions / Convex actions in `convex/customerRequestApplication.ts`
   verify principal/service assertion, then call application functions from
   `src/modules/customer-request/application/public.ts`.
3. Application code (e.g. `provideCustomerRequestFacts` in
   `application/provide-facts/provide.ts`) uses injected `ProvideFactsPorts`
   implemented in `convex/customerRequestProvideFactsPorts.ts`.
4. Ports load/commit via `internal.customerRequestV2.*` queries/mutations and
   nested application helpers (compile, egress recovery).
5. Result projects through `action-projection` / customer projection helpers and
   returns as `CustomerRequestActionResult`.

### Capability supply admission path

1. Mutation/query in `convex/capabilitySupply.ts` validates actor and envelope.
2. Operation ledger commands from
   `src/modules/capability-supply/internal/operation-ledger/` decide register /
   quarantine / eligibility with replay policy.
3. Writers in `internal/binding/`, `internal/offering/`, `internal/eligibility/`,
   `internal/publication/` run against ports from
   `convex/capabilitySupplyWriterPorts.ts` /
   `capabilitySupplyEligiblePorts.ts` /
   `capabilitySupplyPublicationPorts.ts` /
   `capabilitySupplyOperationPorts.ts`.
4. Eligible exact supply is listed for routing via module eligibility + Convex
   read adapters.

### Route execution / journal path

1. Application `runRoute` / cancel actions in
   `convex/customerRequestApplication.ts` trigger mandate admission and
   execution start.
2. Internal journal mutations in `convex/customerRequestRouteExecution.ts`
   (`startOrResume`, `leaseNextDispatch`, `markDispatched`, `recordOutcome`, …)
   persist run/attempt state.
3. Pure integrity and cancel/lease decisions come from
   `src/modules/customer-request/route-execution/journal/` (machines still
   deferred in the Convex file).
4. Problem report/reply/support flows call
   `route-execution/problem-support/` decisions and projections, then persist
   via the same Convex file.

**State Management:**
- Durable request aggregate and route generations: Convex
  (`customerRequestV2` family + schema fragments under
  `src/modules/customer-request/internal/`).
- Client UI: TanStack Router + React; no second customer-intent compiler on the
  legacy Answer Thread path.
- Harness runs: `src/modules/harness/` session journal and evidence envelopes.

## Key Abstractionsions

**ActionDefinition:**
- Purpose: Single declared operation with summary, boundaries, surfaces, schemas
- Examples: `src/modules/customer-request/customer-request.actions.ts`,
  `src/modules/registry/registry.actions.ts`
- Pattern: `defineAction` → register in `src/modules/actions/index.ts`

**Application Ports (`*Ports`):**
- Purpose: IO boundary for application use-cases (load, commit, replay, graph)
- Examples: `ProvideFactsPorts`, `CompareResumePorts`, `ConfirmRoutePorts`,
  `StandingRoutePorts`, `ProblemRoutePorts`, `AuthorizePreparationPorts`
- Pattern: type in `application/<slice>/types.ts`; implement in
  `convex/customerRequest*Ports.ts`; pass into application function

**EligibleSupplyPorts / OperationLedgerPorts / Publication ports:**
- Purpose: Capability-supply persistence and contract lookups without Convex
  types in pure modules
- Examples: `src/modules/capability-supply/internal/eligibility/ports.ts`,
  `internal/publication/ports.ts`, `internal/operation-ledger/types.ts`
- Pattern: Convex `capabilitySupply*Ports.ts` implements; module owns policy

**RequestGraph / interpret-compile:**
- Purpose: Assemble exact contracts + eligible supply, interpret NL, compile
  commit
- Examples: `application/interpret-compile/`
- Pattern: ports supply graph + commit; pure bind/rebind of facts

**Route journal decisions:**
- Purpose: Deterministic integrity and cancel/lease/recovery kinds
- Examples: `route-execution/journal/integrity.ts`,
  `route-execution/journal/decisions.ts`
- Pattern: pure functions over snapshots; Convex mutators apply results

**Module public barrel:**
- Purpose: Only cross-module import surface
- Examples: `src/modules/registry/public.ts`,
  `src/modules/capability-supply/public.ts`,
  `src/modules/customer-request/application/public.ts`
- Pattern: re-export from `internal/` or application slices; never import
  sibling `internal/` from outside

## Entry Points

**TanStack Start HTTP / pages:**
- Location: `src/routes/`
- Triggers: browser, agent HTTP clients, webhooks
- Responsibilities: parse request, call server fns / Convex, return JSON or UI

**Customer Request API:**
- Location: `src/routes/api.requests*.ts`, `src/routes/api.v1.requests*.ts`
- Triggers: authenticated external agents / human flows
- Responsibilities: create/resume request, facts, confirm, run, cancel,
  problems, repeat permissions, evidence

**Quiet agent tools door:**
- Location: agent tools routes under `src/routes/` +
  `src/modules/harness/tool-contract.ts`
- Triggers: assistants listing/invoking tools
- Responsibilities: expose only allowlisted `agentTools` actions

**Convex Customer Request application:**
- Location: `convex/customerRequestApplication.ts`
- Triggers: server fns and other Convex callers
- Responsibilities: `submit`, `refine`, `provideFacts`, `resume`, `compare`,
  `confirmRoute`, standing-route actions, `runRoute`, `cancelRoute`, problem
  and evidence actions, `authorizePreparation`

**Convex capability supply:**
- Location: `convex/capabilitySupply.ts`
- Triggers: admin/operator/admission mutations and eligibility queries
- Responsibilities: register binding/offering, eligibility, publish/refresh/
  withdraw, quarantine, list eligible supply

**Convex route execution:**
- Location: `convex/customerRequestRouteExecution.ts`
- Triggers: internal workers and application run/cancel path
- Responsibilities: journal lifecycle, dispatch lease, problem persistence,
  evidence export queries

**Schema composition root:**
- Location: `convex/schema.ts`
- Triggers: Convex codegen / deploy
- Responsibilities: spread module table fragments only

## Architectural Constraints

- **Threading:** Single-threaded Convex isolate for queries/mutations; Node
  actions only in `"use node"` files that export actions alone (see
  `.agents/skills/ae-convex-guardrails/SKILL.md`).
- **Global state:** Action registry array in `src/modules/actions/index.ts`
  (assert unique IDs at load). No mutable domain singletons in modules.
- **Circular imports:** Avoid Convex ↔ module cycles by keeping ports in
  `convex/*Ports.ts` and domain types in modules. Modules must not import
  `convex/` except through generated API from Convex files.
- **Module privacy:** Cross-module imports go through `public.ts` (or
  `application/public.ts` for Customer Request application). `internal/` is
  private.
- **Authority separation (ADR-002):** Mandate, preparation, and route stay
  separate; `application/public.ts` composes them and does not merge authority
  helpers.
- **Deepen status:** Application (~1749), capabilitySupply (~973) are thin
  adapters. RouteExecution (~2463) still hosts journal machine sequencing;
  journal decision/integrity/export and problem-support are deepened.

## Anti-Patterns

### Business logic in Convex handlers

**What happens:** Branching and projections grow inside
`convex/customerRequestApplication.ts` or `convex/capabilitySupply.ts`.
**Why it's wrong:** Re-creates god-files; blocks unit testing without Convex.
**Do this instead:** Add or extend a slice under
`src/modules/customer-request/application/<slice>/` or
`src/modules/capability-supply/internal/<slice>/`, export via the module
public barrel, and keep Convex as ports + validators.

### Importing `internal/` across modules

**What happens:** `src/modules/foo` imports `src/modules/bar/internal/...`.
**Why it's wrong:** Breaks the public seam; fails
`tests/imports/private-imports.test.ts`.
**Do this instead:** Export through `bar/public.ts` (or the owning public
barrel).

### Declaring `agentTools` without allowlist

**What happens:** Action sets `surfaces` to include `agentTools` but omits
`PublicQuietAgentToolIds`.
**Why it's wrong:** Action is not on the quiet door; assistants cannot call it.
**Do this instead:** Also update `src/modules/harness/tool-contract.ts`
allowlist deliberately.

### Inline tables in `convex/schema.ts`

**What happens:** New `defineTable` added only in the composition root.
**Why it's wrong:** Breaks module ownership and schema tests.
**Do this instead:** Own the fragment in
`src/modules/<domain>/internal/schema.ts` or `internal/convex-schema.ts`, then
spread it in `convex/schema.ts`.

### Pulling `node:*` into query/mutation graphs

**What happens:** Shared module imported by a mutation also imports `node:crypto`.
**Why it's wrong:** Convex bundler fails non-Node runtime codegen.
**Do this instead:** Isolate Node in a `"use node"` action-only file; keep
domain modules Node-free.

## Error Handling

**Strategy:** Discriminated result unions (`kind: 'refused' | 'conflict' |
'needs_attention' | …`) at application boundaries; Convex validators reject
malformed input; authority failures refuse rather than throw when possible.

**Patterns:**
- Application functions return typed results (`ProvideFactsResult`,
  `CustomerRequestActionResult`) via `toActionResult` /
  `action-projection`.
- Command replay: ports `replayCommittedCommand` short-circuit idempotent
  retries before mutation.
- Integrity failures on supply/route snapshots refuse or mark unavailable
  rather than invent state.

## Cross-Cutting Concerns

**Logging:** Observability module + funnel API
(`src/modules/observability/`, `src/routes/api.observability.funnel.ts`);
source-owned evidence in harness, not console-only traces for consequential
runs.

**Validation:** Zod at action/HTTP boundaries (`.strict()`); Convex `v.*`
validators on Convex functions; contract digests via
`src/modules/common/canonical-digest`.

**Authentication:** Clerk for human/owner sessions; service assertion envelopes
for Customer Request agent principals
(`src/modules/customer-request/service-auth-envelope.ts`);
`convex/authz.ts` for admin authority on supply/execution admin paths.

---

*Architecture analysis: 2026-07-18*
*last_mapped_commit: 19e988f5*
