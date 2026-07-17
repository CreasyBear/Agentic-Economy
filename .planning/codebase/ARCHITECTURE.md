<!-- refreshed: 2026-07-17 -->
# Architecture

**Analysis Date:** 2026-07-17
**Inspected Revision:** `3aa46069a00724679020f7f3cb338cc4ee177591`

## System Overview

```text
+-----------------------------------------------------------------------+
| TanStack Start surfaces                                               |
| `src/routes/`                                                         |
| public pages | owner/admin UI | browser API | authenticated agent API |
+---------------------------+-------------------------------------------+
                            |
                            v
+-----------------------------------------------------------------------+
| Surface adapters                                                      |
| `src/lib/server/` | `src/components/` | `src/views/`                  |
| auth, HTTP parsing, response projection, reusable presentation         |
+---------------------------+-------------------------------------------+
                            |
                            v
+-----------------------------------------------------------------------+
| Source-owned domain modules                                           |
| `src/modules/*`                                                       |
| public contracts, actions, pure policy, internal schemas/adapters      |
+---------------------------+-------------------------------------------+
                            |
                            v
+-----------------------------------------------------------------------+
| Convex source and workers                                             |
| `convex/`                                                             |
| durable state, authz, mutations, queries, actions, scheduled workers   |
+---------------------------+-------------------------------------------+
                            |
                            v
+-----------------------------------------------------------------------+
| External providers                                                    |
| Clerk, notification providers, search/LLM transports, route providers |
+-----------------------------------------------------------------------+
```

The application is a TypeScript full-stack monolith with explicit domain boundaries. TanStack Start owns human and HTTP entry points, `src/lib/server/` adapts transport and identity into domain calls, `src/modules/` owns contracts and policy, and Convex owns durable source state and asynchronous execution. Deeper Request -> RoutePlan -> Approve -> Run -> Inspect machinery exists in source, but its presence does not establish customer reachability or external fulfilment.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Router bootstrap | Creates the generated TanStack route tree and global router behavior | `src/router.tsx` |
| Root document | Installs Astryx, conditional Clerk auth, global feedback, scripts, and styles | `src/routes/__root.tsx` |
| Human routes | Public registry, listing, inquiry, customer-record, legal, auth, owner, and admin pages | `src/routes/` |
| HTTP routes | Thin file-route handlers for public, browser, agent, webhook, and sandbox endpoints | `src/routes/api*.ts` |
| Server adapters | Parse requests, authenticate callers, call Convex, and project HTTP responses | `src/lib/server/` |
| Action registry | Explicitly registers cross-surface operations and their boundary metadata | `src/modules/actions/index.ts` |
| Domain contracts | Export source-owned types, pure rules, projections, and supported public entry points | `src/modules/*/public.ts` |
| Customer Request | Compiles requests, evaluates candidates, prepares options, governs mandates, execution, recovery, and readback | `src/modules/customer-request/` |
| Registry and catalog | Own published business facts, discovery documents, search, listing projections, and owner claims | `src/modules/registry/`, `src/modules/catalog/`, `src/modules/business/` |
| Inquiry | Admission-gates qualified inquiry submission and owner/customer readbacks | `src/modules/inquiries/` |
| Capability supply | Owns admitted capability contracts, bindings, readiness, and transport runtime | `src/modules/capability-contract/`, `src/modules/capability-contract-registry/`, `src/modules/capability-supply/` |
| Routing kernel | Compiles and verifies route authority, grants, disclosure, budgets, and provider envelopes | `src/modules/routing-kernel/` |
| Convex schema | Composes domain-owned table fragments into one deployment schema | `convex/schema.ts` |
| Convex application layer | Exposes durable queries, mutations, actions, and workers around domain contracts | `convex/` |
| Verification harness | Records governed tool runs, evidence envelopes, approvals, replay, and run-viewer state | `src/modules/harness/` |

## Pattern Overview

**Overall:** Modular monolith with ports/adapters and source-owned domain contracts.

**Key Characteristics:**
- Keep route files thin: delegate request behavior to `src/lib/server/` or module server functions.
- Keep canonical contracts and policy in `src/modules/`; Convex imports domain schema fragments rather than redefining them.
- Export cross-domain dependencies through `public.ts`; keep implementation-only code under `internal/`.
- Declare reusable operations once as actions and register them explicitly in `src/modules/actions/index.ts`.
- Separate projection from authority: customer JSON/UI output is not the same object as internal route, mandate, evidence, or execution state.
- Treat sandbox, source tests, local UI, hosted readback, and successful external fulfilment as separate evidence levels.

## Layers

### Route and Presentation Layer

- Purpose: Expose public pages, authenticated operator pages, discovery documents, browser APIs, agent APIs, and webhooks.
- Location: `src/routes/`, `src/components/`, `src/views/`, `src/styles/`
- Contains: TanStack file routes, route loaders/handlers, React compositions, Astryx adapters, page projections.
- Depends on: `src/lib/`, module public contracts, module server functions, Astryx, Clerk.
- Used by: Browsers, crawlers, assistants, authenticated owners/admins, external webhook providers.
- Rule: Human pages must use truthful public language; internal epistemic or architecture vocabulary belongs only on machine or owner/admin surfaces.

### Server Boundary Layer

- Purpose: Convert HTTP and authenticated sessions into typed domain/application calls.
- Location: `src/lib/server/`, `src/server/`
- Contains: Body bounds, auth, constant-time checks, API response mapping, Convex transport, provider adapters, SSE helpers.
- Depends on: Clerk, Convex client, domain public contracts, platform `Request`/`Response`.
- Used by: `src/routes/` handlers and TanStack server functions.
- Rule: Authenticate and validate at the boundary, then call a source-owned function; do not duplicate domain state machines here.

### Domain Layer

- Purpose: Own business meaning, invariants, authorization contracts, projections, and pure decisions.
- Location: `src/modules/`
- Contains: `public.ts` APIs, `*.actions.ts`, pure compilers/evaluators, validators, projections, `internal/` implementations and schema fragments.
- Depends on: Other modules through public entry points, common primitives in `src/modules/common/`, selected provider ports.
- Used by: Server adapters, Convex functions, tests, tools, examples.
- Rule: Add behavior to the owning domain instead of creating a parallel compiler, history, recommendation, or recovery path.

### Application and Persistence Layer

- Purpose: Persist source state, enforce durable authorization, orchestrate mutations/actions, and run asynchronous work.
- Location: `convex/`
- Contains: Domain-named Convex functions, application coordinators, route transport/cancellation workers, cron registration, composed schema.
- Depends on: Domain contracts and internal Convex validators from `src/modules/`, Convex runtime APIs.
- Used by: Server adapters through `src/lib/server/convex-source.ts`, scheduled jobs, provider execution flows.
- Rule: Read `convex/_generated/ai/guidelines.md` before changing Convex code; preserve Convex function and validator requirements.

### Tooling and Proof Layer

- Purpose: Verify source contracts, local journeys, hosted readbacks, provider readiness, release manifests, and evaluation quality.
- Location: `tests/`, `tools/`, `eval/`, `examples/`, `scripts/`
- Contains: Vitest, Playwright, smoke runners, import guards, hosted probes, example integrations.
- Depends on: Public contracts and intended surfaces.
- Used by: Development, CI/release workflows, architecture gates.
- Rule: State exactly which surface and environment a proof covers.

## Data Flow

### Public Registry and Qualified Inquiry

1. A person or assistant enters via `/registry`, `/$slug`, `/api/businesses/search`, `/api/businesses/$slug`, or the agent-tools surface in `src/routes/`.
2. The route delegates to registry/catalog server functions in `src/modules/registry/registry.functions.ts` or `src/modules/catalog/owner-claim.functions.ts`.
3. The server function reads published source data through `src/lib/server/convex-source.ts` and a corresponding Convex query.
4. Registry/catalog modules project only published business facts; missing details stay absent or need confirmation.
5. If the listing permits it, `inquiry.submit` in `src/modules/inquiries/inquiry.actions.ts` admission-gates a qualified inquiry and persists it through `convex/inquiries.ts`.
6. Notification work is persisted through `src/modules/notification-outbox/` and dispatched by provider-specific HTTP endpoints.

### Authenticated Customer Request Path

1. An authenticated external agent posts to `src/routes/api.v1.requests.ts`; browser requests use parallel `/api/requests*` route files.
2. `src/lib/server/customer-request-agent-api.ts` authenticates the agent, checks scopes where required, and applies navigation metadata.
3. Transport-neutral parsers in `src/lib/server/customer-request-*-api.ts` validate bounded input and create typed commands.
4. The adapter calls public Convex application functions such as `customerRequestApplication:submit`, `provideFacts`, `compare`, `confirmRoute`, or `runRoute`.
5. `convex/customerRequestApplication.ts` coordinates compilation/evaluation with `src/modules/customer-request/` and persists the canonical aggregate.
6. Customer projections return only the state the surface supports; route mandates, execution evidence, and recovery records remain separate internal contracts.

### Route Execution and Recovery

1. Confirmation compiles bounded authority using `src/modules/customer-request/route-mandate.ts` and admission rules in `route-mandate-admission.ts`.
2. Convex persists mandate lifecycle state in `convex/customerRequestRouteMandate*.ts`.
3. Transport and cancellation workers in `convex/customerRequestRouteTransportWorker.ts` and `convex/customerRequestRouteCancellationWorker.ts` coordinate provider calls.
4. Provider responses pass through capability-supply and routing-kernel envelopes before durable result projection.
5. Inspection, problem reporting, evidence, cancellation, and repeat-permission endpoints read the corresponding durable state rather than inferring completion.

**State Management:**
- Convex is the durable source of truth for business, catalog, registry, inquiry, request, route, evidence, settings, and observability records.
- React local state manages transient form and view behavior only.
- TanStack Router owns route/navigation state; Clerk owns authenticated session identity.
- Module-level registries are immutable after initialization, notably `src/modules/actions/index.ts`.
- Tools and examples may use fixture or in-memory state, but those stores are proof harnesses rather than production truth.

## Key Abstractions

### Action

- Purpose: Define one operation with typed input/output, supported surfaces, read/write status, summary, and explicit boundaries.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Pattern: Define with `defineAction`, run the same source-owned implementation, and register explicitly in `src/modules/actions/index.ts`.

### Public Module Contract

- Purpose: Give other domains a stable import seam while hiding schema and implementation details.
- Examples: `src/modules/customer-request/public.ts`, `src/modules/registry/public.ts`, `src/modules/capability-supply/public.ts`.
- Pattern: Export intentional types/functions from `public.ts`; place validators, stores, and implementation helpers under `internal/`.

### Source Transport

- Purpose: Call Convex queries, mutations, and actions through authenticated or public clients without leaking client construction into domains.
- Examples: `src/lib/server/convex-source.ts`.
- Pattern: Use typed `sourceQuery`, `sourceMutation`, or `sourceAction` references and the appropriate authenticated/public call helper.

### Customer Projection

- Purpose: Expose a bounded, truthful view of a canonical Customer Request without leaking internal routing or authority state.
- Examples: `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/route-plan-customer-projection.ts`, `src/modules/customer-request/agent-contract.ts`.
- Pattern: Project explicit discriminated states; never infer booking, payment, dispatch, availability, or fulfilment.

### Domain-Owned Convex Schema Fragment

- Purpose: Keep validators and tables aligned with the module that owns their meaning.
- Examples: `src/modules/customer-request/internal/convex-schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `convex/schema.ts`.
- Pattern: Define tables beside the domain and compose them once in `convex/schema.ts`.

