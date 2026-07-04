<!-- refreshed: 2026-07-04 -->
# Architecture

**Analysis Date:** 2026-07-04

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                     TanStack Start Surface Layer                           │
│  `src/routes`, `src/router.tsx`, `src/start.ts`, `src/routes/__root.tsx`   │
├───────────────────────┬───────────────────────┬───────────────────────────┤
│ Public human surfaces │ HTTP / JSON surfaces   │ Owner / admin surfaces     │
│ `src/routes/registry` │ `src/routes/api.*.ts`  │ `src/routes/owner*.tsx`    │
│ `src/routes/$slug*`   │ `src/routes/llms[.]txt`│ `src/routes/admin*.tsx`    │
└───────────┬───────────┴───────────┬───────────┴──────────────┬────────────┘
            │                       │                          │
            ▼                       ▼                          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                  Action Contracts and Route Adapters                       │
│  `src/modules/actions/index.ts`, `src/modules/common/action.ts`,           │
│  `src/modules/*/*.actions.ts`, `src/modules/*/*.functions.ts`              │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Domain Module Layer                                │
│  `src/modules/*/public.ts`, `src/modules/*/internal/*`, route readbacks,   │
│  source ports, DTOs, schemas, answer gates, discovery builders             │
└──────────────┬─────────────────────┬─────────────────────┬───────────────┘
               │                     │                     │
               ▼                     ▼                     ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ Convex Source Runtime │ │ Assistant Answer Loop  │ │ Astryx UI Composition │
│ `src/lib/server/`     │ │ `src/modules/answer*`  │ │ `src/components/*`    │
│ `convex/*.ts`         │ │ `src/modules/harness`  │ │ `src/styles/*`        │
└───────────┬───────────┘ └───────────┬───────────┘ └───────────────────────┘
            │                         │
            ▼                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Durable Source of Truth                            │
│  Convex tables and functions: `convex/schema.ts`, `convex/registry.ts`,    │
│  `convex/catalog.ts`, `convex/inquiries.ts`, `convex/discovery.ts`         │
└───────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Start middleware | Registers observability, security headers, CSRF, source-write admission, and Clerk middleware. | `src/start.ts` |
| Root route | Provides Astryx `Theme`, `LinkProvider`, `LayerProvider`, conditional Clerk provider, head metadata, and global error handling. | `src/routes/__root.tsx` |
| Router | Creates the TanStack router from the generated route tree and default not-found behavior. | `src/router.tsx` |
| Route modules | Adapt URL routes to loaders, server functions, API handlers, and UI composition. | `src/routes` |
| Action registry | Keeps operation contracts explicit and shared by UI, HTTP, agent JSON, and quiet agent tools. | `src/modules/actions/index.ts` |
| Action model | Defines `defineAction`, surfaces, read/write flags, parameters, summaries, and boundaries. | `src/modules/common/action.ts` |
| Registry domain | Reads and searches published public catalog facts without booking, charging, dispatching, or sending inquiries. | `src/modules/registry/public.ts` |
| Registry source adapter | Calls Convex registry queries or local E2E fallback through a source port. | `src/modules/registry/registry.functions.ts` |
| Registry Convex functions | Serves bounded catalog list, search, detail, and inquiry-target lookup queries. | `convex/registry.ts` |
| Catalog and claim domain | Handles owner claim and publish flows, producing public catalog readbacks. | `src/modules/catalog/owner-claim.functions.ts` |
| Catalog Convex functions | Stores claimed businesses and published catalog projections through source-write admission. | `convex/business.ts`, `convex/catalog.ts` |
| Inquiry domain | Submits qualified first-contact inquiries and owner inbox operations. | `src/modules/inquiries/public.ts` |
| Inquiry action | Declares `inquiry.submit` as the only assistant-exposed write and its boundaries. | `src/modules/inquiries/inquiry.actions.ts` |
| Inquiry Convex functions | Persists inquiry messages, owner thread state, and notification outbox records. | `convex/inquiries.ts` |
| Discovery domain | Builds assistant-readable manifests, `llms.txt`, sitemap XML, robots output, and developer discovery schema. | `src/modules/discovery/public.ts` |
| Discovery Convex functions | Reads durable discovery artifacts and health data. | `convex/discovery.ts` |
| Answer turn route | Receives answer turns as SSE requests and delegates streaming to the answer-thread orchestrator. | `src/routes/api.answer.turn.ts` |
| Answer orchestrator | Runs retrieval, tool use, grounding, gating, streaming, and persistence for answer turns. | `src/modules/answer-thread/internal/turn-orchestrator.ts` |
| Answer tool runner | Executes only registered read actions during answer generation and records evidence. | `src/modules/answer-thread/internal/tool-runner.ts` |
| Answer gate | Blocks unsafe, ungrounded, overclaiming, or boundary-missing answer prose. | `src/modules/answer/internal/answer-gate.ts` |
| Quiet agent tools route | Lists and invokes assistant-callable actions while enforcing identity and write admission. | `src/routes/api.agent.tools.ts` |
| Source-write admission | Signs and verifies server-origin write authority for Convex mutations and agent writes. | `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts` |
| Clearance domain | Resolves signed write admission for `inquiry.submit` and records agent identity. | `src/modules/clearance/clearance.functions.ts` |
| Public shell | Provides public navigation, correction affordance, footer, and funnel attribution around public routes. | `src/components/ae/layout/AePublicShell.tsx` |
| Operator shell | Provides owner, admin, and developer navigation around authenticated operator routes. | `src/components/ae/layout/AeOperatorShell.tsx` |
| Astryx adapter | Bridges TanStack links into Astryx navigation components. | `src/components/astryx/RouterLink.tsx` |
| Convex schema | Composes module-owned table definitions into the backend schema. | `convex/schema.ts` |

