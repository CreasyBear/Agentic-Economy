# Architecture

**Analysis Date:** 2026-07-17  
**Inspected revision:** `7deffac41e103ee619ce099db531fc2127ba9985`  
**last_mapped_commit:** `7deffac41e103ee619ce099db531fc2127ba9985`

## Pattern Overview

**Overall:** Full-stack modular monolith — TanStack Start (React 19 + file routes) over Convex, with domain modules that declare operations once as actions and fan out to UI, HTTP, agent JSON, and answer-thread tools.

**Key Characteristics:**
- Domain modules under `src/modules/<domain>/` with enforced `public.ts` / `internal/` seams
- Thin route adapters in `src/routes/` — no Convex transport or schema ownership in routes
- One action registry (`src/modules/actions/index.ts`) — define once, call from every surface
- Durable source of truth in Convex; TanStack server functions and HTTP handlers call through source ports
- Customer Request V2 is the canonical authenticated request lifecycle; registry + qualified inquiry remain the public discovery conversion path
- Neutral routing kernel (`src/modules/routing-kernel/`) is bridged by Customer Request (`kernel-router.ts`), not by route handlers inventing a second router

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Surfaces                                                                │
│  Human UI (`src/routes/*.tsx`, `src/components/ae/`)                     │
│  HTTP API (`src/routes/api.*`, `/api/v1/requests*`)                      │
│  Discovery (`/llms.txt`, `/SKILL.md`, `/api/businesses*`)                │
│  Answer / harness (`src/modules/answer*`, `src/modules/harness/`)        │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ thin adapters + ActionDefinition.run
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Domain modules (`src/modules/*/public.ts`, `*.actions.ts`,             │
│  `*.functions.ts`) — validation, projection, admission, compilation     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ Convex source ports (`src/lib/server/convex-source.ts`)
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Convex (`convex/*.ts` + composed `convex/schema.ts`)                   │
│  Application composition (e.g. `customerRequestApplication.ts`)         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Layers

**Surface / Route Layer:**
- Purpose: HTTP and page entry; parse request, call one public seam or action, return response/UI
- Contains: TanStack file routes under `src/routes/`, UI under `src/components/ae/` and Astryx wrappers in `src/components/astryx/`
- Location: `src/routes/`, `src/components/`
- Depends on: module `public.ts`, `*.actions.ts`, `*.functions.ts`, and `src/lib/server/*` API handlers — never `modules/*/internal/*`
- Used by: browsers, assistants, external agents, operator sessions

**Action / Contract Layer:**
- Purpose: Boundary-honest operation contracts shared across surfaces
- Contains: `ActionDefinition` consts, Zod input/output schemas, `summary` / `boundaries` / `surfaces` / `readOnly`
- Location: `src/modules/common/action.ts`, `src/modules/<domain>/<domain>.actions.ts`, registry at `src/modules/actions/index.ts`
- Depends on: `*ThroughSource` / read helpers from `*.functions.ts` (not `internal/`)
- Used by: HTTP routes, answer-thread tool runner, harness tool contracts, UI server fns

**Domain Module Layer:**
- Purpose: Own business logic, projections, compilers, and Convex table fragments
- Contains: `public.ts` barrels, `internal/` implementation, optional `*.functions.ts` source adapters
- Location: `src/modules/<domain>/`
- Depends on: other modules only via their `public.ts`; shared primitives in `src/modules/common/`
- Used by: routes, sibling modules (public only), Convex functions that import domain pure logic

**Server Adapter Layer:**
- Purpose: Cross-cutting HTTP/auth/admission plumbing and Customer Request API handlers
- Contains: Convex client helpers, source-write admission middleware wiring, Customer Request HTTP handlers, sandbox provider hosts
- Location: `src/lib/server/`, `src/lib/http/`, `src/start.ts` middleware stack
- Depends on: domain public seams and security admission (`src/modules/security/`)
- Used by: routes and server functions

**Persistence / Convex Layer:**
- Purpose: Durable queries, mutations, actions, crons, and HTTP router for sandbox/retired paths
- Contains: `convex/*.ts` functions; schema composition root `convex/schema.ts` spreading module-owned `*Tables` fragments
- Location: `convex/`
- Depends on: module schema fragments under `src/modules/*/internal/*schema*`; domain pure modules for application logic
- Used by: TanStack via `src/lib/server/convex-source.ts`

## Data Flow

**Public registry search (HTTP):**

1. `GET /api/businesses/search` — `src/routes/api.businesses.search.ts`
2. Parse query params with `registrySearchAction.schema`
3. `registrySearchAction.run` → `readPublicRegistrySearchPage` in `src/modules/registry/registry.functions.ts`
4. Source port queries Convex `registry:searchPublicBusinessCatalog` (and optional catalog search port)
5. Project inquiry-capable page shape; return JSON

