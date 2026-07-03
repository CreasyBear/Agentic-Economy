<!-- refreshed: 2026-07-03 -->
# Architecture

**Analysis Date:** 2026-07-03

## System Overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                         TanStack Start Route Layer                         │
│ `src/start.ts` + `src/router.tsx` + `src/routes/*` + `src/routeTree.gen.ts` │
├──────────────────────────┬──────────────────────────┬──────────────────────┤
│ Public human surfaces    │ Owner/admin/developer    │ Machine/API surfaces │
│ `/`, `/registry`,        │ `/owner/*`, `/admin/*`,  │ `/api/*`,            │
│ `/$slug`, `/t/$threadId` │ `/developers/*`          │ `/llms.txt`, UCP     │
└─────────────┬────────────┴────────────┬─────────────┴──────────┬───────────┘
              │                         │                        │
              ▼                         ▼                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         UI / Route Adapter Layer                           │
│ `src/components/ae/*`, `src/components/ai-elements/*`, `src/lib/ui/*`       │
│ Astryx primitives, AE shells, cards, chat, operator readbacks, route glue   │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         Module Boundary Layer                              │
│ `src/modules/*/public.ts`, `*.functions.ts`, `*.actions.ts`, `internal/*`  │
├──────────────────────┬───────────────────────┬─────────────────────────────┤
│ Domain contracts     │ Source/server seams    │ Explicit action registry    │
│ result unions        │ Zod + `createServerFn` │ `src/modules/actions`       │
└────────────┬─────────┴──────────┬────────────┴───────────────┬─────────────┘
             │                    │                            │
             ▼                    ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         OMP-Gold Harness Kernel                            │
