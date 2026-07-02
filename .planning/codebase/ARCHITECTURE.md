<!-- refreshed: 2026-07-02 -->
# Architecture

**Analysis Date:** 2026-07-02

## System Overview

```text
+-------------------------------------------------------------------+
|                         TanStack Start App                         |
| `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`          |
+----------------------+----------------------+---------------------+
| Public UI Routes     | Owner/Admin Routes   | API/Machine Routes  |
| `src/routes/*.tsx`   | `src/routes/owner*`  | `src/routes/api.*`  |
+----------+-----------+----------+-----------+----------+----------+
           |                      |                      |
           v                      v                      v
+-------------------------------------------------------------------+
|                     Feature Module Boundary                        |
| `src/modules/*/public.ts`, `*.functions.ts`, `*.actions.ts`        |
+----------------------+----------------------+---------------------+
| Domain logic         | Action registry      | Server/source ports |
| `src/modules/*/internal` | `src/modules/actions` | `src/lib/server` |
+----------+-----------+----------+-----------+----------+----------+
           |                      |                      |
           v                      v                      v
+-------------------------------------------------------------------+
|                         Convex Source State                        |
| `convex/*.ts`, `convex/schema.ts`, module-owned table schemas      |
+----------------------+----------------------+---------------------+
| Catalog/Registry     | Inquiry/Answer data  | Ops/observability   |
| `convex/registry.ts` | `convex/inquiries.ts`| `convex/security.ts`|
+-------------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Start instance | Installs request middleware for observability, CSRF, source-write admission, and Clerk request auth. | `src/start.ts` |
| Router | Builds the TanStack Router from the generated route tree and registers router types. | `src/router.tsx` |
| Root route | Provides global document shell, Clerk provider gating, observability boot, error boundary, tooltips, and toaster. | `src/routes/__root.tsx` |
| File routes | Own URL shape, search-param validation, loaders, API handlers, metadata, and route-level composition. | `src/routes/registry.tsx`, `src/routes/api.agent.tools.ts`, `src/routes/$slug.tsx` |
| Public shell/components | Render public human surfaces without owning business logic. | `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx` |
| Operator shell/components | Render owner/admin operational surfaces. | `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/operator/AeOperatorDataTable.tsx` |
| Action contract | Defines AE actions, boundaries, input/output schemas, surfaces, and agent descriptors. | `src/modules/common/action.ts` |
| Action registry | Explicitly imports and registers all action definitions for UI, HTTP, agent JSON, and agent-tools surfaces. | `src/modules/actions/index.ts` |
| Registry module | Reads published catalog pages/details and routes search through Convex or optional search backend fallback. | `src/modules/registry/registry.functions.ts`, `src/modules/registry/public.ts` |
| Inquiry module | Validates public inquiry writes, owner inbox reads/writes, local-E2E fallback state, and source-write admission. | `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/public.ts` |
| Answer-thread module | Streams answer turns, executes read tools, freezes evidence, and persists answer-thread/tool-call records. | `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/answer-thread.functions.ts` |
| Answer module | Owns answer synthesis, tool-use LLM integration, copy gates, grounded sources, and answer UI artifacts. | `src/modules/answer/public.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts` |
| Catalog/business modules | Own business claim, catalog publication, public catalog contracts, service capabilities, and visibility rules. | `src/modules/business/public.ts`, `src/modules/catalog/public.ts` |
| Convex transport | Creates public/authenticated Convex HTTP clients and typed function references by string name. | `src/lib/server/convex-source.ts` |
| Convex schema | Composes module-owned table definitions into the deployed Convex schema. | `convex/schema.ts` |
| Convex functions | Provide source-state queries/mutations for registry, catalog, inquiries, billing, protected actions, security, and observability. | `convex/registry.ts`, `convex/inquiries.ts`, `convex/catalog.ts` |
| Source-write admission | Signs request-scoped write admission on TanStack server functions and verifies it inside Convex mutations. | `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts` |

## Pattern Overview

**Overall:** Modular monolith with file-based TanStack routes, feature-module ports, explicit action registry, and Convex-backed source state.

**Key Characteristics:**
- Route files in `src/routes/` stay thin: they validate URL/request shape, call module server functions, and compose UI components.
- Feature modules under `src/modules/` expose a `public.ts` contract and keep implementation in `internal/`; routes and components should use public exports or `*.functions.ts` server seams.
- External assistant operations are defined once as actions in `src/modules/*/*.actions.ts` and registered in `src/modules/actions/index.ts`.
- Convex stores durable state while TypeScript module contracts in `src/modules/*/public.ts` and `src/modules/*/internal/schema.ts` define domain shapes and table schemas.
- Public catalog, answer, and inquiry paths preserve AE's trust boundary: read, compare, summarize, route, and send qualified inquiries only when published.

## Layers

**App Bootstrap:**
- Purpose: Start TanStack Start and install cross-cutting middleware.
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`
- Contains: Request middleware, router defaults, global HTML document, providers, root metadata.
- Depends on: `@tanstack/react-start`, `@tanstack/react-router`, Clerk, observability modules.
- Used by: All web, server function, and API route traffic.

