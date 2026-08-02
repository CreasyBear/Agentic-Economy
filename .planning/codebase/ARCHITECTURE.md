<!-- refreshed: 2026-08-02 -->
# Architecture

**Analysis Date:** 2026-08-02

The maintained execution trace is [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md).
Any change that adds or moves a prompt, gate, model call, stream frame, durable journal,
or scheduler hop MUST update it in the same change.

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                  People, agents, and providers              │
├──────────────────┬──────────────────┬───────────────────────┤
│ Browser / HTTP   │ Agent / CLI / MCP │ Provider / webhook     │
│ `src/routes/`    │ `tools/ae/`       │ `convex/http.ts`       │
│ `src/components/`│ `src/lib/server/` │ `src/routes/api.*`     │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│             Shared domain and application modules            │
│ `src/modules/*/public.ts`, `*.actions.ts`, `*.functions.ts` │
│ `src/modules/actions/index.ts` and `src/lib/server/*`        │
└──────────────────────────────┬──────────────────────────────┘
                               │ typed source queries/mutations/actions
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Convex application and effects               │
│ `convex/*.ts`, `convex/crons.ts`, `convex/http.ts`            │
│ `convex/customerRequestRouteTransportWorker.ts`              │
└──────────────────────────────┬──────────────────────────────┘
                               │ transactions, ports, projections
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Convex tables and external observations           │
│ `convex/schema.ts`, `src/modules/*/internal/*schema.ts`      │
│ provider endpoints, OpenRouter, notification/payment systems │
└─────────────────────────────────────────────────────────────┘
```

The application is a bounded-context TypeScript modular monolith. TanStack Start owns the web request and rendering boundary; React routes and components do not own domain transitions. Domain modules expose supported public seams, action declarations, and source-function adapters. Convex is the durable source of truth for request, supply, inquiry, answer, work-tree, invocation, harness, and supporting state. External observations and model output are inputs to deterministic validation rather than authority.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Runtime middleware | Composes observability, security headers, agent-content negotiation, CSRF, source-write admission, and Clerk middleware. | `src/start.ts` |
| Router and document | Creates the TanStack router and mounts the root document, conditional Clerk provider, CSS, error boundary, and client observability. | `src/router.tsx`, `src/routes/__root.tsx` |
| File-route boundary | Maps public pages, operator pages, HTTP protocols, OAuth/MCP, webhooks, and discovery files to thin handlers or components. | `src/routes/` |
| Action contract | Defines input/output schemas, surfaces, authority, effects, retry posture, evidence, and safe continuation metadata. | `src/modules/common/action.ts` |
| Action registry | Explicitly registers every cross-surface action and derives action lookup and MCP names from one array. | `src/modules/actions/index.ts` |
| Customer Request domain | Interprets intent, compiles bounded capability graphs, prepares exact routes, projects customer states, and defines recovery semantics. | `src/modules/customer-request/public.ts`, `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/customer-projection.ts` |
| Customer Request application | Authenticates callers, enforces idempotency and revisions, commits V2 aggregates, and coordinates preparation, confirmation, execution, problems, and evidence. | `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts` |
| Capability and supply domain | Validates contracts, publication bindings, readiness, pricing, provider transport, and bounded x402/payment observations. | `src/modules/capability-contract/public.ts`, `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/route-transport-runtime.ts` |
| Catalog and discovery | Owns business/offering publication projections, registry search/detail, discovery manifests, agent pages, and public readbacks. | `src/modules/catalog/public.ts`, `src/modules/registry/public.ts`, `src/modules/discovery/public.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts` |
| Answer and answer-thread | Streams bounded answer turns, performs context/intent/retrieval/model/gate/assembly/persistence phases, and exposes redacted thread projections. | `src/modules/answer/public.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `convex/answerThreads.ts` |
| Harness and invocation control | Records tool/model events, gates actions, persists invocation controls/attempts, supports replay/cold resume, and verifies evidence around effects. | `src/modules/harness/`, `src/modules/action-invocation/`, `convex/actionInvocationControl.ts`, `convex/harnessSessions.ts` |
| WorkTree host | Runs a source-backed human or agent work-tree loop with guest/owner binding, bounded verbs, decisions, receipts, and repeat permissions. | `src/modules/work-tree/human-root.functions.ts`, `src/modules/work-tree/work-tree.functions.ts`, `convex/workTrees.ts` |
| Durable backend | Composes all bounded-context table fragments and exposes public/internal queries, mutations, and actions with Convex validators. | `convex/schema.ts`, `src/modules/*/internal/*schema.ts`, `convex/*.ts` |
| Effect scheduler and worker | Dispatches route execution through bounded Workpool concurrency, network guards, signed calls, provider responses, and payment/reconciliation ports. | `convex/customerRequestRouteWorkpool.ts`, `convex/customerRequestRouteTransportWorker.ts` |
| Machine and server adapters | Authenticates agent keys, handles browser sessions, maps HTTP payloads, calls typed source refs, and creates projections for machine surfaces. | `src/lib/server/`, `src/routes/api.requests.ts`, `src/routes/api.v1.requests.ts`, `src/routes/mcp.ts`, `tools/ae/cli.ts` |
| Product UI | Renders public, customer-request, chat, supply, offering, inquiry, claim, and operator experiences from loaders/server functions and projections. | `src/components/ae/`, `src/components/ai-elements/`, `src/components/ui/` |

