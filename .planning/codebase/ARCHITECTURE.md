<!-- refreshed: 2026-07-19 -->
# Architecture

**Analysis Date:** 2026-07-19
**last_mapped_commit:** `77ec35ac`

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ TanStack Start surfaces                                                     │
│ React pages · file routes · server functions · JSON/agent APIs              │
│ `src/routes/` · `src/components/` · `src/views/` · `src/start.ts`            │
└───────────────┬──────────────────────┬───────────────────────┬──────────────┘
                │                      │                       │
                ▼                      ▼                       ▼
┌──────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────┐
│ Registry / Inquiry   │  │ Canonical Customer      │  │ Owner / Admin /     │
│ public product       │  │ Request lifecycle       │  │ Answer Thread       │
│ `registry/`          │  │ `customer-request/`     │  │ `_operator/`        │
│ `inquiries/`         │  │                         │  │ `answer-thread/`    │
└──────────┬───────────┘  └────────────┬────────────┘  └──────────┬──────────┘
           │                           │                          │
           └───────────────────────────┼──────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Source transport and application boundary                                   │
│ `src/lib/server/convex-source.ts` · module `*.functions.ts` · actions        │
│ Customer Request application slices and ports                               │
│ `src/modules/customer-request/application/`                                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Convex hosts and port adapters                                               │
│ validators/auth/scheduling in `convex/*.ts`; pure orchestration in modules   │
│ workers: route transport and cancellation; crons: bounded cleanup            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Module-owned Convex table fragments composed by `convex/schema.ts`           │
│ requests · routes · supply · registry · inquiry · outbox · observability     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Start middleware | Observability, security headers, CSRF, write admission, Clerk | `src/start.ts` |
| Router/root | Generated route tree, providers, error boundary, global theme | `src/router.tsx`, `src/routes/__root.tsx` |
| File routes | Thin React or HTTP adapters over server/module seams | `src/routes/` |
| Action registry | Explicit cross-surface operation catalog with Zod contracts | `src/modules/actions/index.ts` |
| Action contract | Defines surfaces, schemas, boundaries, context, tool description | `src/modules/common/action.ts` |
| Registry | Public business list/search/detail projections | `src/modules/registry/` |
| Inquiry | Qualified-inquiry admission, persistence, owner/customer projections | `src/modules/inquiries/` |
| Customer Request | Canonical interpret → compare → confirm → run → inspect lifecycle | `src/modules/customer-request/` |
| Customer Request application | I/O-free orchestration interfaces and projection composition | `src/modules/customer-request/application/` |
| Execution machines | Transaction-scoped start, lease, outcome, cancel, problem, dispatch decisions | `src/modules/customer-request/route-execution/` |
| V2 aggregate machines | Durable request/revision/generation read and write operations | `src/modules/customer-request/v2-read/`, `src/modules/customer-request/v2-write/` |
| Convex application host | Service assertion, validators, public action registration, ports wiring | `convex/customerRequestApplication.ts` |
| Convex execution host | Internal query/mutation registration over execution machines | `convex/customerRequestRouteExecution.ts` |
| Convex adapters | Implement module port interfaces against `QueryCtx`/`MutationCtx`/`ActionCtx` | `convex/customerRequest*Ports.ts` |
| Capability supply | Contracts, admission, eligibility, publication and readiness | `src/modules/capability-supply/`, `convex/capabilitySupply*.ts` |
| Notification outbox | Durable dispatch, provider webhooks, retries and operator readback | `src/modules/notification-outbox/`, `convex/notificationOutbox*.ts` |
| Answer harness | Answer-model tools, approvals, runs and persisted threads | `src/modules/harness/`, `src/modules/answer/`, `src/modules/answer-thread/` |
| Schema root | Composes table fragments owned by domain modules | `convex/schema.ts` |

## Pattern Overview

