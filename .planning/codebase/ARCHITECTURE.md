# Architecture

**Analysis Date:** 2026-08-06

Map of the **current** dirty working tree (HEAD `4a17c63`, uncommitted in-flight work included). This document describes the *conceptual* organization of Agentic-Economy: patterns, layers, data flows, key abstractions, entry points, error handling, and cross-cutting concerns. For the physical layout see `STRUCTURE.md`; for prompt/model/data-flow specifics see the separately maintained `.planning/codebase/PROMPT-DATA-FLOW.md` (do **not** edit that file).

## Pattern Overview

**Overall:** Modular monorepo-of-modules — a deterministic kernel driving a React/TanStack/Convex application. The system is a **capability marketplace**: third-party capabilities (OpenAPI/MCP/x402 providers) are *admitted*, *published*, discovered by natural-language customer requests, *planned* into deterministic route mandates, *executed* by transport workers, and the results are *persisted as evidence* through durable projections. Business logic is organized into bounded-context `src/modules/<context>/` packages; Convex is the single durable source of truth; a deterministic kernel owns bounds, validation, dispatch, and persistence so model/provider observations are never trusted without deterministic checking.

**Key Characteristics:**
- **Convex is the durable source of truth.** Tables are defined once in `src/modules/<ctx>/internal/convex-schema.ts` (or `schema.ts`), composed centrally in `convex/schema.ts` via `defineSchema({...ctxTables})`. Change a table → run `npm run check:convex-codegen`.
- **Deterministic kernel over model output.** Every surface reads/writes only through a deterministic compiler/interpreter (`src/modules/customer-request/compiler.ts`, `semantic-interpreter.ts`) and route-mandate layer (`route-mandate.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts`). The eligibility gate (`src/modules/customer-request/application/interpret-compile/eligibility.ts`) enforces the honesty floor: `no_candidates` / `non_executable` / `hostile` / `greenfield` / `genuine`.
- **Action contract as the cross-surface primitive.** One registry (`src/modules/actions/index.ts`) exposes every action to UI / HTTP / agent-JSON / answer-thread / CLI / MCP via a single `defineAction` contract (`src/modules/common/action.ts`). Surfaces never duplicate domain logic.
- **Bounded-context modules with explicit public seams.** Each domain exposes a `public.ts` (pure projection / typing) plus `*.functions.ts` / `*.actions.ts` (Convex) and keeps impure internals under `internal/`. Import-boundary tests enforce module isolation (`tests/imports/*.test.ts`).
- **Producer→plan→execute→evidence pipeline** with a money ledger and x402 payment gate (`src/modules/money/`, `src/modules/action-invocation/`).
- **Retired legacy routing kernel.** `src/modules/routing-kernel/retirement.ts` plus `tools/release/verify-kernel-retirement.mjs` keep legacy engine code from creeping back; there are dedicated import-boundary tests (`kernel-retirement-manifest.test.ts`, `legacy-engine-retirement.test.ts`).

## Layers