## Pattern Overview

**Overall:** Bounded-context modular monolith with explicit registered actions, source adapters, and Convex durability.

**Key Characteristics:**
- `public.ts` is the supported module import seam; private implementation, ports, and schema fragments remain behind module boundaries.
- A declaration in a module `*.actions.ts` is registered in `src/modules/actions/index.ts` and can fan out to UI, HTTP, agent JSON, answer-thread, CLI, and MCP surfaces without duplicating the runner.
- Routes and components adapt transport and presentation; deterministic domain code owns semantics, authorization preparation, state transitions, and result meaning.
- Convex functions own durable identity, revisions, idempotency, source writes, projections, and recovery state. External effects are released only after persisted authority checks.
- Model/provider responses, imported commitments, and provider receipts are observations. Schemas, digests, evidence requirements, and state machines decide what may become durable truth.

## Layers

**Presentation and transport:**
- Purpose: Accept browser, agent, CLI, MCP, webhook, and provider requests; render pages or protocol responses.
- Location: `src/routes/`, `src/components/`, `tools/ae/`, `convex/http.ts`.
- Contains: File routes, server handlers, UI shells, HTTP negotiation, OAuth/MCP and webhook adapters.
- Depends on: Module public seams, action registry, server helpers, and read projections.
- Used by: People, external agents, provider systems, and local/release tooling.

**Domain and application modules:**
- Purpose: Define business vocabulary, schemas, deterministic decisions, action contracts, state transitions, and projections.
- Location: `src/modules/`.
- Contains: Bounded contexts such as `customer-request`, `capability-supply`, `catalog`, `registry`, `answer-thread`, `harness`, `work-tree`, `inquiries`, and `money`.
- Depends on: `src/modules/common/` primitives and injected source/effect ports; private modules do not become route imports.
- Used by: TanStack server functions, action runners, Convex application functions, tests, and projections.

**Source and server adapter:**
- Purpose: Convert a domain operation into authenticated/public Convex transport or a bounded server function while preserving the domain contract.
- Location: `src/lib/server/convex-source.ts`, `src/modules/*/*.functions.ts`, `src/lib/server/customer-request-*-api.ts`.
- Contains: Typed `sourceQuery`, `sourceMutation`, and `sourceAction` references; Clerk/guest/agent authentication; HTTP parsing and response mapping.
- Depends on: Clerk, Convex HTTP client, action/domain public seams, and bounded request utilities.
- Used by: File routes, UI loaders/actions, CLI, MCP, and agent APIs.

**Durable application and persistence:**
- Purpose: Enforce source-owned identity, authorization, revisions, idempotency, transactional writes, scheduled continuation, and readback.
- Location: `convex/*.ts`, `convex/schema.ts`.
- Contains: Public and internal Convex functions, port adapters, table mappers, Workpool hooks, and cron jobs.
- Depends on: Convex runtime, `convex/values`, module schema fragments, and domain public APIs.
- Used by: Source adapters and Convex scheduler/worker callbacks.