**Overall:** Modular monolith with ports-and-adapters boundaries. TanStack Start owns presentation and HTTP transport; domain packages own contracts and orchestration; Convex owns durable state, registered functions, transactions and scheduling.

**Key Characteristics:**
- Use a domain package under `src/modules/<domain>/` as the unit of ownership. Expose sibling-module and route imports through `public.ts` or a deliberate top-level adapter file.
- Keep routes thin. `tests/imports/route-boundary.test.ts` forbids route-owned Convex transport and direct schema imports.
- Keep module internals private. `tests/imports/private-imports.test.ts` enforces the `internal/` seam.
- Declare reusable operations in `<domain>.actions.ts`, then register them explicitly in `src/modules/actions/index.ts`; no module-evaluation registration.
- Treat the current action surface vocabulary as `ui | http | agentJson | answerThread` from `src/modules/common/action.ts`. There is no live `agentTools` action surface in current source.
- Keep Customer Request as the canonical customer intent and lifecycle model. `tests/imports/customer-request-boundaries.test.ts` prevents a parallel Customer Plan model and keeps compilation unable to execute providers or grant approval.
- Use semantic ports that commit inside the caller’s Convex transaction. Pure machines do not return generic patch plans for a host to apply later.
- Define Convex table fragments beside their owning modules and compose them once in `convex/schema.ts`.

## Layers

**Presentation and transport:**
- Purpose: Render public/operator views and receive HTTP requests.
- Location: `src/routes/`, `src/components/`, `src/views/`
- Contains: TanStack file routes, React views, route handlers, SEO/discovery endpoints.
- Depends on: top-level module seams, server API handlers, Astryx components.
- Used by: browsers, owners/admins, public API clients, authenticated external agents.

**Start middleware:**
- Purpose: Apply request-wide security, telemetry and identity controls.
- Location: `src/start.ts`
- Contains: Sentry/PostHog isolation, CSP/security headers, CSRF, source-write admission and Clerk middleware.
- Depends on: `src/lib/http/`, `src/lib/server/`, `src/lib/observability/`.
- Used by: every TanStack Start request.

**Route/server API adapters:**
- Purpose: Parse HTTP, authenticate the caller, validate JSON and translate results to responses.
- Location: `src/lib/server/*-api.ts`, route-local handlers in `src/routes/api.*.ts`
- Contains: Customer Request REST handlers, registry APIs, webhook handlers, operator session gates.
- Depends on: module contracts and `src/lib/server/convex-source.ts`.
- Used by: file routes.

**Action and server-function adapters:**
- Purpose: Reuse operations across UI, HTTP, agent JSON and answer-thread surfaces.
- Location: `src/modules/*/*.actions.ts`, `src/modules/*/*.functions.ts`, `src/modules/actions/index.ts`
- Contains: Zod input/output contracts, boundary text, `createServerFn` handlers and `*ThroughSource` functions.
- Depends on: public domain functions and Convex source references.
- Used by: routes, React views and the answer harness.

**Domain/application layer:**
- Purpose: Express business rules, state transitions, projections and orchestration without transport concerns.
- Location: `src/modules/`
- Contains: domain types, pure functions, application slices, port interfaces and internal commands.
- Depends on: TypeScript/Zod domain contracts; Convex imports are limited to module-owned schema fragments or explicit host-facing adapters.
- Used by: server functions and Convex hosts.

**Customer Request application layer:**
- Purpose: Compose the canonical request lifecycle while keeping mandate, preparation, route and execution authority separate.
- Location: `src/modules/customer-request/application/`
- Contains: `interpret-compile/`, `provide-facts/`, `refine/`, `compare-resume/`, `confirm-route/`, `preparation-egress/`, `standing-route/`, `problem-route/` and projection slices.
- Depends on: Customer Request domain types and slice-specific port interfaces.
- Used by: `convex/customerRequestApplication.ts`.