**Presentation / Routes (React)**
- Purpose: public storefront + operator/admin console surfaces; renders Convex projections read back via the {@link src/modules/*/public.ts} APIs.
- Contains: `src/routes/*.tsx` (TanStack file routes: `index.tsx`, `$slug.tsx`, `_operator/*`, `api.*`, `oauth.*`, `[.]well-known/*`), UI primitives in `src/components/ui/`, domain components in `src/components/ae/**` (chat, plan, supply, operator, status, customer-request, harness, action-invocation).
- Depends on: `src/modules/*/public.ts` projection types + `src/lib/client/*` and Convex client hooks. Does **not** import domain internals.
- Used by: browser users and external agents (agent-content-negotiation serves markdown to agents).

**Server functions / route handlers**
- Purpose: server-side RPC surface for the UI and external client calls. Each route file wires to a `*.functions.ts` / `*.actions.ts` / `lib/server/*` handler.
- Contains: `src/lib/server/*` (MCP API, rate-limit, sandbox-capability-provider, work-tree-agent-api, customer-request-agent-oauth-api, source-write-admission, security), `src/lib/http/*` (CSRF, cookies, header/security, OAuth challenge, agent-content-negotiation), and `convex/http.ts`.
- Depends on: `src/modules/**/public.ts` and domain functions/actions.
- Used by: the browser/operator surfaces and external agents/APIs.

**Application / deterministic domain kernel**
- Purpose: business logic — the "brain" that turns a natural-language request into a deterministic, bounded, rechargeable plan.
- Contains: `src/modules/customer-request/` (semantic-interpreter, compiler, eligibility, route-mandate, agent-contract, customer-projection, route-plan-customer-projection, evaluation, legacy-v1), `src/modules/capability-supply/` (admission, publication, provenance, operation-projection, supplied-quote, liquidity, readiness-probe, x402-payment-signer), `src/modules/action-invocation/` (standing-mandate, durable, dynamic-published-contract, application-service, host-projection), `src/modules/money/` (ledger, live-money-gate, topup, payout-policy, stripe-webhook, pricing), `src/modules/registry/`, `src/modules/catalog/`, `src/modules/discovery/`, `src/modules/answer/`, `src/modules/answer-thread/`, `src/modules/inquiries/`, `src/modules/work-tree/`, `src/modules/harness/`, `src/modules/security/`.
- Depends on: Convex tables + `src/modules/common/*` (action, result, stable-hash, canonical-digest, json-pointer, csrf).
- Used by: Convex functions/actions which front these modules.

**Persistence / Convex**
- Purpose: the single source of truth; durable projections, ledgers, journals, and read projections.
- Contains: `convex/*.ts` — table-defining files (`customerRequestV2.ts`, `capabilitySupply.ts`, `catalog.ts`, `registry.ts`, `discovery.ts`, `business.ts`, `moneyLedger.ts`, `workTrees.ts`, `security.ts`, `notificationOutbox.ts`, `harnessSessions.ts`, `devSeed.ts`, …) plus port functions (`*Ports.ts`, `customerRequestRouteExecution.ts`, `customerRequestRouteMandate.ts`, `customerRequestApplication.ts`), cron (`crons.ts`), seed (`devSeed.ts`, `devSeedStore.ts`), and `_generated/` codegen.
- Depends on: `src/modules/**/internal/*` (schema + logic) and `src/modules/common/*`.
- Used by: server functions/actions and route loaders.

**Tooling / eval / release**
- Purpose: development, evidence packets, parity checks, and release gates not part of the running app.
- Contains: `tools/` (`dev/`, `release/`, `ae/`), `eval/` (`answer/`, `engine/`, `quality/`, `consumer/`, `product-foundry/`, `parity/`, `toolcall/`), `scripts/audit-action-surfaces.mjs`, `.github/workflows/` (kernel-release-gate, react-doctor).
- Depends on: source modules; not imported by the app.

## Data Flow

### Customer-request → plan → execute → evidence (primary)
1. **Entry:** browser or agent posts a natural-language customer request through a route or the chat UI (`src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`); the answer-thread/chat path goes through `src/components/ae/chat/AeChat.tsx` → `src/modules/answer/`.
2. **Semantic interpretation:** `src/modules/customer-request/semantic-interpreter.ts` (via `src/modules/customer-request/application/interpret-compile/eligibility.ts`) tokenizes the request, runs the **eligibility gate**, and builds a desired-capability understanding — never trusting the model to pick providers.
3. **Compile:** `src/modules/customer-request/compiler.ts` + `agent-contract.ts` compile the interpretation into a bounded **route mandate** (`route-mandate.ts`), an explicit plan of capabilities/prices/limits, persisted as `customerRequestV2` tables (`internal/convex-v2-schema.ts`).
4. **Dispatch:** Convex route-execution functions (`convex/customerRequestRouteExecution.ts`, `customerRequestRouteExecutionDispatchPorts.ts`) push the mandate to a transport worker — `customerRequestRouteTransportWorker.ts` + `customerRequestRouteCancellationWorker.ts`.
5. **Execution:** `src/modules/customer-request/openrouter-transport.ts` (or x402 capability transport) calls the provider; `src/modules/action-invocation/` (`standing-mandate.ts`, `durable.ts`, `application-service.ts`) enforces the money gate and x402 payment via `src/modules/capability-supply/internal/x402-payment-signer.ts` + `src/modules/money/live-money-gate.ts`.
6. **Evidence:** results are journaled (`customerRequestRouteExecutionJournalPorts.ts`), recorded in `src/modules/harness/` run collection for agent runs, and projected to customers via `customer-projection.ts` / `route-plan-customer-projection.ts`. Hosted/provider/customer evidence ceilings are documented in `.planning/codebase/PROMPT-DATA-FLOW.md`.

### Capability admission → publication → discovery
1. **Admission:** `src/modules/capability-supply/internal/admit-provider-schema.ts` (with `schema-deref.ts` for OpenAPI deref, injection outside the Convex chain) + publication importers (`publication-importers.ts`, curated `*-publications.ts`) normalize a provider's real schema deterministically, refusing `schema_profile_unsupported` when unable.
2. **Publication:** `internal/publication/{validate,admit,refresh,publish,draft,withdraw,lifecycle,provenance,source}.ts` establish tri-state provenance and promotion.
3. **Projection/discovery:** `operation-projection.ts`, `src/modules/registry/operations.actions.ts`, `src/modules/discovery/` build searchable operation descriptors; the NL engine matches via `registry.operations.search` (discovery is the retrieval authority — see `.planning/codebase/PROMPT-DATA-FLOW.md`).
4. **Keyless vs keyed:** keyless ops are gate-checked for eligibility; keyed/paid ops route through the money ledger + x402 (`src/modules/capability-supply/internal/readiness-probe.ts` resolves the x402 EVM signing credential).

### Observability / notification
- Client events → PostHog (`src/lib/observability/posthog.client.ts`); server errors → Sentry (`sentry.server.ts`); funnel events → `src/lib/observability/funnel.*`. Outbox pattern: `src/modules/notification-outbox/` → Resend / Novu dispatch routes (`api.notification.resend-dispatch.ts`, `api.notification.novu-dispatch.ts`) with webhooks (`resend-webhook.ts`, `stripe-webhook.ts`).

## Key Abstractions

- **Action contract / registry** — `src/modules/common/action.ts` defines `defineAction` with `ActionSurface` (`ui|http|agentJson|answerThread|cli|mcp`), consequence/authority/retry/effect classification, `ActionInvocationContract`, and `describeActionForAgent`. `src/modules/actions/index.ts` is the single cross-surface registry (`listActions`, `findAction`, `listMcpActions`, deterministic `mcpToolName`).
- **Deterministic kernel** — `src/modules/customer-request/application/interpret-compile/eligibility.ts` (honesty floor), `compiler.ts`, `semantic-interpreter.ts`, `route-mandate.ts`. Model output is treated as untrusted observation until deterministically validated.
- **Capability supply / provenance** — `src/modules/capability-supply/` + `internal/` (admit → publish → provenance → liquidity → readiness). Tri-state provenance + observed-real promotion distinguish curated/demo/real supply.
- **Money ledger + x402** — `src/modules/money/ledger.ts`, `live-money-gate.ts`, `topup.ts`, `payout-policy.ts`, `stripe-webhook.ts`; `src/modules/action-invocation/` is the payment-bearing action surface; `src/modules/capability-supply/internal/x402-payment-signer.ts` is the quarantined EVM signer (import-boundary enforced).
- **Standing mandate / durable execution** — `src/modules/action-invocation/standing-mandate.ts`, `durable.ts`, `dynamic-published-snapshot-verifier.ts` pin provider bindings/schemas/spend ceilings for the planner to reference.
- **Harness / observation → evidence** — `src/modules/harness/` (`run-loop.ts`, `run-collector.ts`, `tool-contract.ts`, `emission-guard.ts`, `action-tool.ts`) collects agent runs into evidence envelopes.
- **Projection pattern** — every context exposes redacted `public.ts` projections consumed by routes/components rather than raw documents (`capacity-supply/operation-projection.ts`, `customer-request/customer-projection.ts`, `catalog/`, etc.).
- **Deterministic planning assistants** — `src/lib/operator/navigation.ts`, `src/lib/operator/route-options.ts`, `status-presentation.ts`, `contract-scans.ts`, `journey-events.ts` derive UI state mechanically (no ad-hoc statuses).

## Entry Points

| Entry | Location | Trigger | Responsibility |
|---|---|---|---|
| TanStack router | `src/router.tsx` + `src/routeTree.gen.ts` | browser navigation | map URL → page component |
| TanStack Start bootstrap | `src/start.ts` | server boot | wiring request middleware (observability, security headers, agent-negotiation, CSRF, source-write, Clerk) |
| Public pages | `src/routes/index.tsx`, `$slug.tsx`, `claim.tsx`, `$slug.inquiry.tsx`, `sign-*.tsx` | browser/SEO/agents | render projections |
| Operator console | `src/routes/_operator/*.tsx` | owner/admin UI | run/supply/offerings/inquiries/claims/search-gaps/admin views |
| HTTP/API routes | `src/routes/api.*.ts`, `oauth.*`, `[.]well-known/*` | external clients/agents | server functions, MCP, OAuth, webhooks, sitemap |
| Server functions/actions | `src/modules/*/*.functions.ts` / `*.actions.ts` + `convex/*.ts` | route/serverFn calls | execute domain logic with Convex durability |
| Convex router | `convex/http.ts`, `convex/convex.config.ts`, `convex/crons.ts` | Convex runtime | HTTP endpoints, component+env wiring, crons |

## Error Handling

- **Typed results over throws** — domain logic returns discriminated results (`src/modules/common/result.ts`); actions return `ActionResult` tagged by `kind`; the kernel classifies outcomes rather than bubbling raw exceptions.
- **Refusal as a first-class outcome** — the eligibility gate and admission seam return explicit refusal codes (`no_candidates`, `non_executable`, `hostile`, `schema_profile_unsupported`) that surfaces render honestly instead of fabricating plans.
- **Middleware-based HTTP errors** — `src/start.ts` request middleware wraps per-route errors, captures to Sentry, and applies security headers/CSRF consistently.
- **Observability error capture** — `src/lib/observability/sentry.server.ts` captures server exceptions with `ae.path` tags; `AeObservabilityErrorBoundary.tsx` handles client render errors.
- **Retry semantics** — actions declare `ActionRetryClass` (`replayable | attributable_retry | reconcile_before_retry`); `src/modules/action-invocation/durable.ts` + `standing-mandate-validation.ts` govern retry within a mandate.
- **Leaky-proofing** — `tests/imports/*.test.ts` (route-boundary, capability-contract-boundaries, customer-request-boundaries, kernel-retirement, action-invocation-host-boundaries) are treated as error-prevention gates.

## Cross-Cutting Concerns

- **Determinism** — the compiler/interpreter + route mandate centralize all non-vendor logic so outputs don't depend on model whim; discovery-trust selection keeps the model from re-ranking a deterministic pool. See `convex/customerRequestRouteMandate.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts`.
- **Validation** — Zod 4 schemas (`src/modules/**/internal/*.schema.ts` / `convex-schema.ts`) at module boundaries; `src/modules/harness/strict-schema.ts` + `tool-contract.ts` for agent tool I/O; `src/modules/capability-supply/internal/admit-provider-schema.ts` for provider schemas.
- **x402 payment** — `src/modules/capability-supply/internal/x402-payment-signer.ts` (quarantined EVM key handling), `src/modules/money/live-money-gate.ts` (first-dollar gate), `src/modules/action-invocation/` (paid mandates), `tests/imports/paid-operation-development-surface-exclusion.test.ts` keeps paid paths out of dev surfaces.
- **Auth & identity** — Clerk middleware (`src/start.ts`) for human identity; actor/OAuth for agents (`src/modules/customer-request/agent-access-console.ts`, `customerRequestAgentOAuth.ts`, `oauth.*` routes, `http-message-signatures-directory`); `src/modules/security/` (`source-write-admission.ts`, `security.ts`, `authz.ts`).
- **Logging / observability** — PostHog client + Sentry server/client + funnel events; never log credential values (env var names only).
- **Secrets** — env var NAMES only in config (`convex/convex.config.ts` env block, `.env.example`); `.env.local` / `.vercel/*.env*` are git-ignored credential stores; `src/lib/dev/local-e2e-auth.ts` gates any local auth bypass behind env.
- **Concurrency / rate limiting** — `@convex-dev/rate-limiter`, `@convex-dev/workflow`, `@convex-dev/workpool` components wired in `convex/convex.config.ts`; `src/lib/server/rate-limit.ts` + `tests/setup/http-rate-limit.ts`.
- **Import boundaries** — enforced by `tests/imports/*` so modules cannot reach across seams (e.g. x402 signer quarantined, routing-kernel retired, paid surfaces excluded from dev).

---
*Architecture analysis: 2026-08-06*
<!-- refreshed: 2026-08-06 -->
