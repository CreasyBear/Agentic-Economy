# Architecture

**Analysis Date:** 2026-07-13

## Pattern Overview

**Overall:** Full-stack modular monolith with a TanStack Start web/BFF boundary, Convex-owned durable source state, an explicit action-contract registry, and a separately exposed routing-kernel protocol boundary.

**Key Characteristics:**
- File-based TanStack routes in `src/routes/` serve SSR pages, resource routes, JSON APIs, and SSE.
- Bounded contexts live in `src/modules/`; `public.ts` files are the intended cross-module façades and `internal/` is private implementation.
- Operations that need a reusable machine/application contract are declared in `src/modules/*/*.actions.ts` and explicitly registered in `src/modules/actions/index.ts`.
- TanStack server functions and route handlers adapt browser/HTTP requests to domain operations and the Convex source transport.
- Convex table fragments are owned beside their domains and composed centrally in `convex/schema.ts`; deployable functions and HTTP routes live in `convex/`.
- Discovery and qualified-inquiry behavior remains separate from booking, payment, dispatch, and autonomous fulfilment authority.
- The working tree includes current capability-supply and shipping-provider integration work in `src/modules/capability-supply/`, `src/modules/provider-integrations/`, and `convex/capabilitySupply.ts`.

## Layers

**Presentation Layer:**
- Purpose: Render public discovery, answer, listing, inquiry, customer-record, owner, admin, and developer experiences.
- Contains: Page routes in `src/routes/*.tsx`, product components in `src/components/ae/`, Astryx adapters in `src/components/astryx/`, and answer primitives in `src/components/ai-elements/`.
- Depends on: React, TanStack Router, Astryx, module public contracts, and server functions.
- Used by: Browser navigation and server rendering.

**Route and HTTP Adapter Layer:**
- Purpose: Bind URLs and methods to application operations, bound/parse untrusted input, and map typed outcomes to HTML, JSON, or SSE.
- Contains: `createFileRoute` declarations in `src/routes/`, including `src/routes/api.answer.turn.ts`, `src/routes/api.businesses.ts`, `src/routes/api.requests.ts`, and `src/routes/$slug.inquiry.tsx`.
- Depends on: Module actions/public seams and `src/lib/server/` adapters.
- Used by: Browsers, assistants consuming published JSON/text, notification providers, and customer-request clients.

