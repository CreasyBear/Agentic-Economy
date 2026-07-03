<!-- refreshed: 2026-07-03 -->
# Architecture

**Analysis Date:** 2026-07-03

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                  TanStack Start request surface              │
├──────────────────┬──────────────────┬───────────────────────┤
│ Human routes      │ JSON/text routes  │ Assistant actions     │
│ `src/routes/*`    │ `src/routes/api*` │ `src/modules/actions` │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Domain module layer                       │
│ `src/modules/<domain>/public.ts`                             │
│ `src/modules/<domain>/<domain>.functions.ts`                 │
│ `src/modules/<domain>/<domain>.actions.ts`                   │
│ `src/modules/<domain>/internal/*`                            │
└────────┬────────────────────────────┬───────────────────────┘
         │                            │
         ▼                            ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│ Source transport/admission   │  │ UI composition             │
│ `src/lib/server/*`           │  │ `src/components/*`         │
└────────┬────────────────────┘  └────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Convex source state                     │
│ `convex/schema.ts`, `convex/*.ts`, `convex/source_state.ts`  │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack router bootstrap | Creates the route tree, preload policy, not-found component, and generated route typing. | `src/router.tsx`, `src/routeTree.gen.ts` |
| Root document shell | Mounts global CSS, Astryx theme/link/layer providers, conditional Clerk provider, observability boot, error boundary, and toaster. | `src/routes/__root.tsx` |
| Request middleware | Applies observability isolation, CSRF protection for server functions, source-write request context, and Clerk middleware. | `src/start.ts` |
| Public registry routes | Serve human registry pages and read-only business catalog JSON. | `src/routes/registry.tsx`, `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts` |
| Listing and inquiry routes | Read a published listing, build inquiry affordances, and submit first-contact inquiries. | `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/inquiry.functions.ts` |
| Action registry | Registers explicit assistant-facing operations once and exports lookup/list helpers. | `src/modules/actions/index.ts`, `src/modules/common/action.ts` |
| Harness/tool contracts | Converts action definitions into strict tool contracts, policies, descriptors, and execution records. | `src/modules/harness/tool-contract.ts`, `src/modules/harness/action-tool.ts`, `src/modules/harness/tool-policy.ts` |
| Answer turn orchestrator | Streams answer-turn events through context, intent, route, retrieval, model, gate, assemble, persist, and report phases. | `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts` |
| Convex transport | Builds typed function references and authenticated/public Convex HTTP transports. | `src/lib/server/convex-source.ts` |
| Source-write admission | Converts request context into scoped write admission and rejects missing or client-exposed write secrets. | `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts` |
| Convex functions | Persist and query source state for business, catalog, registry, discovery, inquiries, answer threads, notification outbox, billing, protected actions, harness, observability, and security. | `convex/schema.ts`, `convex/*.ts` |
| Operator auth shell | Shares sign-in guard, pending UI, and error UI for owner/admin/developer routes. | `src/lib/server/require-operator-session.ts`, `src/lib/operator/route-options.ts` |
| UI system | Composes Astryx primitives, legacy AE domain components, AI Elements chat parts, and public/operator shells. | `src/components/astryx/RouterLink.tsx`, `src/components/ae/*`, `src/components/ai-elements/*` |

## Pattern Overview

**Overall:** Modular full-stack React application with domain modules, action contracts, and Convex-backed source state.