## Entry Points

### Application Router

- Location: `src/router.tsx`, generated tree `src/routeTree.gen.ts`
- Triggers: Browser or server-rendered TanStack Start request.
- Responsibilities: Resolve file routes, preload intent, restore scroll, and render the root boundary.

### Public Human Surfaces

- Location: `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/t.$threadId.tsx`
- Triggers: Browser navigation.
- Responsibilities: Publish comparable business facts, collect qualified inquiries, and show customer-facing records without overstating action capability.

### Machine Discovery and Public Reads

- Location: `src/routes/llms[.]txt.ts`, `src/routes/SKILL[.]md.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`
- Triggers: Assistant/crawler HTTP requests.
- Responsibilities: Return public discovery and listing information with machine-specific epistemic detail.

### Customer Request APIs

- Location: `src/routes/api.v1.requests*.ts`, `src/routes/api.requests*.ts`
- Triggers: Authenticated agent or browser lifecycle requests.
- Responsibilities: Delegate create/resume, facts, messages, options, confirmation, run, cancellation, evidence, problem, and repeat-authority calls.

### Convex Deployment

- Location: `convex/schema.ts`, `convex/http.ts`, domain-named files under `convex/`
- Triggers: Convex query/mutation/action calls, HTTP actions, and scheduled workers.
- Responsibilities: Enforce durable application behavior and persist canonical state.