**Route Layer:**
- Purpose: Bind URLs to loaders, server handlers, route metadata, and page components.
- Location: `src/routes/`
- Contains: Public pages, owner/admin pages, API endpoints, machine-readable resources.
- Depends on: `src/modules/*/*.functions.ts`, `src/modules/*/public.ts`, `src/components/ae/*`, `src/components/ui/*`.
- Used by: Browser navigation, fetch clients, assistants, webhooks, and tests.

**Action Layer:**
- Purpose: Declare operations once for UI/HTTP/agent JSON/agent-tools reuse.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Contains: `defineAction`, input/output Zod schemas, surfaces, read/write flags, boundaries, action runners.
- Depends on: Feature module server functions and public contracts.
- Used by: `src/routes/api.agent.tools.ts`, answer tool runner, future HTTP/agent surfaces.

**Feature Module Layer:**
- Purpose: Own business logic, source-state transformations, validators, readbacks, and module-specific server functions.
- Location: `src/modules/*/`
- Contains: `public.ts`, `*.functions.ts`, `*.actions.ts`, `*.schema.ts`, `internal/*.ts`.
- Depends on: Shared helpers in `src/modules/common`, server ports in `src/lib/server`, other modules only through public contracts.
- Used by: Routes, Convex function adapters, tests, and action declarations.

**Server/Source Port Layer:**
- Purpose: Bridge TanStack server functions/API handlers to Convex and provider adapters.
- Location: `src/lib/server/`, feature `*.functions.ts`
- Contains: Convex HTTP transport, source-write admission, provider seams, SSE response helper.
- Depends on: Convex client APIs, Clerk server auth, module contracts.
- Used by: Durable route loaders, mutations, API handlers, answer turn persistence.

**Convex Layer:**
- Purpose: Persist source state and expose durable queries/mutations/actions.
- Location: `convex/`
- Contains: Domain Convex functions, auth config, cron jobs, schema composition, runtime DB adapter helpers.
- Depends on: Convex generated APIs, module-owned table schemas and domain functions in `src/modules/*`.
- Used by: `src/lib/server/convex-source.ts` and Convex scheduled jobs.

**Presentation Layer:**
- Purpose: Render public, chat, inquiry, owner, admin, and primitive UI.
- Location: `src/components/`, `src/styles/`, `public/images/illustration/`
- Contains: AE-branded components, shadcn-style primitives, answer/chat components, CSS tokens and answer styles.
- Depends on: Route loader data and public module types.
- Used by: `src/routes/*.tsx`.

## Data Flow

### Primary Request Path

1. A browser request enters the TanStack Start instance and runs middleware for observability, CSRF, source-write admission, and Clerk (`src/start.ts:50`).
2. The router resolves a generated file route from `src/routeTree.gen.ts` through `getRouter()` (`src/router.tsx:5`).
3. Public registry requests validate search params and call `readRegistryRouteServer` (`src/routes/registry.tsx:38`, `src/routes/registry.tsx:62`).
4. The registry route delegates to `readPublicRegistryCatalogPage` or `readPublicRegistrySearchPage` (`src/routes/registry.tsx:77`).
5. `src/modules/registry/registry.functions.ts` selects the source port, optionally uses a search backend, and falls back to Convex in supported local/dev paths (`src/modules/registry/registry.functions.ts:79`, `src/modules/registry/registry.functions.ts:151`).
6. Convex reads published catalog data through indexed queries and returns public DTOs (`convex/registry.ts:194`, `convex/registry.ts:243`).
7. The route renders AE public components with the returned catalog page (`src/routes/registry.tsx:93`).

### Agent Tools Flow

1. `GET /api/agent/tools` lists assistant-callable actions from the central registry (`src/routes/api.agent.tools.ts:26`).
2. `POST /api/agent/tools` validates JSON body, finds the registered action, checks `agentTools` exposure, parses input, and runs the action (`src/routes/api.agent.tools.ts:36`).
3. Action definitions carry the boundaries and schemas that describe assistant-safe behavior (`src/modules/common/action.ts:73`, `src/modules/common/action.ts:113`).
4. `registry.search` and `registry.detail` call the same public registry read functions as human/API surfaces (`src/modules/registry/registry.actions.ts:170`, `src/modules/registry/registry.actions.ts:199`).
5. `inquiry.submit` calls the same source-admitted inquiry write path as the public form (`src/modules/inquiries/inquiry.actions.ts:171`, `src/modules/inquiries/inquiry.functions.ts:275`).