**External effect and observation:**
- Purpose: Call registered provider endpoints and model/payment/notification systems only after authority is prepared; record bounded observations and reconcile unknown outcomes.
- Location: `convex/customerRequestRouteTransportWorker.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/model-gateway/public.ts`, `src/modules/notification-outbox/`.
- Contains: Guarded HTTP, signed route calls, x402 custody hooks, OpenRouter model creation/cost parsing, and notification dispatch ports.
- Depends on: Durable dispatch state, network guard, credentials, provider adapters, and evidence/digest contracts.
- Used by: Customer Request execution, answer model calls, supply readiness, and notification workflows.

**Projection and readback:**
- Purpose: Expose stable, privacy-scoped views to people and agents without rebuilding authority from raw documents or transcripts.
- Location: `src/modules/customer-request/customer-projection.ts`, `src/modules/registry/public.ts`, `src/modules/catalog/public.ts`, `src/modules/answer-thread/projection.ts`, `convex/businessSupplyProjectionSnapshot.ts`.
- Contains: Customer Request views, public catalog pages, answer thread projections, owner/operator readbacks, and evidence exports.
- Depends on: Durable source state and explicit serialization policies.
- Used by: `src/components/`, public pages, machine APIs, and discovery documents.

## Data Flow

### Primary Request Path

1. `POST /api/requests` or `POST /api/v1/requests` enters `src/routes/api.requests.ts` or `src/routes/api.v1.requests.ts`, then delegates to the browser or agent server boundary (`src/lib/server/customer-request-browser-api.ts`, `src/lib/server/customer-request-agent-api.ts`).
2. The server boundary authenticates a Clerk session, browser guest assertion, or scoped agent key, validates the operation, and calls a source action through `src/modules/customer-request/customer-request.functions.ts` and `src/lib/server/convex-source.ts`.
3. `convex/customerRequestApplication.ts` applies durable rate admission, resolves the caller, namespaces idempotency by principal/operation/request, reserves the request, and invokes the compile/commit path.
4. The Customer Request compiler and semantic interpreter (`src/modules/customer-request/compiler.ts`, `src/modules/customer-request/semantic-interpreter.ts`) turn request facts and registered supply into a bounded proposal, graph, plan revision, and digests; model output remains proposal evidence.
5. `convex/customerRequestV2.ts` and preparation/mandate modules persist the aggregate, current revision, route plan, preparation state, exact authority, and customer-safe projection. Confirmation is distinct from starting execution.
6. Route execution mutations (`convex/customerRequestRouteMandate.ts`, `convex/customerRequestRouteExecution.ts`) recheck current revisions, authority, idempotency, and effect fences before dispatching through `convex/customerRequestRouteWorkpool.ts`.
7. `convex/customerRequestRouteTransportWorker.ts` opens the current dispatch, verifies signed authority and public endpoint safety, releases the effect, invokes `src/modules/capability-supply/route-transport-runtime.ts`, and records success, refusal, partial, or unknown observations for reconciliation.
8. The application serializes a `CustomerRequestProjection` or evidence readback through the same server surface; UI and agents consume the projection and must resume from durable state after interruption or unknown outcomes.

### Answer Turn Path

1. `src/routes/api.answer.turn.ts` bounds the request body, validates the query, resolves the session/thread, checks access and idempotency, applies admission, and opens an AI SDK UI message stream.
2. `src/modules/answer-thread/internal/turn-orchestrator.ts` creates a harness-backed run and executes context, intent, route, retrieval, model, gate, assembly, persistence, and report phases.
3. Retrieval and model phases use the answer module (`src/modules/answer/public.ts`) and action/tool contracts; boundary, unsupported, frozen, clarification, and tool-search paths are selected deterministically before any model call.
4. Gate/finalization verifies the structured snapshot and allowed catalog grounding, then the persistence phase writes answer threads/turns/tool calls through `convex/answerThreads.ts`; failure after streaming is reported as a typed error rather than silently treated as success.
5. `src/components/ae/chat/` consumes typed stream frames and later projections from `src/modules/answer-thread/public.ts`; it does not become the source of thread authority.