## Architectural Constraints

- **Runtime:** Application server code targets Vercel Node 20 through Nitro; Convex functions run in the Convex runtime; browser code must not import server-only modules.
- **Threading:** Request handlers are asynchronous on the JavaScript event loop. Durable concurrency and retries are coordinated through Convex transactions, scheduled functions, and explicit worker state.
- **Global state:** The action array in `src/modules/actions/index.ts` is process-local and immutable; durable state must not rely on process globals.
- **Import boundaries:** Tests under `tests/imports/` enforce public/internal, route, kernel, capability, and source-completeness boundaries.
- **Generated code:** Do not edit `src/routeTree.gen.ts` or `convex/_generated/` manually.
- **Authority:** Caller identity is attribution, not write authority. Writes require source admission and operation-specific authorization.
- **Current versus target:** Internal Request/RoutePlan/mandate/run contracts are not proof of customer-visible choice or successful external fulfilment.
- **Neutrality:** Domain-specific provider behavior belongs in capability contracts or adapters, not the neutral compiler, projection, or routing kernel.

## Anti-Patterns

### Fat Route Handlers

**What happens:** A file route parses, authenticates, applies policy, mutates durable state, and formats projections itself.
**Why it's wrong:** Browser, agent, UI, and tool surfaces drift and bypass source-owned rules.
**Do this instead:** Keep route handlers shaped like `src/routes/api.v1.requests.ts` and delegate to `src/lib/server/customer-request-agent-api.ts` or a module server function.