### Qualified Inquiry Flow

1. Public listing pages build a handoff affordance only from published catalog facts (`src/routes/$slug.tsx:77`).
2. `/$slug/inquiry` loads the public business page and converts it into route readback state (`src/routes/$slug.inquiry.tsx:43`).
3. Form submission uses the TanStack server function `submitPublicInquiryServer` (`src/routes/$slug.inquiry.tsx:65`, `src/modules/inquiries/inquiry.functions.ts:249`).
4. The server function creates operation/correlation keys, derives source-write admission from middleware context, and calls Convex (`src/modules/inquiries/inquiry.functions.ts:283`, `src/modules/inquiries/inquiry.functions.ts:727`).
5. Convex verifies source-write admission and runs `submitPublicInquiry` against source state (`convex/sourceWriteAdmission.ts:39`, `convex/inquiries.ts:599`).
6. The response returns a receipt and notification state; it does not book, charge, dispatch, or auto-fulfil (`src/modules/inquiries/inquiry.actions.ts:171`).

### Answer Turn Flow

1. `POST /api/answer/turn` resolves or creates a pseudonymous session, rate-limits the turn, checks thread access, and starts SSE (`src/routes/api.answer.turn.ts:22`).
2. `streamAnswerTurn` trims the query, emits thread/work-step events, classifies follow-up intent, and chooses a route (`src/modules/answer-thread/internal/turn-orchestrator.ts:108`, `src/modules/answer-thread/internal/turn-orchestrator.ts:189`).
3. Retrieval-first turns call `runAnswerToolCall` with `registry.search` before assembling a snapshot (`src/modules/answer-thread/internal/turn-orchestrator.ts:371`, `src/modules/answer-thread/internal/tool-runner.ts:52`).
4. The tool runner validates action input/output, executes only registered read-only actions, extracts public providers, and buffers evidence (`src/modules/answer-thread/internal/tool-runner.ts:60`, `src/modules/answer-thread/internal/tool-runner.ts:85`).
5. The tool-use LLM path exposes only `registry.search` and `registry.detail`, then gates prose against tool-derived allowed slugs (`src/modules/answer/internal/answer-tool-use-agent.ts:54`, `src/modules/answer/internal/answer-tool-use-agent.ts:255`).
6. Completed turns persist frozen evidence, prose, timings, work log, and tool calls to Convex through `answerThreads:*` functions (`src/modules/answer-thread/internal/turn-orchestrator.ts:1164`, `src/modules/answer-thread/answer-thread.functions.ts:71`).

**State Management:**
- Durable source state lives in Convex tables composed by `convex/schema.ts`.
- Browser route state comes from TanStack Router loaders and search params in `src/routes/*.tsx`.
- Session identity for answer threads uses an AE session cookie in `src/modules/answer-thread/internal/session-cookie.ts`.
- Module-level test ports exist for deterministic tests, for example `publicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts` and `testPort` in `src/modules/answer-thread/answer-thread.functions.ts`.
- Public write admission uses request-scoped context from `src/lib/server/source-write-admission.ts` and signed admission verification in `convex/sourceWriteAdmission.ts`.

## Key Abstractions

**Action:**
- Purpose: One operation declaration for UI, HTTP, agent JSON, and quiet agent-tools surfaces.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Pattern: `defineAction` plus Zod input/output schemas, `readOnly`, `surfaces`, `summary`, and `boundaries`.

**Public Module Contract:**
- Purpose: Stable exports and domain types for routes, Convex adapters, and tests.
- Examples: `src/modules/business/public.ts`, `src/modules/catalog/public.ts`, `src/modules/registry/public.ts`, `src/modules/answer/public.ts`
- Pattern: Public re-export of internal implementation plus domain value unions and result types.