**Pure execution and aggregate machines:**
- Purpose: Make deterministic transactional decisions through semantic ports.
- Location: `src/modules/customer-request/route-execution/`, `src/modules/customer-request/v2-write/`, `src/modules/customer-request/v2-read/`, `src/modules/customer-request/v2-preparation*/`
- Contains: journal predicates, start/lease/outcome/cancel/problem/dispatch machines, aggregate commits, preparation and read projections.
- Depends on: domain types and injected ports; never on TanStack routes.
- Used by: Convex host and adapter files.

**Convex host/adapters:**
- Purpose: Register public/internal functions, validate arguments, resolve auth, map documents and perform/schedule transactional work.
- Location: `convex/`
- Contains: `query`/`mutation`/`action` shells, `*Ports.ts` factories, transport/cancellation workers and crons.
- Depends on: Convex runtime and domain module APIs.
- Used by: server-side Convex HTTP clients and other Convex functions.

**Persistence:**
- Purpose: Durable source state with indexes and transaction boundaries.
- Location: `src/modules/*/internal/*schema*.ts`, composed by `convex/schema.ts`
- Contains: module-owned table fragments for all current domains.
- Depends on: `convex/server` and `convex/values`.
- Used by: Convex queries, mutations and actions.

## Data Flow

### Primary Customer Request Path

1. An authenticated agent submits to `POST /api/v1/requests` in `src/routes/api.v1.requests.ts:5`.
2. `handleAgentCustomerRequestPost` authenticates the key, adds the delegated principal and constructs a signed service assertion in `src/lib/server/customer-request-agent-api.ts:35`.
3. The server calls the public Convex action `customerRequestApplication:submit` through `src/lib/server/convex-source.ts`.
4. `convex/customerRequestApplication.ts` verifies the assertion, validates the command and calls `interpretCompileCommit` from `src/modules/customer-request/application/public.ts`.
5. Application ports load exact contracts and eligible supply, interpret and compile the canonical aggregate, then commit through `convex/customerRequestV2.ts` and `convex/customerRequestV2WritePorts.ts`.
6. Follow-up routes provide facts or messages, request options, confirm a route and run it through `src/routes/api.v1.requests.$requestRef.*.ts`.
7. Confirmation issues bounded route authority through mandate ports; run enters `convex/customerRequestRouteExecution.ts`.
8. Execution machines commit run/attempt/outbox state through journal ports; `convex/customerRequestRouteTransportWorker.ts` performs the provider transport and records the outcome.
9. Inspect, evidence, cancellation, problem and repeat-permission routes project durable state back through `src/modules/customer-request/agent-contract.ts`.

### Public Registry and Inquiry Path

1. A browser or assistant reads `src/routes/registry.tsx`, `src/routes/api.businesses.search.ts`, or `src/routes/api.businesses.$slug.ts`.
2. Routes call `src/modules/registry/registry.functions.ts`; actions in `src/modules/registry/registry.actions.ts` share the same source readers.
3. `src/lib/server/convex-source.ts` creates public or authenticated `ConvexHttpClient` transports and calls `convex/registry.ts`.
4. A supported qualified inquiry is admitted by `src/modules/inquiries/inquiry.actions.ts` / `inquiry.functions.ts`.
5. Inquiry commands persist the thread and enqueue notification work through `convex/inquiry*.ts` and the notification outbox.
6. Owner routes under `src/routes/_operator/owner.inquiries*.tsx` read/reply/close through authenticated server functions.

### Answer Thread Tool Path

1. `src/routes/api.answer.turn.ts` invokes the answer runtime in `src/modules/answer/`.
2. The harness derives tool contracts from registered actions in `src/modules/harness/tool-contract.ts`.
3. Only `registry.search` and `registry.detail` are exposed to the answer model (`AnswerModelToolIds`).
4. `src/modules/answer-thread/internal/tool-runner.ts` validates/executes calls with surface `answerThread`.
5. Turns and tool calls persist through `src/modules/answer-thread/` and `convex/answerThreads.ts`.