**Qualified inquiry submit:**

1. Action `inquiry.submit` (`src/modules/inquiries/inquiry.actions.ts`) or UI/server fn path
2. Write path requires `SourceWriteAdmission` (`src/modules/security/source-write-admission.ts`, wired in `src/start.ts` / `src/lib/server/source-write-admission.ts`)
3. `submitPublicInquiryThroughSource` persists via Convex inquiry functions
4. Returns receipt + delivery state — not booking/payment/dispatch

**Authenticated Customer Request (human):**

1. `POST /api/requests` — `src/routes/api.requests.ts` → `src/lib/server/customer-request-api.ts`
2. Zod + sensitive-input admission; Convex `customerRequestApplication:submit`
3. Domain compile/evaluate/prepare/project in `src/modules/customer-request/` (`compiler.ts`, `evaluation.ts`, `preparation.ts`, `customer-projection.ts`)
4. Kernel bridge for structured quotes via `src/modules/customer-request/kernel-router.ts` → `src/modules/routing-kernel/application.ts`
5. Same `CustomerRequestView` vocabulary returned for inspect/resume; opaque `requestRef` only at the boundary

**Authenticated Customer Request (external agent):**

1. `POST /api/v1/requests*` — e.g. `src/routes/api.v1.requests.ts` → `src/lib/server/customer-request-agent-api.ts`
2. Clerk API key (`customer_requests:create`); service assertion in `src/modules/customer-request/service-auth-envelope.ts`
3. Same application composition as human path; never accept capability/RoutePlan/mandate digests from the caller

**Answer-thread tool use:**

1. Answer turn uses harness/answer agent (`src/modules/answer/`, `src/modules/answer-thread/`)
2. Tool IDs resolve through `findAction` (`src/modules/actions/index.ts`) — see `src/modules/answer-thread/internal/tool-runner.ts`
3. Answer-model allowlist pins read tools (`AnswerModelToolIds` in `src/modules/harness/tool-contract.ts`: `registry.search`, `registry.detail`)

**State Management:**
- Durable state: Convex documents (Requests, mandates, catalog projections, inquiries, harness sessions, etc.)
- Request/response: largely stateless per HTTP call; resume by `requestRef` / slug / thread id
- Client UI: TanStack Router + React; Convex reactivity where wired for operator/owner surfaces
- No second intent compiler on the legacy Answer Thread path for Customer Request compilation

## Key Abstractions

**ActionDefinition:**
- Purpose: Single operation contract for UI/HTTP/agentJson/answerThread
- Examples: `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/customer-request/customer-request.actions.ts`
- Pattern: `defineAction` in `src/modules/common/action.ts`; explicit registration array in `src/modules/actions/index.ts`

**Module public seam:**
- Purpose: Only legal import path for routes and sibling modules
- Examples: `src/modules/registry/public.ts`, `src/modules/customer-request/public.ts`, `src/modules/discovery/public.ts`
- Pattern: Barrel re-exports `Impl` aliases from `internal/`; enforced by `tests/imports/private-imports.test.ts`

**ThroughSource / source port:**
- Purpose: Bind domain reads/writes to Convex (or test doubles) without routes owning transport
- Examples: `submitPublicInquiryThroughSource`, `readPublicRegistrySearchPage`, `callSourceAction` / `callPublicSourceQuery` in `src/lib/server/convex-source.ts`
- Pattern: Port object or named `*ThroughSource` function; `createServerFn` wrappers in `*.functions.ts` for UI

**CustomerRequestView / customer projection:**
- Purpose: Customer-safe state machine vocabulary — no binding IDs, digests, or kernel internals
- Examples: `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/agent-contract.ts`
- Pattern: Projection from durable aggregate + evaluation/preparation results

**NeutralRoutingKernel:**
- Purpose: Capability-binding quote/prepare/authorize/execute/inspect operations for conformant providers
- Examples: `src/modules/routing-kernel/application.ts`, `src/modules/routing-kernel/http-capability-binding.ts`
- Pattern: Kernel interface + adapters; Customer Request bridges via `kernel-router.ts`

**SourceWriteAdmission:**
- Purpose: Signed admission for consequential writes (AE write gate)
- Examples: `src/modules/security/source-write-admission.ts`, middleware in `src/start.ts`
- Pattern: Request digest + scope + operation key verified before mutations