**Action Contract Layer:**
- Purpose: Define reusable typed operations once, including input/output schemas, parameters, read/write classification, allowed surfaces, summaries, and explicit boundaries.
- Contains: `src/modules/common/action.ts`, declarations such as `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, and the explicit registry `src/modules/actions/index.ts`.
- Depends on: Zod, domain application functions, and the harness conversion layer.
- Used by: HTTP business APIs, agent-JSON descriptions, the answer-thread read-tool runner, and harness execution.
- Current source note: `ActionSurface` is `ui | http | agentJson | answerThread`; there is no agent-tools file route or `/api/agent/tools` route in the current route tree. The quiet in-product machine operation path is the answer-thread/harness action runner, while published JSON routes call selected actions directly.

**Application Adapter Layer:**
- Purpose: Coordinate auth, validation, source-write admission, transport calls, and public DTO mapping without owning durable state.
- Contains: `*.functions.ts` files such as `src/modules/inquiries/inquiry.functions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/settings/settings.functions.ts`, and `src/modules/storefront/storefront.functions.ts`.
- Depends on: Domain public APIs, action contracts, and `src/lib/server/convex-source.ts`.
- Used by: Routes, loaders, UI mutations, and action runners.

**Domain Layer:**
- Purpose: Express catalog, registry, inquiry, answer, customer-request, capability, security, routing, lifecycle, evidence, and notification rules independently of web routing.
- Contains: `src/modules/*/public.ts`, focused domain files, and module-private `src/modules/*/internal/` implementations.
- Depends on: Local contracts and `src/modules/common/`; cross-domain access is expected to use public seams.
- Used by: Application adapters, Convex functions, evaluations, examples, and tests.

**Persistence and Background Layer:**
- Purpose: Own durable state, transactional updates, identity/authority checks, scheduled work, provider dispatch state, and backend protocol hosting.
- Contains: `convex/schema.ts`, `convex/authz.ts`, `convex/source_state.ts`, `convex/crons.ts`, domain `convex/*.ts` functions, and `convex/http.ts`.
- Depends on: Convex APIs and domain-owned schema/command contracts.
- Used by: Web server adapters, cron jobs, hosted routing clients, and provider integrations.

**Shared Infrastructure Layer:**
- Purpose: Supply cross-domain runtime adapters rather than product-domain authority.
- Contains: `src/lib/http/`, `src/lib/server/`, `src/lib/observability/`, `src/lib/operator/`, and `src/lib/ui/`.
- Used by: Start middleware, routes, application adapters, presentation, and tests.

## Architectural Boundaries

**Web/BFF Boundary:**
- `src/start.ts` composes observability, security headers, CSRF, source-write admission, and Clerk middleware.
- `src/router.tsx` consumes generated `src/routeTree.gen.ts`; `src/routes/__root.tsx` owns the document shell, Astryx providers, global error handling, and selective Clerk provider installation.
- Routes should adapt requests rather than own Convex schema or persistence logic; `tests/imports/route-boundary.test.ts` and `tests/imports/private-imports.test.ts` protect these seams.

**Action Registry Boundary:**
- `src/modules/actions/index.ts` explicitly imports and registers actions; uniqueness is checked at module initialization.
- Current registrations cover inquiry submit/customer-record read, registry list/search/detail, storefront draft import, demand capture, and owner notification settings.
- Action surface membership is metadata, not authorization by itself. Writes still require request/source admission and, where applicable, owner/admin authority.
- `src/modules/answer-thread/internal/answer-tool-registry.ts` admits only enumerated answer read tools; `src/modules/answer-thread/internal/tool-runner.ts` additionally refuses unknown or non-read-only actions.

**Domain Module Boundary:**
- Typical shape is `public.ts`, optional `*.functions.ts`/`*.actions.ts`, and private `internal/` code.
- `src/modules/common/` owns genuinely shared IDs, stable hashes, result/action contracts, Convex literals, and audit-event vocabulary.
- New capability supply is split between neutral contracts/registration in `src/modules/capability-supply/`, provider-specific shipping adapters in `src/modules/provider-integrations/shipping/`, and durable registration/readback in `convex/capabilitySupply.ts`.

**Convex Source Boundary:**
- `convex/schema.ts` composes module-owned table fragments, including answer-thread, capability-contract registry, capability supply, customer request, inquiry, registry, routing, and security tables.
- `src/lib/server/convex-source.ts` is the web-server gateway for public or Clerk-authenticated Convex queries, mutations, and actions.
- `convex/authz.ts` derives human identity/authority server-side; `convex/sourceWriteAdmission.ts` rechecks write admission at the durable boundary.
- `convex/_generated/` is generated API/data-model material and is not a domain ownership seam.

**Routing Protocol Boundary:**
- `convex/http.ts` exposes `/.well-known/ae-routing.json`, `/v1/route`, `/v1/authorize`, `/v1/execute`, `/v1/reconcile`, `/v1/inspect`, `/v1/cancel`, and `/mcp`.
- This routing-kernel protocol is distinct from the public registry/qualified-inquiry product contract; its authority is enforced by signed caller identity, durable grants, budgets, disclosure constraints, admission, and kernel state.
- `src/modules/routing-kernel/internal/kernel.ts` owns neutral lifecycle transitions; `convex/routingKernelStoreAdapter.ts` supplies durable storage and `convex/routingKernelBindings.ts` supplies provider bindings.

## Data Flow

**Public Catalog Read:**
1. A route such as `src/routes/api.businesses.search.ts` parses query parameters.
2. The route validates through `registrySearchAction.schema` and calls `registrySearchAction.run`.
3. `src/modules/registry/registry.actions.ts` invokes registry source/application logic.
4. `src/lib/server/convex-source.ts` calls the public Convex query used by `src/modules/registry/registry.functions.ts`.
5. `convex/registry.ts` loads durable records and applies registry projections.
6. A public-safe catalog DTO is emitted as JSON or rendered by the registry/listing UI.

**Answer Thread and Internal Tool Use:**
1. `src/routes/api.answer.turn.ts` bounds the body, parses JSON, validates the request, resolves session/thread access, and applies rate limiting.
2. It opens an abort-aware SSE stream and calls `src/modules/answer-thread/internal/turn-orchestrator.ts` through the answer-thread public seam.
3. The orchestrator runs explicit context, intent, routing, retrieval, assembly, safety, persistence, and finalization phases through the harness loop.
4. Retrieval selects only enumerated read tools from `src/modules/answer-thread/internal/answer-tool-registry.ts`.
5. `src/modules/answer-thread/internal/tool-runner.ts` resolves the action registry, enforces read-only execution, validates strict schemas, records hashes/timings, and returns public catalog evidence.
6. The completed snapshot, tool-call evidence, and thread state are persisted to Convex before the route emits completion.

**Qualified Inquiry Write:**
1. A person submits from `src/routes/$slug.inquiry.tsx`; reusable action/harness callers use `inquiry.submit` from `src/modules/inquiries/inquiry.actions.ts`.
2. `src/modules/inquiries/inquiry.functions.ts` validates input, derives operation/correlation identity, and obtains source-write context.
3. `src/start.ts` classifies source-write admission before the request reaches application code.
4. `convex/inquiries.ts` verifies source-write and actor requirements, reconstructs state, and applies inquiry commands.
5. Inquiry, notification, operation, and audit records persist; outbox/cron/provider paths handle delivery and retries.
6. The caller receives a typed receipt, replay result, or bounded refusal. It is a human first-contact message, not booking, payment, dispatch, or fulfilment.

**Customer Request Compilation:**
1. Routes under `src/routes/api.requests*.ts` and `src/routes/api.v1.requests*.ts` use focused helpers in `src/lib/server/customer-request-*.ts`.
2. `src/modules/customer-request/` interprets, compiles, prepares, authorizes, evaluates, and projects customer request state.
3. Capability-contract and capability-supply registries provide the declared/available mechanism inputs; provider integration code supplies provider-specific quote inputs without owning customer authority.
4. Convex adapters in `convex/customerRequest*.ts` and `convex/capabilitySupply.ts` persist the durable records and registrations.

**Routing Kernel Execution:**
1. A signed external caller reaches a route mounted by `convex/http.ts`.
2. The edge envelope and HTTP Message Signature identity are verified, then durable agent grants are resolved.
3. Admission and authorization check route/quote identity, spend, expiry, disclosure, recipient, attempt/exposure, and idempotency constraints.
4. The routing kernel selects a conformant binding and records route/run state through the Convex store adapter.
5. Provider effects execute behind binding adapters; evidence, cancellation, inspection, incident control, and reconciliation remain tied to the durable run graph.
6. Readback/evidence demonstrates what occurred but does not replace the enforcing grant, budget, or kernel authority.

**State Management:**
- Durable product and protocol state resides in Convex tables composed by `convex/schema.ts`.
- Domain logic favors explicit immutable source-state/command transitions and discriminated results.
- Shareable UI state uses route parameters/search; pseudonymous answer access uses a session cookie plus persisted thread ownership.
- External effects use operation/idempotency keys, outbox/attempt records, retries, and reconciliation rather than in-memory completion claims.

## Key Abstractions

**Public Module Seam:**
- Purpose: Expose supported domain contracts while keeping implementation private.
- Examples: `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/customer-request/public.ts`.
- Pattern: Explicit façade enforced by import tests.

**Action:**
- Purpose: Declare a typed operation and its boundary-honest machine metadata once.
- Examples: `registry.search`, `registry.detail`, `inquiry.submit`.
- Pattern: `defineAction` value registered explicitly in `src/modules/actions/index.ts`.

**Source State and Command:**
- Purpose: Keep domain transitions deterministic and separate from storage mechanics.
- Examples: inquiry, registry, settings, routing, and capability source-state operations under module `internal/` directories.
- Pattern: Immutable input state plus command produces typed result and next state/readback.

**Harness Tool and Run Loop:**
- Purpose: Execute actions under schema, approval, read/write, evidence, and phase controls.
- Examples: `src/modules/harness/action-tool.ts`, `src/modules/harness/run-loop.ts`, `src/modules/answer-thread/internal/tool-runner.ts`.
- Pattern: Adapter plus explicit phase/state machine.

**Readback / Receipt / Evidence:**
- Purpose: Make externally observable results reconstructable without mislabelling observation as enforcement authority.
- Examples: inquiry receipts, customer projections, harness evidence envelopes, routing evidence records.
- Pattern: Purpose-specific typed DTO with stable identities/hashes.

**Capability Contract and Supply:**
- Purpose: Separate what a capability promises from what provider-backed supply is registered and available.
- Examples: `src/modules/capability-contract/`, `src/modules/capability-contract-registry/`, `src/modules/capability-supply/`.
- Pattern: Neutral contract/registry boundaries with provider-specific adapters outside the core.

## Entry Points

**TanStack Start Middleware:**
- Location: `src/start.ts`
- Triggers: Every Start request.
- Responsibilities: Observability isolation/flush, security headers, CSRF, write admission, and Clerk middleware.

**Web Router:**
- Location: `src/router.tsx`, `src/routeTree.gen.ts`, and `src/routes/`.
- Triggers: Browser, SSR, resource, and API requests.
- Responsibilities: Match routes and adapt request/UI concerns to application seams.

**Answer SSE API:**
- Location: `src/routes/api.answer.turn.ts`.
- Triggers: `POST /api/answer/turn`.
- Responsibilities: Bound/validate input, enforce access/rate limits, stream sequenced answer events.

**Convex Backend:**
- Location: `convex/schema.ts`, `convex/*.ts`, `convex/crons.ts`.
- Triggers: Web transport calls, scheduled jobs, and internal Convex calls.
- Responsibilities: Durable transactions, authz, source admission, projections, retries, and background work.

**Routing HTTP Protocol:**
- Location: `convex/http.ts`.
- Triggers: Signed routing descriptor/operation requests.
- Responsibilities: Authenticate, admit, authorize, dispatch to the kernel, and return bounded protocol responses.

**Evaluation and Hosted-Proof CLIs:**
- Location: `eval/answer/scripts/*.ts`, `tools/release/`, and `examples/routing-provider/run-*.mjs`.
- Triggers: npm scripts, CI, or operator invocation.
- Responsibilities: Evaluate answer behavior, verify release contracts, and exercise hosted provider/routing paths.

## Error Handling

**Strategy:** Validate and refuse at system boundaries, return discriminated domain outcomes for expected failures, and reserve thrown errors for infrastructure faults or violated invariants.

**Patterns:**
- HTTP handlers bound body size and return stable status/code payloads, e.g. `src/routes/api.answer.turn.ts`.
- Zod validates route/action/server-function inputs; Convex validators define backend arguments and schema.
- Action/harness execution records blocked, refused, error, and complete states instead of silently converting failures to success.
- `ConvexSourceError` in `src/lib/server/convex-source.ts` normalizes missing auth/backend configuration failures.
- Provider and routing authentication failures fail closed and expose safe reason codes/readbacks.
- Sentry/PostHog middleware captures unexpected server failures while flushing telemetry best-effort.

## Cross-Cutting Concerns

**Logging and Observability:** `src/lib/observability/` integrates Sentry/PostHog; `src/modules/observability/` and audit-event contracts own product records, redaction, funnel state, and operation identity.

**Validation:** Zod at web/action boundaries, Convex `v` validators at backend boundaries, strict schemas in the harness, and module-local domain validators.

**Authentication and Authorization:** Clerk protects human owner/admin flows; Convex derives identity server-side. Routing callers use HTTP Message Signatures, directory resolution, explicit grants, and budget/disclosure authority.

**Security:** `src/start.ts` installs CSRF/header/write-admission middleware; durable writes re-check authority; request bodies are bounded; network/provider access is isolated behind server-only adapters.

**Reliability:** Operation/correlation/idempotency IDs, expected versions, outbox records, attempt histories, retry timestamps, run journals, and reconciliation states address replay and partial failure.

**Accessibility and Design:** `src/routes/__root.tsx` installs Astryx providers and global feedback; `tests/ui-contract/` and `tests/e2e/a11y/` enforce structural and accessibility expectations.

---

*Architecture analysis: 2026-07-13*
*Update when major patterns change*
