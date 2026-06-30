<!-- refreshed: 2026-06-30 -->
# Architecture

**Analysis Date:** 2026-06-30

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│              TanStack React Start Application                │
│              `src/start.ts`, `src/router.tsx`                │
├──────────────────┬──────────────────┬───────────────────────┤
│ Public surfaces  │ Operator surfaces│ JSON / SSE APIs        │
│ `src/routes/*`   │ `src/routes/*`   │ `src/routes/api.*`     │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│             Domain Modules and Public Seams                  │
│ `src/modules/*/public.ts`, `src/modules/*/*.functions.ts`   │
│ `src/modules/actions/index.ts`                               │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│             Source Adapters and Write Admission              │
│ `src/lib/server/convex-source.ts`                            │
│ `src/lib/server/source-write-admission.ts`                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               Convex Source State and Functions              │
│ `convex/schema.ts`, `convex/*.ts`, `convex/source_state.ts`  │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start bootstrap | Installs CSRF, source-write admission, and Clerk request middleware. | `src/start.ts` |
| Router factory | Creates the file-route router from the generated route tree. | `src/router.tsx` |
| Root route | Adds global metadata, CSS, Clerk provider wrapping, tooltip provider, and toaster. | `src/routes/__root.tsx` |
| Route adapters | Own loaders, server handlers, page shells, and HTTP response shaping. | `src/routes/*.ts`, `src/routes/*.tsx` |
| Domain public seams | Export domain contracts and supported operations; callers should cross modules here. | `src/modules/*/public.ts` |
| Server-function seams | Define TanStack `createServerFn` validators, Convex function references, source ports, and local/E2E fallbacks. | `src/modules/*/*.functions.ts` |
| Action registry | Centralizes assistant/UI/API action declarations and exposes agent-tool descriptions. | `src/modules/actions/index.ts`, `src/modules/common/action.ts` |
| Convex transport | Builds authenticated and public Convex HTTP transports and typed function references. | `src/lib/server/convex-source.ts` |
| Source-write admission | Signs browser/API writes before they reach Convex and rejects client-exposed secrets. | `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts` |
| Convex schema composition | Combines module-owned table schemas into the runtime database schema. | `convex/schema.ts` |
| Operator shell | Provides owner/admin/developer navigation and section rails for protected readbacks. | `src/components/ae/layout/AeOperatorShell.tsx`, `src/lib/operator/navigation.ts` |
| Public listing shell | Renders marketplace-style public pages from route readbacks and module DTOs. | `src/components/ae/listing/AeProviderListingPage.tsx`, `src/components/ae/layout/AePublicShell.tsx` |

## Pattern Overview

**Overall:** Full-stack modular monolith with file-based TanStack routes, Convex-backed source state, module public seams, and explicit action registration.

**Key Characteristics:**
- File routes in `src/routes/` are thin adapters over domain modules in `src/modules/`.
- Domain code is organized by bounded context: `business`, `catalog`, `registry`, `discovery`, `inquiries`, `answer`, `answer-thread`, `billing`, `business-action`, `protected-action`, `notification-outbox`, `observability`, `security`, `seo`, and `dev`.
- Source persistence is centralized in Convex files under `convex/`, with schemas imported from module-owned internal schema files into `convex/schema.ts`.
- Writes use operation keys, correlation IDs, stable request hashes, and source-write admission rather than trusting client-provided authority fields.
- Public human surfaces and assistant-readable JSON share data contracts but expose different vocabulary and boundaries.

## Layers

**Application Bootstrap:**
- Purpose: Configure request middleware and client routing.
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/routeTree.gen.ts`
- Contains: TanStack Start middleware, route tree wiring, root document, global providers.
- Depends on: TanStack React Start, Clerk, global CSS in `src/styles/globals.css`.
- Used by: Every route in `src/routes/`.

**Route Adapter Layer:**
- Purpose: Translate HTTP requests, route params, forms, loaders, and page states into module calls.
- Location: `src/routes/`
- Contains: Public pages like `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`; owner/admin/developer pages like `src/routes/owner.inquiries.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/developers.discovery.tsx`; API endpoints like `src/routes/api.businesses.ts`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`.
- Depends on: Module public seams and `*.functions.ts` server seams; shared UI components in `src/components/`.
- Used by: Browser navigation, assistant/API clients, tests that import route handlers directly.

