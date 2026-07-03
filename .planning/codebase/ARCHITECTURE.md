<!-- refreshed: 2026-07-03 -->
# Architecture

**Analysis Date:** 2026-07-03

## System Overview

```text
+-------------------------------------------------------------+
|              TanStack Start application shell                |
| `src/start.ts` -> `src/router.tsx` -> `src/routes/__root.tsx` |
+----------------------+-------------------+------------------+
| Public registry      | Owner/admin       | Machine surfaces |
| `src/routes/*`       | `src/routes/owner*`| `src/routes/api*`|
+----------+-----------+---------+---------+---------+--------+
           |                     |                   |
           v                     v                   v
+-------------------------------------------------------------+
|                    Module public seams                       |
| `src/modules/*/public.ts`, `*.functions.ts`, `*.actions.ts`  |
+----------------------+-------------------+------------------+
           |                     |                   |
           v                     v                   v
+-------------------------------------------------------------+
|                 Server source and admission layer             |
| `src/lib/server/convex-source.ts`                             |
| `src/lib/server/source-write-admission.ts`                    |
+-------------------------------------------------------------+
           |
           v
+-------------------------------------------------------------+
|                         Convex backend                        |
| `convex/schema.ts`, `convex/registry.ts`, `convex/inquiries.ts`|
| `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`    |
+-------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start request middleware | Builds the request context with observability, CSRF, source-write admission, and Clerk auth middleware. | `src/start.ts` |
| Root route shell | Installs global styles, Astryx providers, Clerk provider gating, observability bootstrapping, error boundary, and toast layer. | `src/routes/__root.tsx` |
| Router factory | Creates the TanStack router from the generated route tree with intent preloading and route type registration. | `src/router.tsx` |
| Public registry routes | Render human surfaces for search, provider detail, and qualified inquiry intake. | `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx` |
| Machine-readable registry routes | Return public JSON, agent JSON, discovery, sitemap, and llms text payloads. | `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts` |
| Action registry | Declares assistant-callable and HTTP-facing operations once and exposes action metadata to API and harness callers. | `src/modules/actions/index.ts`, `src/modules/common/action.ts` |
| Registry module | Owns public catalog projection, search/detail/list action contracts, and registry source access. | `src/modules/registry/public.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/registry.functions.ts` |
| Inquiry module | Owns qualified inquiry submission, owner inbox/thread operations, reply, read/close actions, and route readbacks. | `src/modules/inquiries/public.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts` |
| Answer module | Owns answer synthesis, prose, evidence, layout profile, model selection, and tool-use agent behavior. | `src/modules/answer/public.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts` |
| Answer-thread module | Owns live answer turn orchestration, SSE events, thread persistence, harness finalization, and answer thread Convex access. | `src/modules/answer-thread/public.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts` |
| Harness module | Provides deterministic tool/model/run accounting, tool wrappers, approval policy, evidence envelopes, and runtime event collection. | `src/modules/harness/public.ts`, `src/modules/harness/action-tool.ts`, `src/modules/harness/run-loop.ts` |
| Source call facade | Centralizes Convex public/authenticated/system clients and function reference calls from server code. | `src/lib/server/convex-source.ts` |
| Source-write admission | Signs browser/server write authority and verifies it in Convex mutations. | `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts` |
| Convex source state | Defines persisted tables, indexes, source import state, and domain projections. | `convex/schema.ts`, `convex/source_state.ts`, `convex/registry.ts`, `convex/inquiries.ts` |
| Owner/operator shell | Protects owner/admin/developer routes and renders Astryx operator navigation. | `src/lib/operator/route-options.ts`, `src/lib/server/require-operator-session.ts`, `src/components/ae/layout/AeOperatorShell.tsx` |
| Notification provider | Dispatches Resend email, resolves owner email through Clerk, verifies provider callbacks, and records provider results. | `src/lib/server/notification-provider.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.resend-webhook.ts` |

## Pattern Overview

**Overall:** File-based TanStack Start frontend with route-scoped server functions, domain module seams, action-driven machine surfaces, and Convex as the source-state backend.

**Key Characteristics:**
- Route files in `src/routes/` are thin entry points. They validate URL or request input, call module server functions/actions, and render Astryx-backed UI.
- Domain behavior is organized under `src/modules/<domain>/`. Import from `src/modules/<domain>/public.ts` when crossing module boundaries.
- External assistant operations are action declarations in `src/modules/*/*.actions.ts` and are registered exactly once in `src/modules/actions/index.ts`.
- Convex access from app server code goes through `src/lib/server/convex-source.ts`; route and component code does not instantiate Convex clients directly.
- Browser-originating writes are admitted through source-write admission in `src/lib/server/source-write-admission.ts`, domain helper functions, and `convex/sourceWriteAdmission.ts`.
- Public copy, JSON payloads, actions, and tool outputs preserve the AE trust boundary from `AGENTS.md`: read, compare, summarize, route to next step, and submit qualified inquiry only.
- UI code uses Astryx primitives and application shells from `DESIGN.md`; Tailwind utilities are layout glue, not a second design system.

## Layers

**Request Runtime:**
- Purpose: Establish request context and process every TanStack Start request.
- Location: `src/start.ts`
- Contains: `createStartHandler`, `defaultStreamHandler`, request middleware, local Clerk bypass guard, CSRF guard.
- Depends on: `@tanstack/react-start`, Clerk middleware, `src/lib/http/csrf.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/observability/otel.ts`.
- Used by: All route handlers, loaders, server functions, and API endpoints.

**Routing and Root Shell:**
- Purpose: Resolve file routes and provide application-wide providers.
- Location: `src/router.tsx`, `src/routes/__root.tsx`, `src/routeTree.gen.ts`
- Contains: Generated route tree, router factory, route type registration, global `head` links, `Theme`, `LayerProvider`, `LinkProvider`, Clerk provider, observability boundary, toaster.
- Depends on: `@tanstack/react-router`, `@tanstack/react-start`, `@astryxdesign/core`, generated route tree.
- Used by: Public, owner/admin, API, discovery, and agent routes.

**Public Human Routes:**
- Purpose: Render searchable registry, provider pages, landing answer prompt, and qualified inquiry form.
- Location: `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`
- Contains: Search parameter validation, route loaders, SEO metadata, form submission handlers, public shell composition.
- Depends on: Registry and inquiry module public/server functions, Astryx shell components, AE route readbacks.
- Used by: Human visitors and assistants that route users back to AE for boundary-sensitive work.

**Machine and API Routes:**
- Purpose: Expose JSON, SSE, discovery files, quiet agent tools, provider callbacks, and internal dispatch endpoints.
- Location: `src/routes/api.*.ts`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`
- Contains: HTTP method handlers, request body parsing, action invocation, SSE response creation, cache headers, provider signature verification.
- Depends on: `src/modules/actions/index.ts`, domain modules, `src/lib/http/json.ts`, `src/lib/server/source-write-admission.ts`, provider libraries.
- Used by: External assistants, browser clients, webhook providers, smoke tests, and discovery crawlers.

**Owner/Admin Operator Routes:**
- Purpose: Render authenticated owner/admin workflows and readback panels.
- Location: `src/routes/owner.*.tsx`, `src/routes/admin.*.tsx`, `src/routes/developers.*.tsx`
- Contains: `operatorRouteOptions`, route loaders, route-specific server functions, Astryx operator panels, denial/readback fallbacks.
- Depends on: Clerk auth through server functions, operator shell, owner/admin domain modules.
- Used by: Business owners, admin operators, developer discovery surfaces.

**Domain Modules:**
- Purpose: Own business rules, server functions, projections, actions, and domain schemas.
- Location: `src/modules/`
- Contains: `public.ts` export seams, `*.functions.ts` server/source access, `*.actions.ts` operation contracts, `*.schema.ts` validators, `internal/` implementation details.
- Depends on: Common action/result utilities, Convex source facade, Zod, domain-specific libraries.
- Used by: Routes, API handlers, harness, tests, and adjacent modules through public seams.

**Action Contract Layer:**
- Purpose: Declare one operation contract that fans out to React UI, HTTP API, agent JSON, quiet agent tools, and harness tooling.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Contains: Action metadata, schemas, read-only/write flags, surfaces, boundaries, JSON schema descriptions, invocation helpers.
- Depends on: Zod schemas and domain action runners.
- Used by: `src/routes/api.agent.tools.ts`, registry JSON routes, answer tool runner, harness tools.

**Answer and Harness Runtime:**
- Purpose: Turn a public query into a boundary-honest, evidence-backed response while recording phases, tool calls, and finalization data.
- Location: `src/modules/answer/`, `src/modules/answer-thread/`, `src/modules/harness/`
- Contains: Tool-use agent, turn orchestrator, run loop, answer gate, tool runner, thread persistence, evidence snapshotting, model events.
- Depends on: Registered read-only actions, OpenRouter/model configuration, Convex answer-thread persistence, harness policy.
- Used by: `src/components/ae/chat/AeChat.tsx`, `src/routes/api.answer.turn.ts`, thread routes under `src/routes/t.$threadId.tsx`.

**Server Source Layer:**
- Purpose: Isolate all app-server calls into Convex and enforce authenticated/public/system client selection.
- Location: `src/lib/server/convex-source.ts`
- Contains: `sourceQuery`, `sourceMutation`, `sourceAction`, `callPublicSourceQuery`, `callAuthenticatedSourceMutation`, `callSystemSourceMutation`, source URL resolution.
- Depends on: `convex/server`, `convex/browser`, Clerk server auth.
- Used by: Domain `*.functions.ts` files and provider dispatch routes.

**Source Admission Layer:**
- Purpose: Bind browser/server write intent to signed admission envelopes before Convex accepts mutations.
- Location: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Contains: Scope constants, HMAC admission creation/verification, request-context helpers, Convex mutation validators.
- Depends on: Server runtime secret, request context, Convex mutation args.
- Used by: Public inquiry submission, owner claim/catalog publish, protected actions, billing, notification repair, business actions, harness session finalization.

**Convex Backend:**
- Purpose: Persist source-owned state, serve indexed queries, enforce auth/authorization, and execute domain mutations.
- Location: `convex/`
- Contains: Schema fragments, auth config, source state import/upsert logic, registry queries, inquiry mutations, billing/protected/business-action mutations, notification outbox, answer threads, harness sessions.
- Depends on: Convex validators, generated API types, Clerk identity, source-write admission.
- Used by: All source calls from app server modules.

**Styling and Design System:**
- Purpose: Provide global cascade, Astryx theme, layout density, and visual constraints.
- Location: `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/base.css`, `src/components/astryx/`, `src/components/ae/layout/`
- Contains: Global CSS imports, theme tokens, router link adapter, app shells, legacy compatibility components.
- Depends on: `@astryxdesign/core`, `@astryxdesign/theme-neutral`, Tailwind 4.
- Used by: Root route, public shell, operator shell, registry/listing/inquiry components.

## Data Flow

### Primary Public Search Path

1. The browser requests `/registry` and TanStack Start applies middleware from `src/start.ts:52`.
2. The file route validates search params with Zod in `src/routes/registry.tsx:59`.
3. The route loader calls `readRegistryRouteServer` from `src/routes/registry.tsx:68`.
4. The server function loads public registry data through `loadRegistryRouteReadback` in `src/routes/registry.tsx:81`.
5. Registry server functions call the source port in `src/modules/registry/registry.functions.ts:74`.
6. The production source port calls Convex through `callPublicSourceQuery` in `src/modules/registry/registry.functions.ts:152`.
7. Convex reads indexed public catalog rows in `convex/registry.ts:194`.
8. The route renders search controls and cards inside `AePublicShell` in `src/routes/registry.tsx:117`.

### Provider Detail and Inquiry Path

1. The provider route loads catalog data by slug through `readPublicBusinessPageServer` in `src/routes/$slug.tsx:25`.
2. The inquiry route loads the same provider page plus inquiry readback in `src/routes/$slug.inquiry.tsx:60`.
3. The form validates target, body, contact, and origin before calling `submitPublicInquiryServer` in `src/routes/$slug.inquiry.tsx:111`.
4. `submitPublicInquiryThroughSource` creates idempotency and correlation keys in `src/modules/inquiries/inquiry.functions.ts:283`.
5. The server signs a `public_inquiry` admission envelope through `sourceWriteAdmissionFromContext` in `src/lib/server/source-write-admission.ts:33`.
6. The inquiry mutation receives validated input and source-write admission at `convex/inquiries.ts:612`.
7. The route renders a receipt or boundary-honest error state without implying booking, payment, dispatch, availability, or fulfillment.

### Quiet Agent Tool Path

1. `GET /api/agent/tools` lists agent-tool actions using `listAgentToolActions` in `src/routes/api.agent.tools.ts:23`.
2. Action descriptions are built from `describeActionForAgent` in `src/modules/common/action.ts:119`.
3. `POST /api/agent/tools` parses `{ tool, input }`, rejects unknown tools, validates input, and invokes `executeAction` in `src/routes/api.agent.tools.ts:43`.
4. Registered actions come from the explicit `actions` array in `src/modules/actions/index.ts:22`.
5. `registry.search` and `registry.detail` remain read-only; `inquiry.submit` is the only assistant-exposed write in `src/modules/inquiries/inquiry.actions.ts:96`.
6. Write actions receive `sourceWriteRequest` from `sourceWriteAdmissionFromRequest` in `src/routes/api.agent.tools.ts:112`.

### Answer Turn and Evidence Path

1. The home route passes `q` into `AeChat` when a query is present in `src/routes/index.tsx:36`.
2. `AeChat` starts a live turn and opens `/api/answer/turn` from `src/components/ae/chat/AeChat.tsx:173`.
3. `api.answer.turn` validates request data, session cookie, rate limits, and access before streaming in `src/routes/api.answer.turn.ts:22`.
4. `streamAnswerTurn` creates thread/turn/harness identifiers and emits the initial SSE thread event in `src/modules/answer-thread/internal/turn-orchestrator.ts:161`.
5. Retrieval runs AE read tools through `runAnswerToolCall("registry.search")` in `src/modules/answer-thread/internal/turn-orchestrator.ts:678`.
6. The tool runner validates registered read-only actions and captures structured output in `src/modules/answer-thread/internal/tool-runner.ts:56`.
7. The answer tool-use agent builds provider snapshots and applies gate checks in `src/modules/answer/internal/answer-tool-use-agent.ts:225`.
8. The finalization step persists answer turns, tool calls, frozen evidence, and harness journal data in `src/modules/answer-thread/internal/answer-turn-finalization.ts:147`.

### Owner Inbox Path

1. Owner inquiry routes share `operatorRouteOptions` from `src/lib/operator/route-options.ts:10`.
2. `requireOperatorSession` reads Clerk auth and redirects unauthenticated users in `src/lib/server/require-operator-session.ts:7`.
3. The inbox route loader calls `readCurrentOwnerInboxServer` in `src/routes/owner.inquiries.tsx:35`.
4. Inquiry server functions call authenticated Convex queries through `readCurrentOwnerInboxThroughSource` in `src/modules/inquiries/inquiry.functions.ts:327`.
5. Convex resolves the business actor from Clerk identity in `convex/authz.ts:35`.
6. The operator shell renders owner navigation and content using Astryx `AppShell` in `src/components/ae/layout/AeOperatorShell.tsx:45`.

### Notification Dispatch Path

1. Internal dispatch hits `POST /api/notification/resend-dispatch` with bearer auth validated in `src/routes/api.notification.resend-dispatch.ts:277`.
2. The route reads dispatch details through a system source call in `src/routes/api.notification.resend-dispatch.ts:173`.
3. The provider helper resolves the owner email through Clerk in `src/lib/server/notification-provider.ts:268`.
4. Resend delivery is performed by provider code in `src/lib/server/notification-provider.ts:315`.
5. Provider response is recorded through Convex source calls in `src/routes/api.notification.resend-dispatch.ts:229`.
6. Resend callbacks enter `src/routes/api.notification.resend-webhook.ts:59` and verify raw webhook input before recording provider state.

**State Management:**
- Public catalog, inquiries, owner/admin state, billing, protected actions, answer threads, notification outbox, and harness sessions live in Convex tables declared by `convex/schema.ts`.
- Browser UI state stays component-local unless it needs to survive navigation. Chat thread state is persisted through answer-thread server functions and Convex.
- Source admission request state lives in TanStack server function context via `src/lib/server/source-write-admission.ts`.
- Route data is fetched in TanStack loaders or server functions; avoid ad hoc client fetches when a route loader can provide stable data.
- Module-level state is limited to explicit test/local seams and small caches, such as `answerCache` in `src/routes/api.answer.ts:19`; persistent state belongs in Convex.

## Key Abstractions

**Action Contract:**
- Purpose: Represent an AE operation with id, schema, surfaces, read/write mode, summary, boundaries, and runner.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Pattern: Define with `defineAction`, register in `src/modules/actions/index.ts`, expose through route/API/harness consumers.

**Domain Public Seam:**
- Purpose: Stabilize imports across module boundaries and hide `internal/` implementation details.
- Examples: `src/modules/answer/public.ts`, `src/modules/answer-thread/public.ts`, `src/modules/harness/public.ts`, `src/modules/billing/public.ts`
- Pattern: Export types, projections, and callable functions from `public.ts`; keep internal algorithms under `internal/`.

**Source Function Reference:**
- Purpose: Address Convex functions from server code without importing generated API objects into route files.
- Examples: `src/lib/server/convex-source.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`
- Pattern: Build refs with `sourceQuery`, `sourceMutation`, or `sourceAction`, then call through public/authenticated/system source helpers.

**Source-Write Admission:**
- Purpose: Enforce that writes originate from an allowed AE surface and scope.
- Examples: `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Pattern: Choose the narrow scope, create admission in a server function/route, pass it to Convex mutation args, and verify with `requireSourceWrite`.

**Route Readback:**
- Purpose: Return UI-ready state, denial state, and reconstruction details for public or operator pages.
- Examples: `src/modules/inquiries/route-readbacks.ts`, `src/modules/billing/owner-billing.readback.ts`, `src/modules/security/admin-readback.functions.ts`
- Pattern: Build readback data in module functions, then let route files render it with shell components.

**Harness Run:**
- Purpose: Capture deterministic phases, tools, model output, evidence, policy, and finalization records around answer generation.
- Examples: `src/modules/harness/run-loop.ts`, `src/modules/harness/action-tool.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Pattern: Start a `HarnessRunLoop`, record phases and tool/model events, persist final journal data at answer turn finalization.

**Discovery Manifest:**
- Purpose: Publish machine-readable, boundary-honest catalog/discovery data.
- Examples: `src/modules/discovery/public.ts`, `src/modules/discovery/discovery.functions.ts`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`
- Pattern: Build discovery payloads in the module layer and expose them through simple text/JSON/XML route handlers.

**Operator Route Options:**
- Purpose: Share auth, pending, and error behavior across owner/admin/developer routes.
- Examples: `src/lib/operator/route-options.ts`, `src/lib/server/require-operator-session.ts`
- Pattern: Spread `operatorRouteOptions` into protected route definitions and keep role-specific denial state in route readbacks.

## Entry Points

**Application request handler:**
- Location: `src/start.ts`
- Triggers: Every TanStack Start HTTP request.
- Responsibilities: Create router, stream responses, apply observability, CSRF, source admission, and Clerk middleware.

**Router factory:**
- Location: `src/router.tsx`
- Triggers: TanStack Start app initialization.
- Responsibilities: Attach generated route tree and register router types.

**Root route:**
- Location: `src/routes/__root.tsx`
- Triggers: Every route render.
- Responsibilities: Set document metadata/assets and install global UI/auth/observability providers.

**Landing and answer prompt:**
- Location: `src/routes/index.tsx`
- Triggers: `GET /` and `GET /?q=...`.
- Responsibilities: Render landing search prompt or pass query to live chat flow.

**Live answer stream:**
- Location: `src/routes/api.answer.turn.ts`
- Triggers: `POST /api/answer/turn`.
- Responsibilities: Validate turn input, check session/rate/access, and stream SSE events from answer orchestration.

**Registry search:**
- Location: `src/routes/registry.tsx`, `src/routes/api.businesses.search.ts`
- Triggers: Human registry page requests and `GET /api/businesses/search`.
- Responsibilities: Validate search params, call registry module, render cards or return JSON.

**Provider detail:**
- Location: `src/routes/$slug.tsx`, `src/routes/api.businesses.$slug.ts`
- Triggers: Human provider page requests and `GET /api/businesses/$slug`.
- Responsibilities: Load one public catalog listing, generate SEO data, render listing or return JSON/not-found.

**Qualified inquiry:**
- Location: `src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/inquiry.actions.ts`
- Triggers: Human form submission or `inquiry.submit` agent tool.
- Responsibilities: Validate contact/message/target, sign source-write admission, submit inquiry, and render receipt/readback.

**Quiet agent tools:**
- Location: `src/routes/api.agent.tools.ts`
- Triggers: `GET /api/agent/tools` and `POST /api/agent/tools`.
- Responsibilities: List assistant-callable actions and invoke registered tools with boundary metadata.

**Discovery files:**
- Location: `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`
- Triggers: Plain-text, JSON, XML, and robots crawler requests.
- Responsibilities: Publish canonical assistant/crawler discovery payloads.

**Owner inbox:**
- Location: `src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`
- Triggers: Authenticated owner inbox and thread views.
- Responsibilities: Read owner inquiry data, reply, mark read, close, and render operator shell.

**Provider callbacks:**
- Location: `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`
- Triggers: Resend and Stripe webhooks.
- Responsibilities: Verify raw provider signatures and record provider outcomes through source-admitted mutations.

**Convex backend functions:**
- Location: `convex/registry.ts`, `convex/inquiries.ts`, `convex/catalog.ts`, `convex/answerThreads.ts`, `convex/notificationOutbox.ts`
- Triggers: Source calls from app server modules.
- Responsibilities: Serve indexed reads, enforce auth/source-write admission, mutate source-state tables, and return typed projections.

## Architectural Constraints

- **Threading:** The web app runs on the Node/TanStack Start request model with async server functions and streaming SSE; Convex functions execute in Convex's function runtime. There are no app-managed worker threads.
- **Global state:** Keep runtime global state explicit and small. Existing examples include the legacy answer cache in `src/routes/api.answer.ts:19` and local/test ports in `src/modules/registry/registry.functions.ts:46` and `src/modules/answer-thread/answer-thread.functions.ts:190`.
- **Circular imports:** Domain code should import through `src/modules/*/public.ts` seams. The tests under `src/modules/__tests__/` enforce internal-boundary and agent-boundary rules.
- **Convex function calls:** App server code calls Convex through `src/lib/server/convex-source.ts`; do not create route-local Convex clients.
- **Convex validators and indexes:** Convex functions define validators and use indexed/bounded reads, following `convex/_generated/ai/guidelines.md`. Schema changes belong in `convex/schema.ts` and module schema fragments.
- **Auth:** Clerk middleware belongs in `src/start.ts`; server-side auth reads use Clerk server helpers through `src/lib/server/require-operator-session.ts` or source helpers. Convex authorization is enforced in `convex/authz.ts`.
- **Source writes:** Browser or server writes to Convex require the narrowest source-write scope in `src/modules/security/source-write-admission.ts`; do not add write mutations that bypass `convex/sourceWriteAdmission.ts`.
- **Assistant boundary:** Assistant-facing actions may read, compare, summarize, route to next step, and submit qualified inquiry only. Do not expose booking, payment, dispatch, availability confirmation, or autonomous fulfillment.
- **Visual system:** New UI uses Astryx primitives from `@astryxdesign/core` and the neutral theme. Do not add bespoke `Ae*` presentation components, shadcn/radix/cva wrappers, fontsource fonts, handwritten CSS files, or Daylight-era visual assets.
- **Human vocabulary:** Public human routes do not show internal labels such as `source-owned`, `readback`, `manifest`, `capability`, `gateway`, `operator`, `MCP`, `OpenAPI`, `callable`, `autonomous`, `agent-native`, `DTO`, or `fixture`.
- **Generated files:** Do not edit `src/routeTree.gen.ts` or `convex/_generated/*` directly. Regenerate them with the project scripts when route or Convex API changes require it.
- **Secrets:** `.env`, `.env.local`, and similar files exist for environment configuration and must not be read, quoted, or committed into generated documentation.

## Anti-Patterns

### Bypassing the Action Registry for Assistant Operations

**What happens:** A new assistant-visible operation is implemented as a standalone API route or server function without an action declaration.
**Why it's wrong:** The operation will not share schemas, summaries, boundaries, read/write mode, quiet tool exposure, or harness behavior with the rest of AE.
**Do this instead:** Define the operation in `src/modules/<domain>/<domain>.actions.ts`, import it in `src/modules/actions/index.ts`, and route HTTP or UI callers through the action runner as shown by `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.actions.ts`.

### Importing Module Internals Across Domain Boundaries

**What happens:** Route or adjacent domain code imports from another module's `internal/` directory or private implementation file.
**Why it's wrong:** It couples surfaces to implementation details that are not stable and bypasses the module contracts used by tests and route consumers.
**Do this instead:** Export the needed contract from `src/modules/<domain>/public.ts` or add a narrow server function in `src/modules/<domain>/<domain>.functions.ts`; follow `src/modules/answer/public.ts` and `src/modules/answer-thread/public.ts`.

### Creating Route-Local Convex Clients

**What happens:** A route creates its own Convex client or imports generated API objects directly.
**Why it's wrong:** It bypasses the app's source URL resolution, public/authenticated/system client separation, Clerk token handling, test seams, and source-write admission flow.
**Do this instead:** Add a domain source reference in `src/modules/<domain>/<domain>.functions.ts` using helpers from `src/lib/server/convex-source.ts`.

### Writing Without Source-Write Admission

**What happens:** A browser-triggered or server-triggered mutation writes to Convex without a `sourceWrite` envelope.
**Why it's wrong:** Convex cannot prove the write came from an allowed AE surface or scope, and replay/conflict protections are weakened.
**Do this instead:** Create admission with `src/lib/server/source-write-admission.ts`, choose a scope from `src/modules/security/source-write-admission.ts`, validate it in Convex with `convex/sourceWriteAdmission.ts`, and store operation keys when the domain requires idempotency.

### Overclaiming AE Capabilities in Public or Agent Surfaces

**What happens:** Copy or tool metadata implies AE can book, pay, dispatch, confirm availability, or autonomously fulfill a service request.
**Why it's wrong:** It breaks the product trust contract and creates false expectations for both people and assistants.
**Do this instead:** Reuse boundary language from `AGENTS.md`, `PRODUCT.md`, and the `summary`/`boundaries` fields in `src/modules/inquiries/inquiry.actions.ts`.

### Adding a Parallel UI System

**What happens:** New UI imports shadcn/radix/cva wrappers, extends legacy bespoke presentation primitives, or adds separate CSS files for feature styling.
**Why it's wrong:** `DESIGN.md` makes Astryx the visual authority and keeps Tailwind utilities limited to layout glue.
**Do this instead:** Compose with Astryx primitives, route shells in `src/components/ae/layout/`, and global styling from `src/styles/globals.css`.

## Error Handling

**Strategy:** Validate at boundaries, return typed domain results, fail closed for auth/admission/provider errors, and render explicit readback or denial states rather than throwing user-facing surprises.

**Patterns:**
- Route handlers return `jsonResponse` with explicit status codes, as in `src/routes/api.businesses.$slug.ts` and `src/routes/api.agent.tools.ts`.
- Domain actions return structured success/error payloads and preserve action-specific error codes, as in `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.actions.ts`.
- Server functions validate input with Zod before source calls, as in `src/routes/registry.tsx:59` and `src/routes/$slug.inquiry.tsx:111`.
- Source and admission helpers throw server-side errors when required configuration is missing or invalid, as in `src/lib/server/convex-source.ts:168` and `src/lib/server/source-write-admission.ts:70`.
- Convex write functions verify source admission and domain authorization before mutation, as in `convex/sourceWriteAdmission.ts:39`, `convex/catalog.ts:221`, and `convex/inquiries.ts:612`.
- Provider webhook routes verify raw signatures before processing payloads, as in `src/routes/api.business-actions.stripe-webhook.ts:116` and `src/routes/api.notification.resend-webhook.ts:59`.
- Owner/admin routes use route readbacks for denial or degraded states instead of leaking raw auth/provider errors into UI.

## Cross-Cutting Concerns

**Logging:** Observability starts in `src/start.ts` through `src/lib/observability/otel.ts`. UI boot/error capture lives in `src/routes/__root.tsx` with `AeObservabilityBoot` and `AeObservabilityErrorBoundary`. Domain telemetry and operator readbacks live under `src/modules/observability/` and Convex functions in `convex/observability.ts`.

**Validation:** Use Zod for route/search/action inputs in `src/routes/` and `src/modules/common/action.ts`; use Convex validators for backend function args and returns in `convex/*.ts`. Keep schemas close to the boundary that accepts untrusted data.

**Authentication:** Clerk middleware is installed in `src/start.ts`; protected route server functions call `requireOperatorSession` from `src/lib/server/require-operator-session.ts`; Convex domain access checks live in `convex/authz.ts`. Keep public read routes unauthenticated and owner/admin operations authenticated.

**Authorization:** Owner/admin authorization belongs in Convex queries/mutations and route readback functions, not only in React components. Use `operatorRouteOptions` for route-level protection and Convex `resolveBusinessActor`/`resolveAdminAuthority` for data access.

**Security:** CSRF protection is request middleware in `src/start.ts`; source-write admission protects all browser/server writes to Convex; provider webhook routes verify signatures over raw request bodies; secrets are accessed through server-side config readers only.

**Design:** `DESIGN.md` is the source of truth. Use `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `src/components/astryx/RouterLink.tsx`, and route shells before adding any local UI abstraction.

**Testing Boundaries:** Existing tests under `src/modules/__tests__/`, `src/lib/__tests__/`, and `src/routes/__tests__/` codify important architecture rules, including agent boundaries, internal import boundaries, route behavior, source admission, and discovery payload shape.

---

*Architecture analysis: 2026-07-03*