**Harness tool contract:**
- Purpose: Tier, approval mode, exposure, and schema diagnostics for tools used by answer/harness loops
- Examples: `src/modules/harness/tool-contract.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/harness/run-loop.ts`
- Pattern: Policy wrappers over ActionDefinition; owner/admin modes stay off public agent surfaces

**ModuleResult:**
- Purpose: Discriminated `kind: 'ok' | 'error'` results with codes and retryability
- Examples: `src/modules/common/result.ts`
- Pattern: Prefer structured results over thrown business failures at domain boundaries

## Entry Points

**TanStack Start app:**
- Location: `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/__root.tsx`
- Triggers: Vite/Nitro HTTP (dev `vite dev`, prod `vite start` / Vercel)
- Responsibilities: Middleware (observability, CSP headers, CSRF, source-write context, Clerk), router registration, root providers (Astryx theme, Clerk)

**File routes:**
- Location: `src/routes/**`
- Triggers: Matched URL (pages and `api.*` server handlers)
- Responsibilities: Thin adapt; call actions or `src/lib/server/*` handlers

**Convex functions:**
- Location: `convex/*.ts`
- Triggers: Client/source ports, crons (`convex/crons.ts`), Convex HTTP (`convex/http.ts`)
- Responsibilities: Authz, persistence, application composition (e.g. `convex/customerRequestApplication.ts`), sandbox provider HTTP, retired V1 routing stubs

**Action registry:**
- Location: `src/modules/actions/index.ts`
- Triggers: Import-time registration; `listActions` / `findAction` at runtime
- Responsibilities: Unique action IDs; single catalog of machine-callable AE operations

**Discovery surfaces:**
- Location: `src/routes/llms[.]txt.ts`, `src/routes/SKILL[.]md.ts`, `src/routes/api.businesses*.ts`, `src/routes/$slug.ucp.ts`
- Triggers: Assistants and crawlers
- Responsibilities: Plain-text / JSON catalog and skill material via `src/modules/discovery/`

## Error Handling

**Strategy:** Boundary validation with Zod (`safeParse` / `.parse`); domain `ModuleResult` or discriminated agent result schemas; HTTP status mapping in `src/lib/server/*`; observability capture in `src/start.ts` middleware

**Patterns:**
- API handlers map `ConvexSourceError` to status codes (`src/lib/server/convex-source.ts`, e.g. `customer-request-api.ts`)
- Writes throw or return admission errors via `SourceWriteAdmissionError`
- Actions expose `kind: 'error'` outputs with `retryable` for machine consumers
- UI uses `AeObservabilityErrorBoundary` (`src/components/ae/feedback/`) plus Sentry/PostHog when enabled

## Cross-Cutting Concerns

**Logging / observability:**
- Server middleware in `src/start.ts` → `src/lib/observability/` (Sentry, PostHog)
- Domain funnel/events via `src/modules/observability/`

**Validation:**
- Zod at action and HTTP boundaries (prefer `.strict()` objects)
- Import/architecture guardrails: `tests/imports/*`, scanners in `src/lib/ui/contract-scans.ts`

**Authentication / authorization:**
- Clerk (`@clerk/tanstack-react-start`) for humans and operator UI
- Customer Request agent path: Clerk API keys + HMAC service assertion (`customer-request-agent-auth.ts`, `service-auth-envelope.ts`)
- Owner/admin harness approval modes in `src/modules/harness/approval-policy.ts` — never expose owner-only ops on answer/agent surfaces

**Security headers / CSRF:**
- `src/lib/http/security-headers.ts`, `createCsrfMiddleware` in `src/start.ts`

**Architectural constraints (enforced):**
- Routes must not import `convex/schema`, `convex/browser|server`, or `modules/*/internal/*` (`tests/imports/route-boundary.test.ts`)
- Sibling modules must not import another module's `internal/` (`tests/imports/private-imports.test.ts`)
- Convex schema tables live in module fragments; `convex/schema.ts` only composes
- Domain-specific provider behavior stays in capability contracts/adapters — neutral compiler and customer projection must not change when a conformant business is added

**Anti-patterns (do not introduce):**
- Second Customer Request / intent compiler on the Answer Thread path — compile through `src/modules/customer-request/`
- Route files owning Convex clients or table definitions — use source ports and module schemas
- Declaring an action surface without registration in `src/modules/actions/index.ts` (side-effect imports tree-shake away)
- Treating registry match or sandbox provider success as proof of booking, payment, or real fulfilment
- Labelling JSON agent surfaces MCP/OpenAPI/callable on human copy without a proven contract

---

*Architecture analysis: 2026-07-17*  
*Update when major patterns change*  
*Mapped from commit `7deffac41e103ee619ce099db531fc2127ba9985`*