### Private Cross-Module Imports

**What happens:** One module reaches into another module's `internal/` directory.
**Why it's wrong:** Domain ownership becomes ambiguous and schema refactors leak across the repository.
**Do this instead:** Add an intentional export to the owning module's `public.ts` and let `tests/imports/private-imports.test.ts` guard the seam.

### Parallel Customer State Machines

**What happens:** Conversation, Answer Thread, UI recovery, or an adapter creates a second intent compiler, request history, recommendation model, or recovery lifecycle.
**Why it's wrong:** The canonical Customer Request loses authority and cross-surface resume behavior diverges.
**Do this instead:** Extend `src/modules/customer-request/` and resume the aggregate persisted by `convex/customerRequestApplication.ts`.

### Presence-as-Proof Claims

**What happens:** A schema, test, sandbox provider, route file, or internal projection is described as a production capability.
**Why it's wrong:** It upgrades implementation evidence into customer reachability or fulfilment evidence.
**Do this instead:** Name the exact intended surface and evidence level; use hosted readback and external outcome proof when making hosted or fulfilment claims.

### Direct Presentation System Expansion

**What happens:** New bespoke `Ae*`, Radix/shadcn wrappers, or handwritten styling is added for ordinary UI needs.
**Why it's wrong:** It bypasses the Astryx authority and increases a legacy presentation layer.
**Do this instead:** Compose `@astryxdesign/core` and `@astryxdesign/theme-neutral`, using `src/components/astryx/` only for required integration adapters.

## Error Handling

**Strategy:** Validate at every trust boundary and return typed discriminated outcomes inside domains; translate them to stable HTTP status/body contracts at the surface.

**Patterns:**
- Zod schemas and strict JSON helpers validate untrusted payloads before application calls.
- Domain results use explicit `kind`/reason codes instead of throwing for expected refusal states.
- Server adapters return bounded JSON errors and catch source/provider failures at the transport boundary.
- `ConvexSourceError` in `src/lib/server/convex-source.ts` distinguishes missing auth and deployment configuration.
- Root observability and error UI are installed by `src/routes/__root.tsx`; Sentry integration is configured in `vite.config.ts` when credentials exist.
- Recovery is modeled explicitly for route cancellation, problem reporting, evidence inspection, retries, and provider transport state.

## Cross-Cutting Concerns

**Logging:** Domain audit events and observability records live in `src/modules/observability/` and Convex; Sentry/PostHog adapters capture runtime/product signals. Avoid logging sensitive request bodies or authority material.

**Validation:** Use Zod at action/HTTP boundaries, Convex validators for persisted/function arguments, branded identifiers from `src/modules/common/ids.ts`, and canonical digests for signed or replay-sensitive objects.

**Authentication:** Clerk protects owner/admin sessions; authenticated agents use the agent-auth adapter and scoped principals. Authentication identifies a caller but does not replace source-write admission or mandate authority.

**Authorization:** Owner/admin gates live in `src/lib/server/require-operator-session.ts` and Convex authz modules; route execution uses explicit preparation, mandate, spend, disclosure, and repeat-permission contracts.

**Design:** `DESIGN.md` governs visual work. Astryx primitives are the default; human surfaces keep internal machine vocabulary out of public copy.

---

*Architecture analysis: 2026-07-17*
