<!-- refreshed: 2026-07-01 -->
# Architecture

**Analysis Date:** 2026-07-01

## System Overview

```text
+--------------------------------------------------------------------------------+
|                         TanStack Start application                              |
| `src/start.ts` + `src/router.tsx` + `src/routes/__root.tsx`                      |
+--------------------------+--------------------------+--------------------------+
| Human UI routes          | JSON / SSE API routes    | Quiet agent tools        |
| `src/routes/*.tsx`       | `src/routes/api.*.ts`    | `src/routes/api.agent.tools.ts` |
+------------+-------------+-------------+------------+-------------+------------+
             |                           |                          |
             v                           v                          v
+--------------------------------------------------------------------------------+
|                      Domain modules and action registry                         |
| `src/modules/*/public.ts`, `src/modules/*/*.functions.ts`,                     |
| `src/modules/*/*.actions.ts`, `src/modules/actions/index.ts`                    |
+--------------------------+--------------------------+--------------------------+
| Source ports             | Domain contracts         | Guardrails/readbacks     |
| `src/lib/server/*`       | `src/modules/*/internal` | `src/modules/security/*` |
+------------+-------------+-------------+------------+-------------+------------+
             |                           |                          |
             v                           v                          v
+--------------------------------------------------------------------------------+
|                           Convex source of record                               |
| `convex/*.ts`, `convex/schema.ts`, module table schemas in `src/modules/*`      |
+--------------------------+--------------------------+--------------------------+
| Public catalog/search    | Owner/admin workflows    | Answer thread evidence   |
| `convex/registry.ts`     | `convex/inquiries.ts`    | `convex/answerThreads.ts` |
+--------------------------+--------------------------+--------------------------+
             |
             v
+--------------------------------------------------------------------------------+
| External services and observability                                             |
| Clerk auth, OpenRouter answer agent, Meilisearch optional search, provider      |
| webhooks, Sentry/PostHog, Autumn/Stripe, Resend/Novu                            |
+--------------------------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start bootstrap | Installs request middleware for observability, CSRF, source-write admission, and Clerk. | `src/start.ts` |
| Router factory | Creates the generated route tree router, default not-found behavior, preloading, and scroll restoration. | `src/router.tsx` |
| Root route | Provides document shell, global CSS, Clerk provider gating, tooltip provider, error boundary, toaster, and observability boot. | `src/routes/__root.tsx` |
| Route files | Adapt HTTP requests or React route loaders/components to module seams. | `src/routes/` |
| Product components | Render AE-specific public, owner, admin, chat, registry, inquiry, and listing surfaces. | `src/components/ae/` |
| UI primitives | Hold shadcn/Radix-style reusable primitives consumed by AE components. | `src/components/ui/` |
| Domain modules | Own contracts, pure domain commands, route server functions, action definitions, validators, and schema fragments. | `src/modules/` |
| Action registry | Registers cross-surface actions once and exposes list/find helpers for UI, HTTP, agent JSON, and agent tools. | `src/modules/actions/index.ts` |
| Action contract | Defines action schema, parameters, boundaries, surfaces, read/write classification, and agent descriptors. | `src/modules/common/action.ts` |
| Convex transport | Creates public/authenticated Convex HTTP clients and typed function references for source queries/mutations/actions. | `src/lib/server/convex-source.ts` |
| Source-write admission | Adds signed write-admission context to server functions and request-based action calls. | `src/lib/server/source-write-admission.ts` |
| Admission verifier | Creates and verifies HMAC source-write admission records. | `src/modules/security/source-write-admission.ts` |
| Convex schema composition | Composes table definitions from module-owned schema fragments plus business-action store tables. | `convex/schema.ts` |
| Convex auth | Configures Clerk-issued Convex JWT provider. | `convex/auth.config.ts` |
| Convex authz | Resolves owners/admins from Convex auth identity and admin membership rows. | `convex/authz.ts` |
| Registry source | Reads public business catalog pages, searches, details, Meilisearch fallback/primary, and legacy local fallback. | `src/modules/registry/registry.functions.ts` |
| Answer turn orchestrator | Streams answer events, routes follow-up intent, runs registry tools, gates prose, and persists turn evidence. | `src/modules/answer-thread/internal/turn-orchestrator.ts` |
| Tool runner | Validates read action tool inputs, executes registered read-only actions, extracts provider evidence, and hashes tool results. | `src/modules/answer-thread/internal/tool-runner.ts` |
| Inquiry source | Owns public inquiry and owner inbox/thread server functions over Convex source mutations/queries. | `src/modules/inquiries/inquiry.functions.ts` |
| Guardrail scanner | Enforces import boundaries, route boundaries, TypeScript standards, source-mining limits, and public-language rules. | `src/lib/ui/contract-scans.ts` |

## Pattern Overview

**Overall:** Modular monolith with route adapters, domain public seams, source ports, and Convex-backed persistence.

**Key Characteristics:**
- Route files in `src/routes/` stay thin: use `createFileRoute`, loaders/server handlers, local UI state, and module public/server functions such as `readRegistryRouteServer` in `src/routes/registry.tsx`.
- Domain code is split by module: `public.ts` exports contracts and approved functions, `internal/` contains private commands/schema/helpers, `*.functions.ts` exposes TanStack server functions and source ports, and `*.actions.ts` declares cross-surface actions.
- Convex table definitions live with modules and are composed in `convex/schema.ts`; Convex runtime functions in `convex/*.ts` import module contracts/commands to avoid duplicating business rules.
- Assistant-callable operations are action declarations, not ad hoc route handlers. `src/modules/actions/index.ts` is the registration point and `src/routes/api.agent.tools.ts` is the quiet invocation door.
- Writes use signed source-write admission from `src/lib/server/source-write-admission.ts`; Convex mutations verify the admission through `convex/sourceWriteAdmission.ts`.
- Tests encode architecture rules in `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and `tests/imports/ts-standards.test.ts`.

## Layers

**Application Bootstrap:**
- Purpose: Configure the full-stack runtime, middleware chain, router, document shell, and global providers.
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `vite.config.ts`
- Contains: TanStack Start middleware, route tree wiring, CSS entry, Clerk provider gating, observability boot.
- Depends on: `@tanstack/react-start`, `@tanstack/react-router`, `@clerk/tanstack-react-start`, `@sentry/*`, `src/lib/server/source-write-admission.ts`
- Used by: The Vite/Vinxi server and every route in `src/routes/`.

**Route Adapter Layer:**
- Purpose: Map URLs to loaders, server handlers, UI components, search-param validation, and response formats.
- Location: `src/routes/`
- Contains: Human pages (`src/routes/registry.tsx`, `src/routes/$slug.tsx`), owner/admin pages (`src/routes/owner.inquiries.tsx`, `src/routes/admin.claims.tsx`), API routes (`src/routes/api.businesses.search.ts`, `src/routes/api.answer.turn.ts`), discovery files (`src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`).
- Depends on: Module public seams and server functions in `src/modules/`, AE components in `src/components/ae/`, primitives in `src/components/ui/`.
- Used by: Browsers, assistants reading public APIs, Playwright tests, and answer/chat clients.

**Component Layer:**
- Purpose: Render reusable AE product surfaces and shared UI primitives.
- Location: `src/components/ae/`, `src/components/ui/`, `src/components/ai-elements/`, `src/components/animate/`
- Contains: Chat surfaces (`src/components/ae/chat/AeChat.tsx`), listing pages (`src/components/ae/listing/AeProviderListingPage.tsx`), registry cards (`src/components/ae/registry/AeRegistryCard.tsx`), inquiry UI (`src/components/ae/inquiries/`), operator shells (`src/components/ae/layout/AeOperatorShell.tsx`), shadcn/Radix primitives.
- Depends on: Route loader data, module contracts, `src/styles/globals.css`, `src/styles/tokens.css`, and component utilities in `src/lib/utils.ts`.
- Used by: Route components only; domain modules do not depend on components.

**Domain Module Layer:**
- Purpose: Own product/domain contracts, pure commands, schemas, validation, and module-level source adapters.
- Location: `src/modules/`
- Contains: Business/catalog/registry/inquiries/answer/billing/protected-action/business-action/security/observability modules.
- Depends on: Other modules through public seams only, common IDs/results/hash helpers in `src/modules/common/`, Zod, and server transport helpers when in `*.functions.ts`.
- Used by: Routes, Convex runtime functions, tests, and actions.

**Action Layer:**
- Purpose: Declare operations once for UI, HTTP, agent JSON, and agent-tools surfaces with explicit boundaries.
- Location: `src/modules/*/*.actions.ts`, `src/modules/actions/index.ts`, `src/modules/common/action.ts`
- Contains: `inquiry.submit`, `registry.search`, `registry.detail`, owner inquiry actions.
- Depends on: Module server/source functions and Zod schemas.
- Used by: `src/routes/api.agent.tools.ts`, the answer tool runner in `src/modules/answer-thread/internal/tool-runner.ts`, and future UI/HTTP surfaces.

**Source Transport Layer:**
- Purpose: Hide Convex HTTP transport, auth token handling, public vs authenticated source calls, and source-write admission.
- Location: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`
- Contains: `sourceQuery`, `sourceMutation`, `createPublicConvexClient`, `createAuthenticatedConvexClient`, admission middleware/helpers, provider boundary ports.
- Depends on: Clerk server auth, Convex HTTP client, security module admission helpers.
- Used by: Module `*.functions.ts` files such as `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/modules/answer-thread/answer-thread.functions.ts`.