## Pattern Overview

**Overall:** Route-adapter plus public module seam plus Convex source runtime plus explicit action contracts.

**Key Characteristics:**
- Keep TanStack route files in `src/routes` as adapters for loaders, server functions, route handlers, and shell composition.
- Put reusable business behavior behind domain seams such as `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, and `src/modules/discovery/public.ts`.
- Keep implementation details under `src/modules/*/internal` and access them from owning seams, functions, or Convex wrappers.
- Declare operations in `src/modules/*/*.actions.ts` and register them in `src/modules/actions/index.ts`; do not expose a new assistant operation without a `summary`, `boundaries`, `surfaces`, and `readOnly` value.
- Treat Convex as the durable source of truth through `src/lib/server/convex-source.ts`, `convex/schema.ts`, and domain-specific `convex/*.ts` files.
- Use source ports in `src/modules/*/*.functions.ts` to hide Convex transport and local E2E fallbacks from routes.
- Route all assistant answer tool use through registered read actions and `src/modules/answer-thread/internal/tool-runner.ts`, then gate final prose with `src/modules/answer/internal/answer-gate.ts`.
- Preserve the AE trust contract in every layer: AE may read, compare, summarize, route to the next step, and send a qualified inquiry when published; AE does not book, charge, dispatch, or auto-fulfil.

## Layers

**Surface Routing:**
- Purpose: Own URL shape, search validation, loaders, server function calls, API responses, route metadata, and shell selection.
- Location: `src/routes`
- Contains: TanStack file routes, API route handlers, escaped route files such as `src/routes/llms[.]txt.ts`, dynamic routes such as `src/routes/$slug.tsx`, and nested route files such as `src/routes/$slug.inquiry.tsx`.
- Depends on: `src/modules/*/public.ts`, `src/modules/*/*.functions.ts`, `src/modules/*/*.actions.ts`, `src/components/ae/layout/*`, `src/lib/*`.
- Used by: TanStack Start through `src/routeTree.gen.ts` and `src/router.tsx`.

**UI Composition:**
- Purpose: Render public, owner, admin, developer, registry, listing, inquiry, chat, and feedback experiences.
- Location: `src/components`
- Contains: AE shells in `src/components/ae/layout`, listing UI in `src/components/ae/listing`, inquiry UI in `src/components/ae/inquiries`, chat primitives in `src/components/ai-elements`, and the Astryx link adapter in `src/components/astryx/RouterLink.tsx`.
- Depends on: Astryx packages, React, route readbacks, and domain DTOs.
- Used by: `src/routes/*.tsx` route components.

**Action Contracts:**
- Purpose: Define the operations that can fan out to React UI, HTTP APIs, agent JSON, and quiet agent tools.
- Location: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/*/*.actions.ts`
- Contains: `registry.list`, `registry.search`, `registry.detail`, `inquiry.submit`, and `storefront.importDraft`.
- Depends on: Zod schemas, module functions, and `ActionContext`.
- Used by: `src/routes/api.businesses*.ts`, `src/routes/api.agent.tools.ts`, `src/modules/harness/*`, and answer tool execution.

**Domain Modules:**
- Purpose: Own business rules, schemas, readbacks, DTOs, pure transformations, and route-facing seams.
- Location: `src/modules`
- Contains: Domains including `registry`, `catalog`, `inquiries`, `answer`, `answer-thread`, `discovery`, `clearance`, `security`, `harness`, `observability`, `billing`, and `protected-action`.
- Depends on: Module-local `internal` code, shared `src/modules/common`, `src/lib/server`, Convex source references, and Zod.
- Used by: Routes, action handlers, Convex wrappers, and tests.

**Server Function and Source Runtime:**
- Purpose: Bridge TanStack server functions and route handlers to Convex source queries, mutations, and actions.
- Location: `src/modules/*/*.functions.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`
- Contains: `createServerFn` handlers, source port implementations, Convex HTTP client wrappers, authenticated/public source calls, and source-write request context.
- Depends on: Clerk server auth, Convex HTTP client, source-write admission, and environment configuration.
- Used by: Routes, domain modules, and action handlers.

**Convex Runtime:**
- Purpose: Store durable state and execute source-of-truth reads/writes with validators and authorization.
- Location: `convex`
- Contains: `convex/schema.ts`, domain function files such as `convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/discovery.ts`, and generated APIs under `convex/_generated`.
- Depends on: Convex validators, indexes, source-write admission, Clerk identity, and module-owned schema fragments in `src/modules/*/internal/schema.ts`.
- Used by: `src/lib/server/convex-source.ts` and local development tooling.

**Assistant Answer Loop:**
- Purpose: Stream grounded answer turns, call read tools, record evidence, and block unsafe final prose.
- Location: `src/modules/answer`, `src/modules/answer-thread`, `src/modules/harness`
- Contains: `streamAnswerTurn`, answer tool use agent, answer tool runner, gates, catalog grounding, rate limits, sessions, and harness tool contracts.
- Depends on: Action registry, registry actions, model adapter configuration, Convex answer thread functions, and source-write request context.
- Used by: `src/routes/api.answer.turn.ts` and answer/chat UI surfaces.

**Discovery and SEO:**
- Purpose: Publish assistant-readable and crawler-readable artifacts without exposing private operational state.
- Location: `src/modules/discovery`, `src/modules/seo`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/api.discovery.schema.ts`
- Contains: Discovery manifest builders, `llms.txt`, sitemap, robots, developer discovery schema, and SEO helpers.
- Depends on: Registry/catalog source data and discovery Convex queries.
- Used by: Public routes, assistant readers, and integration tests.

**Guardrails and Tests:**
- Purpose: Enforce route boundaries, public copy boundaries, action exposure rules, import seams, and discovery/API contracts.
- Location: `tests`
- Contains: Import-boundary tests in `tests/imports`, copy tests in `tests/copy`, action/API tests in `tests/unit/actions` and `tests/integration`, E2E tests in `tests/e2e`, and UI contract tests in `tests/ui-contract`.
- Depends on: Source files, generated route tree, Vitest, and Playwright.
- Used by: Development, CI, and future agents making changes.

## Data Flow

### Primary Request Path

1. A person opens `/registry`; `src/routes/registry.tsx:59` creates the route, `src/routes/registry.tsx:64` validates search params, and `src/routes/registry.tsx:69` calls the route server function.
2. `src/routes/registry.tsx:81` loads a registry readback and chooses list or search; search calls `src/modules/registry/registry.functions.ts:82`.
3. `src/modules/registry/registry.functions.ts:168` calls the Convex source query through `callPublicSourceQuery`, with local E2E fallback through `src/modules/registry/registry.functions.ts:189`.
4. `convex/registry.ts:224` executes the bounded public catalog search query, while `convex/registry.ts:206` handles public catalog listing.
5. `src/routes/registry.tsx` renders the readback inside public UI and companion HTTP routes such as `src/routes/api.businesses.search.ts` expose the same action-backed facts as JSON.

### Qualified Inquiry Flow

1. A person opens `/$slug/inquiry`; `src/routes/$slug.inquiry.tsx` loads the public listing and inquiry route readback.
2. The inquiry form submits through `submitPublicInquiryServer`, defined at `src/modules/inquiries/inquiry.functions.ts:272`.
3. `src/modules/inquiries/inquiry.functions.ts:298` validates and submits through the public source adapter.
4. `src/modules/inquiries/inquiry.functions.ts:303` resolves the published inquiry target before any write is attempted.
5. `src/modules/inquiries/inquiry.functions.ts:316` calls `inquiries:submitPublicInquiry` with source-write admission from `src/lib/server/source-write-admission.ts`.
6. `convex/inquiries.ts:612` persists the qualified inquiry and returns a receipt; this flow sends a first-contact message for owner review and does not book, charge, dispatch, or confirm availability.

### Quiet Agent Tool Path

1. `src/routes/api.agent.tools.ts:35` owns `GET` and `POST` for the quiet assistant tool door.
2. `src/routes/api.agent.tools.ts:176` lists only actions returned by `listAgentToolActions` from `src/modules/actions/index.ts:37`.
3. `src/routes/api.agent.tools.ts` validates JSON input, action schema, read/write intent, and agent identity before execution.
4. `src/routes/api.agent.tools.ts:118` resolves signed write admission for write tools; `src/routes/api.agent.tools.ts:141` only allows writes when the admission tool id is `inquiry.submit`.
5. `src/routes/api.agent.tools.ts:136` executes the action through the harness tool runner and returns structured results with action boundaries intact.

### Answer Turn Flow

1. `src/routes/api.answer.turn.ts:14` owns `POST /api/answer/turn`, and `src/routes/api.answer.turn.ts:32` validates the request body.
2. `src/routes/api.answer.turn.ts:75` calls `streamAnswerTurn` with session, thread, query, rate-limit, and source-write context.
3. `src/modules/answer-thread/internal/turn-orchestrator.ts:161` orchestrates the streaming turn, retrieval, model loop, tool calls, gate, finalization, and persistence.
4. `src/modules/answer/internal/answer-tool-use-agent.ts:117` runs the model tool-use loop with registered read tools.
5. `src/modules/answer-thread/internal/tool-runner.ts:56` executes only read actions and records tool evidence.
6. `src/modules/answer/internal/answer-gate.ts:27` rejects unsafe, ungrounded, overclaiming, or boundary-missing answer prose before final output is accepted.

### Owner Claim and Catalog Publish Flow

1. Owner-facing routes call server functions in `src/modules/catalog/owner-claim.functions.ts`.
2. `src/modules/catalog/owner-claim.functions.ts:147` defines the owner claim server function and validates the form input.
3. The source adapter creates source-write admissions before calling `business:claimBusiness` and `catalog:publishBusinessCatalog`.
4. `convex/business.ts` claims the business under authenticated owner authority, and `convex/catalog.ts` publishes owner-reviewed catalog facts.
5. Registry and discovery projections become readable through `src/modules/registry/registry.functions.ts` and `src/modules/discovery/discovery.functions.ts`.

### Discovery Artifact Flow

1. Assistant-readable routes such as `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, and `src/routes/api.discovery.schema.ts` receive read-only requests.
2. `src/modules/discovery/discovery.functions.ts` reads durable discovery artifacts through Convex or local fixtures.
3. `src/modules/discovery/public.ts` shapes manifests, sitemap XML, robots output, and developer discovery artifacts.
4. `convex/discovery.ts` serves durable discovery data without exposing private owner state or private source hashes.

**State Management:**
- Durable source state lives in Convex tables composed by `convex/schema.ts`.
- TanStack route loaders and server functions are request-scoped and call Convex through source ports in `src/modules/*/*.functions.ts`.
- Local E2E fallbacks live behind source port overrides such as `src/modules/registry/registry.functions.ts:57` and must stay out of production behavior.
- Public UI state is React-local in route components and form components; durable writes go through server functions or action handlers.
- Answer sessions, rate limits, and thread access are handled under `src/modules/answer-thread` and persisted through Convex answer-thread functions when durable state is required.

## Key Abstractions

**Action:**
- Purpose: Represents a boundary-honest operation that can be reused across UI, HTTP, agent JSON, and quiet agent tools.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Pattern: Use `defineAction`, Zod input schemas, explicit `surfaces`, `readOnly`, `summary`, and `boundaries`; register each action in `src/modules/actions/index.ts`.

**Public Module Seam:**
- Purpose: Gives routes and neighboring modules a stable import path while hiding internal implementation details.
- Examples: `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/answer/public.ts`, `src/modules/answer-thread/public.ts`, `src/modules/discovery/public.ts`
- Pattern: Export DTOs, schemas, readbacks, and public functions from `public.ts`; keep helpers in `src/modules/*/internal`.

**Source Port:**
- Purpose: Decouples route-facing functions from Convex transport and local E2E fixtures.
- Examples: `src/modules/registry/registry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/discovery/discovery.functions.ts`
- Pattern: Define a port interface, provide a Convex implementation, and expose local fixture overrides only for tests or E2E.

**Source-Write Admission:**
- Purpose: Binds mutating operations to server-origin authority, request context, operation keys, correlation keys, and replay protection.
- Examples: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Pattern: Create admission in server middleware or server functions, pass it to Convex mutations, and require Convex-side verification before writes.

**Convex Function Wrapper:**
- Purpose: Provides validated source-of-truth reads and writes over module-owned tables.
- Examples: `convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/discovery.ts`
- Pattern: Use Convex validators, return validators, indexes, and bounded reads; read `convex/_generated/ai/guidelines.md` before editing Convex code.

**Harness Tool Contract:**
- Purpose: Converts action contracts into executable tool contracts for answer generation, tests, and the quiet agent tools route.
- Examples: `src/modules/harness/public.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `src/routes/api.agent.tools.ts`
- Pattern: Build contracts from registered actions, validate strict schemas, and keep writes blocked unless the route has explicit write admission.

**Route Readback:**
- Purpose: Packages domain facts, copy, safe boundaries, and UI state for route components.
- Examples: `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/route-readbacks.ts`, `src/modules/catalog/owner-claim.functions.ts`
- Pattern: Produce complete readback objects in domain/server code and keep route components focused on rendering.

**Shell:**
- Purpose: Provides consistent public and operator navigation without duplicating route chrome.
- Examples: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`
- Pattern: Use public shell for human public surfaces and operator shell for authenticated owner/admin/developer surfaces.

## Entry Points

**Application Start:**
- Location: `src/start.ts`
- Triggers: TanStack Start server bootstrap.
- Responsibilities: Register request middleware, security headers, CSRF, source-write admission, observability, and Clerk middleware.

**Root UI Route:**
- Location: `src/routes/__root.tsx`
- Triggers: Every TanStack route render.
- Responsibilities: Provide document shell, global CSS, Astryx providers, conditional Clerk provider, error boundary, and outlet rendering.

**Router:**
- Location: `src/router.tsx`
- Triggers: Client/server router creation.
- Responsibilities: Bind `src/routeTree.gen.ts`, default preload, not-found component, and scroll restoration.

**Public Registry:**
- Location: `src/routes/registry.tsx`
- Triggers: `GET /registry`.
- Responsibilities: Validate registry search state, load public catalog/search readbacks, and render registry UI.

**Public Listing:**
- Location: `src/routes/$slug.tsx`
- Triggers: `GET /$slug`.
- Responsibilities: Load public business detail, build SEO, render listing facts, and expose inquiry/agent JSON affordances.

**Public Inquiry:**
- Location: `src/routes/$slug.inquiry.tsx`
- Triggers: `GET /$slug/inquiry` and public inquiry form submission.
- Responsibilities: Render first-contact inquiry route and call `submitPublicInquiryServer`.

**Business API:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`
- Triggers: `GET /api/businesses`, `GET /api/businesses/search`, and `GET /api/businesses/$slug`.
- Responsibilities: Return action-backed public catalog JSON.

**Quiet Agent Tools:**
- Location: `src/routes/api.agent.tools.ts`
- Triggers: `GET /api/agent/tools` and `POST /api/agent/tools`.
- Responsibilities: List assistant-callable actions and execute read tools or admitted `inquiry.submit` writes.

**Answer Turn API:**
- Location: `src/routes/api.answer.turn.ts`
- Triggers: `POST /api/answer/turn`.
- Responsibilities: Validate answer turns, enforce rate limits, and stream grounded SSE responses.

**Discovery Routes:**
- Location: `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/api.discovery.schema.ts`
- Triggers: Assistant, crawler, and developer discovery requests.
- Responsibilities: Return plain-text, JSON, XML, and schema artifacts.

**Owner and Admin Routes:**
- Location: `src/routes/owner*.tsx`, `src/routes/admin*.tsx`, `src/routes/developers*.tsx`
- Triggers: Authenticated operator navigation.
- Responsibilities: Use `src/lib/operator/route-options.ts` and `src/components/ae/layout/AeOperatorShell.tsx` for protected owner/admin/developer surfaces.

**Convex Functions:**
- Location: `convex/*.ts`
- Triggers: Calls through Convex HTTP client, Convex scheduled/internal functions, and local Convex development.
- Responsibilities: Execute validated source-of-truth reads and writes over tables in `convex/schema.ts`.

## Architectural Constraints

- **Threading:** The web app runs on the Node/Vite/TanStack event loop and streams answer turns with SSE in `src/routes/api.answer.turn.ts`; Convex functions run as Convex queries, mutations, actions, and internal functions. No worker-thread architecture is present.
- **Global state:** Keep module-level mutable state limited to explicit test and legacy adapters such as `src/modules/registry/registry.functions.ts:57` and the legacy `answerCache` in `src/routes/api.answer.ts`. Durable state belongs in Convex tables from `convex/schema.ts`.
- **Circular imports:** No circular dependency chain is part of the intended architecture. Preserve route-to-domain and domain-to-internal directionality; `tests/imports/private-imports.test.ts` and `tests/imports/route-boundary.test.ts` enforce this.
- **Convex edits:** Read `convex/_generated/ai/guidelines.md` before changing Convex code. Add validators, return validators, indexes, and module-owned schema fragments before exposing new Convex reads or writes.
- **Action exposure:** New operations must be declared in `src/modules/*/*.actions.ts`, registered in `src/modules/actions/index.ts`, and given boundary-honest copy before they appear on UI, HTTP, agent JSON, or quiet agent tools surfaces.
- **Assistant boundary:** Assistant tools may read, compare, summarize, route to the next step, and submit a qualified inquiry when published. They must not imply booking, payment, dispatch, availability confirmation, or autonomous fulfillment.
- **Public copy:** Public human surfaces must not expose internal architecture vocabulary such as `MCP`, `OpenAPI`, `callable`, `DTO`, `manifest`, or public epistemic labels such as `KNOWN` and `UNKNOWN`; `tests/copy/phase1-banned-copy.test.ts` enforces this.
- **UI system:** `DESIGN.md` makes Astryx the visual authority. Use `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `src/components/astryx/RouterLink.tsx`, and Tailwind 4 layout utilities; do not add new bespoke `Ae*` presentation systems, shadcn/radix wrappers, handwritten CSS files, fontsource fonts, or retired Daylight assets.

