<!-- refreshed: 2026-07-04 -->
# Architecture

**Analysis Date:** 2026-07-04

## System Overview

```text
+------------------------------------------------------------------+
| TanStack Start app and file routes                               |
| `src/routes/__root.tsx`, `src/router.tsx`, `src/start.ts`         |
+----------------------+----------------------+--------------------+
| Public surfaces      | Owner/admin surfaces | API/tool surfaces  |
| `src/routes/index.tsx` | `src/routes/owner.*` | `src/routes/api.*` |
| `src/routes/registry.tsx` | `src/routes/admin.*` | `src/routes/api.agent.tools.ts` |
| `src/routes/$slug.tsx` | `src/components/ae/layout/AeOperatorShell.tsx` | |
+----------+-----------+----------+-----------+---------+----------+
           |                      |                     |
           v                      v                     v
+------------------------------------------------------------------+
| Route/server function bridge                                     |
| `src/modules/*/*.functions.ts`, `src/modules/*/*.actions.ts`      |
| `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts` |
+----------------------+----------------------+--------------------+
           |                      |                     |
           v                      v                     v
+------------------------------------------------------------------+
| Domain modules and action contracts                              |
| `src/modules/*/public.ts`, `src/modules/*/internal/*`             |
| `src/modules/actions/index.ts`, `src/modules/common/action.ts`    |
+----------------------+----------------------+--------------------+
           |                      |                     |
           v                      v                     v
+------------------------------------------------------------------+
| Convex persistence, auth, operational state, and projections      |
| `convex/schema.ts`, `convex/*.ts`, `src/modules/*/internal/schema.ts` |
+------------------------------------------------------------------+
           |
           v
+------------------------------------------------------------------+
| External edges                                                   |
| Clerk auth, Convex deployment, OpenRouter, Sentry/PostHog,        |
| notification and billing providers                               |
| `src/lib/observability/*`, `src/lib/server/*`, `convex/auth.config.ts` |
+------------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root route shell | Wires global head tags, Astryx theme providers, Clerk wrapper for auth-gated routes, observability boot, error boundary, and toaster. | `src/routes/__root.tsx` |
| Router factory | Creates the TanStack Router from generated routes and default not-found behavior. | `src/router.tsx` |
| Start middleware | Adds observability, security headers, CSRF, source-write admission, and Clerk middleware to server functions. | `src/start.ts` |
| Public shell | Owns public navigation, footer, correction widget, and funnel attribution boot for public pages. | `src/components/ae/layout/AePublicShell.tsx` |
| Operator shell | Owns owner/admin shell, sidebar/section nav, breadcrumbs, and density context. | `src/components/ae/layout/AeOperatorShell.tsx` |
| Action registry | Registers public machine-operation contracts and filters agent-tool actions. | `src/modules/actions/index.ts` |
| Action contract type | Defines `defineAction`, action surfaces, input/output schemas, summaries, boundaries, and agent descriptors. | `src/modules/common/action.ts` |
| Registry actions | Exposes `registry.list`, `registry.search`, and `registry.detail` as bounded read actions over published catalog facts. | `src/modules/registry/registry.actions.ts` |
| Inquiry action | Exposes `inquiry.submit` as the only assistant-facing write; it records a qualified inquiry for owner review only. | `src/modules/inquiries/inquiry.actions.ts` |
| Quiet agent door | Lists and invokes assistant-callable tools with signature checks and harness policy enforcement. | `src/routes/api.agent.tools.ts` |
| Registry source bridge | Reads public catalog pages/details/search through Convex or local E2E fixture ports. | `src/modules/registry/registry.functions.ts` |
| Inquiry source bridge | Converts route/action inputs into Convex mutations and local E2E fallbacks for public and owner inquiry flows. | `src/modules/inquiries/inquiry.functions.ts` |
| Answer turn orchestrator | Streams answer turns, runs the tool-use loop, gates output, and persists thread/tool-call evidence. | `src/modules/answer-thread/internal/turn-orchestrator.ts` |
| Answer tool-use agent | Calls OpenRouter with `registry.search` and `registry.detail` tools, then gates prose against catalog-derived slugs. | `src/modules/answer/internal/answer-tool-use-agent.ts` |
| Harness tool runner | Converts actions into strict tool definitions and enforces read/write approval policy before execution. | `src/modules/harness/action-tool.ts` |
| Convex source bridge | Builds public/authenticated Convex HTTP clients and typed function references used by route modules. | `src/lib/server/convex-source.ts` |
| Convex schema composer | Combines module-owned Convex table schemas into the backend schema. | `convex/schema.ts` |
| Convex runtime adapters | Validate args/auth and call shared module logic or direct table adapters for persistence. | `convex/registry.ts`, `convex/inquiries.ts`, `convex/business.ts` |

## Pattern Overview

**Overall:** Modular monolith with TanStack Start routes, explicit action contracts, shared pure domain modules, and Convex persistence adapters.

**Key Characteristics:**
- Routes stay close to surface concerns in `src/routes/*`, while business rules and readbacks live under `src/modules/*`.
- Each major domain exposes a `public.ts` seam, hides implementation in `internal/`, and uses `*.functions.ts` for TanStack server functions and Convex source calls.
- Agent-readable operations are declared once as actions in `src/modules/*/*.actions.ts` and registered centrally in `src/modules/actions/index.ts`.
- Convex schemas are owned by modules under `src/modules/*/internal/schema.ts` or `src/modules/*/internal/convex-schema.ts` and composed in `convex/schema.ts`.
- AE product boundaries are architectural constraints: public and assistant paths may read, compare, summarize, route, and submit qualified inquiries; they do not book, charge, dispatch, or auto-fulfil.

## Layers

**Application Shell:**
- Purpose: Provide root document, providers, routing, global CSS, observability boot, and route-level middleware.
- Location: `src/routes/__root.tsx`, `src/router.tsx`, `src/start.ts`, `src/styles/globals.css`
- Contains: TanStack Router root route, router factory, Start middleware, global Astryx/Tailwind CSS entry.
- Depends on: `@tanstack/react-router`, `@tanstack/react-start`, `@clerk/tanstack-react-start`, `@astryxdesign/core`, `src/lib/http/security-headers.ts`, `src/lib/server/source-write-admission.ts`
- Used by: All pages and API routes generated into `src/routeTree.gen.ts`.

**Route Surfaces:**
- Purpose: Define file-based public, owner, admin, API, SEO, and assistant endpoints.
- Location: `src/routes/`
- Contains: `createFileRoute(...)` route definitions, loaders, search validation, API handlers, and page components.
- Depends on: `src/components/ae/*`, `src/components/astryx/*`, `src/modules/*/*.functions.ts`, `src/modules/*/public.ts`, `src/modules/*/*.actions.ts`
- Used by: TanStack Router through generated `src/routeTree.gen.ts`.

**UI Components:**
- Purpose: Render public, owner, admin, chat, listing, inquiry, feedback, and operator UI.
- Location: `src/components/`
- Contains: Astryx adapter `src/components/astryx/RouterLink.tsx`, active AE components under `src/components/ae/*`, chat elements under `src/components/ai-elements/*`, and legacy UI wrappers under `src/components/ui/*`.
- Depends on: Astryx components, Lucide icons, Tailwind utility classes, module readbacks.
- Used by: Route components in `src/routes/*`.

**Module Public Seams:**
- Purpose: Export domain types, pure commands, readback builders, and stable module APIs.
- Location: `src/modules/*/public.ts`
- Contains: Re-exports from `internal/`, public contract types, domain values, route readback helpers.
- Depends on: `src/modules/*/internal/*`, `src/modules/common/*`
- Used by: Routes, Convex adapters, tests, and other modules.

**Action Contracts:**
- Purpose: Define machine-operation contracts once and fan them out to HTTP, agent JSON, agent tools, and UI surfaces.
- Location: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Contains: `defineAction` declarations with Zod schemas, parameters, read-only flags, boundaries, and output schemas.
- Depends on: Module source bridges such as `src/modules/registry/registry.functions.ts` and `src/modules/inquiries/inquiry.functions.ts`.
- Used by: `src/routes/api.agent.tools.ts`, `src/routes/api.businesses*.ts`, answer tool-use code in `src/modules/answer-thread/internal/tool-runner.ts`, and harness tooling in `src/modules/harness/action-tool.ts`.

**Source Bridges:**
- Purpose: Translate route/server/action calls into Convex queries/mutations with local E2E fallbacks and source-write admission where required.
- Location: `src/modules/*/*.functions.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`
- Contains: `createServerFn` exports, `sourceQuery`, `sourceMutation`, Convex HTTP client creation, source-write signatures, local fixture ports.
- Depends on: `convex/*` function names, Clerk auth, `CONVEX_URL`/`VITE_CONVEX_URL`, source-write secret names.
- Used by: Route loaders/actions, public API handlers, action runners, and owner/admin routes.

**Domain Internals:**
- Purpose: Own deterministic business rules, schemas, readbacks, validation, projections, and operational state transitions.
- Location: `src/modules/*/internal/`
- Contains: Pure command handlers such as `src/modules/inquiries/internal/commands.ts`, schema/table definitions such as `src/modules/registry/internal/schema.ts`, and projection/search helpers such as `src/modules/registry/internal/search.ts`.
- Depends on: `src/modules/common/*` and other module public seams.
- Used by: `public.ts` seams and Convex adapters.

**Convex Backend:**
- Purpose: Persist and query source state, apply auth/authorization, expose Convex query/mutation/action functions, and run scheduled jobs.
- Location: `convex/`
- Contains: `convex/schema.ts`, runtime modules such as `convex/registry.ts`, `convex/inquiries.ts`, `convex/catalog.ts`, auth in `convex/auth.config.ts`, source-state adapters in `convex/source_state.ts`, and crons in `convex/crons.ts`.
- Depends on: Module public seams and module-owned schema tables under `src/modules/*/internal/*`.
- Used by: `src/lib/server/convex-source.ts` through Convex HTTP function references.

**Operational/Evaluation Tooling:**
- Purpose: Validate imports, copy, UI contract, SEO, E2E flows, agent answer quality, and graph freshness.
- Location: `tests/`, `eval/answer/`, `tools/`, `workflows/`
- Contains: Vitest suites, Playwright suites, promptfoo answer evals, graph tooling, workflow docs.
- Depends on: Source modules, route handlers, fixtures, and package scripts in `package.json`.
- Used by: Development and release commands such as `npm run test:release`.

## Data Flow

### Primary Request Path

1. A browser route or API endpoint enters TanStack Router via `createFileRoute` in `src/routes/registry.tsx:59`, `src/routes/$slug.tsx:18`, `src/routes/api.businesses.search.ts:11`, or another file under `src/routes/`.
2. Root providers and middleware are applied by `src/routes/__root.tsx:17` and `src/start.ts:61`.
3. Route loaders or API handlers call module functions or actions, for example `src/routes/registry.tsx:59`, `src/routes/api.businesses.search.ts:11`, and `src/routes/api.businesses.$slug.ts:7`.
4. Actions validate input through Zod and call the shared source bridge, for example `src/modules/registry/registry.actions.ts:230` and `src/modules/inquiries/inquiry.actions.ts:112`.
5. Source bridges call Convex public queries/mutations through typed function references in `src/lib/server/convex-source.ts`, with local E2E fallbacks in `src/modules/registry/registry.functions.ts:82` and `src/modules/inquiries/inquiry.functions.ts:298`.
6. Convex functions validate args/auth and read or mutate tables, for example `convex/registry.ts:206` and `convex/inquiries.ts:612`.
7. Module-owned table schemas are composed by `convex/schema.ts:18` from files such as `src/modules/business/internal/schema.ts:13`, `src/modules/catalog/internal/schema.ts:13`, `src/modules/registry/internal/schema.ts:39`, and `src/modules/inquiries/internal/convex-schema.ts:16`.
8. Route handlers return HTML, JSON, or SSE using route-local response helpers such as `src/routes/api.businesses.ts:25` and `src/routes/api.answer.turn.ts:14`.

### Public Registry Flow

1. `/registry` validates search params and calls `readRegistryRouteServer` in `src/routes/registry.tsx:43`.
2. `loadRegistryRouteReadback` chooses list vs search in `src/routes/registry.tsx:75`.
3. `readPublicRegistrySearchPage` selects Convex, Meili, dual, or fallback search in `src/modules/registry/registry.functions.ts:82`.
4. Convex search reads public business catalogs through indexed runtime readers in `convex/registry.ts:224`.
5. The page renders published, filtered catalog DTOs in `src/routes/registry.tsx:96` and cards in `src/routes/registry.tsx:262`.

### Public Listing and Inquiry Flow

1. `/ $slug` loads a business page through `readPublicBusinessPageServer` in `src/routes/$slug.tsx:18`.
2. Listing UI builds the inquiry affordance through `src/modules/inquiries/route-readbacks.ts` and renders `src/components/ae/listing/AeProviderListingPage.tsx`.
3. `/ $slug/inquiry` validates the listing and target in `src/routes/$slug.inquiry.tsx:51`.
4. The form submits to `submitPublicInquiryServer` defined in `src/modules/inquiries/inquiry.functions.ts:272`.
5. `submitPublicInquiryThroughSource` resolves slug targets, signs source-write admission, and calls `inquiries:submitPublicInquiry` in `src/modules/inquiries/inquiry.functions.ts:298`.
6. Convex persists the thread/message/notification path in `convex/inquiries.ts:612`.
7. The response returns a receipt and delivery state; AE does not confirm timing, quote, availability, booking, payment, dispatch, or fulfillment.

### Quiet Agent Tool Flow

1. `GET /api/agent/tools` is served by `src/routes/api.agent.tools.ts:30` and lists filtered action-derived tool descriptors.
2. `POST /api/agent/tools` parses `{ tool, input }`, verifies agent identity, and blocks unsigned write attempts in `src/routes/api.agent.tools.ts:43`.
3. The route converts action contracts into harness tool definitions through `src/modules/harness/action-tool.ts:42`.
4. `runHarnessTool` validates input/output schemas and applies read/write policy in `src/modules/harness/action-tool.ts:57`.
5. Current `agentTools` action descriptors include `registry.search`, `registry.detail`, and `inquiry.submit` from `src/modules/actions/index.ts:22`; `src/routes/api.agent.tools.ts` runs the harness in public-read mode, so read tools run automatically and write tools remain blocked unless the endpoint supplies a qualified-write approval mode.

### Answer Chat / Tool-Use Flow

1. `/api/answer/turn` validates the request, resolves the session, rate-limits, and opens SSE in `src/routes/api.answer.turn.ts:14`.
2. `streamAnswerTurn` runs the harness loop and emits thread/work/plan/complete events in `src/modules/answer-thread/internal/turn-orchestrator.ts:107`.
3. Tool-led retrieval calls `runAnswerToolUseAgent`, which gives the model only read tools and assembles providers from tool outputs in `src/modules/answer/internal/answer-tool-use-agent.ts:78`.
4. Each tool call is executed through `runAnswerToolCall`, which refuses unknown or non-read tools and records stable evidence in `src/modules/answer-thread/internal/tool-runner.ts:49`.
5. Final output is gated against catalog-derived allowed slugs and persisted via answer-thread functions in `src/modules/answer-thread/answer-thread.functions.ts`.

**State Management:**
- Server state is primarily Convex-backed and exposed through source bridge functions in `src/lib/server/convex-source.ts`.
- Local E2E and tests use in-memory ports and fallback source states in files such as `src/modules/registry/registry.functions.ts` and `src/modules/answer-thread/answer-thread.functions.ts`.
- Client UI state stays route-local for forms, filters, and chat interaction, for example `src/routes/registry.tsx`, `src/routes/$slug.inquiry.tsx`, and `src/components/ae/chat/*`.

## Key Abstractions

**Action:**
- Purpose: Single source of truth for safe machine operations.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Pattern: Zod schema + typed parameters + boundary summary + surface list + async runner.

**Public Module Seam:**
- Purpose: Keep routes and Convex adapters from importing module internals directly.
- Examples: `src/modules/catalog/public.ts`, `src/modules/business/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/registry/public.ts`
- Pattern: Re-export domain contracts and curated functions from `internal/`.

**Source Port / Source Bridge:**
- Purpose: Make route/server code independent of direct Convex client mechanics and provide local fixture fallbacks.
- Examples: `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/lib/server/convex-source.ts`
- Pattern: `sourceQuery`/`sourceMutation` references plus `callPublicSourceQuery`, `callSourceMutation`, and test/local port overrides.

**Source Write Admission:**
- Purpose: Gate browser/server writes with signed request context before Convex accepts them.
- Examples: `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `src/modules/security/source-write-admission.ts`
- Pattern: TanStack middleware injects request context; server functions sign `source-write:v1`; Convex verifies scope, operation key, and correlation ID.

**Public Catalog:**
- Purpose: Published business/service DTO used by people, APIs, and assistants.
- Examples: `src/modules/catalog/internal/catalog-model.ts`, `src/modules/registry/internal/search.ts`, `src/modules/registry/public.ts`
- Pattern: Business + context + services + capabilities collapse into a boundary-honest public catalog with no raw contact leakage.

**Harness Tool:**
- Purpose: Convert actions into strict tools for agent and answer-runtime execution.
- Examples: `src/modules/harness/action-tool.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/answer-thread/internal/tool-runner.ts`
- Pattern: action descriptor -> strict schema validation -> approval policy -> stable result hash -> evidence record.

**Convex Runtime State Adapter:**
- Purpose: Bridge module pure state models with Convex tables.
- Examples: `convex/source_state.ts`, `convex/registry.ts`, `convex/inquiries.ts`
- Pattern: Load table rows into source-state records, run shared module logic, and persist updates through indexed upsert specs.

## Entry Points

**App root:**
- Location: `src/routes/__root.tsx`
- Triggers: Every TanStack route render.
- Responsibilities: HTML document, global CSS, Astryx theme, link/layer providers, Clerk provider gating, observability boot, error boundary.

**Router factory:**
- Location: `src/router.tsx`
- Triggers: TanStack Start runtime.
- Responsibilities: Build router from `src/routeTree.gen.ts`, set default preload, not-found behavior, and scroll restoration.

**Server middleware:**
- Location: `src/start.ts`
- Triggers: TanStack Start server runtime.
- Responsibilities: Request middleware for observability, security headers, CSRF, source-write admission, and Clerk.

**Public routes:**
- Location: `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`
- Triggers: Browser navigation.
- Responsibilities: Home chat/search entry, registry browsing, listing detail, and qualified inquiry form.

**Owner/admin routes:**
- Location: `src/routes/owner.*.tsx`, `src/routes/admin.*.tsx`
- Triggers: Browser navigation behind Clerk provider.
- Responsibilities: Owner inbox/status/billing/action views and admin reconstruction/audit/readback surfaces.

**Public APIs:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/llms[.]txt.ts`
- Triggers: HTTP GET requests.
- Responsibilities: Return public catalog JSON and assistant-readable discovery text.

**Quiet agent tools API:**
- Location: `src/routes/api.agent.tools.ts`
- Triggers: HTTP GET/POST requests.
- Responsibilities: List assistant tools and invoke action-backed tools under identity and harness policy.

**Answer SSE API:**
- Location: `src/routes/api.answer.turn.ts`
- Triggers: HTTP POST with JSON answer turn input.
- Responsibilities: Rate-limit, authorize thread access, stream answer events, and persist answer/tool evidence.

**Convex backend:**
- Location: `convex/schema.ts`, `convex/*.ts`
- Triggers: Convex HTTP client function calls, scheduled jobs, webhooks, and admin operations.
- Responsibilities: Persistent source state, auth/authorization, indexed reads, transactional mutations, and cron cleanup.

## Architectural Constraints

- **Threading:** JavaScript/TypeScript runs on the normal event loop in TanStack Start and Convex. Long answer turns stream through SSE in `src/routes/api.answer.turn.ts`, while Convex mutations/queries remain transactional in `convex/*.ts`.
- **Global state:** Test/local override state exists in `src/modules/registry/registry.functions.ts` (`catalogSearchPortForTests`, `catalogSearchBackendForTests`) and `src/modules/answer-thread/answer-thread.functions.ts` (`testPort`, `localE2ePort`, `missingConvexFunctions`). Use reset helpers where present in tests.
- **Circular imports:** No circular dependency chain was identified in sampled route/module/Convex imports. Preserve the intended direction: `src/routes/*` -> `src/modules/*/public.ts` or `*.functions.ts`; `public.ts` -> `internal/*`; `convex/*` -> module public seams and schema files.
- **Convex rules:** Read `convex/_generated/ai/guidelines.md` before editing Convex code. Convex functions need validators, sensitive functions should use internal registrations, and auth-derived identity should come from `ctx.auth.getUserIdentity()` in `convex/authz.ts`.
- **UI system:** `DESIGN.md` is authoritative. New UI should use Astryx primitives and Tailwind layout glue through `src/routes/__root.tsx`, `src/components/astryx/RouterLink.tsx`, and `src/styles/globals.css`.
- **Product boundary:** `PRODUCT.md`, `AGENTS.md`, and `.agents/skills/submit-qualified-inquiry/SKILL.md` define the safe contract. Keep public and assistant copy honest: AE publishes, reads, compares, summarizes, routes, and sends qualified inquiries; it does not book, charge, dispatch, or auto-fulfil.
- **Generated files:** Do not edit `src/routeTree.gen.ts` or `convex/_generated/*` by hand. Regenerate through TanStack Router or Convex tooling.
- **Secrets:** `.env` and `.env.local` exist at the repo root; never read or quote their contents. Use `.env.example` only for names and documentation.

## Anti-Patterns

### Extending Legacy Presentation Components

**What happens:** Routes and surfaces still import many bespoke `Ae*` presentation components from `src/components/ae/*`, and legacy wrappers exist under `src/components/ui/*`.
**Why it's wrong:** `DESIGN.md` marks the old Daylight/Register identity and parallel component systems as retired; adding to them expands migration debt and can diverge from the Astryx-era system.
**Do this instead:** Use Astryx components through `@astryxdesign/core` and only keep AE components for behavior/state that has not been re-skinned yet; route shell patterns live in `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, and `src/components/astryx/RouterLink.tsx`.

### Importing Module Internals From Routes

**What happens:** Internal folders such as `src/modules/registry/internal/*`, `src/modules/inquiries/internal/*`, and `src/modules/catalog/internal/*` contain domain implementation details.
**Why it's wrong:** Routes that import internals bypass module seams, make tests harder to isolate, and can couple UI/API surfaces to storage details.
**Do this instead:** Routes should import `src/modules/*/public.ts`, `src/modules/*/*.functions.ts`, or `src/modules/*/*.actions.ts`; Convex adapters can import module public seams and schema files as shown in `convex/schema.ts`.

### Bypassing Action Registration For Assistant Operations

**What happens:** Adding an API-only or route-local assistant operation would skip the central action registry.
**Why it's wrong:** The quiet agent door, answer tool-use loop, agent JSON payloads, and HTTP surfaces depend on one boundary-honest contract per operation.
**Do this instead:** Add `<module>/<module>.actions.ts`, export a `defineAction` result, register it in `src/modules/actions/index.ts`, and provide explicit `summary`, `boundaries`, `schema`, `outputSchema`, `readOnly`, and `surfaces`.

## Error Handling

**Strategy:** Domain functions return discriminated result objects for expected failures, while route/server adapters translate parse, auth, admission, source, and policy failures into HTTP responses or UI readbacks.

**Patterns:**
- Use `kind: 'ok' | 'error' | ...` result unions in module logic such as `src/modules/inquiries/internal/commands.ts` and `src/modules/catalog/internal/publish.ts`.
- Parse external input through Zod before running actions or server functions in `src/modules/common/action.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/routes/api.agent.tools.ts`.
- Convert source failures into stable public errors in bridge files such as `src/modules/inquiries/inquiry.functions.ts`.
- Return JSON API errors through helpers such as `jsonResponse` in `src/routes/api.businesses.ts` and `jsonError` in `src/routes/api.agent.tools.ts`.
- Refuse unsafe or non-read agent tool calls in `src/modules/answer-thread/internal/tool-runner.ts` and harness policy in `src/modules/harness/action-tool.ts`.

## Cross-Cutting Concerns

**Logging:** Observability middleware in `src/start.ts` initializes Sentry/PostHog server modules from `src/lib/observability/*`; client boot lives in `src/components/ae/layout/AeObservabilityBoot.tsx`.
**Validation:** Zod validates route/server/action input in `src/modules/common/action.ts`, `src/modules/inquiries/inquiry.functions.ts`, and multiple `src/routes/*`; Convex validators live in `convex/*.ts`.
**Authentication:** Clerk is mounted for `/sign-in`, `/sign-up`, `/owner`, and `/admin` in `src/routes/__root.tsx`; Convex JWT auth config lives in `convex/auth.config.ts`; authority resolution lives in `convex/authz.ts`.
**Authorization:** Owner/admin authority and source-write admission are enforced by `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `convex/authz.ts`, and module security functions in `src/modules/security/public.ts`.
**Security Headers:** HTTP security headers are applied by middleware in `src/start.ts` using `src/lib/http/security-headers.ts`.
**Design System:** Astryx providers are global in `src/routes/__root.tsx`; CSS cascade is owned by `src/styles/globals.css`; `DESIGN.md` forbids new bespoke CSS systems.
**SEO/Discovery:** Public SEO helpers live in `src/modules/seo/*`; assistant discovery text and sitemap/robots routes live in `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, and `src/routes/robots[.]txt.ts`.

---

*Architecture analysis: 2026-07-04*