**Persistence Layer:**
- Purpose: Persist public catalog, owner/admin state, inquiry threads, answer evidence, provider events, audit/readback data, and support records.
- Location: `convex/`, module table schemas under `src/modules/*/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `convex/businessActionStore.ts`
- Contains: Convex queries/mutations/actions, table definitions, authz, source state adapters.
- Depends on: Convex validators/server APIs, module public contracts, module pure commands.
- Used by: Source transport calls from server functions and public API routes.

**Evaluation and Guardrail Layer:**
- Purpose: Protect product contract, import boundaries, answer quality, public copy, UI contracts, and e2e flows.
- Location: `tests/`, `eval/answer/`, `src/lib/ui/contract-scans.ts`, `.github/workflows/eval-gate.yml`
- Contains: Unit/integration/e2e/a11y/copy/import/type/SEO tests plus promptfoo answer evaluations.
- Depends on: Vitest, Playwright, promptfoo, scanner helpers.
- Used by: Release scripts in `package.json`.

## Data Flow

### Primary Request Path

1. A browser posts an answer turn to `POST /api/answer/turn`; the route parses JSON, resolves the session cookie, checks rate limits, checks thread access, and opens an SSE response (`src/routes/api.answer.turn.ts:14`, `src/routes/api.answer.turn.ts:22`).
2. The route delegates to `streamAnswerTurn`, which trims the query, classifies follow-up intent, emits visible work-log events, and routes unsupported/boundary/frozen/search flows (`src/modules/answer-thread/internal/turn-orchestrator.ts:87`, `src/modules/answer-thread/internal/turn-orchestrator.ts:233`).
3. Search turns call `runAnswerToolCall` with `registry.search`; the tool runner verifies the tool id, finds the registered action, enforces read-only status, validates the action schema, and records a hashed evidence record (`src/modules/answer-thread/internal/tool-runner.ts:52`, `src/modules/registry/registry.actions.ts:90`).
4. `registry.search` calls `readPublicRegistrySearchPage`, which chooses Convex, dual Meilisearch shadowing, or Meilisearch primary with Convex fallback/hydration (`src/modules/registry/registry.functions.ts:79`).
5. Registry source reads use Convex public queries such as `registry:searchPublicBusinessCatalog` through `sourceQuery` and `callPublicSourceQuery`; Convex resolves public catalog DTOs from indexed tables (`src/lib/server/convex-source.ts:63`, `convex/registry.ts:201`).
6. The answer agent assembles grounded prose and artifacts from tool results, gates prose against allowed slugs, emits SSE events, and persists frozen evidence/tool calls through `answerThreads:appendAnswerTurnWithThreadAndToolCalls` (`src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `convex/answerThreads.ts`).
7. The client receives `thread`, `work`, `one-line`, source/artifact, and `complete` events and renders them through chat components in `src/components/ae/chat/`.