│ `src/modules/harness/*` + answer bridge in `src/modules/answer-thread/*`   │
│ action→tool contracts, approval policy, run loop, evidence, replay, journal │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          Convex Source State                               │
│ `convex/schema.ts`, `convex/*.ts`, module-owned schema fragments            │
│ answer threads, catalog/registry, inquiries, harness sessions, billing,     │
│ protected actions, business actions, notification outbox, audit/security    │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         Provider Boundary Layer                            │
│ Clerk auth, Convex HTTP, Sentry/PostHog, Resend/Novu, Autumn/Stripe,        │
│ optional Meilisearch catalog search                                         │
└────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start bootstrap | Orders request middleware for observability, CSRF, source-write admission, and Clerk. | `src/start.ts` |
| Router factory | Builds the generated route tree with intent preloading, scroll restoration, and AE not-found chrome. | `src/router.tsx`, `src/routeTree.gen.ts` |
| Root route | Owns document metadata, global CSS, Astryx `Theme`, `LinkProvider`, `LayerProvider`, optional Clerk wrapper, observability boot, error boundary, toaster, and `<Outlet />`. | `src/routes/__root.tsx` |
| Public home | Validates `?q=`, loads featured catalog entries when no query is present, and switches to chat when a query is present. | `src/routes/index.tsx`, `src/components/ae/chat/AeChat.tsx` |
| Public registry | Validates search params, reads catalog/search pages through the registry source seam, and renders an Astryx card-grid registry. | `src/routes/registry.tsx`, `src/modules/registry/registry.functions.ts` |
| Public listing | Loads a published business page, builds SEO/JSON-LD, computes inquiry affordance, and exposes the agent JSON URL. | `src/routes/$slug.tsx`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/seo/public.ts` |
| Public inquiry | Validates the human inquiry form, calls the inquiry server seam, and presents a first-contact receipt. | `src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/inquiry.functions.ts` |
| Thread route | Loads a public thread projection and SEO, then reuses `AeChat` for replay/share. | `src/routes/t.$threadId.tsx`, `src/modules/answer-thread/public.ts` |
| Answer turn API | Resolves the anonymous session, validates a turn request, rate-limits, checks thread access, streams SSE frames, and delegates orchestration. | `src/routes/api.answer.turn.ts` |
| Answer turn orchestrator | Classifies intent, plans layout, chooses clarification/boundary/frozen/retrieval paths, calls answer tools, emits events, and persists turns. | `src/modules/answer-thread/internal/turn-orchestrator.ts` |
| Answer tool runner | Adapts registered read actions into harness tools and refuses unknown or write tools in the public answer loop. | `src/modules/answer-thread/internal/tool-runner.ts` |
| Answer finalization bridge | Builds frozen evidence, answer artifacts, answer run data, harness run reports, and harness session journal entries before persistence. | `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/modules/answer-thread/internal/answer-harness-operation.ts` |
| Answer thread source seam | Maps answer-thread operations to Convex queries/mutations and exposes test ports. | `src/modules/answer-thread/answer-thread.functions.ts`, `convex/answerThreads.ts` |
| Action registry | Registers machine-callable AE actions explicitly; no module-eval side effects are used. | `src/modules/actions/index.ts` |
| Action contract | Defines action shape, surfaces, schemas, boundaries, source-write declarations, and agent descriptors. | `src/modules/common/action.ts` |
| Harness tool contract | Converts actions to strict JSON-schema tool contracts and limits quiet-agent vs answer-model exposure. | `src/modules/harness/tool-contract.ts` |
| Quiet agent door | Lists/invokes assistant-callable actions through the harness contract. | `src/routes/api.agent.tools.ts` |
| Harness run loop | Executes schema-first tool/model phases with approval, timeouts, aborts, telemetry, and run reports. | `src/modules/harness/run-loop.ts`, `src/modules/harness/action-tool.ts` |
| Harness session seam | Persists append-only harness session entries, replays idempotent entries, and exposes public/admin projections. | `src/modules/harness/harness.functions.ts`, `convex/harnessSessions.ts`, `src/modules/harness/internal/convex-schema.ts` |
| Operator route guard | Applies signed-in admission and shared pending/error chrome to `/owner/*`, `/admin/*`, and `/developers/*`. | `src/lib/operator/route-options.ts`, `src/lib/server/require-operator-session.ts` |
| Owner inquiry console | Reads owner inbox/thread state and writes owner replies/read/close events through the inquiry source seam. | `src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, `src/modules/inquiries/inquiry.functions.ts` |
| Admin readbacks | Render admin reconstructions for inquiries, protected actions, business actions, billing, run evidence, claims, audit, and index health. | `src/routes/admin.*.tsx`, `src/components/ae/readback/AeAdminReadbackPanel.tsx`, `src/components/ae/harness/AeHarnessRunViewer.tsx` |
| Source write admission | Creates HMAC-bound scope/operation/correlation admissions for browser/server writes. | `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts` |
| Convex transport | Creates public/authenticated Convex HTTP clients and type-safe function references. | `src/lib/server/convex-source.ts` |
| Convex schema composition | Imports module-owned table fragments and composes the source-state schema. | `convex/schema.ts`, `src/modules/*/internal/*schema*.ts` |
| Convex authority | Derives business actors and admin authority from Convex auth identity and admin membership rows. | `convex/authz.ts`, `convex/auth.config.ts` |
| Discovery/SEO | Projects public catalog state into `llms.txt`, UCP JSON, sitemap/robots, schema examples, and thread/business metadata. | `src/modules/discovery/*`, `src/modules/seo/public.ts`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts` |
| Provider adapters | Isolate provider verification, dispatch, and readbacks from route/domain logic. | `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`, `src/modules/registry/internal/catalog-search-port.ts` |

## Pattern Overview

**Overall:** Modular TanStack Start application with Convex source state, explicit action registration, and a reusable harness/evidence control plane.

**Key Characteristics:**
- Treat `src/routes/*` as thin adapters: validate params/search/body, call a module seam, render UI or return JSON/SSE.
- Keep domain ownership in `src/modules/<domain>/`: public contracts in `public.ts`, server/source boundaries in `*.functions.ts`, action-backed machine operations in `*.actions.ts`, private implementation in `internal/*`.
- Persist durable state in Convex through `convex/*.ts` and table fragments imported by `convex/schema.ts`.
- Expose assistant-callable operations only through registered actions and harness filters in `src/modules/actions/index.ts` and `src/modules/harness/tool-contract.ts`.
- Preserve AE's trust contract: AE reads, compares, summarizes, routes, and records first-contact inquiries; it does not book, charge, dispatch, or auto-fulfill.
- Public projections are allowlists. Private evidence and provider payloads stay behind owner/admin/source seams.

## Project Guidance Constraints

**Product boundary:**
- Use `AGENTS.md`, `PRODUCT.md`, and `.agents/skills/submit-qualified-inquiry/SKILL.md` as the safe-contract boundary. Public code must not imply AE books, charges, dispatches, guarantees availability, or autonomously fulfills work.
- `inquiry.submit` records one human first-contact message and returns a receipt; timing, quote, scope, and availability remain business-owner decisions.
- Billing, protected action, and business-action routes are operator/source readbacks. Do not describe payment/platform capabilities as live public marketplace behavior unless the route/source code provides that behavior.

**Skill-defined patterns:**
- `.codex/agents/gsd-codebase-mapper.md` requires path-specific, prescriptive, current-state maps in `.planning/codebase/`.
- `.codex/skills/tanstack-start/SKILL.md` emphasizes `createServerFn`, input validation, middleware ordering, auth checks, CSRF, and server/client file separation.
- `.codex/skills/tanstack-router/SKILL.md` emphasizes file routes, validated search params, loaders, route error/not-found handling, and typed route registration.
- `.agents/skills/convex/SKILL.md` routes Convex work through official Convex AI guidance; read `convex/_generated/ai/guidelines.md` before changing Convex code.
- `.agents/skills/ai-elements/SKILL.md` places local AI UI primitives under `src/components/ai-elements/` and composes them as project-owned code.
- `.agents/skills/ui-craft/SKILL.md` treats `.ui-craft/brief.md`, `.ui-craft/tokens.md`, `DESIGN.md`, and `src/styles/tokens.css` as UI/design context.

## Layers

**Route/UI Layer:**
- Purpose: Own URL shape, route validation, loaders, SSR metadata, public/owner/admin shells, and React rendering.
- Location: `src/routes/`, `src/components/ae/`, `src/components/ai-elements/`, `src/components/astryx/`, `src/styles/`.
- Contains: TanStack file routes, API route handlers, `AePublicShell`, `AeOperatorShell`, chat/thread components, registry/listing cards, inquiry forms, operator panels, Astryx link bridge.
- Depends on: Module public/server seams, `@tanstack/react-router`, `@tanstack/react-start`, React, Astryx, Tailwind CSS utilities, `src/lib/ui/*`.
- Used by: Browser users, owner/admin/developer operators, external API callers.

**Domain Module Layer:**
- Purpose: Own domain contracts, pure business operations, result unions, projections, and invariants.
- Location: `src/modules/*/public.ts`, `src/modules/*/internal/*.ts`.
- Contains: `answer`, `answer-thread`, `billing`, `business`, `business-action`, `catalog`, `discovery`, `harness`, `inquiries`, `notification-outbox`, `observability`, `protected-action`, `registry`, `security`, `seo`, and shared `common` helpers.
- Depends on: Module-local internals, `src/modules/common/*`, selected public seams from sibling modules.
- Used by: Route loaders, server functions, action runners, Convex functions, tests.

**Source/Server Seam Layer:**
- Purpose: Bind route/server functions to Convex source queries/mutations and local test/E2E ports.
- Location: `src/modules/*/*.functions.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`.
- Contains: `createServerFn` wrappers, Zod input schemas, `sourceQuery`/`sourceMutation` refs, Convex HTTP calls, source error normalization, source-write admission calls, local E2E fallbacks.
- Depends on: Convex HTTP client, Clerk server auth, source-write admission, module public contracts.
- Used by: `src/routes/*`, actions, owner/admin panels.

**Action Layer:**
- Purpose: Declare public machine operations once for UI, HTTP, agent JSON, quiet agent tools, and harness conversion.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Contains: `ActionDefinition`, surfaces, parameters, boundaries, Zod schemas, `run` implementations.
- Depends on: Domain server seams and `@tanstack/ai` JSON schema conversion.
- Used by: `/api/agent/tools`, answer tool runner, harness tool descriptors, tests.

**Harness / Evidence Layer:**
- Purpose: Provide schema-first tool contracts, approval policy, run-loop telemetry, evidence envelopes, replay projections, session journaling, and admin evidence readbacks.
- Location: `src/modules/harness/*`, answer bridge files in `src/modules/answer-thread/internal/*harness*`.
- Contains: `HarnessRunLoop`, `ActionHarnessTool`, `HarnessToolContract`, approval policies, emission guard, protected evidence classification, session journal, replay projection, run-viewer projection.
- Depends on: Actions, strict schemas, stable hashing, source-write policy.
- Used by: Answer tool runner, quiet agent-tools route, answer finalization, Convex harness sessions, admin run viewer.

**Convex Runtime Layer:**
- Purpose: Persist source-owned state and enforce server-derived authority.
- Location: `convex/*.ts`, `convex/schema.ts`, `src/modules/*/internal/convex-schema.ts`, `src/modules/*/internal/schema.ts`.
- Contains: Convex queries/mutations/internal mutations, validators, table schemas, indexes, auth config, crons, source-state row adapters.
- Depends on: Convex validators, module public contracts, `convex/authz.ts`.
- Used by: `src/lib/server/convex-source.ts` and deployed source reads/writes.

**Provider Boundary Layer:**
- Purpose: Isolate provider-specific verification, dispatch, telemetry, and search backends.
- Location: `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`, `src/lib/observability/*`, `src/modules/registry/internal/catalog-search-port.ts`, webhook routes in `src/routes/api.*webhook.ts`.
- Contains: Provider payload verification, redacted readbacks, webhook admission, dispatch adapters, optional Meilisearch catalog search, Sentry/PostHog boot.
- Depends on: Provider SDKs/APIs and env var names; secret values are not documented or read.
- Used by: Billing webhooks, business-action Stripe webhook, notification dispatch/webhook routes, observability middleware, registry search.

## Data Flow

### Public Answer Turn

1. Browser submits a turn to `POST /api/answer/turn` (`src/routes/api.answer.turn.ts:22`).
2. The handler resolves or creates `ae_session`, parses `answerTurnRequestSchema`, rate-limits, checks thread access, and opens an SSE stream (`src/routes/api.answer.turn.ts:23`, `src/routes/api.answer.turn.ts:32`, `src/routes/api.answer.turn.ts:38`, `src/routes/api.answer.turn.ts:45`).
3. `streamAnswerTurn` classifies intent, emits work steps, selects clarification/boundary/frozen/retrieval paths, and emits answer events (`src/modules/answer-thread/internal/turn-orchestrator.ts:133`).
4. Retrieval calls use `runAnswerToolCall`, which looks up the registered action and adapts it to a harness tool (`src/modules/answer-thread/internal/tool-runner.ts:56`, `src/modules/actions/index.ts:39`).
5. Public answer-model tools are limited to `registry.search` and `registry.detail` (`src/modules/harness/tool-contract.ts:31`).
6. Registry retrieval runs through `registrySearchAction`, `readPublicRegistrySearchPage`, and Convex-backed registry source refs (`src/modules/registry/registry.actions.ts:230`, `src/modules/registry/registry.functions.ts:79`, `src/modules/registry/registry.functions.ts:35`).
7. `persistAnswerTurnWithResult` builds frozen evidence/artifacts and writes turn rows/tool rows (`src/modules/answer-thread/internal/answer-turn-finalization.ts:119`).
8. `appendAnswerTurnWithThreadAndToolCalls` persists through Convex (`src/modules/answer-thread/answer-thread.functions.ts:161`, `convex/answerThreads.ts:183`).
9. `/t/$threadId` renders from the public projection and SEO builder, not private harness evidence (`src/routes/t.$threadId.tsx:61`, `convex/answerThreads.ts:410`).

### Registry / Public Listing

1. `/registry` validates `q`, `limit`, and `cursor` search params (`src/routes/registry.tsx:59`).
2. `readRegistryRouteServer` validates input with Zod and calls `loadRegistryRouteReadback` (`src/routes/registry.tsx:49`, `src/routes/registry.tsx:81`).
3. Empty queries use `readPublicRegistryCatalogPage`; non-empty queries use `readPublicRegistrySearchPage` (`src/routes/registry.tsx:82`).
4. `readPublicRegistrySearchPage` selects the configured search backend and filters smoke catalogs before returning public DTOs (`src/modules/registry/registry.functions.ts:79`, `src/modules/registry/registry.functions.ts:247`).
5. Convex registry queries hydrate published businesses, service catalogs, capabilities, registry attempts, and index status (`convex/registry.ts:194`, `convex/registry.ts:419`, `convex/registry.ts:616`).
6. `/$slug` reads the public business page through `readPublicBusinessPageServer`, builds SEO, computes inquiry affordance, and renders `AeProviderListingPage` (`src/routes/$slug.tsx:16`, `src/routes/$slug.tsx:87`).

### Qualified Inquiry

1. `/$slug/inquiry` loads a route readback and uses `submitPublicInquiryServer` for POST submission (`src/routes/$slug.inquiry.tsx:42`, `src/routes/$slug.inquiry.tsx:44`).
2. `submitPublicInquiryServer` validates `publicInquirySubmitSchema` and delegates to `submitPublicInquiryThroughSource` (`src/modules/inquiries/inquiry.functions.ts:249`, `src/modules/inquiries/inquiry.functions.ts:275`).
3. `submitPublicInquiryThroughSource` creates operation/correlation identifiers, compacts private contact input, and obtains source-write admission (`src/modules/inquiries/inquiry.functions.ts:275`, `src/modules/inquiries/inquiry.functions.ts:727`).
4. `sourceWriteAdmissionFromContext` signs scope/operation/correlation/request context (`src/lib/server/source-write-admission.ts:33`).
5. Convex `inquiries:submitPublicInquiry` validates the target, writes the thread/message/notification/audit/funnel state, and returns a receipt or stable error (`convex/inquiries.ts:601`).
6. Owner inbox/thread routes use `operatorRouteOptions`, then read/mutate through owner-authenticated source functions (`src/routes/owner.inquiries.tsx:35`, `src/modules/inquiries/inquiry.functions.ts:253`, `src/modules/inquiries/inquiry.functions.ts:263`).

### Quiet Agent Tools

1. `GET /api/agent/tools` lists quiet-agent descriptors (`src/routes/api.agent.tools.ts:32`).
2. `listAgentToolActions` filters registered actions whose `surfaces` include `agentTools` (`src/modules/actions/index.ts:35`).
3. `buildHarnessToolContracts` maps actions into contracts and `filterQuietAgentToolContracts` limits exposure to `registry.search`, `registry.detail`, and `inquiry.submit` (`src/modules/harness/tool-contract.ts:25`, `src/modules/harness/tool-contract.ts:305`, `src/modules/harness/tool-contract.ts:311`).
4. `POST /api/agent/tools` validates tool identity/schema and runs it through `runHarnessTool` (`src/routes/api.agent.tools.ts:43`, `src/modules/harness/action-tool.ts:57`).
5. The quiet agent write surface still runs through action boundaries and source-write declarations; do not call Convex inquiry mutations directly from machine routes.

### Owner/Admin Operator Surfaces

1. Operator routes spread `operatorRouteOptions`, which provides `beforeLoad`, pending chrome, and error chrome (`src/lib/operator/route-options.ts:10`).
2. `requireOperatorBeforeLoad` redirects unauthenticated users to `/sign-in/$` and allows local E2E bypass only outside production (`src/lib/server/require-operator-session.ts:7`, `src/lib/server/require-operator-session.ts:33`).
3. Role-specific navigation comes from `src/lib/operator/navigation.ts` and shell layout components under `src/components/ae/layout/`.
4. Owner surfaces read/write through owner source seams such as `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/business-action/business-action.functions.ts`, and `src/modules/billing/billing.functions.ts`.
5. Admin surfaces use reconstruction/readback server seams and Convex admin authority checks; route chrome does not replace source authority (`convex/authz.ts:50`, `src/routes/admin.runs.tsx:15`, `src/routes/admin.business-actions.tsx:99`).

### Convex Source Composition

1. Module table fragments export tables from `src/modules/*/internal/convex-schema.ts` or `src/modules/*/internal/schema.ts`.
2. `convex/schema.ts` imports fragments for answer threads, billing, business actions, business, catalog, registry, discovery, harness, inquiries, notification outbox, protected actions, observability, and security (`convex/schema.ts:3`, `convex/schema.ts:17`).
3. Server seams create `sourceQuery`/`sourceMutation` references by string name and call them through public/authenticated Convex transports (`src/lib/server/convex-source.ts:63`, `src/lib/server/convex-source.ts:81`, `src/lib/server/convex-source.ts:143`).
4. Convex functions map runtime rows back into module contracts and enforce identity/authority inside Convex (`convex/authz.ts:35`, `convex/authz.ts:50`).
5. Generated Convex API files under `convex/_generated/*` are consumed by tooling and not edited by hand.

**State Management:**
- Durable source state lives in Convex tables composed by `convex/schema.ts`.
- Public answer sessions use the `ae_session` HttpOnly cookie from `src/modules/answer-thread/internal/session-cookie.ts`.
- Answer turn rate limits/idempotency are process-local in `src/modules/answer-thread/internal/turn-guard.ts`; durable records belong in Convex.
- Module-local test ports exist in seams such as `src/modules/registry/registry.functions.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, and `src/modules/harness/run-viewer.functions.ts`.
- Generated files `src/routeTree.gen.ts` and `convex/_generated/*` are artifacts, not implementation seams.

## Key Abstractions

**ActionDefinition:**
- Purpose: One operation declaration for UI, HTTP, agent JSON, quiet agent tools, and harness conversion.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Pattern: Zod input/output schemas, explicit `surfaces`, public `parameters`, safe `boundaries`, optional source-write declaration, and shared `run` implementation.

**HarnessToolContract / HarnessRunLoop:**
- Purpose: Schema-first tool execution with approval policy, timing, aborts, telemetry, tool/model phases, and run reports.
- Examples: `src/modules/harness/tool-contract.ts`, `src/modules/harness/action-tool.ts`, `src/modules/harness/run-loop.ts`.
- Pattern: Convert registered actions to tool contracts; filter by quiet-agent or answer-model allowlist; run reads automatically; gate writes with policy/source-write admission.

**AnswerThread / AnswerTurn / AnswerToolCall:**
- Purpose: Thread-first public answer persistence with frozen evidence, tool-call rows, and shareable projection.
- Examples: `src/modules/answer-thread/answer-thread.schema.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `convex/answerThreads.ts`.
- Pattern: Store thread metadata, query, intent, status, one-line/prose/artifacts, evidence JSON, timing, work-log, and per-tool evidence summaries.

**PublicBusinessCatalogApiDto:**
- Purpose: Public allowlisted catalog DTO for registry, listing pages, agent tools, and answer cards.
- Examples: `src/modules/registry/public.ts`, `src/modules/registry/internal/search.ts`, `convex/registry.ts`.
- Pattern: Include published business/service/capability fields and discovery/index status; omit private owner/contact/source internals.

**SourceWriteAdmission:**
- Purpose: Browser/server write gate for consequential source mutations.
- Examples: `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`.
- Pattern: Scope + operation + correlation + method/origin/path signed server-side and verified at source mutation boundaries.

**Readback Projection:**
- Purpose: Owner/admin UI receives operational truth without public leakage of private rows/provider payloads.
- Examples: `src/modules/inquiries/route-readbacks.ts`, `src/modules/billing/owner-billing.readback.ts`, `src/modules/harness/internal/run-viewer-projection.ts`.
- Pattern: Source seam returns a result union/readback DTO; UI renders allowed/denied/error/not-found states and repair actions.

**Convex Schema Fragment:**
- Purpose: Keep table ownership near domain modules while composing one Convex schema root.
- Examples: `src/modules/harness/internal/convex-schema.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `src/modules/registry/internal/schema.ts`, `convex/schema.ts`.
- Pattern: Module exports `*Tables`; `convex/schema.ts` imports and spreads all fragments.

## Entry Points

**Application Bootstrap:**
- Location: `src/start.ts`
- Triggers: TanStack Start runtime.
- Responsibilities: Request middleware ordering for observability, CSRF, source-write admission, and Clerk.

**Router:**
- Location: `src/router.tsx`, `src/routeTree.gen.ts`
- Triggers: TanStack Router.
- Responsibilities: Route tree, preload behavior, scroll restoration, default not-found component, global route typing.

**Root Document:**
- Location: `src/routes/__root.tsx`
- Triggers: Every rendered route.
- Responsibilities: Head tags, global stylesheet, Astryx providers, Clerk provider scope, observability/error/toast chrome.

**Public Home / Chat:**
- Location: `src/routes/index.tsx`, `src/components/ae/chat/AeChat.tsx`
- Triggers: `/` and optional `?q=`.
- Responsibilities: Show landing/featured listings or start a thread-first answer turn.

**Public Catalog / Listing / Inquiry:**
- Location: `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`
- Triggers: Human browse/detail/inquiry flows.
- Responsibilities: Read published catalog state, render comparable listing cards, submit first-contact inquiry when offered.

**Machine Read Surfaces:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/api.discovery.*.ts`
- Triggers: HTTP GET.
- Responsibilities: Public catalog/search/detail JSON, assistant text index, UCP manifest, schema/fixture/example projections.

**Answer APIs:**
- Location: `src/routes/api.answer.turn.ts`, `src/routes/api.answer.threads.ts`, `src/routes/api.answer.threads.$threadId.ts`, `src/routes/api.answer.follow-up-chips.ts`, `src/routes/t.$threadId.tsx`
- Triggers: SSE turn POST, thread list/detail GET, follow-up chips GET, thread route.
- Responsibilities: Thread-first answer persistence, replay, and deterministic follow-up affordances.

**Compatibility Answer/Chat APIs:**
- Location: `src/routes/api.answer.ts`, `src/routes/api.chat.ts`, `src/routes/api.chat.models.ts`
- Triggers: HTTP answer/chat callers and non-production or explicitly enabled chat API.
- Responsibilities: Snapshot/stream compatibility surfaces, model selector data, and OpenRouter-backed chat when enabled.

**Quiet Agent Tools:**
- Location: `src/routes/api.agent.tools.ts`
- Triggers: Assistant GET/POST.
- Responsibilities: List assistant-callable tools and invoke registered actions through harness execution.

**Owner/Admin/Developer Consoles:**
- Location: `src/routes/owner.*.tsx`, `src/routes/admin.*.tsx`, `src/routes/developers.discovery.tsx`
- Triggers: Signed-in operator navigation.
- Responsibilities: Owner inbox/actions/billing/status, admin reconstruction/health/run evidence, developer discovery readback.

**Provider Webhooks/Dispatch:**
- Location: `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/routes/api.notification.*.ts`, `src/routes/api.observability.funnel.ts`
- Triggers: Provider callbacks, internal dispatch/readback calls, funnel capture.
- Responsibilities: Verify/admit provider events, record redacted evidence/readbacks, route through source seams.

**Convex Functions:**
- Location: `convex/*.ts`
- Triggers: Convex HTTP client calls and scheduled jobs.
- Responsibilities: Durable queries/mutations, auth-derived authority, source-write verification, table/index access.

## Architectural Constraints

- **Threading:** TanStack Start/Nitro and Convex code run on JavaScript event-loop runtimes. Answer streaming uses server-side `ReadableStream` SSE; no worker-thread architecture is present in mapped source.
- **Route direction:** Preserve route → public module/server seam → module internal/domain → Convex/source direction. Avoid importing route code from modules.
- **Convex transactions:** Convex queries/mutations must use validators and index-aware reads. Owner/admin authority comes from Convex auth/rows via `convex/authz.ts`, not browser payloads.
- **Global state:** Module-local test ports and in-memory rate limits exist in `src/modules/answer-thread/internal/turn-guard.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, and `src/modules/harness/run-viewer.functions.ts`. Durable runtime state belongs in Convex.
- **Generated code:** Do not edit `src/routeTree.gen.ts`, `convex/_generated/api.*`, `convex/_generated/server.*`, or `convex/_generated/dataModel.*` by hand.
- **Reference app pages:** `src/app/ai-chat/page.tsx`, `src/app/ai-chat-landing/page.tsx`, and `src/app/library/page.tsx` are Next-style Astryx reference pages, not TanStack Start route entries. Production routes belong under `src/routes/*`.
- **Action registration:** New assistant/UI/HTTP operations must be defined in `src/modules/*/*.actions.ts` and imported into `src/modules/actions/index.ts` when they are action-backed.
- **Tool exposure:** Public answer tools remain `registry.search` and `registry.detail`; quiet agent tools are `registry.search`, `registry.detail`, and `inquiry.submit`.
- **Public copy boundary:** Public human surfaces must avoid internal/protocol vocabulary and unsupported booking/payment/dispatch claims.
- **Admin source reads:** Admin routes require server/Convex authority checks. UI route guards only establish signed-in operator admission.
- **Circular imports:** No circular chain is documented in the mapped architecture. Keep shared primitives in `src/modules/common/*` or `src/lib/*` instead of cross-importing route/UI code.

## Anti-Patterns

### Route-Owned Business Logic

**What happens:** A route owns a domain state machine, provider SDK call, source mutation, or Convex row mapping.
**Why it's wrong:** It bypasses shared result unions, test ports, source-write admission, and owner/admin authority rules.
**Do this instead:** Put logic in `src/modules/<module>/public.ts` or `src/modules/<module>/<module>.functions.ts`, then let `src/routes/*` call that seam.

### Unregistered Machine Operations

**What happens:** A new assistant/API/UI operation is callable but not declared with `defineAction` or imported into `src/modules/actions/index.ts` when it should be action-backed.
**Why it's wrong:** UI, HTTP, agent JSON, quiet-agent tools, and harness descriptors drift.
**Do this instead:** Define an action in `src/modules/<module>/<module>.actions.ts`, include schemas/boundaries/surfaces, and register it in `src/modules/actions/index.ts`.

### Hidden Retrieval In Answer Synthesis

**What happens:** Answer prose names providers from route-local helpers, fixtures, or unrecorded lookups.
**Why it's wrong:** Provider artifacts must be backed by persisted tool evidence and allowed slugs.
**Do this instead:** Run `registry.search` or `registry.detail` through `runAnswerToolCall` in `src/modules/answer-thread/internal/tool-runner.ts` and persist through answer finalization.

### Public Leakage Of Harness Evidence

**What happens:** Public thread projections serialize `harnessRun`, raw tool input/output, tool IDs, result hashes, or internal trace names.
**Why it's wrong:** Public users receive answer checks and provider artifacts, not private debugging evidence.
**Do this instead:** Use `buildPublicThreadProjection` in `src/modules/answer-thread/internal/public-projection.ts` and private admin projections in `src/modules/harness/internal/run-viewer-projection.ts`.

### Source Writes Without Admission

**What happens:** Browser-originated writes call Convex mutations without `sourceWriteAdmissionFromContext` or `sourceWriteAdmissionFromRequest`.
**Why it's wrong:** Consequential writes require scope/operation/correlation binding and stale/signature rejection.
**Do this instead:** Follow `submitPublicInquiryThroughSource` in `src/modules/inquiries/inquiry.functions.ts`, billing functions in `src/modules/billing/billing.functions.ts`, or business-action functions in `src/modules/business-action/business-action.functions.ts`.

### Dynamic Public Tool Discovery

**What happens:** Public assistants receive arbitrary tools, plugin discovery, shell/browser/LSP capabilities, or broad action catalogs.
**Why it's wrong:** AE's safe assistant contract is explicit and small.
**Do this instead:** Keep public assistant tools limited by `AnswerModelToolIds` and `PublicQuietAgentToolIds` in `src/modules/harness/tool-contract.ts`.

### Runtime Code In `src/app/*`

**What happens:** New production UI is added under `src/app/*` as if this were a Next.js App Router project.
**Why it's wrong:** TanStack Start route generation only reads `src/routes/*`; `src/app/*` pages do not create URL entries in this architecture.
**Do this instead:** Build route adapters in `src/routes/*`, place reusable UI in `src/components/ae/*`, and keep Astryx references as source material only.

## Error Handling

**Strategy:** Expected domain failures return discriminated result unions; infrastructure/programmer failures may throw and are caught or converted at route/source seams.

**Patterns:**
- Use `kind: 'ok' | 'error' | 'allowed' | 'denied' | 'not_found'` style result unions in module APIs such as `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`, and `src/modules/business-action/business-action.functions.ts`.
- Convert `ConvexSourceError` and `SourceWriteAdmissionError` into stable user/operator readbacks at source seams.
- Public JSON routes return no-store JSON through `jsonResponse` in `src/routes/api.businesses.ts`.
- Answer turn errors stream safe SSE events and persist error turns when a thread exists.
- Owner/admin routes render denied/fallback readbacks instead of leaking private rows when authority/source wiring rejects access.
- Harness tool execution maps validation, approval, timeout, abort, and thrown errors into `HarnessToolStatus` through `src/modules/harness/action-tool.ts` and `src/modules/harness/run-loop.ts`.

## Cross-Cutting Concerns

**Logging/Observability:** `src/start.ts` wraps requests with Sentry/PostHog server isolation when enabled. Client boot lives in `src/components/ae/layout/AeObservabilityBoot.tsx`; event capture helpers live in `src/lib/observability/*` and `src/modules/observability/*`.

**Validation:** Zod validates route/server-fn/action inputs in `src/routes/*`, `src/modules/*/*.functions.ts`, and `src/modules/*/*.actions.ts`. Convex validators live in `convex/*.ts` and module schema fragments.

**Authentication:** Clerk wraps sign-in/sign-up/owner/admin paths in `src/routes/__root.tsx`; operator routes use `src/lib/server/require-operator-session.ts`; Convex derives actor/admin authority in `convex/authz.ts`.

**Authorization:** Owner/admin reads and mutations must use source seams and Convex-side membership/owner checks. Route-level signed-in admission is not enough for data authority.

**CSRF/source writes:** `src/start.ts` applies TanStack CSRF middleware for server functions and source-write admission middleware for request context; consequential source mutations verify admission at the source layer.

**Redaction:** Public DTO builders and projections are allowlists. Private evidence is represented by hashes/readbacks in modules such as `src/modules/harness/evidence-envelope.ts`, `src/modules/business-action/public.ts`, and `src/modules/observability/internal/audit.ts`.

**Design/copy:** `DESIGN.md`, `.ui-craft/*`, `src/styles/tokens.css`, and `src/components/ae/*` own visual language and public copy posture. Do not add unsupported booking/payment/dispatch language.

**Generated/reference artifacts:** `src/routeTree.gen.ts` and `convex/_generated/*` are generated. `src/app/*/page.tsx` files are Astryx reference pages. Runtime imports must not depend on generated output directories such as `.output/`, `output/`, `test-results/`, `playwright-report/`, or `graphify-out/`.

---

*Architecture analysis: 2026-07-03*