**UI Component Layer:**
- Purpose: Render reusable public, operator, feedback, forms, chat, listing, and primitive components.
- Location: `src/components/ae/`, `src/components/ui/`, `src/components/ai-elements/`
- Contains: AE-specific components such as `src/components/ae/chat/AeChat.tsx`, `src/components/ae/inquiries/AeInquiryInboxPanel.tsx`, `src/components/ae/operator/AeOperatorDataTable.tsx`, plus shadcn-style primitives in `src/components/ui/`.
- Depends on: React, local design tokens in `src/styles/tokens.css`, module DTO/readback types where needed.
- Used by: Route components under `src/routes/`.

**Domain Module Layer:**
- Purpose: Own business rules, contracts, schemas, source-state command functions, and route-safe exports.
- Location: `src/modules/`
- Contains: `public.ts` seams, `internal/` implementation files, `*.functions.ts` TanStack server functions, `*.actions.ts` action declarations, and module-local schemas.
- Depends on: `src/modules/common/*`, selected sibling public seams, and source adapters in `src/lib/server/`.
- Used by: Routes, Convex functions, tests, and the central action registry.

**Action Layer:**
- Purpose: Define once and expose the same operation to UI, HTTP, agent JSON, and quiet agent tools surfaces.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Contains: `defineAction`, action metadata, Zod schema, boundary summaries, `surfaces`, and action `run` handlers.
- Depends on: Module server functions such as `src/modules/inquiries/inquiry.functions.ts`.
- Used by: `src/routes/api.agent.tools.ts` and future route/UI action renderers.