### Public Registry and Listing Flow

1. `/registry` validates search params, runs `readRegistryRouteServer`, and calls `loadRegistryRouteReadback` (`src/routes/registry.tsx:38`, `src/routes/registry.tsx:77`).
2. Empty queries call `readPublicRegistryCatalogPage`; non-empty queries call `readPublicRegistrySearchPage` (`src/routes/registry.tsx`).
3. API counterparts `GET /api/businesses`, `GET /api/businesses/search`, and `GET /api/businesses/$slug` call the same registry module functions and return no-store JSON (`src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`).
4. A public business page reads route-safe catalog data through `readPublicBusinessPageServer`, builds SEO, and renders `AeProviderListingPage` (`src/routes/$slug.tsx:11`, `src/modules/catalog/owner-claim.functions.ts`).

### Qualified Inquiry Flow

1. `/$slug/inquiry` loads a public business page and builds an inquiry route readback (`src/routes/$slug.inquiry.tsx:43`, `src/modules/inquiries/route-readbacks.ts`).
2. The client submits through `submitPublicInquiryServer`, a TanStack server function with Zod validation (`src/modules/inquiries/inquiry.functions.ts:249`).
3. `submitPublicInquiryThroughSource` creates operation/correlation ids, obtains source-write admission, and calls public Convex mutation `inquiries:submitPublicInquiry` (`src/modules/inquiries/inquiry.functions.ts:275`, `convex/inquiries.ts:548`).
4. Convex mutation logic validates target availability, CSRF/admission/rate limits, creates inquiry thread/message/notification rows, and returns a receipt using module inquiry commands (`convex/inquiries.ts`, `src/modules/inquiries/internal/commands.ts`).
5. Owner inbox and thread routes read the owner-scoped inbox/thread source and execute owner mutations through the same inquiry server functions (`src/routes/owner.inquiries.tsx:34`, `src/routes/owner.inquiries.$threadId.tsx:66`).

