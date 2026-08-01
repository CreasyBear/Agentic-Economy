---
name: architecture
kind: codebase-map
analysis_date: 2026-08-01
refreshed: 2026-08-01
---

# Architecture Map

**Analysis date:** 2026-08-01  
**Repository:** `Agentic-Economy`  
**Scope:** full repository; generated/build/vendor output is described only where it defines a runtime or source boundary.

## System shape

Agentic Economy is a TypeScript application with a TanStack Start/React presentation and HTTP layer, a Convex source-of-truth backend, and a domain-module layer shared by browser routes, machine surfaces, the CLI, and Convex functions.

```text
Browser / agent / CLI / webhook
              |
              v
TanStack Router file routes + HTTP handlers (`src/routes/`)
              |
              +--> server functions and action adapters (`src/lib/server/`, `src/modules/*/*.actions.ts`)
              |          |
              |          +--> shared domain/application modules (`src/modules/*/public.ts`)
              |          |
              |          +--> authenticated/public Convex transport (`src/lib/server/convex-source.ts`)
              |                         |
              |                         v
              |              Convex queries/mutations/actions (`convex/`)
              |                         |
              |                         v
              |              composed schema and projections (`convex/schema.ts`)
              |
              +--> registered action surfaces (`src/modules/actions/index.ts`)
                         |
                         +--> MCP / agent JSON / HTTP / answer-thread / UI / CLI

Convex actions also call explicit application ports and provider seams for
customer-request execution, capability transport, billing, notifications, and
model calls (`convex/*Ports.ts`, `src/modules/provider-integrations/`,
`src/modules/model-gateway/`).
```

The build/runtime wiring is explicit: `vite.config.ts` installs TanStack Start, Nitro, React, Tailwind, and optional Sentry plugins; Nitro targets Vercel Node serverless functions (`vite.config.ts:90-116`). The TypeScript project includes `src/`, `convex/`, and tests while excluding `convex/_generated` (`tsconfig.json:33-44`).

## Runtime entrypoints and boundaries

| Boundary | Entry point | Responsibility and next boundary |
| --- | --- | --- |
| Vercel/Node server | `src/start.ts` | Installs observability, security headers, agent-content negotiation, CSRF, source-write admission, and Clerk request middleware before route handling (`src/start.ts:11-77`). |
| React router | `src/router.tsx` | Creates the TanStack Router from generated `routeTree` and sets preload, pending, transition, not-found, and scroll behavior (`src/router.tsx:6-14`). |
| Root document | `src/routes/__root.tsx` | Adds document head/CSS, route outlet, route progress, observability boot/error boundary, toast host, scripts, and conditional `ClerkProvider` for auth-sensitive prefixes (`src/routes/__root.tsx:26-109`). |
| File-based pages/API | `src/routes/` | Each filename maps to a route; pages use loaders/server functions and API files expose `GET`/`POST`/other handlers through `createFileRoute` (`src/routes/index.tsx:41-66`, `src/routes/api.businesses.search.ts:17-23`). |
| Public machine adapter | `src/modules/actions/index.ts` | Owns the single action registry and filters it for MCP; each action carries schema, effect, surfaces, and optional invocation contract (`src/modules/actions/index.ts:43-90`, `src/modules/common/action.ts:198-223`). |
| Convex client transport | `src/lib/server/convex-source.ts` | Builds authenticated/public Convex HTTP clients, typed function references, and source query/mutation/action calls (`src/lib/server/convex-source.ts:57-80`, `src/lib/server/convex-source.ts:83-202`). |
| Convex application | `convex/` | Registers public and internal queries, mutations, actions, HTTP actions, and cron handlers. Function files delegate into domain modules and persistence ports (`convex/customerRequestApplication.ts:21-66`, `convex/registry.ts:243-406`). |
| Convex auth/config | `convex/auth.config.ts`, `convex/convex.config.ts` | Clerk JWT is the Convex provider; app config declares server environment values and installs Workflow and Workpool components (`convex/auth.config.ts:3-12`, `convex/convex.config.ts:6-19`). |
| Convex HTTP | `convex/http.ts` | Hosts sandbox provider GET/POST endpoints and explicit retired routing/MCP responses (`convex/http.ts:11-50`). |
| Scheduled cleanup | `convex/crons.ts` | Hourly internal cleanup for security abuse buckets, inquiry abuse buckets, and source-write nonces (`convex/crons.ts:5-28`). |
| CLI/automation | `tools/ae/cli.ts`, `eval/*`, `tools/dev/*`, `tools/release/*` | Exercises the same public machine surfaces, action registry, local provider hosts, evaluation suites, and release readbacks rather than introducing a second domain implementation (`tools/ae/cli.ts:1-20`). |

## Layering and module ownership

### 1. Presentation and protocol layer

- Browser pages, public listings, operator screens, OAuth endpoints, discovery documents, webhooks, and API handlers are file routes below `src/routes/`; generated registration is in `src/routeTree.gen.ts`, which explicitly warns that it is overwritten by TanStack Router (`src/routeTree.gen.ts:7-9`).
- Public pages compose feature components such as `AePublicShell` (`src/components/ae/layout/AePublicShell.tsx:56-86`), while the pathless operator route mounts `AeOperatorShell` around `/owner/*`, `/admin/*`, and `/developers/*` children (`src/routes/_operator.tsx:7-25`).
- Operator authentication is a route boundary, not a per-page convention: `operatorLayoutRouteOptions` applies `requireOperatorBeforeLoad` once at the pathless layout (`src/lib/operator/route-options.ts:13-21`), and the guard redirects unauthenticated sessions to sign-in (`src/lib/server/require-operator-session.ts:28-37`).
- API routes validate/normalize protocol input and then delegate. For example, `/api/businesses/search` parses URL search parameters and runs `registrySearchAction` (`src/routes/api.businesses.search.ts:25-40`), while `/api/answer/turn` owns body size, JSON, schema, rate-limit, access, and SSE response handling (`src/routes/api.answer.turn.ts:23-50`, `src/routes/api.answer.turn.ts:71-118`).

### 2. Cross-surface action layer

- `defineAction` is the shared action contract. It requires an id, description, boundaries, Zod input/output schemas, parameter metadata, read-only/effect metadata, exposed surfaces, and a runner (`src/modules/common/action.ts:198-223`).
- `src/modules/actions/index.ts` registers customer-request, registry, inquiry, storefront/discovery, supply, sandbox, demand, and settings actions and asserts unique IDs before exposing the registry (`src/modules/actions/index.ts:14-70`).
- Action metadata is deliberately machine-readable: `describeActionForAgent` converts Zod input/output schemas to JSON Schema and preserves effect/boundary metadata (`src/modules/common/action.ts:263-293`).
- HTTP, agent JSON, MCP, answer-thread, UI, and CLI callers therefore converge on the same action definitions. `registrySearchAction` explicitly lists HTTP, agent JSON, and answer-thread surfaces (`src/modules/registry/registry.actions.ts:354-387`), and `registryServicesSearchAction` adds MCP (`src/modules/registry/registry.actions.ts:420-453`).

### 3. Domain and application modules

Domain modules are organized by bounded context under `src/modules/`. Public entry files export contracts and application seams; `internal/` directories hold implementation details and persistence schemas. The main groups are:

| Bounded context | Key paths | Architectural role |
| --- | --- | --- |
| Capability contract | `src/modules/capability-contract/public.ts` | Defines and validates the versioned JSON Schema 2020-12 capability contract, input semantics, evidence, lifecycle, and decision model. It bounds schema size/depth and compiled validators (`src/modules/capability-contract/public.ts:16-31`, `src/modules/capability-contract/public.ts:235-489`). |
| Capability supply | `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/published-operation.ts`, `src/modules/capability-supply/route-transport-runtime.ts` | Imports/admitted transports, publishes operations, models offerings/bindings, performs readiness/liquidity observation, and supplies routeable capability graph data (`src/modules/capability-supply/public.ts:7-51`). |
| Customer request | `src/modules/customer-request/public.ts`, `src/modules/customer-request/application/public.ts`, `src/modules/customer-request/compiler.ts` | Compiles intent and facts into a bounded request aggregate, evaluates eligible supply, creates route-plan generations, prepares actions, confirms mandates, and exposes application workflows through explicit ports (`src/modules/customer-request/public.ts:1-81`, `src/modules/customer-request/application/public.ts:46-138`). |
| Action invocation | `src/modules/action-invocation/index.ts`, `src/modules/action-invocation/application-service.ts` | Provides durable/in-memory invocation tracing, standing mandates, dynamic published-operation adapters, paid-operation semantics, recovery/reconciliation, and host projections (`src/modules/action-invocation/index.ts:30-90`, `src/modules/action-invocation/application-service.ts:40-74`). |
| Registry/catalog | `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/catalog/public.ts` | Projects published business/offering supply into public catalog and service APIs; the source port selects Convex or bounded legacy/local paths and optionally hydrates external search results (`src/modules/registry/registry.functions.ts:51-72`, `src/modules/registry/registry.functions.ts:120-219`). |
| Answer and thread | `src/modules/answer/public.ts`, `src/modules/answer-thread/public.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts` | Validates structured answer snapshots/artifacts, grounds provider facts, builds public thread projections, and runs retrieval/clarification/boundary/inquiry/agent turn paths (`src/modules/answer/public.ts:11-64`, `src/modules/answer-thread/public.ts:19-52`, `src/modules/answer-thread/internal/turn-orchestrator.ts:126-224`). |
| Harness | `src/modules/harness/public.ts`, `src/modules/harness/run-loop.ts`, `src/modules/harness/tool-contract.ts` | Runs bounded model/tool phases, applies approval and strict-schema gates, records run/session/evidence projections, and supports replay/evaluation (`src/modules/harness/public.ts:58-75`, `src/modules/harness/public.ts:130-158`). |
| Plan proposal | `src/modules/plan-proposal/public.ts`, `src/modules/plan-proposal/internal/plan-store.ts` | Validates model proposals against action menus and active plan state, applies budgets, and persists plan events/revisions (`src/modules/plan-proposal/public.ts:43-219`, `src/modules/plan-proposal/public.ts:272-313`). |
| Inquiries/notifications | `src/modules/inquiries/public.ts`, `src/modules/notification-outbox/public.ts` | Owns inquiry submission/readback/projection and notification dispatch contracts; persistence and provider dispatch are separated into Convex outbox functions (`convex/inquiries.ts:710-1245`, `convex/notificationOutbox.ts:311-567`). |
| Discovery/storefront | `src/modules/discovery/public.ts`, `src/modules/storefront/public.ts`, `src/modules/imported-commitment/` | Generates public discovery manifests/LLMs/sitemap projections and imports or enriches external supply claims before catalog publication (`convex/discovery.ts:234-413`, `src/routes/$slug.ucp.ts:25-44`). |
| Decision/project state | `src/modules/decision-map/public.ts`, `src/modules/project-spine/public.ts` | Maintains decision-map drafts/events and versioned project-spine status/generation contracts (`src/modules/decision-map/public.ts:1-21`, `src/modules/project-spine/public.ts:1-21`). |
| Shared platform/security | `src/modules/common/`, `src/modules/security/`, `src/modules/network-guard/`, `src/modules/observability/`, `src/modules/model-gateway/`, `src/modules/money/`, `src/modules/settings/` | Supplies canonical digests, stable hashes, source-write admission, host/network controls, observability, OpenRouter access, billing semantics, and operator preferences (`src/modules/model-gateway/public.ts:1-10`, `src/modules/common/action.ts:236-260`). |

The public files are the intended dependency seams. For example, the customer-request Convex application imports the application public API and separately injects `authorizePreparationPorts`, `compareResumePorts`, `confirmRoutePorts`, problem, facts, refine, and standing-route ports (`convex/customerRequestApplication.ts:21-66`).

## Primary data flows

### Public discovery and catalog search

1. The home route validates `q`, loads a server readback, and combines registry services with a customer-request plan preview (`src/routes/index.tsx:25-66`, `src/routes/index.tsx:95-123`).
2. The route calls `registryServicesSearchAction` for non-empty search queries (`src/routes/index.tsx:68-75`).
3. The action runs registry projection functions (`src/modules/registry/registry.actions.ts:420-453`), which read the Offering projection through a source port (`src/modules/registry/registry.functions.ts:93-118`).
4. The source query points to Convex `registry:searchPublicBusinessOfferingSupply`; `convex/registry.ts:300-395` exposes the public catalog and offering-supply query family, with bounded candidate/hydration limits (`convex/registry.ts:470-473`).
5. The route converts service DTOs into consumer supply options and projects the request preview into the one-view result (`src/routes/index.tsx:117-123`). When the engine flag is off and no services exist, it can additionally call `webDiscoverAction` (`src/routes/index.tsx:110-116`).

### Answer thread and streaming chat

1. The browser posts a bounded JSON turn to `/api/answer/turn`, which resolves a session cookie, validates access to an existing thread, checks rate limits, and creates an abort-aware SSE stream (`src/routes/api.answer.turn.ts:25-70`).
2. The route invokes `streamAnswerTurn` with the query, optional thread/search context, prechecked access, prior turns, and the original request signal (`src/routes/api.answer.turn.ts:71-95`).
3. `streamAnswerTurn` builds harness phases and chooses turn-path units such as retrieval-first, clarification, boundary, frozen-known, inquiry handoff, proposal, or agent (`src/modules/answer-thread/internal/turn-orchestrator.ts:55-74`, `src/modules/answer-thread/internal/turn-orchestrator.ts:226-553`).
4. Model access crosses the single OpenRouter seam in `src/modules/model-gateway/public.ts:1-10`; answer schema, grounding, artifacts, and message parts remain in `src/modules/answer/public.ts:21-64`.
5. Durable thread writes/readbacks are exposed by Convex `createAnswerThread`, append, tool-call, session-list, and public-projection functions (`convex/answerThreads.ts:78-140`, `convex/answerThreads.ts:331-554`).
6. The client renders streamed events in `src/components/ae/chat/` and the thread route reads a public projection before choosing the chat or private customer-record view (`src/routes/t.$threadId.tsx:70-85`, `src/routes/t.$threadId.tsx:88-107`).

### Customer request planning, authority, and route execution

1. Browser requests enter `src/routes/api.requests.ts`, whose POST handler delegates to `handleBrowserCustomerRequestPost` (`src/routes/api.requests.ts:1-7`). The browser adapter maintains a scoped guest session cookie and signs/verifies its session material with HMAC (`src/lib/server/customer-request-browser-api.ts:18-24`, `src/lib/server/customer-request-browser-api.ts:221-240`).
2. Public/UI actions are declared in `src/modules/customer-request/customer-request.actions.ts:47-108` and call named Convex source actions through `src/modules/customer-request/customer-request.functions.ts:56-110`.
3. Convex `customerRequestApplication.ts` resolves the caller, namespaces command keys, hashes commands, checks replay, reserves submissions, and delegates interpretation/compilation to application ports (`convex/customerRequestApplication.ts:680-743`). Refinement and fact submission use the same expected-revision/idempotency/port pattern (`convex/customerRequestApplication.ts:747-797`).
4. Application composition builds a request graph, interprets/compiles a proposal, evaluates eligible capability supply, and projects consumer-plan/route results through `src/modules/customer-request/application/public.ts:46-113`; the compiler represents route steps, edges, price/evidence, authority, expiry, and digest fields (`src/modules/customer-request/compiler.ts:92-157`).
5. Convex V2 read/write functions reserve/commit aggregates, refresh route generations, record command replays, and expose current projection material (`convex/customerRequestV2.ts:150-471`).
6. Confirmation and execution cross explicit route-mandate, execution-journal, dispatch, cancellation, evidence, and transport seams in `convex/customerRequestConfirmRoutePorts.ts`, `convex/customerRequestRouteMandate.ts`, `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteExecutionDispatchPorts.ts`, and `convex/customerRequestRouteTransportWorker.ts`.

### Supply publication to routeable capability

1. Owner pages are file routes under `src/routes/_operator/owner.*` and render supply/catalog feature components under `src/components/ae/supply/`, `src/components/ae/status/`, and `src/components/ae/offerings/`.
2. Capability publication and lifecycle mutations are exposed by `convex/capabilitySupply.ts`, including `publishCapability`, `withdrawCapability`, `refreshCapability`, graph reads, offering/binding registration, eligibility, quarantine, and owner funnel actions (`convex/capabilitySupply.ts:374-410`, `convex/capabilitySupply.ts:575-783`, `convex/capabilitySupply.ts:925-1138`).
3. Catalog writes use `convex/catalog.ts` to publish business catalog, create/revise offerings, change status, manage access paths, retry projections, and handle legacy-to-offering cutover (`convex/catalog.ts:270-589`).
4. Registry reads consume public catalog/offering projections (`convex/registry.ts:243-395`), while discovery manifests are regenerated or invalidated by `convex/discovery.ts:234-413`.
5. Route transport and dynamic published operations remain behind `src/modules/capability-supply/route-transport-runtime.ts` and `src/modules/action-invocation/dynamic-published-adapter.ts`; a provider-specific contract is isolated in `src/modules/provider-integrations/shipping/public.ts:7-50`.

### Inquiry and notification delivery

1. Public listing inquiry pages are route files such as `src/routes/$slug.inquiry.tsx`; action definitions include `submitInquiryAction` and owner/customer-record reads in `src/modules/actions/index.ts:31-32`.
2. Convex `submitPublicInquiry` validates/admit targets and writes inquiry state; owner inbox/readback, customer-record, replies, close, and privacy operations live in `convex/inquiries.ts:710-1245`.
3. Notification enqueue/dispatch, provider webhook ingestion, operator readback, retry, and no-repair controls are isolated in `convex/notificationOutbox.ts:311-567`; route-level provider handlers live under `src/routes/api.notification.*`.

## Persistence, projections, and asynchronous work

- `convex/schema.ts` composes table maps from each bounded context rather than declaring one monolithic table schema. The composition includes action invocation, answer threads, engine plans, decision maps, business/catalog, capability supply, customer requests, registry, discovery, harness, inquiries, outbox, observability, security, money, settings, and project spine (`convex/schema.ts:3-46`).
- Domain modules own schema fragments in `src/modules/*/internal/convex-schema.ts` or `schema.ts`; Convex files own validators and read/write orchestration. This keeps persisted shape near the bounded context while retaining one deployment schema (`convex/schema.ts:1-24`).
- Public catalog, discovery, answer, route, and harness data are projections/readbacks rather than raw source rows. Examples include registry DTO projection in `src/modules/registry/public.ts:31-52`, public thread projection in `src/modules/answer-thread/public.ts:19-25`, and private/public evidence projections in `src/modules/harness/public.ts:88-114`.
- Workflows and pools are installed as Convex components (`convex/convex.config.ts:1-19`); project-spine workflows use `WorkflowManager` and versioned definitions in `convex/projectSpine.ts:1-104`. Hourly cleanup is intentionally scheduled through internal functions (`convex/crons.ts:7-26`).
- Idempotency and replay are first-class. Customer-request command digests and namespaced keys appear in `convex/customerRequestApplication.ts:703-713`; V2 read/write results distinguish stored, replayed, conflict, stale, and invalid outcomes (`convex/customerRequestV2.ts:46-143`). Shared digest primitives are in `src/modules/common/canonical-digest.ts` and `src/modules/common/stable-hash.ts`.

## Security and authority boundaries

- Request middleware applies CSRF only to server functions, source-write admission before authenticated route handling, and Clerk middleware unless local E2E bypass is enabled (`src/start.ts:39-76`).
- Convex auth uses Clerk JWT issuer configuration (`convex/auth.config.ts:3-12`); application actions still resolve caller identity and optional service assertions before customer-request transitions (`convex/customerRequestApplication.ts:14-19`, `convex/customerRequestApplication.ts:703-705`).
- Action contracts classify consequence, authority, retry, evidence, and continuation; legacy actions are explicitly marked as unclassified writes rather than silently upgraded (`src/modules/common/action.ts:236-260`).
- MCP admits anonymous read-only actions and filters authenticated actions by declared surface and customer-request authority mode (`src/lib/server/mcp-api.ts:21-33`). OAuth/agent access protocol handlers are isolated in `src/routes/oauth.*`, `src/routes/[.]well-known/`, and `src/modules/customer-request/agent-access.ts`.
- Sensitive source writes use family-scoped keys/nonces and admission middleware (`src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`); source-writable Convex operations are reached through `src/lib/server/convex-source.ts` rather than direct browser database access.

## External/runtime integration seams

- Authentication: Clerk TanStack Start middleware/provider (`src/start.ts:66-76`, `src/routes/__root.tsx:79-108`) and Convex issuer config (`convex/auth.config.ts`).
- Model transport: OpenRouter/TanStack AI gateway (`src/modules/model-gateway/public.ts:1-10`, `src/modules/answer-thread/internal/turn-orchestrator.ts:1-8`); Convex declares model-related environment keys in `convex/convex.config.ts:7-15`.
- Search: registry source reads may select Convex or Meilisearch and hydrate facts back from the Offering projection (`src/modules/registry/registry.functions.ts:120-219`); deployment values are declared in `.env.example:96-102`.
- Billing/payment: money module and Stripe/Autumn route/provider surfaces (`src/modules/money/public.ts`, `src/routes/api.stripe.webhook.ts`, `.env.example:57-68`); action invocation includes x402/payment reconciliation seams (`src/modules/action-invocation/index.ts:17-24`, `src/modules/action-invocation/paid-operation-semantics.ts`).
- Notifications: Resend/Novu dispatch and webhook handlers under `src/routes/api.notification.*`, backed by the Convex outbox (`convex/notificationOutbox.ts:311-567`, `.env.example:70-83`).
- Observability: client boot/error boundary (`src/routes/__root.tsx:10-13`, `src/routes/__root.tsx:91-100`) and server middleware (`src/start.ts:11-37`) feed Sentry/PostHog modules under `src/lib/observability/` and `src/modules/observability/`.
- Agent protocols: MCP over streamable HTTP (`src/lib/server/mcp-api.ts:6-13`, `src/routes/mcp.ts:5-12`), UCP/discovery JSON (`src/routes/$slug.ucp.ts:17-44`), and OAuth metadata/token/authorization routes under `src/routes/oauth.*` and `src/routes/[.]well-known/`.

## Architectural constraints visible in the source

1. **One action contract, many surfaces.** Route handlers and adapters should call an existing action from `src/modules/actions/index.ts` or a domain public seam rather than duplicate business logic; the registry explicitly describes HTTP/MCP/agent/answer-thread exposure (`src/modules/actions/index.ts:74-90`).
2. **Public modules over internals.** Cross-context imports use files such as `src/modules/customer-request/application/public.ts`, `src/modules/registry/public.ts`, and `src/modules/capability-supply/public.ts`; persistence details remain in `internal/` or Convex adapter files.
3. **Explicit ports at runtime seams.** Customer-request application handlers inject named ports (`convex/customerRequestApplication.ts:57-66`), while registry reads inject a source port and search backend (`src/modules/registry/registry.functions.ts:36-91`).
4. **Projection before presentation.** Browser and agent surfaces consume DTOs/readbacks (`src/routes/index.tsx:32-47`, `src/modules/answer-thread/public.ts:11-25`) instead of exposing Convex documents directly.
5. **Authority before effect.** Customer request actions resolve callers and command identity before durable writes (`convex/customerRequestApplication.ts:703-743`); action metadata and MCP admission keep read-only and consequential actions distinct (`src/modules/common/action.ts:115-167`, `src/lib/server/mcp-api.ts:26-33`).
6. **Generated files are not extension points.** `src/routeTree.gen.ts` and `convex/_generated/` are generated registrations/types; route source belongs in `src/routes/`, and schema/function source belongs in `convex/` and `src/modules/` (`src/routeTree.gen.ts:7-9`, `tsconfig.json:43-44`).

## Completion

Completion confirmation (2026-08-01): complete; `ARCHITECTURE.md` — 180 lines; `STRUCTURE.md` — 236 lines.