### Supply Publication and Public Readback

1. The owner route `src/routes/_operator/owner.supply.tsx` loads and mutates the funnel through `src/modules/capability-supply/supply-funnel.functions.ts`.
2. The funnel uses typed source query/mutation/action references to Convex supply functions, where publication, readiness, price, binding, and revision checks are durable.
3. `src/modules/capability-contract/public.ts` and `src/modules/capability-supply/public.ts` validate the contract, offering, adapter, credentials, and evidence bounds before a publication can become callable.
4. `convex/catalog.ts` and `convex/businessSupplyProjectionSnapshot.ts` maintain offering-owned public supply projections; `convex/registry.ts` and `convex/discovery.ts` provide list/search/detail and manifest readbacks.
5. `src/routes/api.businesses*`, `src/routes/$slug.tsx`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, and `src/routes/SKILL[.]md.ts` render or serialize those projections.

**State Management:**
- Durable lifecycle state lives in Convex documents and event/journal rows, with revisions, command digests, idempotency keys, authority fences, and readback projections.
- Module-level caches such as the provider cache in `src/modules/model-gateway/public.ts` are performance-only and never carry identity, authority, or business state.
- Browser cookies hold session/guest identifiers and UI state; server handlers resolve them into source-owned principals before writes.
- Streaming state can be observed before persistence completes, but finalization and source-write success are checked before a turn is declared complete.

## Key Abstractions

**Public module seam:**
- Purpose: Keep route and host imports stable while hiding private schemas, ports, and implementation details.
- Examples: `src/modules/customer-request/public.ts`, `src/modules/answer-thread/public.ts`, `src/modules/inquiries/public.ts`.
- Pattern: Consumers import public contracts/functions; `internal/` and implementation files are guarded by import-boundary tests.

**Registered action:**
- Purpose: Describe one operation once for execution, machine discovery, UI/HTTP/agent surfaces, authority, effects, retry, and evidence.
- Examples: `src/modules/common/action.ts`, `src/modules/customer-request/customer-request.actions.ts`, `src/modules/actions/index.ts`.
- Pattern: `defineAction` creates a typed contract; the explicit registry supplies `listActions`, `findAction`, and MCP projections.

**Source function reference:**
- Purpose: Keep server callers typed while routing to Convex by named function reference.
- Examples: `src/lib/server/convex-source.ts`, `src/modules/customer-request/customer-request.functions.ts`, `src/modules/capability-supply/supply-funnel.functions.ts`.
- Pattern: Construct `sourceQuery`/`sourceMutation`/`sourceAction`, then call through authenticated or public source transport.

**Port and adapter:**
- Purpose: Inject persistence, provider, clock, credential, network, or scheduler dependencies into deterministic domain machines.
- Examples: `convex/customerRequestV2PreparationPorts.ts`, `convex/customerRequestRouteExecutionJournalPorts.ts`, `src/modules/capability-supply/internal/transport-adapters.ts`.
- Pattern: Domain code owns the state transition; Convex or a development host supplies the port implementation.

**Projection/readback:**
- Purpose: Give people and agents stable, bounded, privacy-scoped state without exposing authority internals.
- Examples: `src/modules/customer-request/customer-projection.ts`, `src/modules/registry/public.ts`, `convex/businessSupplyProjectionSnapshot.ts`.
- Pattern: Read source state, serialize an explicit DTO, redact capability/binding/mandate internals, and return status plus safe next action.

**Authority and digest fence:**
- Purpose: Bind an operation to the current principal, exact inputs, revision, prepared authority, and idempotency key before effect release.
- Examples: `src/modules/common/canonical-digest.ts`, `src/modules/customer-request/route-mandate.ts`, `convex/customerRequestRouteMandateAdmission.ts`, `src/modules/action-invocation/durable.ts`.
- Pattern: Canonicalize and digest material fields, persist the fence, reject stale or conflicting commands, and reconcile unknown effects.