### Agent Tool Flow

1. `GET /api/agent/tools` maps `listAgentToolActions()` through `describeActionForAgent` and returns assistant-visible descriptors (`src/routes/api.agent.tools.ts:17`, `src/routes/api.agent.tools.ts:26`).
2. `POST /api/agent/tools` checks JSON content type, finds the action, enforces `agentTools` exposure, validates with the action schema, builds request/admission context, and calls `action.run` (`src/routes/api.agent.tools.ts:36`).
3. `inquiry.submit` is the only assistant-exposed write action; it uses the same inquiry source function as the public form and carries explicit booking/payment/dispatch refusal boundaries (`src/modules/inquiries/inquiry.actions.ts:79`).
4. `registry.search` and `registry.detail` are read-only agent tool actions and are also the tools used by the answer agent (`src/modules/registry/registry.actions.ts`).

**State Management:**
- Durable state lives in Convex tables composed by `convex/schema.ts`; module schema fragments define table ownership and indexes.
- Route loaders and server functions return readback DTOs instead of exposing Convex documents directly; examples are `PublicBusinessCatalogApiDto` in `src/modules/registry/public.ts` and owner inquiry readbacks in `src/modules/inquiries/public.ts`.
- Public answer sessions use a pseudonymous cookie managed in `src/modules/answer-thread/internal/session-cookie.ts`; answer turns and tool calls persist in `answerThreads`, `answerTurns`, and `answerToolCalls`.
- Short-lived in-memory state exists for API answer cache (`src/routes/api.answer.ts`), answer rate-limit buckets/idempotency (`src/modules/answer-thread/internal/turn-guard.ts`), once-only client funnel events (`src/lib/observability/funnel-client.ts`), and test ports such as `setPublicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts`.
- React component state is local to route/component interactions; durable mutations go through server functions and source ports.

## Key Abstractions

