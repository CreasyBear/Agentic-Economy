<!-- refreshed: 2026-07-07 -->
# Architecture

**Analysis Date:** 2026-07-07

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                 TanStack Start Application                  │
│ `src/start.ts` `src/router.tsx` `src/routeTree.gen.ts`      │
├──────────────────┬──────────────────┬───────────────────────┤
│ Public Routes    │ Operator Routes  │ Machine Routes        │
│ `src/routes/*.tsx`│ `src/routes/_operator/*` │ `src/routes/api.*.ts` │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Domain Modules                           │
│ `src/modules/<domain>/public.ts`                            │
│ `src/modules/<domain>/*.functions.ts`                       │
│ `src/modules/<domain>/*.actions.ts`                         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Convex Source                         │
│ `convex/*.ts` `convex/schema.ts`                            │
│ module schema fragments in `src/modules/*/internal/schema.ts`│
└─────────────────────────────────────────────────────────────┘
```

AE is a single TanStack Start + React application with Convex as the backend source of record. There is no separate API service: API routes are TanStack file routes in `src/routes/api.*.ts` with `server.handlers`, and UI reads/writes use TanStack `createServerFn` seams in `src/modules/*/*.functions.ts`.

The product contract is a registry and qualified-inquiry router. The runtime must not imply booking, charging, dispatch, live availability, or autonomous fulfillment. Assistant-facing and machine-readable surfaces use the same module action definitions as UI/HTTP paths, then apply explicit exposure gates.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Start middleware | Observability, security headers, CSRF for server functions, source-write admission, Clerk middleware | `src/start.ts` |
| Router factory | TanStack router over generated route tree, preload/pending/not-found defaults | `src/router.tsx` |
| Route tree | Generated route imports and route hierarchy; never hand-edit | `src/routeTree.gen.ts` |
| Root route | Document shell, Astryx providers, conditional Clerk provider, global CSS and app chrome | `src/routes/__root.tsx` |
| Public routes | Human public pages such as `/`, `/registry`, `/$slug`, `/$slug/inquiry`, legal/help pages | `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx` |
| Operator routes | Owner/admin/developer UI under the `_operator` route group | `src/routes/_operator.tsx`, `src/routes/_operator/*.tsx` |
| Machine routes | JSON APIs, agent tools, discovery files, webhooks, notification dispatch/readback endpoints | `src/routes/api.agent.tools.ts`, `src/routes/api.businesses.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts` |
| Action registry | Explicit central registry of reusable AE operations | `src/modules/actions/index.ts` |
| Action primitive | Defines `ActionDefinition`, surfaces, schemas, descriptors, action context | `src/modules/common/action.ts` |
| Harness | Tool contract projection, approval policy, run loop, evidence/session records | `src/modules/harness/*` |
| Answer agent | OpenRouter tool-use loop over read-only registry tools with grounding and gate checks | `src/modules/answer/internal/answer-tool-use-agent.ts` |
| Clearance | Signed agent identity, mandate/admission, signing and protocol store | `src/modules/clearance/*` |
| Convex schema root | Composes module-owned table fragments into one `defineSchema` | `convex/schema.ts` |
| Convex functions | Durable reads/writes/actions by domain | `convex/registry.ts`, `convex/inquiries.ts`, `convex/business.ts`, `convex/catalog.ts` |

## Pattern Overview

**Overall:** File-route adapters over module-owned domain seams over Convex source functions.

**Key Characteristics:**
- Routes stay thin: import public module seams, server functions, or action definitions, then adapt HTTP/UI inputs and responses.
- Modules own domain logic and durable table fragments; `internal/` is private to the owning module.
- Convex is the source of record; `convex/schema.ts` is a composition root, not a place for route-owned schemas.
- Operations intended for multiple surfaces are declared once with `defineAction` and explicitly registered in `src/modules/actions/index.ts`.
- Public quiet-agent exposure requires both `surfaces: ['agentTools']` and the pinned harness allowlist in `src/modules/harness/tool-contract.ts`.

## Layers

**Runtime/Middleware Layer:**
- Purpose: Apply request-wide server middleware before route handlers and server functions.
- Location: `src/start.ts`
- Contains: Sentry/PostHog boot and flush, CSP/security headers, CSRF middleware, source-write admission middleware, Clerk middleware, local E2E auth bypass hook.
- Depends on: `@tanstack/react-start`, `@clerk/tanstack-react-start/server`, `src/lib/http/security-headers.ts`, `src/lib/server/source-write-admission.ts`.
- Used by: All TanStack Start requests.

**Route Layer:**
- Purpose: Own URL shape, UI route components, route loaders, API handlers, webhook handlers, and discovery file responses.
- Location: `src/routes/`
- Contains: Public pages, `_operator` owner/admin pages, `api.*.ts` handlers, `llms[.]txt.ts`, `robots[.]txt.ts`, `sitemap[.]xml.ts`, nested `/$slug/ucp` and `/$slug/inquiry`.
- Depends on: Module `public.ts`, `*.functions.ts`, `*.actions.ts`, route-local helpers such as `jsonResponse` in `src/routes/api.businesses.ts`.
- Used by: TanStack generated route tree in `src/routeTree.gen.ts`.

**Module/Public Seam Layer:**
- Purpose: Stable import boundary for each domain.
- Location: `src/modules/<domain>/public.ts`
- Contains: Re-exported domain DTOs, commands, read models, public helpers. It may alias internal exports with local `Impl` names before re-exporting a clean API.
- Depends on: Same-module `internal/*`, common primitives, Convex generated API refs through functions files.
- Used by: Routes and sibling modules. Outside code must not import another module's `internal/*`.

**Server Function / Source Adapter Layer:**
- Purpose: Bridge TanStack server functions and route handlers to Convex source calls.
- Location: `src/modules/*/*.functions.ts`, `src/lib/server/convex-source.ts`
- Contains: `createServerFn` declarations, `*ThroughSource` functions, Convex query/mutation/action calls.
- Depends on: `@tanstack/react-start`, `convex/_generated/api`, `src/lib/server/convex-source.ts`.
- Used by: UI routes, API routes, action `run` bodies.

**Action Layer:**
- Purpose: Declare reusable operation contracts once for UI, HTTP, agent JSON, and quiet agent-tool surfaces.
- Location: `src/modules/*/*.actions.ts`, `src/modules/common/action.ts`, `src/modules/actions/index.ts`
- Contains: `id`, `name`, `summary`, `boundaries`, Zod input/output schemas, parameter metadata, `readOnly`, `surfaces`, and `run`.
- Depends on: Domain functions and schemas.
- Used by: API handlers, harness contracts, answer-model tool specs, assistant JSON descriptors.

**Harness/Agent Runtime Layer:**
- Purpose: Convert actions into tool contracts, enforce approval/exposure policy, run tools, collect evidence, and account for model/tool work.
- Location: `src/modules/harness/`
- Contains: `tool-contract.ts`, `approval-policy.ts`, `tool-policy.ts`, `run-loop.ts`, `action-tool.ts`, evidence envelopes, session journal, run-view projections.
- Depends on: Action definitions, strict schema checks, stable hashing, harness schema types.
- Used by: `src/routes/api.agent.tools.ts`, answer thread orchestration, admin run viewer.

**Answer/Routing Layer:**
- Purpose: Generate grounded answers by calling read-only registry tools, preserving evidence, and gating final prose against source facts.
- Location: `src/modules/answer/`, `src/modules/answer-thread/`
- Contains: OpenRouter tool-use loop, tool spec conversion, prompt builders, catalog grounding, location filters, answer gate, turn orchestration, SSE/thread state.
- Depends on: `src/modules/actions`, `src/modules/harness`, `src/modules/registry`, OpenRouter HTTP API via direct `fetch`.
- Used by: `src/routes/api.answer.ts`, `src/routes/api.answer.turn.ts`, `src/routes/t.$threadId.tsx`, `src/routes/q.$answerId.tsx`.

**Convex Layer:**
- Purpose: Store and query durable state.
- Location: `convex/`, `src/modules/*/internal/*schema.ts`
- Contains: Convex queries/mutations/actions, auth config, crons, generated Convex APIs, schema composition.
- Depends on: Convex validators and selected module-internal pure domain/schema fragments.
- Used by: Module source adapter functions.

**Cross-Cutting Infrastructure:**
- Purpose: Shared framework, security, observability, provider, and UI utilities not owned by one domain.
- Location: `src/lib/`, `src/components/`, `src/styles/`
- Contains: Convex source transport, security headers, local auth bypass, notification/billing providers, contract scanners, Astryx bridge components, global CSS.
- Depends on: Runtime/provider packages and app modules where appropriate.
- Used by: Routes, modules, tests, and middleware.

## Data Flow

### Primary Public Catalog Read Path

1. A human or assistant calls a public route such as `/registry`, `/api/businesses/search`, or `/$slug` (`src/routes/registry.tsx`, `src/routes/api.businesses.search.ts`, `src/routes/$slug.tsx`).
2. The route imports module seams or route handlers that delegate to registry/catalog functions (`src/modules/registry/registry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`).
3. Source adapters call Convex functions via generated refs and the app transport (`src/lib/server/convex-source.ts`, `convex/registry.ts`, `convex/catalog.ts`).
4. Convex reads business, catalog, projection, suppression, and discovery rows from tables composed in `convex/schema.ts`.
5. The route returns React UI or JSON DTOs. JSON routes reuse response helpers from `src/routes/api.businesses.ts`.

### Qualified Inquiry Path

1. The person submits `/$slug/inquiry` through `src/routes/$slug.inquiry.tsx` or an admitted assistant calls `POST /api/agent/tools` with `tool: "inquiry.submit"` (`src/routes/api.agent.tools.ts`).
2. UI uses `submitPublicInquiryServer` and agent tools use `submitInquiryAction` (`src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/inquiry.actions.ts`).
3. Both paths reach `submitPublicInquiryThroughSource`, which validates policy and persists source state through `convex/inquiries.ts`.
4. Owner/operator readbacks use owner routes and server functions in `src/modules/inquiries/inquiry.functions.ts` and `src/routes/_operator/owner.inquiries*.tsx`.
5. Notification side effects are represented through notification outbox/provider seams, not as direct public authority (`src/modules/notification-outbox/`, `convex/notificationOutbox.ts`).

### Quiet Agent Tool Path

1. `GET /api/agent/tools` lists descriptors from `listAgentToolActions()` after harness filtering (`src/routes/api.agent.tools.ts`, `src/modules/actions/index.ts`, `src/modules/harness/tool-contract.ts`).
2. `POST /api/agent/tools` reads a bounded JSON body, validates content type/body size/input schema, and looks up the pinned quiet tool contract (`src/routes/api.agent.tools.ts`).
3. Read tools may run unsigned. Write tools require Web Bot Auth identity verification (`src/modules/clearance/internal/web-bot-auth.ts`), audit recording, declared write scope, and `resolveAgentToolWriteAdmissionThroughSource` (`src/modules/clearance/server.ts`).
4. The route builds `ActionContext` with request, body digest, verified identity, and admission details, then calls `runHarnessTool` with `allowWrites` true only for admitted writes.
5. Tool outputs are schema-checked by harness/tool execution and returned as JSON.

### Answer Thread / Tool-Use Path

1. Answer routes such as `src/routes/api.answer.turn.ts`, `src/routes/api.answer.threads.ts`, `src/routes/t.$threadId.tsx`, and `src/routes/q.$answerId.tsx` invoke answer-thread module functions.
2. The answer tool-use agent calls OpenRouter directly at `https://openrouter.ai/api/v1/chat/completions` (`src/modules/answer/internal/answer-tool-use-agent.ts`).
3. The model receives only read-tool specs derived from action definitions (`src/modules/answer/internal/action-to-tool-spec.ts`, `src/modules/answer-thread/tooling.ts`).
4. Tool results are persisted as evidence, sanitized before prompt re-entry, and final prose is gated against allowed source slugs (`src/modules/answer/internal/catalog-grounding.ts`, `src/modules/answer/internal/answer-gate.ts`).
5. Harness model/tool accounting records usage/cost metadata and run/session evidence (`src/modules/harness/run-loop.ts`, `src/modules/harness/session-journal.ts`).

### Convex Schema Path

1. New durable state belongs to the owning module's schema fragment, such as `src/modules/registry/internal/schema.ts` or `src/modules/inquiries/internal/convex-schema.ts`.
2. `convex/schema.ts` imports the fragment and spreads it into `defineSchema`.
3. Domain Convex functions under `convex/<domain>.ts` read/write those tables.
4. Module source adapters in `src/modules/<domain>/*.functions.ts` call those Convex functions.

**State Management:**
- Convex is the durable source of record for catalog, registry projections, inquiries, answer threads, harness sessions, clearance, security, billing, observability, notification outbox, and settings.
- React route/component state is UI-local only.
- Answer/harness run state is persisted or projected through module tables and evidence/session records, not hidden globals.
- Module-level constants exist for pinned policies such as `PublicQuietAgentToolIds` in `src/modules/harness/tool-contract.ts`, `WRITE_TOOL_SCOPES` in `src/routes/api.agent.tools.ts`, and OpenRouter caps in `src/modules/answer/internal/answer-tool-use-agent.ts`.

## Key Abstractions

**ActionDefinition:**
- Purpose: One typed operation contract spanning UI, HTTP, agent JSON, and quiet agent tools.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/storefront/storefront.actions.ts`.
- Pattern: Zod input/output schema, parameter metadata, boundary-honest text, explicit `surfaces`, delegated `run` implementation.

**Module Public Seam:**
- Purpose: Keep domain internals private while giving routes and sibling modules a stable API.
- Examples: `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/clearance/public.ts`, `src/modules/harness/public.ts`.
- Pattern: Import same-module internal implementation, then re-export selected public names.

**Source Adapter / ThroughSource Function:**
- Purpose: Centralize Convex access and route/server-function behavior.
- Examples: `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `src/modules/settings/settings.functions.ts`.
- Pattern: `createServerFn` for UI calls plus plain `*ThroughSource` functions for actions and route handlers.

**HarnessToolContract:**
- Purpose: Project an action into executable, schema-checked, policy-gated tool contracts.
- Examples: `src/modules/harness/tool-contract.ts`, `src/modules/harness/action-tool.ts`, `src/modules/harness/strict-schema.ts`.
- Pattern: action-to-contract conversion, strict JSON-schema diagnostics, pinned exposure lists, policy declaration, projection summary.

**Clearance / Agent Identity:**
- Purpose: Separate signed request attribution from authorization.
- Examples: `src/modules/clearance/internal/web-bot-auth.ts`, `src/modules/clearance/internal/mandate.ts`, `src/modules/clearance/internal/signing.ts`, `src/modules/clearance/internal/convex-protocol-store.ts`.
- Pattern: Web Bot Auth returns unsigned/identity/error; mandates and admission grant or refuse specific write scopes.

**Convex Schema Fragment:**
- Purpose: Let modules own table definitions while Convex consumes one schema.
- Examples: `src/modules/business/internal/schema.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `src/modules/security/internal/schema.ts`, `convex/schema.ts`.
- Pattern: Export `*Tables` from module internals; spread in `convex/schema.ts`.

## Entry Points

**Application Request Pipeline:**
- Location: `src/start.ts`
- Triggers: TanStack Start server runtime.
- Responsibilities: Middleware sequence for observability, security headers, CSRF, source-write admission, Clerk.

**Router:**
- Location: `src/router.tsx`
- Triggers: Client/server app routing.
- Responsibilities: Create router over generated `routeTree`, default not-found, scroll restoration, view transitions.

**Root Document:**
- Location: `src/routes/__root.tsx`
- Triggers: All rendered app routes.
- Responsibilities: Head metadata, CSS, Astryx `Theme`, `LinkProvider`, `LayerProvider`, Clerk provider gating, observability boot/error boundary/toaster.

**Route Tree:**
- Location: `src/routeTree.gen.ts`
- Triggers: Generated by TanStack Router tooling.
- Responsibilities: Register all file routes and parent/child relationships.

**Action Registry:**
- Location: `src/modules/actions/index.ts`
- Triggers: Imports from harness, routes, answer tooling.
- Responsibilities: Central action list, duplicate ID assertion, action lookup/listing, agent-tool surface prefilter.

**Convex Schema:**
- Location: `convex/schema.ts`
- Triggers: Convex codegen, Convex runtime.
- Responsibilities: Compose module table fragments into source schema.

**Public Machine Routes:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/api.agent.tools.ts`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`
- Triggers: HTTP GET/POST requests.
- Responsibilities: Return catalog JSON, discovery files, or quiet tool descriptors/results.

**Provider/Webhook Routes:**
- Location: `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.*-dispatch.ts`
- Triggers: Provider callbacks or dispatch smokes.
- Responsibilities: Admission/signature/provider handling through module/server seams.

## Architectural Constraints

- **Threading:** Runtime is request/async event-loop driven. Convex functions execute in Convex runtimes. Files using Node built-ins in Convex must be isolated as `"use node"` action-only files such as `convex/capabilityCheck.ts`.
- **Global state:** Pinned policy constants are explicit and small: `PublicQuietAgentToolIds` and `AnswerModelToolIds` in `src/modules/harness/tool-contract.ts`, OpenRouter caps in `src/modules/answer/internal/answer-tool-use-agent.ts`, route body caps and write scopes in `src/routes/api.agent.tools.ts`.
- **Module privacy:** Outside code must not import `src/modules/<domain>/internal/*`; `tests/imports/private-imports.test.ts` enforces this with `scanPrivateImports`.
- **Route boundaries:** Routes must not own Convex schema/transport or clearance internals directly; `tests/imports/route-boundary.test.ts` enforces this with `scanRouteBoundaries`.
- **Generated files:** Do not hand-edit `src/routeTree.gen.ts` or `convex/_generated/*`.
- **Public exposure:** Declaring `agentTools` on an action does not expose it by itself; `src/modules/harness/tool-contract.ts` must allowlist it.
- **Identity vs authorization:** `src/modules/clearance/internal/web-bot-auth.ts` verifies request identity for attribution/quota/audit only. Writes require separate admission in `src/modules/clearance/server.ts`.
- **Copy/security boundary:** Public and assistant-visible text in actions/routes must obey the product boundary and banned vocabulary from the prompt, `CLAUDE.md`, and `.agents/skills/ae-public-copy-guardrails/SKILL.md`.
- **Convex node import trap:** Do not import `node:*` transitively into Convex query/mutation bundles. Keep Node-only code server-only or in action-only `"use node"` Convex files.

## Anti-Patterns

### Route-Owned Domain Logic

**What happens:** A route imports `src/modules/<domain>/internal/*`, owns Convex transport, or directly reaches schema fragments.
**Why it's wrong:** It bypasses module ownership and breaks the adapter-over-public-seam architecture; route-boundary tests catch this.
**Do this instead:** Put logic in `src/modules/<domain>/public.ts` or `src/modules/<domain>/*.functions.ts` and import that from `src/routes/*`.

### Side-Effect Action Registration

**What happens:** A new action file is imported only for module evaluation.
**Why it's wrong:** `package.json` sets `"sideEffects": false`; production bundlers can tree-shake bare side-effect imports.
**Do this instead:** Import the action const in `src/modules/actions/index.ts` and add it to the `actions` array.

### Inline Convex Schema Ownership

**What happens:** A new table is declared directly in `convex/schema.ts` for a route or feature.
**Why it's wrong:** Durable state ownership becomes unclear and future module changes cannot find their schema.
**Do this instead:** Export a `*Tables` fragment from `src/modules/<domain>/internal/schema.ts` or `internal/convex-schema.ts`, then spread it in `convex/schema.ts`.

### Treating Signature as Permission

**What happens:** A signed agent request is allowed to perform a write because identity verification passed.
**Why it's wrong:** AE separates attribution from authorization; `verifyAgentIdentity` can only establish identity, not write authority.
**Do this instead:** Require write scope declaration and `resolveAgentToolWriteAdmissionThroughSource` before calling `runHarnessTool` with writes enabled, as in `src/routes/api.agent.tools.ts`.

### Public Tool Exposure by Surface Flag Alone

**What happens:** A new action adds `agentTools` to `surfaces` and assumes `/api/agent/tools` will expose it.
**Why it's wrong:** Quiet exposure is intentionally gated twice.
**Do this instead:** Update `PublicQuietAgentToolIds` in `src/modules/harness/tool-contract.ts` only after the action contract, policy, copy, schemas, and admission behavior are correct.

## Error Handling

**Strategy:** Use typed/discriminated results at domain boundaries, schema validation at action and route boundaries, and explicit JSON error codes for machine routes.

**Patterns:**
- Action input/output contracts are Zod schemas in `src/modules/*/*.actions.ts` and `src/modules/common/action.ts`.
- `/api/agent/tools` returns stable error codes such as `agent_tools_invalid_input`, `agent_tools_signature_required`, `agent_tools_refused`, and `agent_tools_invalid_output` in `src/routes/api.agent.tools.ts`.
- Web Bot Auth verification uses a typed error taxonomy in `src/modules/clearance/internal/web-bot-auth.ts`.
- Harness run loop tracks status and wraps execution errors in typed classes in `src/modules/harness/run-loop.ts`.
- Convex writes/readbacks should return typed domain results rather than thrown strings where a caller can recover or show a state.

## Cross-Cutting Concerns

**Logging:** Observability middleware initializes Sentry/PostHog per request in `src/start.ts`; domain observability state lives in `src/modules/observability/` and `convex/observability.ts`. Harness run evidence lives in `src/modules/harness/`.

**Validation:** Zod handles action and route-facing schemas; Convex validators handle persistent tables/functions; guardrail scanners in `src/lib/ui/contract-scans.ts` are enforced by tests under `tests/imports/` and `tests/copy/`.

**Authentication:** Clerk wraps sign-in/sign-up and operator routes via `src/routes/__root.tsx` and `src/start.ts`; local E2E bypass is explicitly guarded from production. Owner/admin server functions use server-side session helpers such as `src/lib/server/require-operator-session.ts`.

**Authorization:** Owner/admin actions stay on authenticated UI/server-function paths. Agent writes require Web Bot Auth identity plus clearance admission. Billing authority uses explicit allow/deny helpers in `src/modules/billing/internal/authority.ts`.

**Security:** Request-wide security headers and CSRF/source-write admission run in `src/start.ts`. Bounded request reads and content-type checks protect `src/routes/api.agent.tools.ts`. Provider/webhook code has module-specific admission/signature paths.

**Deployment/Runtime:** `package.json` exposes `dev`, `build`, and `start` through Vite/TanStack Start. Convex codegen validates schema and function bundling through `npm run check:convex-codegen`. E2E/browser gates use Playwright configs in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.

---

*Architecture analysis: 2026-07-07*