**Server Function Seam:**
- Purpose: Keep TanStack server functions and HTTP handlers on one durable implementation.
- Examples: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/billing/billing.functions.ts`
- Pattern: `createServerFn().validator(...).handler(...)` delegates to `*ThroughSource` functions.

**Source Transport:**
- Purpose: Typed Convex function-reference factory and public/authenticated Convex HTTP client creation.
- Examples: `src/lib/server/convex-source.ts`, `src/modules/answer-thread/answer-thread.functions.ts`
- Pattern: `sourceQuery`, `sourceMutation`, `callPublicSourceQuery`, `callSourceMutation`.

**SourceWriteAdmission:**
- Purpose: Request-bound admission token for writes from public/browser/agent surfaces.
- Examples: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Pattern: Middleware captures request method/origin/path, server functions sign operation/correlation keys, Convex verifies scope and signature.

**Runtime Source State Adapter:**
- Purpose: Let Convex adapters call source-state domain functions while keeping TypeScript contracts shared with tests.
- Examples: `convex/source_state.ts`, `convex/catalog.ts`, `convex/inquiries.ts`
- Pattern: `runtimeDb`, `runtimeReader`, `loadPhaseOneSourceState`, and `persistPhaseOneSourceState` adapt Convex DB rows to module state.

**Public Catalog:**
- Purpose: Canonical public listing shape for human pages, APIs, answer tools, and agent JSON.
- Examples: `src/modules/catalog/public.ts`, `src/modules/registry/public.ts`, `convex/registry.ts`
- Pattern: `PublicCatalogContract` is projected to public API DTOs and filtered to published/discoverable records only.

**Answer Tool Evidence:**
- Purpose: Make answer results auditable and grounded in registry actions.
- Examples: `src/modules/answer-thread/internal/tool-runner.ts`, `src/modules/answer/internal/catalog-grounding.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Pattern: Every tool call stores input JSON, result summary JSON, result hash, status, timings, and allowed provider slugs.

## Entry Points

**Web App:**
- Location: `src/start.ts`
- Triggers: Vite/TanStack Start runtime.
- Responsibilities: Request middleware and app lifecycle.

**Router Factory:**
- Location: `src/router.tsx`
- Triggers: TanStack Start client/server router creation.
- Responsibilities: Uses generated route tree, defaults to intent preload, not-found component, scroll restoration.

**Root Document:**
- Location: `src/routes/__root.tsx`
- Triggers: Every route render.
- Responsibilities: Head metadata, global CSS, Clerk provider gating, observability boot, error boundary, toaster.

**Public Registry:**
- Location: `src/routes/registry.tsx`
- Triggers: `GET /registry`.
- Responsibilities: Search param validation, catalog search/list loader, public result rendering.

**Business Detail:**
- Location: `src/routes/$slug.tsx`
- Triggers: `GET /:slug`.
- Responsibilities: Public business page readback, SEO metadata, inquiry affordance, agent JSON URL.

**Public Inquiry:**
- Location: `src/routes/$slug.inquiry.tsx`
- Triggers: `GET /:slug/inquiry`, public form submission.
- Responsibilities: Handoff readback, form validation, `submitPublicInquiryServer` call.