## Anti-Patterns

### Route Reaches Around Domain Seams

**What happens:** A route imports `src/modules/*/internal/*`, `convex/*`, or source transport helpers directly.
**Why it's wrong:** It bypasses route-boundary tests, duplicates business rules, and couples URL handlers to storage details.
**Do this instead:** Import the owning public seam or server function, such as `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/public.ts`, or `src/modules/discovery/discovery.functions.ts`.

### Assistant Operation Without an Action Contract

**What happens:** A new route, tool, or prompt path performs a business operation without a `defineAction` declaration.
**Why it's wrong:** UI, HTTP, agent JSON, and quiet agent tools drift apart, and boundaries stop being machine-readable.
**Do this instead:** Create or update `src/modules/<domain>/<domain>.actions.ts`, register it in `src/modules/actions/index.ts`, and add tests like `tests/unit/actions/agent-tools-surface.test.ts`.

### Public Copy Overclaims AE Authority

**What happens:** Public text suggests AE can book, charge, dispatch, confirm availability, execute autonomously, or verify a claim without a named standard.
**Why it's wrong:** It violates `PRODUCT.md`, `AGENTS.md`, and the safe assistant contract.
**Do this instead:** Use boundary copy modeled by `src/modules/inquiries/inquiry.actions.ts`, `src/modules/answer/internal/boundary-prose.ts`, and `tests/copy/phase1-banned-copy.test.ts`.