**Action:**
- Purpose: A single operation declaration shared by UI, HTTP, agent JSON, and agent-tools surfaces.
- Examples: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/registry/registry.actions.ts`
- Pattern: `defineAction({ id, schema, parameters, readOnly, surfaces, boundaries, run })`, then explicit registration in `src/modules/actions/index.ts`.

**Module Public Seam:**
- Purpose: Export domain contracts and approved operations while keeping implementation details in `internal/`.
- Examples: `src/modules/catalog/public.ts`, `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/answer/public.ts`
- Pattern: Routes and sibling modules import from `public.ts` or `*.functions.ts`, not `internal/`; guardrails enforce this in `src/lib/ui/contract-scans.ts`.

**Source Port / Transport:**
- Purpose: Make Convex, provider, and test transports swappable at module boundaries.
- Examples: `PublicRegistrySourcePort` in `src/modules/registry/registry.functions.ts`, `OwnerCatalogSourcePort` in `src/modules/catalog/owner-claim.functions.ts`, `ConvexSourceTransport` in `src/lib/server/convex-source.ts`
- Pattern: Module functions call a source port; test seams set a port; production uses Convex HTTP references.

**Source-Write Admission:**
- Purpose: Bind writes to method/origin/pathname plus scope/operation/correlation id using a server-only secret.
- Examples: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Pattern: TanStack server middleware injects request context; writes call `sourceWriteAdmissionFromContext` or `sourceWriteAdmissionFromRequest`; Convex mutations call `requireSourceWrite`.

**Readback Contract:**
- Purpose: Return route-safe, user/operator-safe projections with denial/error states instead of raw rows.
- Examples: `OwnerInboxReadback` in `src/modules/inquiries/public.ts`, `AdminShellReadback` in `src/modules/security/public.ts`, `PublicOwnerStatusRouteReadback` in `src/modules/catalog/public.ts`
- Pattern: Route components render readbacks and denial states directly; source hashes/private fields are redacted before public route return values.

**Public Catalog Contract:**
- Purpose: Canonical listing shape for public pages, registry API, discovery payloads, and assistant-readable data.
- Examples: `PublicCatalogContract` in `src/modules/catalog/public.ts`, `PublicBusinessCatalogApiDto` in `src/modules/registry/public.ts`, discovery manifest types in `src/modules/discovery/public.ts`
- Pattern: Business/catalog state becomes a public catalog; registry/discovery/SEO/answer flows consume the public shape.

**Answer Evidence:**
- Purpose: Freeze search evidence, tool inputs/results, generated prose, work log, timing, and artifacts per answer turn.
- Examples: `src/modules/answer-thread/answer-thread.schema.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `convex/answerThreads.ts`
- Pattern: Run tools before prose gating; persist the selected tool arguments and result summaries, not model claims alone.

**Convex Runtime State Adapter:**
- Purpose: Let Convex functions reuse pure module commands by loading/persisting table rows into module source-state objects.
- Examples: `convex/source_state.ts`, `convex/business.ts`, `convex/catalog.ts`, `convex/security.ts`
- Pattern: Load rows, call pure command, persist changed state; direct Convex table access stays inside `convex/`.

## Entry Points

**Runtime Bootstrap:**
- Location: `src/start.ts`
- Triggers: Vite/TanStack Start server startup.
- Responsibilities: Middleware order for observability, CSRF, source-write admission, and Clerk.

**Router:**
- Location: `src/router.tsx`
- Triggers: Client/server rendering.
- Responsibilities: Use generated route tree from `src/routeTree.gen.ts` and default not-found component.

**Root Document:**
- Location: `src/routes/__root.tsx`
- Triggers: Every route render.
- Responsibilities: HTML shell, global CSS, Clerk provider gating, error boundary, toaster, and scripts.

**Public Human Routes:**
- Location: `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/claim.tsx`
- Triggers: Browser navigation.
- Responsibilities: Chat, catalog discovery, public listing, qualified inquiry, and owner claim flows.