## Entry Points

**TanStack Start server:**
- Location: `src/start.ts`
- Triggers: Every application request.
- Responsibilities: Run middleware ordering for observability, security, content negotiation, CSRF, source-write admission, and authentication.

**TanStack Router:**
- Location: `src/router.tsx`, `src/routes/__root.tsx`, `src/routeTree.gen.ts`
- Triggers: Browser navigation and generated file-route registration.
- Responsibilities: Build the router, mount the document/shell, and dispatch page/API route handlers. `src/routeTree.gen.ts` is generated and not a hand-edit extension point.

**HTTP and protocol routes:**
- Location: `src/routes/`
- Triggers: Browser, agent, OAuth, MCP, webhook, discovery, and provider requests.
- Responsibilities: Parse/validate transport input and delegate to server/domain seams; route files do not own domain state transitions.

**Registered action host:**
- Location: `src/modules/actions/index.ts`, `src/lib/server/mcp-api.ts`, `tools/ae/cli.ts`
- Triggers: UI/server callers, MCP discovery/calls, agent JSON, CLI commands, and answer-thread tools.
- Responsibilities: Resolve explicit action metadata and run one source-backed implementation with surface-specific admission.

**Convex application:**
- Location: `convex/schema.ts` and exported functions in `convex/*.ts`
- Triggers: Source transport calls, Convex scheduler, Workpool callbacks, and Convex HTTP routes.
- Responsibilities: Validate values, derive identity, perform transactions, persist projections/journals, and start bounded continuations.

**Scheduled/worker execution:**
- Location: `convex/crons.ts`, `convex/customerRequestRouteWorkpool.ts`, `convex/customerRequestRouteTransportWorker.ts`
- Triggers: Hourly cleanup, route dispatch, completion callbacks, and retries.
- Responsibilities: Run bounded maintenance or external effects from durable state, never from an unpersisted browser/model proposal.

**Model/provider gateways:**
- Location: `src/modules/model-gateway/public.ts`, `src/modules/capability-supply/route-transport-runtime.ts`
- Triggers: Validated answer/model requests or an authorized route dispatch.
- Responsibilities: Create provider requests, enforce bounded transport, attribute observations/cost, and return untrusted observations to deterministic gates.

## Architectural Constraints

- **Threading:** TanStack and Convex handlers are asynchronous event-loop functions; the route transport worker opts into Node with `"use node"` (`convex/customerRequestRouteTransportWorker.ts:1`). Route work is bounded by the Workpool's `maxParallelism: 32` (`convex/customerRequestRouteWorkpool.ts:5-10`).
- **Global state:** The action registry is a module-level immutable array (`src/modules/actions/index.ts:52-90`); provider construction uses a credential-keyed cache (`src/modules/model-gateway/public.ts:40-47`). These are lookup/performance state, not authority or durable business state.
- **Circular imports:** Module public seams and import-boundary tests (`tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/customer-request-boundaries.test.ts`) constrain direction: routes/hosts depend on public modules, while private implementation must not leak back into routes.
- **Generated code:** `src/routeTree.gen.ts` and `convex/_generated/` are generated registrations/types; add source under `src/routes/`, `src/modules/`, or `convex/`, then regenerate rather than editing generated output.
- **Source authority:** Caller identity and authority are derived at authenticated boundaries and rechecked in Convex; request bodies, action attribution, model output, transcripts, and browser state cannot self-authorize writes.
- **Effect ordering:** Durable admission, idempotency, revisions, digests, and authority fences precede provider/payment/notification effects. Unknown outcomes remain reconciliation states.
- **Resource bounds:** HTTP bodies, JSON values, capability contracts, answer turns, graph sizes, provider responses, and retries have explicit limits in their owning modules; new boundaries must preserve those limits.
- **Projection privacy:** Public/customer/agent readbacks use explicit serializers and omit raw credentials, mandates, binding internals, and private source documents.

## Anti-Patterns

### Domain logic in routes or components