### Route Execution and Recovery

1. `convex/customerRequestRouteExecution.ts` delegates start/resume, lease and outcome operations to `src/modules/customer-request/route-execution/machines/`.
2. `convex/customerRequestRouteExecutionJournalPorts.ts` commits semantic run, attempt and outbox changes in the active transaction.
3. `convex/customerRequestRouteTransportWorker.ts` opens a leased dispatch and records dispatched/not-released/accepted/outcome states through dispatch lifecycle ports.
4. Cancellation uses `convex/customerRequestRouteCancellationWorker.ts` and `customerRequestRouteExecutionCancelPorts.ts`.
5. Problems and evidence use `customerRequestRouteExecutionProblemPorts.ts` and `customerRequestEvidenceLoadPorts.ts`.
6. Retry posture is explicit in journal state; callers reconcile unknown external outcomes before retrying.

### Notification Outbox

1. Inquiry or other source commands enqueue a dispatch through a domain-owned port.
2. `convex/notificationOutboxPersistence.ts` maps and upserts durable dispatch records.
3. `convex/notificationOutbox.ts` owns dispatch, webhook, retry and operator functions.
4. `src/modules/notification-outbox/operator/` parses provider payloads and projects operator decisions.

**State Management:**
- Server authority and durable state live in Convex; the React client renders projections and does not own execution authority.
- Customer Request uses versioned aggregates, revisions, route-plan generations, mandates, execution runs and evidence rows.
- Inquiry and notification domains use explicit source-state/persistence ports.
- Module-level registries are immutable arrays or constants; no shared client state library is used.

## Key Abstractions