**Owner/Admin Routes:**
- Location: `src/routes/owner.*.tsx`, `src/routes/admin.*.tsx`
- Triggers: Authenticated owner/admin navigation.
- Responsibilities: Inquiries, status, protected actions, billing, business actions, audit/readback surfaces.

**Public JSON/API Routes:**
- Location: `src/routes/api.businesses*.ts`, `src/routes/api.answer*.ts`, `src/routes/api.discovery*.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`
- Triggers: Assistant/browser HTTP calls.
- Responsibilities: Public registry JSON, answer SSE/threads, discovery payloads, canonical assistant text index.

**Agent Tool Door:**
- Location: `src/routes/api.agent.tools.ts`
- Triggers: Assistant tool discovery/invocation requests.
- Responsibilities: List agent-exposed actions and invoke only actions whose `surfaces` include `agentTools`.

**Convex Functions:**
- Location: `convex/registry.ts`, `convex/catalog.ts`, `convex/business.ts`, `convex/inquiries.ts`, `convex/answerThreads.ts`, `convex/security.ts`
- Triggers: Convex HTTP client calls from source ports.
- Responsibilities: Public/authenticated source reads and writes over module-owned tables.

**Evaluation Scripts:**
- Location: `eval/answer/scripts/run-suite.ts`, `eval/answer/promptfooconfig.yaml`
- Triggers: `npm run test:eval` and `.github/workflows/eval-gate.yml`.
- Responsibilities: Answer pipeline quality and gate checks.

## Architectural Constraints