**Key Characteristics:**
- URL files in `src/routes/*` own routing, loaders, route handlers, search validation, and page composition; domain behavior lives in `src/modules/*`.
- Each domain keeps public contracts in `src/modules/<domain>/public.ts`, implementation details in `src/modules/<domain>/internal/*`, server functions in `src/modules/<domain>/<domain>.functions.ts`, and assistant actions in `src/modules/<domain>/<domain>.actions.ts` when that domain exposes actions.
- Convex schema ownership is delegated to module schema fragments and assembled in `convex/schema.ts`; Convex function files import module public contracts and internal schema helpers.
- Assistant-visible operations are declared as actions in `src/modules/*/*.actions.ts` and explicitly registered in `src/modules/actions/index.ts`; do not rely on import side effects.
- The answer model path can read and compare registry facts through read-only actions; write actions require source-write admission and must preserve AE's boundary: no booking, charging, dispatch, auto-fulfilment, or invented availability.
- Project skills reinforce the same architecture: `convex/_generated/ai/guidelines.md` requires validators and schema ownership, `.codex/skills/tanstack-start/SKILL.md` favors validated `createServerFn` plus middleware, `.codex/skills/clerk-tanstack-patterns/SKILL.md` matches `src/start.ts` and `src/routes/__root.tsx`, and `.agents/skills/submit-qualified-inquiry/SKILL.md` defines inquiry boundaries.

## Layers

**Route Layer:**
- Purpose: Map URLs to loaders, server handlers, page shells, and route-local search validation.
- Location: `src/routes`
- Contains: `createFileRoute` files, API handlers, route loaders, route-specific server functions, SEO metadata.
- Depends on: `src/modules/*`, `src/components/*`, `src/lib/*`, `@tanstack/react-router`, `@tanstack/react-start`.
- Used by: Generated router in `src/routeTree.gen.ts` and runtime router in `src/router.tsx`.

**UI Composition Layer:**
- Purpose: Render public, owner, admin, answer, inquiry, registry, and operator screens.
- Location: `src/components`, `src/hooks`, `src/styles`
- Contains: Astryx adapter components in `src/components/astryx`, AE legacy components in `src/components/ae`, AI chat parts in `src/components/ai-elements`, CSS in `src/styles`.
- Depends on: Astryx packages, React, route hooks, domain DTOs from `src/modules/*/public.ts`.
- Used by: Route files in `src/routes/*`.

**Action Contract Layer:**
- Purpose: Define machine-operation contracts with Zod schemas, output schemas, read/write tier, surfaces, summary, and boundaries.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Contains: `defineAction`, `ActionDefinition`, registered actions, agent descriptors.
- Depends on: Domain server/read functions in `src/modules/registry/registry.functions.ts` and `src/modules/inquiries/inquiry.functions.ts`.
- Used by: Public JSON routes, `src/routes/api.agent.tools.ts`, and answer-tool execution in `src/modules/answer-thread/internal/tool-runner.ts`.

