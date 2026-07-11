# Architecture

**Analysis Date:** 2026-07-11

## Pattern Overview

**Overall:** Full-stack modular monolith: TanStack Start supplies the web/BFF runtime, Convex owns durable source state and background work, and a separately exposed routing kernel handles machine-to-machine capability execution.

**Key Characteristics:**
- File-based routes in `src/routes/` cover SSR pages, resource routes, and HTTP APIs.
- Bounded contexts live in `src/modules/`; cross-module consumers use explicit `public.ts` façades.
- Pure domain transitions are reused by TanStack server functions and deployable Convex functions.
- Convex table fragments are owned by domain modules and composed centrally in `convex/schema.ts`.
- Operational proof is modeled explicitly through audit events, operation keys, attempts, receipts, evidence envelopes, and readbacks.
- Marketplace discovery/inquiry surfaces do not claim the execution authority owned by `src/modules/routing-kernel/`.

## Layers

**Presentation Layer:**
- Purpose: Render public, customer, owner, admin, developer, and evidence-readback experiences.
- Contains: Routes in `src/routes/`, product components in `src/components/ae/`, Astryx adapters in `src/components/astryx/`, and answer UI in `src/components/ai-elements/`.
- Depends on: React, TanStack Router, module public contracts, and server functions.
- Used by: Browser navigation and server rendering.

**Route and HTTP Adapter Layer:**
- Purpose: Bind URLs/methods to application operations, validate bounded input, and map results to responses.
- Contains: `createFileRoute` declarations, loaders, API handlers, SSE endpoints, and well-known/text resources.
- Examples: `src/routes/api.answer.turn.ts`, `src/routes/api.businesses.search.ts`, `src/routes/$slug.inquiry.tsx`.
- Depends on: Module public seams and application/server adapters.

**Application Adapter Layer:**
- Purpose: Coordinate authentication, Zod validation, source-write admission, Convex calls, and DTO mapping.
- Contains: Files such as `src/modules/inquiries/inquiry.functions.ts`, `src/modules/registry/registry.functions.ts`, and `src/modules/demand/demand.actions.ts`.
- Depends on: Domain public APIs and `src/lib/server/convex-source.ts`.
- Used by: Routes, loaders, and UI mutations.

**Domain Layer:**
- Purpose: Express marketplace, inquiry, registry, security, routing, billing, lifecycle, and evidence rules independently of storage.
- Contains: `src/modules/*/public.ts` and module-private `src/modules/*/internal/` implementations.
- Depends on: Local contracts and `src/modules/common/`; cross-domain imports pass through public seams.
- Used by: Application adapters, Convex functions, evaluations, and tests.

**Persistence and Background Layer:**
- Purpose: Own durable state, transactions, identity resolution, scheduled work, provider dispatch, and backend HTTP exposure.
- Contains: `convex/schema.ts`, `convex/source_state.ts`, `convex/authz.ts`, `convex/crons.ts`, domain `convex/*.ts` files, and `convex/_generated/`.
- Depends on: Convex and module public APIs/schema fragments.
- Used by: Server functions, external HTTP callers, cron jobs, and routing agents.

**Shared Infrastructure Layer:**
- Purpose: Supply cross-cutting adapters not owned by one domain.
- Contains: `src/lib/http/`, `src/lib/server/`, `src/lib/observability/`, `src/lib/operator/`, and `src/lib/ui/`.
- Used by: Start middleware, routes, application adapters, and tests.

## Architectural Boundaries

**Web/BFF:**
- `src/start.ts` composes observability, security headers, CSRF, source-write admission, and Clerk middleware.
- `src/router.tsx` consumes generated `src/routeTree.gen.ts`; `src/routes/__root.tsx` owns document/design-system providers and global client concerns.
- Routes are adapters, not persistence owners. `tests/imports/route-boundary.test.ts` rejects route-owned Convex transport and schema imports.

**Domain Modules:**
- Typical shape: `public.ts`, optional `*.functions.ts`/`*.actions.ts`, and `internal/` implementation.
- Public seams export supported contracts and operations. `tests/imports/private-imports.test.ts` rejects cross-module private imports.
- Shared IDs, stable hashes, action/result types, and audit contracts live in `src/modules/common/`.

**Source of Truth:**
- `convex/schema.ts` composes module-owned table fragments such as `src/modules/inquiries/internal/convex-schema.ts`.
- Deployable `convex/*.ts` functions translate documents to domain source state, call module logic, then persist results with `convex/source_state.ts` helpers.
- Web server functions call Convex through `src/lib/server/convex-source.ts` rather than embedding transport in routes.

**Machine Protocol:**
- `convex/http.ts` mounts routing descriptor, HTTP capability, and MCP endpoints.
- `src/modules/routing-kernel/internal/kernel.ts` owns route, quote, authorization, execution, cancellation, inspection, and reconciliation transitions.
- `src/modules/routing-kernel/caller-identity.ts` verifies signed callers; `authorization.ts` evaluates grants and authority.
- `src/modules/routing-kernel/internal/store.ts` defines the storage port; `convex/routingKernelStoreAdapter.ts` implements it durably.
- `CapabilityBindingAdapter` isolates provider quote/execute/reconcile behavior; registrations live in `convex/routingKernelBindings.ts`.

## Data Flow

**Public Catalog Read:**
1. A route under `src/routes/` validates URL/search parameters.
2. It calls a registry/business server function through a public seam.
3. `src/lib/server/convex-source.ts` invokes a public Convex query.
4. `convex/catalog.ts` or `convex/registry.ts` loads source documents and calls `src/modules/catalog/` or `src/modules/registry/` projection logic.
5. A public-safe DTO returns for UI rendering or JSON emission.