- **Threading:** Runtime code uses the JavaScript event loop. API streaming uses `ReadableStream`/SSE in `src/routes/api.answer.turn.ts` and `src/routes/api.chat.ts`. Convex queries/mutations run as Convex transactions; Convex actions are separate runtime functions when needed.
- **Global state:** Keep module-level mutable state narrow and documented. Existing globals include `answerCache` in `src/routes/api.answer.ts`, rate-limit/idempotency buckets in `src/modules/answer-thread/internal/turn-guard.ts`, test seam ports in `src/modules/registry/registry.functions.ts` and `src/modules/answer-thread/answer-thread.functions.ts`, and once-only funnel emission state in `src/lib/observability/funnel-client.ts`.
- **Circular imports:** Routes import module seams; module `internal/` files should not import routes/components. `convex/schema.ts` intentionally imports module schema fragments; `src/routeTree.gen.ts` is generated and imports route modules.
- **Auth:** Browser owner/admin identity comes from Clerk via `@clerk/tanstack-react-start`; Convex auth uses `convex/auth.config.ts`; source auth tokens are requested in `src/lib/server/convex-source.ts`.
- **Writes:** Source writes must carry source-write admission. Do not create write paths that bypass `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.
- **Public copy contract:** Human public surfaces must not imply booking, payment, dispatch, auto-fulfillment, unsupported verification, or internal architecture terms. The source of truth is `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md`.
- **Route boundaries:** Routes must not import `convex/browser`, `convex/server`, Convex schema, or module `internal/` files. `tests/imports/route-boundary.test.ts` and `src/lib/ui/contract-scans.ts` enforce this.
- **Module boundaries:** Sibling modules and routes use public seams. `tests/imports/private-imports.test.ts` enforces no imports from `src/modules/*/internal/*` across boundaries.
- **Convex code:** Read `convex/_generated/ai/guidelines.md` before modifying Convex functions. Convex functions require validators and should prefer indexed reads.
- **Generated files:** Do not hand-edit `src/routeTree.gen.ts` or `convex/_generated/`; regenerate with the owning tools.

## Anti-Patterns

### Route-Owned Source Access

**What happens:** A route imports Convex transport, Convex schema, or a module `internal/` file.
**Why it's wrong:** It bypasses module readbacks, validation, redaction, source ports, and architecture tests.
**Do this instead:** Put source work in a module server/source function such as `src/modules/registry/registry.functions.ts` or `src/modules/inquiries/inquiry.functions.ts`, then call it from the route. The guardrail lives in `src/lib/ui/contract-scans.ts` and `tests/imports/route-boundary.test.ts`.

### Unregistered Assistant Operation

**What happens:** A new assistant-facing operation is implemented as a one-off API route or local tool wrapper.
**Why it's wrong:** The operation will not have a shared schema, `readOnly` classification, surfaces, parameters, or boundary-honest summary.
**Do this instead:** Define the operation in `src/modules/<module>/<module>.actions.ts`, register it in `src/modules/actions/index.ts`, and expose it through `src/routes/api.agent.tools.ts` only when `surfaces` includes `agentTools`.

### Source Write Without Admission

**What happens:** A write server function or API handler calls a Convex mutation without signed source-write context.
**Why it's wrong:** The mutation loses its request-origin/path/scope proof and can bypass replay/correlation controls.
**Do this instead:** Use `sourceWriteAdmissionFromContext` for TanStack server functions or `sourceWriteAdmissionFromRequest` for request handlers, then verify in Convex with `convex/sourceWriteAdmission.ts`.

### Public Surface Leaking Internal Contract Language

**What happens:** Public route copy mentions internal terms such as `source-owned`, `readback`, `manifest`, `MCP`, `callable`, or `autonomous`.
**Why it's wrong:** The product contract requires public human surfaces to express boundaries plainly without protocol or implementation vocabulary.
**Do this instead:** Keep internal vocabulary in JSON, `llms.txt`, agent payloads, owner/admin surfaces, and tests. Public copy rules are documented in `AGENTS.md`, `PRODUCT.md`, and scanned through `src/lib/ui/contract-scans.ts`.

## Error Handling

**Strategy:** Return explicit typed results at module boundaries, translate source/validation failures into route-safe errors, and keep public answers inside known boundaries.

**Patterns:**
- Domain commands return `kind: 'ok'` / `kind: 'error'` unions using helpers in `src/modules/common/result.ts`.
- Actions validate input with Zod schemas before running module functions (`src/modules/common/action.ts`, `src/routes/api.agent.tools.ts`).
- API routes return JSON error bodies or SSE error events without throwing internal details (`src/routes/api.answer.turn.ts`, `src/routes/api.agent.tools.ts`).
- Source functions catch Convex/auth/admission errors and return module error results such as `ownerSourceError` and `inquirySourceError` in `src/modules/inquiries/inquiry.functions.ts`.
- Registry search falls back from Meilisearch to Convex when configured and permitted (`src/modules/registry/registry.functions.ts`).
- Observability middleware captures server exceptions and flushes PostHog/Sentry state (`src/start.ts`).

## Cross-Cutting Concerns

**Logging:** Server errors go through Sentry/PostHog middleware in `src/start.ts` and observability helpers in `src/lib/observability/`; durable audit/funnel rows live in `src/modules/observability/internal/schema.ts` and `convex/observability.ts`.

**Validation:** Routes use TanStack `validateSearch` and Zod server-function validators; actions use Zod schemas; Convex functions use Convex validators; TypeScript strictness is configured in `tsconfig.json`.

**Authentication:** Clerk wraps protected route families in `src/routes/__root.tsx`, request middleware installs Clerk in `src/start.ts`, server functions use `auth()` or Convex tokens through `src/lib/server/convex-source.ts`, and Convex authz resolves authority in `convex/authz.ts`.

**Authorization:** Owner/admin reads and writes are checked in Convex and domain commands (`convex/authz.ts`, `src/modules/security/public.ts`, `src/modules/inquiries/public.ts`); agent tools expose only actions whose surface includes `agentTools`.

**Search:** Public search defaults to Convex and can use Meilisearch through `src/modules/registry/internal/catalog-search-port.ts`; tool-use answer search executes the registered `registry.search` action.

**Source Integrity:** Operation keys, audit events, source hashes, readbacks, source-write admission, and projection attempts are first-class records across `src/modules/observability/`, `src/modules/security/`, `src/modules/registry/`, and Convex tables.

**UI Contract:** Visual and copy constraints live in `DESIGN.md`, `PRODUCT.md`, `AGENTS.md`, `src/styles/tokens.css`, `tests/copy/`, and `tests/ui-contract/`.

---

*Architecture analysis: 2026-07-01*