**Source Adapter Layer:**
- Purpose: Hide Convex transport and source-write signing from routes and pure domain commands.
- Location: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`
- Contains: `sourceQuery`, `sourceMutation`, authenticated/public transport factories, admission middleware, admission builders.
- Depends on: Clerk server auth, Convex HTTP client, source-write domain signing code.
- Used by: `src/modules/*/*.functions.ts` files that call Convex.

**Convex Persistence Layer:**
- Purpose: Store durable source state and expose public/authenticated queries and mutations.
- Location: `convex/`
- Contains: Domain runtime files such as `convex/registry.ts`, `convex/inquiries.ts`, `convex/billing.ts`, `convex/businessActions.ts`; schema assembly in `convex/schema.ts`; runtime adapter helpers in `convex/source_state.ts`.
- Depends on: Convex validators and module public/internal pure functions.
- Used by: Source adapter calls from `src/modules/*/*.functions.ts`.

**Testing and Guardrail Layer:**
- Purpose: Enforce import boundaries, copy contracts, route parity, UI contracts, and domain behavior.
- Location: `tests/`, `eval/answer/`
- Contains: Boundary scans in `tests/imports/`, copy scans in `tests/copy/`, unit tests in `tests/unit/`, integration routes in `tests/integration/`, Playwright flows in `tests/e2e/`, answer evaluations in `eval/answer/`.
- Depends on: Runtime source files and fixture directories under `tests/fixtures/`.
- Used by: `package.json` scripts such as `test:imports`, `test:copy`, `test:integration`, and `test:eval`.

## Data Flow

### Public Business Page

1. TanStack route loader receives `/$slug` in `src/routes/$slug.tsx:13`.
2. Loader calls `readPublicBusinessPageServer` in `src/routes/$slug.tsx:15`.
3. Server function validates input and calls `readPublicBusinessPageThroughSource` in `src/modules/catalog/owner-claim.functions.ts:155`.
4. Source port calls the public Convex query reference in `src/modules/catalog/owner-claim.functions.ts:381`.
5. Convex/public registry logic reads published catalog rows and suppression state in `convex/registry.ts:157` and `convex/registry.ts:271`.
6. Route redacts source hashes, builds SEO with `src/modules/seo/public.ts`, reads paid activation state with `src/modules/billing/billing.functions.ts`, and renders `src/components/ae/listing/AeProviderListingPage.tsx`.

### Public Registry JSON

1. `GET /api/businesses` enters `src/routes/api.businesses.ts:8`.
2. Route handler parses `cursor` and `limit` in `src/routes/api.businesses.ts:16`.
3. Handler calls `readPublicRegistryCatalogPage` in `src/modules/registry/registry.functions.ts:41`.
4. Source port uses public Convex query references from `src/modules/registry/registry.functions.ts:21`.
5. Convex builds `public-business-catalog-api:v1` DTOs in `convex/registry.ts:125`.
6. Route returns `jsonResponse` with `Cache-Control: no-store` from `src/routes/api.businesses.ts:36`.

### Qualified Inquiry

1. Public form route loads the target and validates form state in `src/routes/$slug.inquiry.tsx:43`.
2. Browser submit calls `submitPublicInquiryServer` in `src/routes/$slug.inquiry.tsx:103`.
3. Agent tools can invoke the same write through `POST /api/agent/tools` in `src/routes/api.agent.tools.ts:19`.
4. `src/routes/api.agent.tools.ts:29` validates input against the action schema and calls the registered action from `src/modules/actions/index.ts:13`.
5. `submitInquiryAction` calls `submitPublicInquiryThroughSource` in `src/modules/inquiries/inquiry.actions.ts:80`.
6. `submitPublicInquiryThroughSource` creates an operation key, correlation ID, pseudonymous session ID, abuse key, and source-write admission in `src/modules/inquiries/inquiry.functions.ts:275`.
7. Convex verifies admission and calls the pure inquiry command in `convex/inquiries.ts:548`.
8. Pure command logic validates target, rate limit, idempotency, and notification state in `src/modules/inquiries/internal/commands.ts:280`.
9. Convex persists source state and notification outbox links in `convex/inquiries.ts:590`, then the caller receives a receipt.

### Answer Thread Turn

1. `POST /api/answer/turn` enters `src/routes/api.answer.turn.ts:19`.
2. Route resolves or creates the answer session cookie in `src/routes/api.answer.turn.ts:20`.
3. Request JSON is parsed with `answerTurnRequestSchema` from `src/modules/answer-thread/answer-thread.schema.ts:71`.
4. The route starts an SSE `ReadableStream` and calls `streamAnswerTurn` in `src/routes/api.answer.turn.ts:50`.
5. Turn orchestration classifies follow-up intent, creates IDs, streams events, and captures the final snapshot in `src/modules/answer-thread/internal/turn-orchestrator.ts:39`.
6. Synthesis uses gated LLM when enabled and falls back to deterministic synthesis in `src/modules/answer/internal/synthesize-with-fallback.ts:13`.
7. Turn persistence writes an answer thread and turn best-effort through `src/modules/answer-thread/answer-thread.functions.ts:80`.
8. Convex stores `answerThreads` and `answerTurns` through `convex/answerThreads.ts:15` and `convex/answerThreads.ts:35`.

### Discovery Artifacts

1. `GET /api/discovery/schema` enters `src/routes/api.discovery.schema.ts:29`.
2. Runtime options build a route snapshot in `src/routes/api.discovery.schema.ts:78`.
3. Snapshot execution directly calls durable route handlers for `/api/businesses`, `/api/businesses/search`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, and `/robots.txt` in `src/routes/api.discovery.schema.ts:94`.
4. The discovery module generates schema/example/fixture artifacts from `src/modules/discovery/developer-discovery.ts`.
5. Responses include discovery telemetry headers in `src/routes/api.discovery.schema.ts:49`.

**State Management:**
- Durable state is Convex-backed through `convex/schema.ts` and domain files in `convex/`.
- React state stays local to client components and route components such as `src/routes/$slug.inquiry.tsx`.
- Route loaders and TanStack server functions are request-scoped except for explicit module-level caches and test ports.
- `/api/answer` has a short-lived in-memory `answerCache` in `src/routes/api.answer.ts:25`; answer threads persist best-effort in Convex through `src/modules/answer-thread/answer-thread.functions.ts`.
- Answer sessions use a pseudonymous session cookie via `src/modules/answer-thread/internal/session-cookie.ts`.

## Key Abstractions

**Module Public Seam:**
- Purpose: Stable cross-module API for each bounded context.
- Examples: `src/modules/catalog/public.ts`, `src/modules/registry/public.ts`, `src/modules/discovery/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/billing/public.ts`.
- Pattern: Re-export types, literal unions, and domain functions from `internal/`; keep routes and sibling modules on public seams.

**Source State Command:**
- Purpose: Pure domain operation over an explicit source-state object.
- Examples: `src/modules/inquiries/internal/commands.ts`, `src/modules/catalog/internal/publish.ts`, `src/modules/billing/internal/operations.ts`, `src/modules/business-action/internal/business-action.ts`.
- Pattern: Accept state plus command, return `{ kind: 'ok' | 'error', code, ... }` result and updated state.

**Source Port / Server Function:**
- Purpose: Bridge route-safe calls to Convex and provide local/E2E test fallbacks.
- Examples: `src/modules/registry/registry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`.
- Pattern: Zod validator plus `createServerFn`, `sourceQuery`/`sourceMutation`, and narrow error mapping.

**Action Definition:**
- Purpose: A declarative operation contract with schema, surfaces, summary, and boundaries.
- Examples: `src/modules/common/action.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/actions/index.ts`.
- Pattern: Explicit registration array and `surfaces` filtering for agent tools.

**Source-Write Admission:**
- Purpose: Gate source writes with request origin, path, operation key, correlation ID, nonce, timestamp, and HMAC signature.
- Examples: `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`.
- Pattern: Server signs admission, Convex verifies it, mutations map rejected signatures to CSRF-style errors.

**Public Catalog Contract:**
- Purpose: The central published listing shape for human pages, JSON APIs, discovery manifests, and answer grounding.
- Examples: `src/modules/catalog/public.ts`, `src/modules/registry/internal/search.ts`, `convex/registry.ts`.
- Pattern: Public DTOs redact private source hashes at route boundaries and retain schema versions.

**Answer Snapshot and Thread Turn:**
- Purpose: Represent generated answer output and persisted turn evidence.
- Examples: `src/modules/answer/answer-synthesizer.ts`, `src/modules/answer-thread/answer-thread.schema.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`.
- Pattern: SSE events stream first; frozen evidence/prose persists after capture when possible.

**Operation Key / Stable Hash:**
- Purpose: Idempotency, replay detection, source hashes, and audit joins.
- Examples: `src/modules/common/ids.ts`, `src/modules/common/stable-hash.ts`, `src/modules/inquiries/internal/commands.ts`.
- Pattern: Branded non-empty IDs plus deterministic FNV-style stable hash strings.

## Entry Points

**App Runtime:**
- Location: `src/start.ts`
- Triggers: TanStack Start server runtime.
- Responsibilities: Install CSRF middleware, source-write admission middleware, and Clerk middleware.

**Client/Server Router:**
- Location: `src/router.tsx`, `src/routeTree.gen.ts`
- Triggers: TanStack Router initialization.
- Responsibilities: Register generated file routes, preloading, not-found UI, and scroll restoration.

**Root Document:**
- Location: `src/routes/__root.tsx`
- Triggers: Every route render.
- Responsibilities: Load global CSS, set metadata, wrap protected prefixes with Clerk, and render global providers.

**Public Human Routes:**
- Location: `src/routes/index.tsx`, `src/routes/ask.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`
- Triggers: Browser navigation.
- Responsibilities: Render discovery, registry, listing, and qualified inquiry flows.

**Operator Routes:**
- Location: `src/routes/owner.*.tsx`, `src/routes/admin.*.tsx`, `src/routes/developers.discovery.tsx`
- Triggers: Authenticated owner/admin/developer navigation.
- Responsibilities: Render readbacks, queues, reconstruction panels, billing state, and developer artifacts.

**API Routes:**
- Location: `src/routes/api.*.ts`
- Triggers: HTTP requests from browsers, tests, assistants, and webhooks.
- Responsibilities: Return JSON, text discovery files, SSE streams, webhook admissions, and quiet agent-tool calls.

**Convex Runtime:**
- Location: `convex/*.ts`, `convex/schema.ts`
- Triggers: Convex queries, mutations, and generated API references.
- Responsibilities: Validate args/returns, resolve auth, call pure module functions, persist tables, and serialize readbacks.

## Architectural Constraints

- **Threading:** JavaScript request handlers and React rendering are single-threaded per runtime worker; streaming routes use Web `ReadableStream` in `src/routes/api.answer.ts` and `src/routes/api.answer.turn.ts`; Convex functions run per query/mutation in `convex/*.ts`.
- **Global state:** `src/modules/common/action.ts` keeps a module-level `knownIds` set; `src/routes/api.answer.ts` keeps a module-level `answerCache`; `src/modules/registry/registry.functions.ts` and `src/modules/answer-thread/answer-thread.functions.ts` expose test ports; `src/routeTree.gen.ts` is generated static route state.
- **Circular imports:** Not detected in this mapping pass; import-boundary tests in `tests/imports/private-imports.test.ts` and `tests/imports/route-boundary.test.ts` enforce the main boundary rules.
- **Route boundaries:** Routes should not import Convex transports, Convex schemas, or sibling module internals; rules live in `src/lib/ui/contract-scans.ts`.
- **Public contract language:** `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md` require public copy to avoid booking, payment, dispatch, autonomous fulfillment, and unsupported "verified" claims.
- **Generated files:** Do not edit `src/routeTree.gen.ts` or `convex/_generated/*` directly; source changes regenerate them.
- **Secrets:** `.env.example` and `.env.local` exist, but secret contents are not part of this map and should not be read into planning docs.

## Anti-Patterns

### Route-Owned Source Transport

**What happens:** A route imports Convex transport or schema directly instead of calling a module seam.
**Why it's wrong:** It bypasses source-port error handling, local/E2E fallback behavior, and route-boundary guardrails.
**Do this instead:** Add or reuse a module server function in `src/modules/*/*.functions.ts`, then import it from the route, as in `src/routes/api.businesses.ts` calling `src/modules/registry/registry.functions.ts`.

### Cross-Module Internal Imports

**What happens:** A route or sibling module imports `src/modules/<module>/internal/*` directly.
**Why it's wrong:** It makes internal implementation details part of the caller contract and defeats the public seam enforced by `tests/imports/private-imports.test.ts`.
**Do this instead:** Promote the needed helper or type through `src/modules/<module>/public.ts` or a supported `*.functions.ts` seam; current answer route helpers should prefer `src/modules/answer/public.ts` and `src/modules/answer-thread/public.ts`.

### Unregistered Actions

**What happens:** A module defines an action but does not import it into `src/modules/actions/index.ts`.
**Why it's wrong:** Production bundling can tree-shake side-effect-only registration, and `/api/agent/tools` will not list or find the action.
**Do this instead:** Export action consts from `src/modules/<module>/<module>.actions.ts` and add them to the explicit `actions` array in `src/modules/actions/index.ts`.

### Client-Asserted Write Authority

**What happens:** A browser/API caller supplies authority fields such as operation result, provider state, payment state, or raw source-write secret.
**Why it's wrong:** Convex mutations require source-write admission and domain-owned authority checks; client authority would undermine replay and trust guarantees.
**Do this instead:** Generate operation keys and source-write admission server-side in `src/lib/server/source-write-admission.ts` and verify them in `convex/sourceWriteAdmission.ts`.

## Error Handling

**Strategy:** Domain code returns structured result unions; route/server adapters translate validation, auth, admission, and source failures into route-safe readbacks or HTTP responses.

**Patterns:**
- Use `{ kind: 'ok' | 'error', code, retryable }` unions from `src/modules/common/result.ts` for pure domain operations.
- Use Zod validators at TanStack server-function and API boundaries, as in `src/modules/inquiries/inquiry.functions.ts` and `src/modules/billing/billing.functions.ts`.
- Use Convex `returns` validators for durable function contracts, as in `convex/registry.ts` and `convex/inquiries.ts`.
- Map `ConvexSourceError` and `SourceWriteAdmissionError` to narrow user-safe codes in `src/modules/inquiries/inquiry.functions.ts` and `src/modules/billing/billing.functions.ts`.
- Return `Response.json` or SSE frames from routes; shared `jsonResponse` is in `src/routes/api.businesses.ts`.

## Cross-Cutting Concerns

**Logging:** Runtime logging is minimal; durable observability is modeled as audit events, funnel events, operation keys, dispatch attempts, and reconstruction readbacks in `src/modules/observability/`, `src/modules/notification-outbox/`, and corresponding `convex/*.ts` files.
**Validation:** Zod validates route/server inputs in `src/modules/*/*.functions.ts`; Convex validators validate persisted API boundaries in `convex/*.ts`; literal unions live in module `public.ts` and schema files.
**Authentication:** Clerk middleware is installed in `src/start.ts`; root route wraps sign-in, sign-up, owner, and admin prefixes with `ClerkProvider` in `src/routes/__root.tsx`; Convex resolves owner/admin identity in `convex/authz.ts`.
**Authorization:** Owner reads resolve current business actor or owner IDs in Convex; admin actions use `AdminActionMatrix` in `src/modules/security/internal/admin-authority.ts`.
**Admission and CSRF:** TanStack server functions get source-write context from `src/lib/server/source-write-admission.ts`; Convex verifies signed admission in `convex/sourceWriteAdmission.ts`.
**Redaction:** Private source hashes, contact fields, and payloads are stripped or hashed before public route output in `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/internal/commands.ts`, and `src/modules/observability/internal/redaction.ts`.
**SEO and Discovery:** Public SEO JSON-LD is built in `src/modules/seo/public.ts`; assistant-readable routes are in `src/routes/api.businesses*.ts`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, and `src/routes/api.discovery.schema.ts`.
**Design Contract:** UI structure and tokens are anchored by `DESIGN.md`, `src/styles/tokens.css`, `src/styles/globals.css`, and AE components under `src/components/ae/`.

---

*Architecture analysis: 2026-06-30*