**Qualified Inquiry Write:**
1. The route captures target, message, contact, session, and optional answer-thread origin.
2. `src/modules/inquiries/inquiry.functions.ts` validates input and derives operation/correlation identity.
3. Middleware in `src/start.ts` classifies source-write admission; the server function passes that proof to Convex.
4. `convex/inquiries.ts` verifies source-write/actor requirements, reconstructs domain state, and invokes commands from `src/modules/inquiries/public.ts`.
5. Inquiry, notification, operation, and audit records persist atomically; outbox/cron/provider paths dispatch external effects.
6. The server function returns a stable receipt or typed refusal.

**Answer Streaming:**
1. `src/routes/api.answer.turn.ts` bounds/parses the body, validates it, resolves session/thread access, and rate-limits.
2. `src/modules/answer-thread/` coordinates access and turn persistence.
3. `src/modules/answer/` performs catalog grounding, tool/model orchestration, gating, artifact merging, and evidence assembly.
4. The route emits sequenced `AnswerEvent` SSE frames and honors request abort.

**Routing Kernel Execution:**
1. An external agent calls `convex/http.ts` with a signed request.
2. Identity verification and durable agent-grant resolution authenticate the caller.
3. Authorization checks network, quote digest, spend, expiry, disclosure, recipient, and idempotency constraints.
4. The kernel routes across admitted/conformant bindings and returns bounded authorization.
5. Execution delegates the provider effect to a binding adapter and writes protocol/evidence records through the Convex store.
6. Inspection, cancellation, incident control, and reconciliation use the same durable root/leaf run graph.

**State Management:**
- Durable state resides in Convex tables composed by `convex/schema.ts`.
- Domain logic commonly operates on explicit immutable source-state aggregates.
- Shareable UI state uses route search parameters; pseudonymous answer access uses a cookie plus persisted thread ownership.
- External effects use operation/idempotency keys, outbox/attempt records, retries, and reconciliation rather than in-memory completion.

## Key Abstractions

**Public Module Seam:** Explicit façade such as `src/modules/business/public.ts`, enforced by import tests.

**Source State and Command:** Deterministic state transitions such as `InquirySourceState`, `RegistrySourceState`, and `OwnerSettingsSourceState` returning updated state plus result/readback.

**Server Function / Action:** Typed BFF adapter using `createServerFn`, Zod, auth/source-write context, and the Convex gateway.

**Readback / Receipt / Evidence:** Purpose-specific DTOs make externally observable proof explicit without treating readback as enforcement authority.

**Capability Binding Adapter:** Hexagonal port isolating provider-specific quote, execute, cancel, and reconcile effects from neutral routing policy.

**Operation Identity:** Branded IDs and deterministic hashes from `src/modules/common/ids.ts` and `stable-hash.ts` support replay safety and audit reconstruction.

## Entry Points

**TanStack Start Runtime:** `src/start.ts` — registers request middleware.

**Web Router:** `src/router.tsx` and `src/routeTree.gen.ts` — match browser, SSR, and HTTP routes.

**Route Definitions:** `src/routes/` — adapt URL/request concerns to module operations.

**Convex Backend:** `convex/schema.ts`, deployable `convex/*.ts`, `convex/http.ts`, and `convex/crons.ts` — own persistence, transactions, scheduled work, and protocol hosting.

**Evaluation CLIs:** `eval/answer/scripts/*.ts` and `examples/agent-experience/run-audit.ts` — execute answer evaluations and agent experience probes.

## Error Handling

**Strategy:** Validate and refuse at boundaries, use discriminated unions for expected domain outcomes, and throw only for infrastructure/unexpected failures.

**Patterns:**
- HTTP handlers bound request sizes and return stable status/code payloads.
- Zod validates server-function inputs; Convex `v` validators cover backend arguments/results.
- Domain operations return explicit `ok`, `error`, `denied`, `refused`, retry, or repair variants.
- `ConvexSourceError` in `src/lib/server/convex-source.ts` normalizes backend transport failure.
- Root Sentry/PostHog middleware and `AeObservabilityErrorBoundary` capture unexpected failures.
- Provider failures are redacted into safe codes/readbacks; routing auth fails closed on missing evidence/grant fields.

## Cross-Cutting Concerns

**Observability:** `src/lib/observability/` integrates Sentry/PostHog; `src/modules/observability/` owns audit, operation-key, redaction, funnel, and outbox contracts.

**Validation:** Zod at web boundaries, Convex validators at backend boundaries, module-local validators for domain rules, and strict TypeScript options in `tsconfig.json`.

**Authentication:** Clerk protects human owner/admin surfaces via `convex/authz.ts`; routing agents use HTTP Message Signatures and directory resolution. Local E2E bypass is explicit and environment-gated.

**Security:** `src/start.ts` installs CSRF/source-write/header middleware; Convex mutations re-check authority; network/import operations use `src/modules/network-guard/` and bounded server utilities.

**Reliability:** Expected versions, operation/correlation IDs, outbox records, attempt histories, retry timestamps, and reconciliation states address replay and partial failure.

**Accessibility:** Root route focus management and Astryx providers establish global behavior; `tests/ui-contract/` and `tests/e2e/a11y/` enforce UI/accessibility contracts.

---

*Architecture analysis: 2026-07-11*
*Update when major patterns change*