**ActionDefinition:**
- Purpose: One typed operation contract across supported surfaces.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/customer-request/customer-request.actions.ts`
- Pattern: Strict Zod input/output, plain-language boundaries, explicit `readOnly`, explicit surfaces and injected context.

**Module public seam:**
- Purpose: Keep implementation details private across routes and sibling domains.
- Examples: `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/customer-request/public.ts`
- Pattern: Routes import top-level seams; `internal/` remains same-module-only.

**Application ports:**
- Purpose: Let Customer Request orchestration ask for persistence, supply, auth and scheduling without importing Convex contexts.
- Examples: `src/modules/customer-request/application/*/types.ts`, `convex/customerRequestProvideFactsPorts.ts`, `convex/customerRequestConfirmRoutePorts.ts`
- Pattern: Slice-specific semantic interfaces implemented at the host boundary.

**Execution port families:**
- Purpose: Keep start/lease/outcome, cancellation, problem and dispatch transactions cohesive without a god interface.
- Examples: `src/modules/customer-request/route-execution/machines/ports.ts`, `cancel-ports.ts`, `problem-ports.ts`, `dispatch-lifecycle-ports.ts`
- Pattern: Dedicated family per transaction responsibility, implemented by matching `convex/customerRequestRouteExecution*Ports.ts`.

**CustomerRequestV2WritePorts:**
- Purpose: Commit aggregates and route-plan generation changes consistently.
- Examples: `src/modules/customer-request/v2-write/ports.ts`, `convex/customerRequestV2WritePorts.ts`
- Pattern: Machine calls semantic port operations; adapter performs document reads/writes within the mutation.

**Source transport:**
- Purpose: Centralize public/authenticated Convex HTTP clients and typed function references.
- Examples: `src/lib/server/convex-source.ts`
- Pattern: `sourceQuery`/`sourceMutation`/`sourceAction` references plus `callPublicSource*` or authenticated `callSource*`.

**Module-owned schema fragment:**
- Purpose: Keep persistence ownership aligned with domain ownership.
- Examples: `src/modules/customer-request/internal/convex-schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/registry/internal/schema.ts`
- Pattern: Export `<domain>Tables`; spread once in `convex/schema.ts`.

## Entry Points

**Application bootstrap:**
- Location: `src/start.ts`
- Triggers: Every TanStack Start request.
- Responsibilities: Install global middleware.

**React router:**
- Location: `src/router.tsx`, `src/routes/__root.tsx`
- Triggers: Browser navigation and server rendering.
- Responsibilities: Route resolution, providers, layout, theming and error handling.

**Public human routes:**
- Location: `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`
- Triggers: Customer browser requests.
- Responsibilities: Discovery, comparison and qualified inquiry.

**Customer Request REST API:**
- Location: `src/routes/api.v1.requests*.ts`
- Triggers: Authenticated external agents.
- Responsibilities: Create/resume Request, provide facts/messages, compare, confirm, run, cancel, inspect evidence/problems/repeat permissions.

**Legacy-compatible Request API:**
- Location: `src/routes/api.requests*.ts`
- Triggers: Current human/browser integrations and compatibility clients.
- Responsibilities: Delegate to the same canonical Customer Request server APIs; do not create a second lifecycle.

**Answer API:**
- Location: `src/routes/api.answer.turn.ts`, `src/routes/api.answer.threads*.ts`
- Triggers: Current answer/chat surface.
- Responsibilities: Run answer loop, persist threads and expose public projections.

**Convex public application actions:**
- Location: `convex/customerRequestApplication.ts`, `convex/registry.ts`, `convex/inquiries.ts`
- Triggers: Server-side Convex clients.
- Responsibilities: Validate/authenticate and invoke domain application logic.

**Convex workers and crons:**
- Location: `convex/customerRequestRouteTransportWorker.ts`, `convex/customerRequestRouteCancellationWorker.ts`, `convex/crons.ts`
- Triggers: Scheduled internal functions.
- Responsibilities: External transport/cancellation work and bounded expiry cleanup.

**Convex HTTP router:**
- Location: `convex/http.ts`
- Triggers: Direct Convex HTTP requests.
- Responsibilities: Sandbox provider endpoints and explicit retired routing responses; it is not the main product API.

## Architectural Constraints

- **Threading:** TanStack/Nitro runs on the Node event loop; Convex mutations are serialized transactions and actions/workers perform async external I/O.
- **Transaction boundary:** A semantic machine and its mutation ports execute inside one Convex mutation. Do not split a cohesive state change into a series of client calls.
- **Global state:** `src/modules/actions/index.ts` and `src/modules/harness/tool-contract.ts` contain immutable registries/allowlists. `src/modules/answer-thread/answer-thread.functions.ts` has a process-local missing-function compatibility cache; do not treat it as durable state.
- **Circular imports:** Avoided by public barrels, application `public.ts`, machine index files and host adapters. `tests/imports/private-imports.test.ts` and customer-request boundary tests enforce direction.
- **Route isolation:** Routes cannot own Convex transport or import module schema internals; use `src/lib/server/*-api.ts` and module seams.
- **Convex validators:** Registered functions keep `v.*` argument/return validators in `convex/`; domain machines use TypeScript types.
- **Auth:** Owner/admin calls derive Clerk identity server-side. Agent Customer Request calls authenticate a delegated key and sign a short-lived service assertion before public Convex actions.
- **Deployment:** `vite.config.ts` pins Nitro to Vercel Node serverless (`nodejs20.x`), not an edge runtime.
- **Generated files:** Do not hand-edit `src/routeTree.gen.ts` or `convex/_generated/`.
- **Current-vs-target:** `src/future-phases/` and planning artifacts are not current runtime authority.

## Anti-Patterns

### Route-owned persistence or transport

**What happens:** A file in `src/routes/` imports Convex schemas, constructs its own Convex function transport, or reaches into module `internal/`.
**Why it's wrong:** It duplicates auth/transport policy and couples public URLs to storage details.
**Do this instead:** Put HTTP parsing in `src/lib/server/*-api.ts`, source calls in `*.functions.ts` or `src/lib/server/convex-source.ts`, and domain logic under `src/modules/`; follow `src/routes/api.v1.requests.ts`.

### Parallel customer intent lifecycle

**What happens:** A feature adds a new intent compiler, Customer Plan aggregate, or recommendation/recovery state machine beside Customer Request.
**Why it's wrong:** It forks authority, history and recovery semantics.
**Do this instead:** Extend `src/modules/customer-request/application/` and resume the same canonical aggregate; `tests/imports/customer-request-boundaries.test.ts` is the guardrail.

### Authority inside compilation

**What happens:** The compiler calls providers, executes work or constructs approval grants.
**Why it's wrong:** Interpretation would silently become consequential action.
**Do this instead:** Keep `src/modules/customer-request/compiler.ts` pure; grant route-step authority only through `src/modules/customer-request/route-mandate-admission.ts` and its Convex admission mutation.

### Generic patch plans across transaction boundaries

**What happens:** A domain machine returns database patches for a Convex host to interpret and apply later.
**Why it's wrong:** Business invariants separate from the atomic write and race windows appear.
**Do this instead:** Inject semantic ports such as `JournalMutationPorts` or `CustomerRequestV2WritePorts` and commit within the caller’s mutation.

### Thick Convex host

**What happens:** Validators, auth, orchestration, projections and persistence decisions accumulate in one registered function.
**Why it's wrong:** Domain behavior becomes runtime-bound and difficult to test without Convex.
**Do this instead:** Keep registration/auth/validation in `convex/*.ts`, move orchestration to `src/modules/<domain>/`, and add a focused `*Ports.ts` adapter.

### Treating answer-thread exposure as a public external tool API

**What happens:** Internal `answerThread` tool availability is documented as a public quiet agent endpoint.
**Why it's wrong:** Current source exposes answer-model registry tools internally; no live `api.agent.tools` route exists.
**Do this instead:** Describe the actual `/api/v1/requests` external-agent surface and the internal answer harness separately.

## Error Handling

**Strategy:** Typed discriminated results at domain boundaries, explicit HTTP status mapping at route adapters, and thrown errors only for unavailable configuration or unexpected infrastructure failures.

**Patterns:**
- Customer Request results use `kind`/reason unions in `src/modules/customer-request/agent-contract.ts` and `application/action-result.ts`.
- Server API files validate request bodies and return JSON refusal/conflict responses rather than leaking Convex errors.
- `src/lib/server/convex-source.ts` throws `ConvexSourceError` for missing auth or deployment URL.
- Workers record retry-safe, reconcile-required, refused or proof-gap states rather than assuming external success.
- `src/start.ts` captures unexpected server exceptions and rethrows them so framework error behavior remains intact.

## Cross-Cutting Concerns

**Logging:** PostHog and Sentry are initialized through `src/lib/observability/` and `src/start.ts`; domain audit events live in `src/modules/common/audit-events.ts` and Convex observability tables.

**Validation:** Zod at action/HTTP boundaries, Convex `v.*` validators on registered functions and tables, plus strict JSON/schema diagnostics in `src/modules/harness/`.

**Authentication:** Clerk protects owner/admin server calls through `src/start.ts`, `src/lib/server/require-operator-session.ts` and `convex/auth.config.ts`; external Customer Request agents use `src/lib/server/customer-request-agent-auth.ts` plus signed service assertions.

**Write admission:** `src/lib/server/source-write-admission.ts` and middleware in `src/start.ts` protect source writes; Customer Request adds mandate and route-step admission for consequential execution.

**Security headers:** `src/lib/http/security-headers.ts` applies CSP and response headers globally.

**Import enforcement:** `tests/imports/` statically verifies module privacy, route boundaries, Customer Request authority and retired routing seams.

---

*Architecture analysis: 2026-07-19*