**What happens:** A route or React component parses a protocol payload and directly decides eligibility, authority, routing, or durable state transitions.
**Why it's wrong:** The same operation then diverges across browser, agent, CLI, MCP, or Convex hosts, and UI/transcript state can be mistaken for source authority.
**Do this instead:** Keep the route thin (`src/routes/api.businesses.search.ts:8-18`) and call the owning module action/function or source projection (`src/modules/registry/registry.actions.ts`, `src/lib/server/convex-source.ts`).

### Direct private-module or table imports from a host

**What happens:** A route, host, or component imports `src/modules/<context>/internal/*` or reconstructs state from a Convex document.
**Why it's wrong:** Private contracts become public accidentally, projections lose their privacy boundary, and schema changes require editing every host.
**Do this instead:** Import `src/modules/<context>/public.ts`, use a `*.functions.ts` source adapter, and return an explicit projection. The architectural rule is exercised by `tests/imports/private-imports.test.ts` and `tests/imports/route-boundary.test.ts`.

### Treating model/provider output as authority

**What happens:** A model proposal, provider response, imported commitment, or browser confirmation is persisted or released as if it were an authorization decision.
**Why it's wrong:** Observations can be stale, malformed, replayed, or outside the caller's granted scope.
**Do this instead:** Normalize and validate proposals in `src/modules/customer-request/semantic-interpreter.ts` and `src/modules/customer-request/compiler.ts`; prepare and admit exact authority in `convex/customerRequestRouteMandateAdmission.ts`; record provider outcomes as evidence in the route state machine.

### Releasing an effect before durable fencing

**What happens:** Code calls an external endpoint or payment system before recording the exact command, current revision, authority, and release state.
**Why it's wrong:** A timeout cannot distinguish not-sent from possibly-sent, retries can duplicate effects, and cancellation/readback loses its source of truth.
**Do this instead:** Use `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteTransportWorker.ts`, and `src/modules/capability-supply/route-transport-runtime.ts`; persist dispatch/release state, then reconcile unknown observations before retrying.

## Error Handling

**Strategy:** Fail closed at each boundary, preserve a discriminated refusal/unknown state, and expose only a redacted status and safe next step.

**Patterns:**
- Zod schemas validate TanStack server-function and action payloads; Convex `v.*` validators validate every Convex function boundary (`src/modules/common/action.ts`, `convex/customerRequestApplication.ts`).
- HTTP handlers map invalid bodies, missing identity, rate limits, conflicts, and unavailable sources to explicit status codes (`src/routes/api.answer.turn.ts`, `src/lib/server/json-error.ts`).
- Domain APIs return discriminated results such as `available`, `refused`, `conflict`, `partial`, `unknown`, and `needs_information` rather than throwing for expected business outcomes.
- External effects persist request/response digests, provider references, evidence, and release state; an unknown or possibly released effect is reconciled from source readback before retry.
- Unexpected exceptions are captured by server/client observability (`src/start.ts`, `src/lib/observability/`) while responses remain bounded and redacted.

## Cross-Cutting Concerns

**Logging:** `src/modules/harness/run-collector.ts`, `src/modules/observability/public.ts`, and `src/lib/observability/` collect typed run, timing, funnel, Sentry, and PostHog signals; customer-facing readbacks use explicit redaction.

**Validation:** Zod and action schemas validate HTTP/module inputs, `convex/values` validates Convex inputs/outputs, and capability/customer-request modules apply canonical digests, bounded JSON, graph, contract, and evidence checks.

**Authentication:** `src/start.ts` installs Clerk middleware; `convex/auth.config.ts` configures the Convex JWT issuer; `src/lib/server/convex-source.ts` obtains authenticated Convex tokens; agent APIs derive scoped principals from Clerk API keys; browser guest assertions are source-bound and never caller-chosen.

**Authorization:** Source-write admission, customer-request caller resolution, owner/admin authority, mandate admission, and action surface metadata determine whether a command may proceed. Attribution fields in `src/modules/common/action.ts` do not grant authority.

**Evidence and privacy:** Projections and evidence serializers are owned by domain modules; public routes do not expose raw durable documents, credential material, private prompts, or internal authority digests.

---

*Architecture analysis: 2026-08-02*