**Public Catalog API:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`
- Triggers: `GET /api/businesses`, `GET /api/businesses/search`, `GET /api/businesses/$slug`.
- Responsibilities: Durable public JSON catalog list/search/detail responses.

**Quiet Agent Tools API:**
- Location: `src/routes/api.agent.tools.ts`
- Triggers: `GET /api/agent/tools`, `POST /api/agent/tools`.
- Responsibilities: List assistant-safe tools and invoke exposed actions.

**Answer Turn API:**
- Location: `src/routes/api.answer.turn.ts`
- Triggers: `POST /api/answer/turn`.
- Responsibilities: Session, rate limit, thread access, SSE streaming, turn orchestration.

**Convex API Surface:**
- Location: `convex/*.ts`
- Triggers: Convex client calls from `src/lib/server/convex-source.ts` and scheduled jobs.
- Responsibilities: Queries/mutations over durable source state.

**Scheduled Jobs:**
- Location: `convex/crons.ts`
- Triggers: Convex cron intervals.
- Responsibilities: Cleanup expired security and inquiry abuse buckets.

## Architectural Constraints

- **Threading:** TanStack handlers and server functions use the JavaScript request event loop. Convex queries/mutations are async functions; mutations are transactional and should keep work bounded.
- **Global state:** Test seams and process caches are module-level by design in `src/modules/registry/registry.functions.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, and `src/modules/answer/internal/openrouter-models.ts`.
- **Circular imports:** No circular chain was directly detected during mapping. Preserve the `public.ts`/`internal/` boundary to keep cycles from forming between feature modules.
- **Generated files:** Do not edit `src/routeTree.gen.ts` or `convex/_generated/*`; TanStack Router and Convex codegen own those files.
- **Convex rules:** Read `convex/_generated/ai/guidelines.md` before changing Convex code. All Convex functions need argument validators, explicit table/index use, and bounded query patterns.
- **Trust boundary:** AE must not imply booking, payment, dispatch, autonomous fulfillment, live availability, or unearned "verified" status. This applies to `src/modules/*/*.actions.ts`, answer copy, route copy, APIs, and agent payloads.
- **Human copy vocabulary:** Public human surfaces must avoid internal architecture words listed in `AGENTS.md`; machine payloads can carry internal fields where intended.

## Anti-Patterns

### Bypassing the Action Registry

**What happens:** A new operation is wired directly into one surface but not registered centrally.
**Why it's wrong:** UI, HTTP, agent JSON, and agent-tools can diverge, and action boundaries may be missing.
**Do this instead:** Define the action in `src/modules/<module>/<module>.actions.ts` with `summary` and `boundaries`, then import it in `src/modules/actions/index.ts`.

### Importing Feature Internals From Routes

**What happens:** A route or component imports `src/modules/<module>/internal/*` directly.
**Why it's wrong:** Internal implementation can change without preserving route contracts, and cross-module cycles become easier to introduce.
**Do this instead:** Import from `src/modules/<module>/public.ts` or module server seams such as `src/modules/inquiries/inquiry.functions.ts`.

### Direct Convex Calls From UI Components

**What happens:** UI components create Convex clients or call Convex generated APIs directly.
**Why it's wrong:** It bypasses server auth/admission, local-E2E fallback seams, and public DTO filtering.
**Do this instead:** Route through `*.functions.ts` server functions or source ports such as `src/lib/server/convex-source.ts`.

### Public Writes Without Source-Write Admission

**What happens:** A public write calls a Convex mutation without `SourceWriteAdmission`.
**Why it's wrong:** Public writes lose request-bound origin/scope/correlation verification.
**Do this instead:** Derive admission in `src/lib/server/source-write-admission.ts`, pass it through a module `*ThroughSource` function, and verify with `convex/sourceWriteAdmission.ts`.

### Unbounded Convex Reads

**What happens:** New Convex queries scan or collect rows without indexes or limits.
**Why it's wrong:** Convex query cost grows with table size and can break public request paths.
**Do this instead:** Define indexes in module schemas under `src/modules/*/internal/*schema*.ts` and use `withIndex`, `take`, or pagination following `convex/_generated/ai/guidelines.md`.

## Error Handling

**Strategy:** Return explicit discriminated results for domain/user-facing failures, use HTTP status codes at route boundaries, and keep thrown errors for unavailable infrastructure or unexpected failures.

**Patterns:**
- API handlers return JSON error bodies with status codes, for example `jsonError` in `src/routes/api.agent.tools.ts` and `src/routes/api.answer.turn.ts`.
- Domain/server functions return `{ kind: 'ok' | 'error', code, retryable, reason }` style results, for example `src/modules/inquiries/inquiry.functions.ts`.
- Convex/auth/source failures are normalized by `ConvexSourceError` in `src/lib/server/convex-source.ts` and `SourceWriteAdmissionError` in `src/lib/server/source-write-admission.ts`.
- Tool calls record `refused` and `error` statuses instead of exposing thrown failures to the model in `src/modules/answer-thread/internal/tool-runner.ts`.
- Route-level not-found behavior is centralized through `AeNotFound` in `src/router.tsx` and explicit not-found JSON in `src/routes/api.businesses.$slug.ts`.

## Cross-Cutting Concerns

**Logging:** Observability is request-scoped in `src/start.ts` through Sentry isolation and PostHog flush. Domain audit/funnel events live in `src/modules/observability/*` and Convex `convex/observability.ts`.
**Validation:** Routes use `validateSearch`, Zod validators, and Convex validators. Action input/output is validated by `src/modules/common/action.ts`, route inputs by `createServerFn().validator`, and Convex inputs/returns by `v.*` validators.
**Authentication:** Clerk wraps owner/admin/sign-in routes in `src/routes/__root.tsx` and request middleware in `src/start.ts`. Convex auth is configured in `convex/auth.config.ts`, and owner/admin authority resolves in `convex/authz.ts`.
**Authorization:** Owner/admin operations call module authority helpers and Convex auth resolution, for example `resolveBusinessActor` and `resolveAdminAuthority` in `convex/authz.ts`.
**Security:** CSRF middleware runs for server functions in `src/start.ts`; source-write admission signs public writes in `src/lib/server/source-write-admission.ts`; rate limits and suppression live in `src/modules/security/public.ts` and Convex security/inquiry cleanup jobs.
**Machine readability:** `/llms.txt`, `/api/businesses*`, `/api/agent/tools`, and agent JSON URLs expose assistant-readable public facts while keeping internal architecture vocabulary off human surfaces.

---

*Architecture analysis: 2026-07-02*