**Harness Layer:**
- Purpose: Wrap actions into strict, policy-aware tool contracts and capture execution evidence.
- Location: `src/modules/harness`
- Contains: `HarnessToolContract`, `runHarnessTool`, schema strictness checks, approval policy, run loop, session journal, evidence envelope.
- Depends on: `src/modules/actions`, `src/modules/common/stable-hash.ts`, `@tanstack/ai`, Zod.
- Used by: `src/routes/api.agent.tools.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, admin run viewer routes.

**Domain Layer:**
- Purpose: Own product concepts, DTOs, pure flows, source ports, readbacks, validation, and redaction.
- Location: `src/modules`
- Contains: Domains for `answer`, `answer-thread`, `billing`, `business`, `business-action`, `catalog`, `common`, `discovery`, `harness`, `inquiries`, `lifecycle`, `notification-outbox`, `observability`, `protected-action`, `registry`, `security`, `seo`, and `dev`.
- Depends on: `src/lib/server/*` for source transport only from server-function files, domain-local `internal/*` modules for implementations.
- Used by: Routes in `src/routes/*`, Convex functions in `convex/*.ts`, tests in `tests/*`.

**Source Transport Layer:**
- Purpose: Bridge TanStack server/runtime code to Convex, separate public reads/writes from authenticated owner/admin calls, and enforce write admission.
- Location: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`
- Contains: `sourceQuery`, `sourceMutation`, `callPublicSourceQuery`, `callPublicSourceMutation`, `callSourceQuery`, `callSourceMutation`, `sourceWriteAdmissionFromContext`, `sourceWriteAdmissionFromRequest`.
- Depends on: Clerk server auth, Convex HTTP client, source-write admission domain rules.
- Used by: `src/modules/*/*.functions.ts`, webhook routes in `src/routes/api.*webhook.ts`, answer-thread persistence.

**Convex Source-State Layer:**
- Purpose: Persist source state and expose Convex query/mutation functions with validators.
- Location: `convex`
- Contains: Function files such as `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/inquiries.ts`, `convex/answerThreads.ts`, `convex/harnessSessions.ts`, schema assembly in `convex/schema.ts`, auth in `convex/auth.config.ts`.
- Depends on: Module contracts from `src/modules/*/public.ts`, module schema fragments, Convex validators.
- Used by: Source transport calls from `src/lib/server/convex-source.ts`.

**Evaluation and Test Layer:**
- Purpose: Guard product boundaries, imports, copy, SEO, answer behavior, Convex runtime behavior, E2E flows, and deploy smoke checks.
- Location: `tests`, `eval`, `.github/workflows/eval-gate.yml`
- Contains: Unit, integration, copy, UI-contract, import, SEO, eval, E2E, a11y, and deploy-smoke tests.
- Depends on: Runtime modules, route handlers, eval fixtures in `eval/answer`.
- Used by: `package.json` scripts such as `test:release`, `test:all`, and `test:eval`.

## Data Flow

### Public Registry Search Path

1. Route handler receives `GET /api/businesses/search`, normalizes query params, and parses them with `registrySearchAction.schema` (`src/routes/api.businesses.search.ts:19`).
2. Route delegates to the registered action runner instead of duplicating business logic (`src/routes/api.businesses.search.ts:28`).
3. `registry.search` trims input, preserves literal query behavior, and calls `readPublicRegistrySearchPage` (`src/modules/registry/registry.actions.ts:230`).
4. Registry functions choose Convex, Meili, dual, or fallback search, then hydrate result slugs through the source port (`src/modules/registry/registry.functions.ts:79`, `src/modules/registry/registry.functions.ts:181`).
5. Public Convex calls use `callPublicSourceQuery` over a typed function reference (`src/modules/registry/registry.functions.ts:160`, `src/lib/server/convex-source.ts:143`).
6. Convex registry functions return public catalog DTOs only (`convex/registry.ts:194`, `convex/registry.ts:212`, `convex/registry.ts:243`).
7. The route returns no-store JSON (`src/routes/api.businesses.ts:35`, `src/routes/api.businesses.search.ts:30`).

### Published Listing Page Path

1. Human listing route `/$slug` loads the public business page through a TanStack server function (`src/routes/$slug.tsx:16`).
2. `readPublicBusinessPageServer` validates `{ slug }` and calls `readPublicBusinessPageThroughSource` (`src/modules/catalog/owner-claim.functions.ts:155`).
3. The source port reads public catalog state by slug through Convex or local E2E fixture mode (`src/modules/catalog/owner-claim.functions.ts:275`, `src/modules/catalog/owner-claim.functions.ts:381`).
4. Source hashes are redacted before route readback data reaches public UI (`src/modules/catalog/owner-claim.functions.ts:341`).
5. The route composes the listing with inquiry affordance and agent JSON URL (`src/routes/$slug.tsx:70`).

### Qualified Inquiry Write Path

1. Human inquiry route `/$slug/inquiry` loads a readback and posts through `useServerFn(submitPublicInquiryServer)` (`src/routes/$slug.inquiry.tsx:44`, `src/routes/$slug.inquiry.tsx:86`).
2. Assistant action path posts to `/api/agent/tools`, resolves a quiet tool contract, and runs the harness with request-derived context (`src/routes/api.agent.tools.ts:43`, `src/routes/api.agent.tools.ts:68`).
3. `inquiry.submit` is the registered write action and delegates to `submitPublicInquiryThroughSource` (`src/modules/inquiries/inquiry.actions.ts:96`).
4. `submitPublicInquiryServer` validates input with Zod and calls the same source function (`src/modules/inquiries/inquiry.functions.ts:249`).
5. The source function creates operation/correlation keys, compacts private contact data, builds source-write admission, and calls the Convex public mutation (`src/modules/inquiries/inquiry.functions.ts:275`, `src/modules/inquiries/inquiry.functions.ts:287`, `src/modules/inquiries/inquiry.functions.ts:727`).
6. Convex inquiry mutation validates the target, applies rate/suppression rules, persists the thread/message/notification records, and returns a receipt shape (`convex/inquiries.ts:601`).
7. The result is a receipt or typed error; it never represents booking, payment, dispatch, auto-fulfilment, availability, quote, or job acceptance (`src/modules/inquiries/inquiry.actions.ts:102`).

### Answer Turn Streaming Path

1. `POST /api/answer/turn` resolves/sets the session cookie, parses input, checks rate limits, and opens an SSE stream (`src/routes/api.answer.turn.ts:18`, `src/routes/api.answer.turn.ts:45`, `src/routes/api.answer.turn.ts:65`).
2. `streamAnswerTurn` creates IDs, loads access context, emits the initial thread event, and enters the harness run loop (`src/modules/answer-thread/internal/turn-orchestrator.ts:155`, `src/modules/answer-thread/internal/turn-orchestrator.ts:207`).
3. The run loop phases classify intent, route, retrieve registry results, optionally call the model, gate the answer, assemble SSE events, persist, and report (`src/modules/answer-thread/internal/turn-orchestrator.ts:265`).
4. Retrieval calls `registry.search` through the read-only answer tool runner (`src/modules/answer-thread/internal/turn-orchestrator.ts:330`, `src/modules/answer-thread/internal/tool-runner.ts:35`).
5. The tool runner refuses unknown or non-read actions, validates schemas, extracts allowed slugs, and returns evidence records (`src/modules/answer-thread/internal/tool-runner.ts:52`, `src/modules/answer-thread/internal/tool-runner.ts:66`).
6. Gate/finalization sanitizes the snapshot against allowed slugs and records harness evidence before persistence (`src/modules/answer-thread/internal/turn-orchestrator.ts:405`, `src/modules/answer-thread/internal/turn-orchestrator.ts:465`).
7. Answer-thread functions persist threads, turns, tool calls, and harness finalization through Convex source mutations (`src/modules/answer-thread/answer-thread.functions.ts:120`, `convex/answerThreads.ts:39`).

### Owner/Admin Operation Path

1. Owner/admin/developer routes spread `operatorRouteOptions` for `beforeLoad`, pending, and error components (`src/lib/operator/route-options.ts:10`).
2. `requireOperatorBeforeLoad` uses Clerk auth in a server function and redirects unauthenticated users to `/sign-in/$` (`src/lib/server/require-operator-session.ts:7`).
3. Route loaders call domain server functions such as `readCurrentOwnerInboxServer`, `readAdminBillingServer`, or `readAdminClaimsServer` (`src/modules/inquiries/inquiry.functions.ts:253`, `src/modules/billing/billing.functions.ts:296`, `src/routes/admin.claims.tsx`).
4. Server functions call authenticated Convex transports (`src/lib/server/convex-source.ts:81`, `src/lib/server/convex-source.ts:125`).
5. Convex auth derives owner/admin identity server-side through `ctx.auth.getUserIdentity()` patterns and Clerk JWT configuration (`convex/auth.config.ts:5`, `convex/authz.ts`).

**State Management:**
- Durable state is in Convex tables assembled by `convex/schema.ts`.
- Public session continuity for answer threads uses `ae_session` in `src/modules/answer-thread/internal/session-cookie.ts`.
- Route/UI state is React-local in route components such as `src/routes/registry.tsx` and `src/routes/$slug.inquiry.tsx`.
- Test seams use module-level ports in files such as `src/modules/registry/registry.functions.ts` and `src/modules/answer-thread/answer-thread.functions.ts`.
- Local E2E bypass is controlled by `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in multiple server-side files, including `src/start.ts` and `src/modules/inquiries/inquiry.functions.ts`.

## Key Abstractions

**Action Definition:**
- Purpose: One operation contract for route/API/assistant/harness surfaces.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Pattern: Zod input/output schemas plus `readOnly`, `surfaces`, `summary`, `boundaries`, and `run`.

**Harness Tool Contract:**
- Purpose: Policy-aware execution wrapper around actions with strict schema diagnostics and public projections.
- Examples: `src/modules/harness/tool-contract.ts`, `src/modules/harness/action-tool.ts`, `src/modules/harness/approval-policy.ts`
- Pattern: Convert actions with `actionToHarnessToolContract`, resolve approval in `runHarnessTool`, record stable hashes.

**Source Function Reference:**
- Purpose: Create typed Convex references without importing generated API symbols everywhere.
- Examples: `src/lib/server/convex-source.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`
- Pattern: `sourceQuery('domain:function')`, `sourceMutation('domain:function')`, then `callPublicSourceQuery` or authenticated `callSourceQuery`.

**Source Write Admission:**
- Purpose: Bind writes to method/origin/pathname, scope, operation key, and correlation ID.
- Examples: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Pattern: Request middleware supplies context for server functions; route handlers use request-based admission.

**Public Route Readback:**
- Purpose: Safe DTOs for human routes that redact private/source data and carry UI-ready status.
- Examples: `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/route-readbacks.ts`, `src/modules/billing/owner-billing.readback.ts`
- Pattern: Domain functions return discriminated `kind` objects, redacted catalog projections, and explicit unavailable/not-found states.

**Convex Source State:**
- Purpose: Runtime state projection used by Convex functions and tests.
- Examples: `convex/source_state.ts`, `src/modules/*/internal/schema.ts`, `src/modules/*/internal/convex-schema.ts`
- Pattern: Domain schema fragments are merged in `convex/schema.ts`; functions use indexed queries and validators.

**Answer Turn Run Loop:**
- Purpose: Deterministic orchestration around answer generation and evidence capture.
- Examples: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/harness/run-loop.ts`, `src/modules/answer-thread/internal/tool-runner.ts`
- Pattern: Phased state machine with streamed work steps, read-only tool calls, gate validation, persistence, and harness report.

**Operator Route Options:**
- Purpose: Shared authenticated shell behavior for owner/admin/developer surfaces.
- Examples: `src/lib/operator/route-options.ts`, `src/lib/server/require-operator-session.ts`
- Pattern: Spread common route options into `createFileRoute(...)({ ...operatorRouteOptions, ... })`.

## Entry Points

**Vite/TanStack Start build:**
- Location: `vite.config.ts`
- Triggers: `npm run dev`, `npm run build`, `npm run start`
- Responsibilities: TanStack Start plugin, Nitro, React plugin, Tailwind, Astryx SSR bundling, optional Sentry sourcemaps.

**Request middleware:**
- Location: `src/start.ts`
- Triggers: TanStack Start request handling.
- Responsibilities: Observability, CSRF, source-write context, Clerk middleware.

**Router:**
- Location: `src/router.tsx`, `src/routeTree.gen.ts`
- Triggers: Client/server router creation.
- Responsibilities: Generated route tree, preload, not-found component, scroll restoration.

**Root route:**
- Location: `src/routes/__root.tsx`
- Triggers: Every human/API route render.
- Responsibilities: HTML shell, global CSS, Astryx theme, Clerk provider for auth routes, observability boot, toaster.

**Home and answer UI:**
- Location: `src/routes/index.tsx`, `src/components/ae/chat/AeChat.tsx`
- Triggers: `/` and `/?q=...`.
- Responsibilities: Landing prompt, answer chat, answer-turn stream client.

**Answer API:**
- Location: `src/routes/api.answer.turn.ts`, `src/routes/api.answer.threads.ts`, `src/routes/api.answer.threads.$threadId.ts`
- Triggers: Browser answer chat requests.
- Responsibilities: SSE answer turn streaming, thread list/detail/delete, follow-up chips.

**Registry APIs:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`
- Triggers: Public catalog JSON reads.
- Responsibilities: List/search/detail public business catalog facts.

**Assistant action endpoint:**
- Location: `src/routes/api.agent.tools.ts`
- Triggers: `GET` to list assistant actions and `POST` to run one.
- Responsibilities: Describe quiet tool contracts, validate schemas, run harness tools, return outputs or typed errors.

**Listing and inquiry pages:**
- Location: `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`
- Triggers: Published business pages and human inquiry forms.
- Responsibilities: Listing display, safe inquiry affordance, first-contact inquiry submission.

**Discovery text/files:**
- Location: `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/$slug.ucp.ts`
- Triggers: Assistant/search discovery reads.
- Responsibilities: Plain-text index, sitemap, robots, per-listing discovery manifest.

**Owner/admin surfaces:**
- Location: `src/routes/owner.*.tsx`, `src/routes/admin.*.tsx`, `src/routes/developers.discovery.tsx`
- Triggers: Authenticated operator workflows.
- Responsibilities: Owner inbox, billing, business actions, protected action proposals, admin queues, run viewer, index health, audit events.

**Convex backend:**
- Location: `convex/*.ts`, `convex/schema.ts`, `convex/crons.ts`, `convex/auth.config.ts`
- Triggers: Source transport calls, Convex scheduler, Convex auth.
- Responsibilities: Query/mutation runtime, schema, auth config, cleanup crons.

## Architectural Constraints

- **Threading:** Route/server-function code runs on the JS event loop; answer turns stream over SSE from `src/routes/api.answer.turn.ts`; Convex mutations are transactional and should keep document reads/writes bounded per `convex/_generated/ai/guidelines.md`.
- **Global state:** Test seams are module-level in `src/modules/registry/registry.functions.ts`, `src/modules/discovery/discovery.functions.ts`, and `src/modules/answer-thread/answer-thread.functions.ts`; reset them in tests and do not use them for production state.
- **Action registration:** All actions must be imported into `src/modules/actions/index.ts`; tree-shaking makes side-effect registration unsafe.
- **Generated files:** Do not edit `src/routeTree.gen.ts` or `convex/_generated/*`; regenerate through TanStack Router or Convex codegen.
- **Convex schema:** Add tables through module schema fragments and import them into `convex/schema.ts`; keep validators on Convex functions per `convex/_generated/ai/guidelines.md`.
- **Auth:** Owner/admin Convex calls derive identity from Clerk/Convex JWT state; do not accept owner/admin user IDs from client input for authorization.
- **Public boundary:** Public and assistant-facing descriptions must not imply booking, charging, dispatch, auto-fulfilment, guaranteed availability, confirmed quote, or job acceptance. Use the action boundaries in `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.actions.ts`.
- **Internal vocabulary:** Terms such as `agentTools`, source function references, DTOs, and harness details belong in internal docs/code, not public human copy. Public UI should describe what people can do, not implementation architecture.
- **Search behavior:** Registry search is literal; the caller chooses better search arguments instead of expecting fuzzy correction (`src/modules/registry/registry.actions.ts`).

## Anti-Patterns

### Route-Owned Domain Logic

**What happens:** A route directly mutates domain/source state or duplicates catalog/inquiry rules.
**Why it's wrong:** The same operation must be shared by human UI, JSON routes, assistant actions, tests, and Convex adapters.
**Do this instead:** Put validation and flow in `src/modules/<domain>/<domain>.functions.ts` or `src/modules/<domain>/public.ts`, then call it from the route, as in `src/routes/api.businesses.search.ts` and `src/modules/registry/registry.functions.ts`.

### Side-Effect Action Registration

**What happens:** A new action file is created but not imported into `src/modules/actions/index.ts`.
**Why it's wrong:** Production bundlers can tree-shake bare side-effect imports, and the action will be missing from the assistant/action surfaces.
**Do this instead:** Export the action from `src/modules/<domain>/<domain>.actions.ts`, import it in `src/modules/actions/index.ts`, and let `assertUniqueActionIds` validate IDs.

### Answer Turns Running Writes

**What happens:** An answer model path attempts to run a write action or owner/admin action while streaming.
**Why it's wrong:** Answer turns may read and compare published facts, but writes require explicit source-write admission and qualified user intent.
**Do this instead:** Keep answer tools read-only in `src/modules/answer-thread/internal/tool-runner.ts`; submit inquiries only through `src/modules/inquiries/inquiry.actions.ts` or `src/modules/inquiries/inquiry.functions.ts` with admission.

### Public Copy Overclaiming Capabilities

**What happens:** UI or action copy says AE books, charges, dispatches, confirms availability, or auto-fulfils work.
**Why it's wrong:** AE records and publishes business-supplied details and qualified inquiries; owner confirmation is still required.
**Do this instead:** Use boundary-honest wording from `AGENTS.md`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, and `.agents/skills/submit-qualified-inquiry/SKILL.md`.

### Importing Domain Internals From Routes

**What happens:** A route imports `src/modules/<domain>/internal/*` to bypass the public facade.
**Why it's wrong:** Internal files can change around module-owned invariants and are also used by Convex/schema adapters.
**Do this instead:** Routes should import from `src/modules/<domain>/public.ts`, `src/modules/<domain>/<domain>.functions.ts`, or `src/modules/<domain>/<domain>.actions.ts`. Convex schema assembly is the intentional exception in `convex/schema.ts`.

## Error Handling

**Strategy:** Use typed discriminated results for expected domain failures, route-level HTTP status for transport failures, and thrown errors only for unexpected runtime failures or framework redirects.

**Patterns:**
- Zod route/server/action validation returns or throws before source calls (`src/modules/common/action.ts`, `src/modules/inquiries/inquiry.functions.ts`).
- Domain server functions return `kind: 'ok' | 'error'` or `kind: 'available' | 'not_found' | 'unavailable'` results (`src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`).
- Convex transport wraps missing auth or URL configuration in `ConvexSourceError` (`src/lib/server/convex-source.ts`).
- Source-write failures map to non-retryable domain errors (`src/lib/server/source-write-admission.ts`, `src/modules/inquiries/inquiry.functions.ts`).
- Answer SSE emits typed error events with copy IDs instead of exposing raw exceptions (`src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`).
- JSON routes use `jsonResponse` with no-store cache headers and explicit status codes (`src/routes/api.businesses.ts`, `src/routes/api.agent.tools.ts`).

## Cross-Cutting Concerns

**Logging:** Request-level observability initializes Sentry/PostHog in `src/start.ts`; server/client adapters live in `src/lib/observability/*`; funnel and audit events live in `src/modules/observability/*` and `convex/observability.ts`.
**Validation:** Zod validates TanStack server-function and action inputs in `src/modules/*/*.functions.ts` and `src/modules/*/*.actions.ts`; Convex validators are defined in `convex/*.ts`; schema tables are assembled in `convex/schema.ts`.
**Authentication:** Clerk wraps auth routes in `src/routes/__root.tsx`, request middleware in `src/start.ts`, operator guards in `src/lib/server/require-operator-session.ts`, and Convex JWT auth in `convex/auth.config.ts`.
**Authorization:** Owner/admin source reads and writes call authenticated Convex transports from `src/lib/server/convex-source.ts`; Convex auth/role checks live in `convex/authz.ts` and `src/modules/security/*`.
**Source admission:** Browser/server writes use `src/lib/server/source-write-admission.ts` and Convex-side checks in `convex/sourceWriteAdmission.ts`.
**SEO/discovery:** Public business SEO and discovery files are built through `src/modules/seo/*`, `src/modules/discovery/*`, and routes `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/$slug.ucp.ts`.
**Design system:** Astryx is mounted in `src/routes/__root.tsx`; UI should prefer Astryx primitives and avoid expanding bespoke AE presentation components per `AGENTS.md`.

---

*Architecture analysis: 2026-07-03*