### UI Work Bypasses Astryx

**What happens:** New UI is added under `src/components/ui`, new handwritten CSS files, new shadcn/radix wrappers, or new bespoke presentation-only `Ae*` components.
**Why it's wrong:** It conflicts with `DESIGN.md` and increases migration debt away from the retired Daylight system.
**Do this instead:** Compose Astryx components first, add local Astryx adapters under `src/components/astryx` when needed, and use `src/styles/globals.css` with Tailwind utilities only for layout glue.

### Convex Query Performs Unbounded Reads

**What happens:** A Convex query scans or filters entire tables in application code instead of using indexed, bounded access.
**Why it's wrong:** It breaks the Convex performance model and violates `convex/_generated/ai/guidelines.md`.
**Do this instead:** Add indexes in the module-owned schema or `convex/schema.ts`, query with `.withIndex`, use pagination, and keep limits explicit as in `convex/registry.ts`.

## Error Handling

**Strategy:** Validate at the boundary, return structured user-facing failures, and capture unexpected runtime errors through observability middleware.

**Patterns:**
- Route handlers return JSON errors with explicit status codes in files such as `src/routes/api.agent.tools.ts` and `src/routes/api.businesses.$slug.ts`.
- Server functions and actions validate input with Zod schemas from files such as `src/modules/inquiries/inquiry.functions.ts` and `src/modules/registry/registry.actions.ts`.
- Convex functions return discriminated user-facing results or throw authorization/source-write errors when a write is not admitted, as in `convex/sourceWriteAdmission.ts`.
- Answer generation converts unsafe or failed model behavior into safe fallback frames through `src/modules/answer/internal/answer-gate.ts` and `src/modules/answer-thread/internal/turn-orchestrator.ts`.
- `src/start.ts` initializes Sentry and PostHog request handling, tags request paths, captures unexpected errors, and flushes telemetry.

## Cross-Cutting Concerns

**Logging:** Use observability helpers and middleware under `src/lib/observability`, `src/modules/observability`, and `src/start.ts`; avoid ad hoc logging in domain code unless it is part of an existing diagnostic path.
**Validation:** Use Zod at route/action/server-function boundaries in `src/modules/*/*.actions.ts` and `src/modules/*/*.functions.ts`, and Convex validators in `convex/*.ts`.
**Authentication:** Use Clerk through `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/require-operator-session.ts`, and Convex auth helpers such as `convex/authz.ts`.
**Authorization:** Use source-write admission for server-origin writes in `src/modules/security/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`; use clearance functions for assistant write admission in `src/modules/clearance/clearance.functions.ts`.
**Discovery:** Keep assistant-readable and crawler-readable artifacts in `src/modules/discovery`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, and `convex/discovery.ts`.
**Testing guardrails:** Preserve import, copy, action-surface, and API tests in `tests/imports`, `tests/copy`, `tests/unit/actions`, and `tests/integration` when changing architecture boundaries.

---

*Architecture analysis: 2026-07-04*
