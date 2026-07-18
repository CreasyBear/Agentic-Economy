<!-- refreshed: 2026-07-18 -->
# Architecture

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `5ea44454` (post residual deepen Waves 23–32)

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Surfaces (TanStack Start + Vite)                                            │
│  `src/routes/**` · `src/components/ae/**` · `GET/POST /api/agent/tools`      │
├──────────────────┬──────────────────┬───────────────────────────────────────┤
│  Actions         │  Server adapters │  Quiet agent door / HTTP APIs         │
│  `src/modules/   │  `*.functions.ts`│  `src/lib/server/**`                  │
│   actions/`      │  `src/lib/server`│  Customer Request v1/v2 routes        │
└────────┬─────────┴────────┬─────────┴──────────────────┬────────────────────┘
         │                  │                            │
         ▼                  ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Domain modules (pure / port-driven) — `src/modules/**`                      │
│  public.ts barrels · application/ · route-execution/machines/ · catalog/     │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ ports interfaces
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Thin Convex hosts + *Ports adapters — `convex/*.ts`                         │
│  schema composition · source_state · journalMutationPorts · inquiry ports    │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Convex tables (module-owned schema fragments)                               │
│  `convex/schema.ts` ← `src/modules/*/internal/{schema,convex-schema}.ts`     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Action registry | Declares boundary-honest operations; fans out to UI/HTTP/agentJson/agentTools | `src/modules/actions/index.ts` |
| Domain modules | Own business logic, validators, projections; export only via `public.ts` | `src/modules/<domain>/` |
| Module functions | TanStack `createServerFn` + Convex source binding | `src/modules/<domain>/<domain>.functions.ts` |
| Module actions | `ActionDefinition` consts; never import `internal/` | `src/modules/<domain>/<domain>.actions.ts` |
| Convex host | Validators, auth/admission, construct ports, call module, return | `convex/*.ts` |
| Ports adapters | Map `MutationCtx`/`ActionCtx`/`RuntimeDb` → domain port types | `convex/*Ports.ts` |
| Schema root | Spreads module table fragments only | `convex/schema.ts` |
| Customer Request application | Interpret/compile, facts, confirm, standing route, problems | `src/modules/customer-request/application/` |
| Route-execution machines | Start / lease / outcome orchestration via `JournalMutationPorts` | `src/modules/customer-request/route-execution/machines/` |
| Pure journal | Predicates, integrity, evidence decisions only (no write-plans) | `src/modules/customer-request/route-execution/journal/` |
| Capability supply graph | Graph query + readiness probe logic behind `CapabilityGraphPorts` | `src/modules/capability-supply/internal/graph/` |
| Catalog assembly | Shared row→catalog adapter for registry and discovery hosts | `src/modules/catalog/internal/catalog-from-rows.ts` |
| Inquiry ledger | Pure submit/reply/close against `InquirySourceState` | `src/modules/inquiries/internal/` |
| Hosted agent journey | Hosted proof runners split by scenario | `src/modules/customer-request/hosted-agent-journey/` |

## Pattern Overview

**Overall:** Deep domain modules behind small public seams, with **thin Convex ports** as the only persistence/runtime adapters (post Waves 23–32 deepen campaign).

**Key Characteristics:**
- Domain logic lives under `src/modules/**`; Convex files validate, authorize, build ports, and delegate.
- Port types are Convex-free TypeScript interfaces in the module; adapters live in `convex/*Ports.ts`.
- Thinness is locked by `tests/unit/**/**-thinness.test.ts` (23 thinness suites) plus `tests/imports/*-boundaries.test.ts`.
- `internal/` is private to the owning module; cross-module and route code must import `public.ts` (`tests/imports/private-imports.test.ts`).
- Operations intended for assistants are registered actions; quiet door also requires `PublicQuietAgentToolIds` in `src/modules/harness/tool-contract.ts`.

## Layers

**Surface / presentation:**
- Purpose: Human UI, public pages, operator consoles, HTTP route handlers
- Location: `src/routes/`, `src/components/ae/`, `src/components/astryx/`
- Contains: Route files, React panels, Astryx wrappers
- Depends on: Module `public.ts`, `*.functions.ts`, `src/lib/server/**`
- Used by: Browsers, assistants hitting HTTP/agent tools

**Action / contract:**
- Purpose: Single declaration of callable operations and boundaries
- Location: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `*.actions.ts`
- Contains: `ActionDefinition` registry
- Depends on: Module functions (not `internal/`)
- Used by: Agent tools door, agent JSON, some UI/HTTP handlers

**Domain / application:**
- Purpose: Orchestration, projections, pure decisions
- Location: `src/modules/**` especially `customer-request/application/`, `inquiries/internal/`, `capability-supply/internal/`
- Contains: Port-driven use cases, pure helpers, schema fragments
- Depends on: Sibling `public.ts`, `src/modules/common/**`
- Used by: Convex hosts and server adapters via ports

**Convex adapter:**
- Purpose: Durable storage, scheduling, auth context, HTTP retirement stubs
- Location: `convex/`
- Contains: Queries/mutations/actions, `*Ports.ts`, `source_state.ts`, workers
- Depends on: Module public APIs and port types
- Used by: App via Convex client / `createServerFn` bindings

**Persistence:**
- Purpose: Table definitions and indexes
- Location: Module `internal/schema.ts` or `internal/convex-schema.ts`; composed in `convex/schema.ts`
- Contains: `defineTable` fragments
- Depends on: Convex validators
- Used by: All Convex functions

## Data Flow

### Primary Customer Request path

1. HTTP or agent client hits `src/routes/api.v1.requests*.ts` / `api.requests*.ts` → `src/lib/server/customer-request-*-api.ts`.
2. Server adapter invokes Convex (`convex/customerRequestApplication.ts`, `customerRequestV2*.ts`) with auth/admission.
3. Host builds ports (e.g. `provideFactsPorts` in `convex/customerRequestProvideFactsPorts.ts`) and calls application functions from `src/modules/customer-request/application/public.ts`.
4. Application returns action results / projections; host persists only through port methods.

### Route execution (journal machines — ADR-011)

1. Worker/host mutation in `convex/customerRequestRouteExecution.ts` validates args.
2. Handler constructs `journalMutationPorts(ctx)` from `convex/customerRequestRouteExecutionJournalPorts.ts`.
3. Machine runs in module code: `startOrResume` / `leaseNextDispatch` / `recordOutcome` under `src/modules/customer-request/route-execution/machines/`.
4. Pure decisions use `src/modules/customer-request/route-execution/journal/`; all writes go through `JournalMutationPorts` only.

### Inquiry submit (host-done source-state / notification ports)

1. `convex/inquiries.ts` mutation loads state via `inquirySourceStatePorts(db).load()`.
2. Pure module `submitInquiry` (`src/modules/inquiries/public.ts`) returns new state + notification.
3. Host bridges notifications with `inquiryNotificationPorts(db).enqueueDispatches(...)`.
4. Host persists with `inquirySourceStatePorts(db).persist(...)`. Thinness locked by `tests/unit/inquiries/inquiry-source-state-thinness.test.ts`.

### Capability supply graph / probe

1. `convex/capabilitySupply.ts` exports `queryCapabilityGraph`, `readCapabilityProbeTarget`, `recordCapabilityProbeResult`.
2. Each handler calls module functions with `capabilitySupplyGraphPorts(ctx.db)` (`convex/capabilitySupplyGraphPorts.ts`).
3. Domain logic in `src/modules/capability-supply/internal/graph/{query-graph,read-probe-target,record-probe-result,probe-digest}.ts`. Auth for inactive inclusion stays in the host.

### Catalog projection (shared adapter)

1. `convex/registry.ts` and `convex/discovery.ts` both call `catalogFromRows(...)`.
2. Shared assembly lives in `src/modules/catalog/internal/catalog-from-rows.ts`, re-exported from `src/modules/catalog/public.ts`.
3. Locked by `tests/unit/catalog/catalog-from-rows.test.ts` (host thinness + no Convex imports in adapter).

**State Management:**
- Durable state: Convex documents; inquiry uses aggregate `InquirySourceState` loaded/persisted through ports.
- Ephemeral UI: React route state and TanStack Start server functions.
- Source-write admission: `convex/sourceWriteAdmission.ts` + `src/lib/server/source-write-admission.ts` middleware in `src/start.ts`.

## Key Abstractions

**ActionDefinition:**
- Purpose: One operation contract for all surfaces
- Examples: `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/customer-request/customer-request.actions.ts`
- Pattern: `defineAction` in `src/modules/common/action.ts`; register explicitly in `src/modules/actions/index.ts`

**Ports (domain → Convex):**
- Purpose: Seam for persistence and side effects without leaking Convex types into domain
- Examples: `JournalMutationPorts` (`machines/ports.ts`), `InquirySourceStatePorts` (`inquiries/internal/ledger/ports.ts`), `CapabilityGraphPorts` (`capability-supply/internal/graph/ports.ts`), application ports under `customer-request/application/**/types.ts`
- Pattern: Type in module; factory `fooPorts(ctx)` in `convex/*Ports.ts`; host calls `moduleFn(args, ports)`

**Route-execution machines (ADR-011):**
- Purpose: Orchestrate start/lease/outcome outside pure `journal/` and outside fat Convex handlers
- Examples: `machines/start-or-resume.ts`, `lease-next-dispatch.ts`, `record-outcome.ts`
- Pattern: Machines import journal; journal must not import machines; host stays thin (`machines-thinness.test.ts`)

**catalogFromRows:**
- Purpose: Single catalog-from-rows adapter shared by registry and discovery Convex hosts
- Examples: `src/modules/catalog/internal/catalog-from-rows.ts`
- Pattern: Host maps DB rows → `CatalogFromRowsInput`; adapter returns `PublicCatalogContract`

**Hosted agent journey split:**
- Purpose: Hosted proof journeys by scenario without a single monolithic runner file
- Examples: `hosted-agent-journey/{run,happy,partial,cancel,discovery,front-door,runtime,types}.ts`; barrel `hosted-agent-journey.ts` re-exports `./hosted-agent-journey/index`

## Entry Points

**Vite / TanStack Start app:**
- Location: `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`
- Triggers: Browser navigation, server functions, API routes
- Responsibilities: Middleware (Clerk, CSRF, source-write admission, security headers, observability), route tree

**Convex backend:**
- Location: `convex/` (schema, functions, crons, `http.ts`)
- Triggers: Client queries/mutations/actions, scheduled workers, Convex HTTP routes
- Responsibilities: Persistence, admission, thin delegation to modules

**Quiet agent tools:**
- Location: Routes under `src/routes/` + harness tool contract
- Triggers: `GET/POST /api/agent/tools`
- Responsibilities: List/invoke allowlisted actions only

**Hosted journey proofs:**
- Location: `src/modules/customer-request/hosted-agent-journey/`
- Triggers: Release/smoke tooling (`tools/`, package scripts)
- Responsibilities: Prove discovery, happy, partial, cancel paths against a live base URL

## Architectural Constraints

- **Threading:** Single-threaded JS event loop (Vite SSR + Convex isolate). Node-only code must use `"use node"` actions and must not be imported by query/mutation graphs (`ae-convex-guardrails`).
- **Global state:** Action registry is a module-level const array in `src/modules/actions/index.ts` with uniqueness assert at load. No other shared mutable process singletons required for domain correctness.
- **Circular imports:** Avoid `internal/` cross-module imports; use `public.ts`. Machines may import journal; journal must not import machines (ADR-011).
- **Schema ownership:** New tables belong in the owning module fragment, then spread in `convex/schema.ts` — never define tables inline in route files.
- **Authority honesty:** Public/assistant surfaces must not claim booking, payment, dispatch, or auto-fulfil; action `boundaries` and PRODUCT/AGENTS contracts bind copy and tools.
- **Retirement:** Legacy routing v1 HTTP/MCP paths in `convex/http.ts` return retired responses from `src/modules/routing-kernel/retirement`.

## Anti-Patterns

### Fat Convex host logic

**What happens:** Business orchestration, digests, or graph assembly implemented inside `convex/*.ts` handlers.
**Why it's wrong:** Breaks deepen campaign invariants; untestable without Convex; duplicates across hosts.
**Do this instead:** Put orchestration in `src/modules/**` behind ports; keep host as validate → ports → call → return. Follow existing `*Ports.ts` + thinness tests.

### Importing `internal/` across modules or from routes

**What happens:** `import … from '@/modules/foo/internal/…'` outside `foo`.
**Why it's wrong:** Violates private-import guardrail; couples callers to unstable internals.
**Do this instead:** Export through `public.ts` (Impl-suffix re-export pattern as in `src/modules/registry/public.ts`).

### Write-plan DTOs inside pure `journal/`

**What happens:** `WritePlan`, `intendedPatches`, or Convex types appear under `route-execution/journal/`.
**Why it's wrong:** Couples integrity predicates to mutation plans (ADR-011 forbidden).
**Do this instead:** Keep predicates in `journal/`; put mutation sequencing in `machines/` with `JournalMutationPorts`.

### Declaring `agentTools` without quiet-door allowlist

**What happens:** Action sets `surfaces` including `agentTools` but id is missing from `PublicQuietAgentToolIds`.
**Why it's wrong:** Action never appears on the public quiet door; false sense of assistant reachability.
**Do this instead:** Register in `src/modules/actions/index.ts` **and** pin id in `src/modules/harness/tool-contract.ts`.

### Per-host catalog builders

**What happens:** Registry and discovery each assemble public catalogs differently.
**Why it's wrong:** Drift between discovery and registry projections.
**Do this instead:** Always call `catalogFromRows` from `src/modules/catalog/public.ts`.

## Error Handling

**Strategy:** Domain returns discriminated results (`kind: 'ok' | 'error' | 'refused' | 'conflict'`, etc.); hosts map to Convex validators / HTTP status without inventing success.

**Patterns:**
- Application layer: `CustomerRequestActionResult` and related types in `src/modules/customer-request/application/action-result.ts`.
- Inquiry: module returns `{ kind: 'ok' | 'error', … }`; host summarizes errors (`summarizeSubmitError` in `convex/inquiries.ts`).
- Machines: return typed `StartResult` / `LeaseResult` / `OutcomeResult`; integrity failures may throw explicit integrity errors.
- Source writes: `requireSourceWrite` / admission before mutations.

## Cross-Cutting Concerns

**Logging:** Observability module + PostHog/Sentry via `src/lib/observability/**` and middleware in `src/start.ts`; operator audit via `src/modules/observability/`.
**Validation:** Zod at action/HTTP boundaries; Convex `v.*` validators on host args; capability contracts via `src/modules/capability-contract/`.
**Authentication:** Clerk (`@clerk/tanstack-react-start`) for humans; service/agent envelopes in `src/modules/customer-request/service-auth-envelope.ts`; owner/admin via `convex/authz.ts`.
**Thinness verification:** Prefer adding or extending a `*-thinness.test.ts` when deepening a host.

---

*Architecture analysis: 2026-07-18 · last_mapped_commit `5ea44454`*
