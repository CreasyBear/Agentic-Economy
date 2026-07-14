# External Integrations

**Analysis Date:** 2026-07-14

## APIs & External Services

**Core hosting:**
- Vercel - canonical TanStack Start web/server deployment.
  - SDK/Client: raw Vercel REST calls in `tools/release/deploy-customer-request-git-source.ts`; Nitro `vercel` preset in `vite.config.ts`.
  - Auth: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`; optional automation bypass is read by release tooling.
- Convex Cloud - durable database, queries, mutations, actions, schedules, cron, and typed server adapters.
  - SDK/Client: `convex`; backend entrypoints under `convex/`, browser/server clients under `src/lib/server/convex-source.ts` and related adapters.
  - Auth: `VITE_CONVEX_URL` or `CONVEX_URL`; authenticated human calls use Clerk's `convex` JWT template.

**Authentication:**
- Clerk - human sessions, operator authorization, Convex JWT identity, and scoped external-agent API keys.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/customer-request-agent-auth.ts`; direct Clerk REST is used by `src/lib/server/notification-provider.ts` and release credential tooling.
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN`.

**AI inference:**
- OpenRouter - search-answer synthesis and V2 Customer Request semantic interpretation.
  - SDK/Client: guarded `fetch` calls in `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/openrouter-models.ts`, and `src/modules/customer-request/openrouter-transport.ts`.
  - Auth: `OPENROUTER_API_KEY`; answer model/configuration is bounded by `src/modules/answer/internal/llm-config.ts`, and Request model configuration by `src/modules/customer-request/openrouter-transport.ts`.

**Capability providers:**
- HTTP JSON providers - generic preparation egress and readiness probing for admitted `http-json:v1` bindings.
  - SDK/Client: native `fetch` in `convex/customerRequestV2PreparationEgress.ts`; guarded `undici` transport in `convex/capabilitySupplyReadiness.ts`.
  - Auth: binding configuration references environment variable names; secrets remain deployment-owned and are never stored in publication metadata.
- MCP JSON-RPC providers - generic tool invocation and readiness probing for admitted `mcp-jsonrpc:v1` bindings.
  - SDK/Client: the same bounded transport seam in `convex/customerRequestV2PreparationEgress.ts` and `convex/capabilitySupplyReadiness.ts`.
  - Auth: environment-backed credential references from admitted binding configuration.
- OpenAPI 3.1 and x402 resource documents - ingestion formats normalized by `src/modules/capability-supply/internal/publication-importers.ts`.
  - SDK/Client: no provider SDK; bounded document parsing and JSON Schema validation.
  - Auth: not applicable at import. x402 payment execution is refused; compatible metadata normalizes to the generic HTTP adapter only.

**Registry search:**
- Meilisearch - optional derived registry projection and search backend.
  - SDK/Client: direct REST client in `src/modules/registry/internal/catalog-search-port.ts` with selection/fallback in `src/modules/registry/registry.functions.ts`.
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, and `AE_SEARCH_TIMEOUT_MS` are read by source configuration.

**Notifications:**
- Resend - admitted inquiry email delivery plus signed webhook readback.
  - SDK/Client: direct REST calls in `src/lib/server/notification-provider.ts`; dispatch and webhook routes in `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.resend-webhook.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, and the internal `AE_NOTIFICATION_OUTBOX_SECRET`.
- Novu - admitted notification workflow dispatch and transaction readback.
  - SDK/Client: direct REST calls in `src/lib/server/notification-provider.ts`; dispatch route in `src/routes/api.notification.novu-dispatch.ts`.
  - Auth: `NOVU_SECRET_KEY`, workflow identifiers, and the internal `AE_NOTIFICATION_OUTBOX_SECRET`.

**Optional client services:**
- Google Maps - optional map artifact in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - SDK/Client: browser embed loaded only when configured; CSP allowances live in `src/lib/http/security-headers.ts`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.

**Dormant/example services:**
- Web Bot Auth signature directories - current source publishes `src/routes/[.]well-known/http-message-signatures-directory.ts` and retains verification/example code, but the current external Request API authenticates Clerk API keys in `src/lib/server/customer-request-agent-auth.ts`.
  - SDK/Client: `web-bot-auth` and `http-message-sig` in `src/modules/routing-kernel/` and `examples/`.
  - Auth: example/signing configuration only; do not describe this as current Request authorization.
- Cloudflare Workers - standalone routing-edge and agent-directory examples under `examples/routing-edge/` and `examples/routing-agent-directory/`.
  - SDK/Client: Wrangler configuration in each example directory.
  - Auth: example-specific Worker secrets; not part of the canonical Vercel/Convex application path.

## Data Storage

**Databases:**
- Convex Cloud document database.
  - Connection: `VITE_CONVEX_URL` or `CONVEX_URL`.
  - Client: `convex`; schema composition is owned by `convex/schema.ts`, which imports domain schemas under `src/modules/*/internal/`.
- Durable domains include answer threads, business ownership, catalog/registry projections, capability contracts and supply, Customer Requests and evidence, inquiries/notifications, harness records, observability, security/settings, and retained routing history.
- Convex backend evolution is source/schema driven; there is no SQL migration layer. Use explicit migration functions such as `convex/authzMigration.ts` where durable rewrites are required.

**File Storage:**
- No production object-storage integration detected.
- Local generated artifacts and evaluation outputs are tooling evidence only; do not use them as durable application state.

**Caching:**
- No external cache service detected.
- Meilisearch is a derived search projection, not source-of-truth storage or a general cache.
- In-process module caches, browser state, and provider caches are runtime optimizations and must not become authority.

## Authentication & Identity

**Auth Provider:**
- Clerk.
  - Implementation: `clerkMiddleware()` is included by `src/start.ts` except under the explicit local E2E bypass; `src/lib/server/convex-source.ts` obtains the Clerk `convex` JWT for authenticated Convex calls.
  - External agents use Clerk `api_key` tokens with the exact Customer Request scope in `src/lib/server/customer-request-agent-auth.ts`; token identity alone is insufficient without the required scope.
  - Owner/admin UI routes under `src/routes/_operator/` perform explicit owner/operator checks.
  - Server-originated writes use source-write admission and replay nonces through `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`; do not treat transport authentication as verb authorization.

## Monitoring & Observability

**Error Tracking:**
- Sentry is optional and configuration-gated.
  - Browser/server implementations: `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`.
  - Build upload: `@sentry/vite-plugin` activates in `vite.config.ts` only when its complete credential tuple exists.
  - Runtime/build configuration includes DSN, environment, release, auth token, organization, and project names read by source; absence disables the integration.

**Logs:**
- PostHog browser/server funnel capture is normalized through `src/lib/observability/`, `src/modules/observability/`, and `src/routes/api.observability.funnel.ts`.
- Convex durable audit, provider evidence, and notification outbox rows are inspectable operational records.
- Vercel and Convex provider logs are deployment-owned. No separate log aggregation SDK is declared in `package.json`.

## CI/CD & Deployment

**Hosting:**
- Vercel Node serverless hosts the TanStack Start application emitted by Nitro in `vite.config.ts`.
- Convex Cloud hosts durable application state and backend functions.
- Cloudflare Workers appear only in standalone examples and are not deployed by the canonical release workflow.

**CI Pipeline:**
- GitHub Actions workflow `.github/workflows/kernel-release-gate.yml` runs source gates and exact-revision deployment tooling.
- `tools/release/deploy-customer-request-git-source.ts` creates and reads back a Vercel deployment for a pinned Git SHA; the workflow deploys Convex from the same checkout and runs release proof.
- The untracked `.github/workflows/react-doctor.yml` is local working-tree material and is not canonical CI authority.
- Source configuration or a successful local test does not prove hosted customer reachability; record exact-revision route evidence before making a production claim.

## Environment Configuration

**Required env vars:**
- Core web/auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`.
- Core data: `VITE_CONVEX_URL` or `CONVEX_URL` as appropriate to the runtime.
- AI-backed Request/answer paths: `OPENROUTER_API_KEY` plus bounded optional model settings.
- Exact release: Vercel project credentials, Convex deployment credentials, and Clerk release identity configuration read by `.github/workflows/kernel-release-gate.yml` and `tools/release/`.
- Provider-specific variables are required only when that provider path is intentionally enabled; inspect its guarded reader before deployment.

**Secrets location:**
- Vercel environment owns web/server runtime secrets.
- Convex deployment environment owns backend-only secrets and credential references used by Convex actions.
- GitHub environments own release/deployment credentials.
- Cloudflare secrets apply only to standalone examples.
- `.env.example` and `.env.local` exist locally; neither file is evidence that a service is configured, and their contents must not be copied into maps or logs.

## Webhooks & Callbacks

**Incoming:**
- `/api/notification/resend-webhook` - raw Resend event admission with signature, timestamp, payload-hash, and durable deduplication in `src/routes/api.notification.resend-webhook.ts`.
- `/api/notification/resend-dispatch` - internal outbox dispatch protected by the notification outbox secret.
- `/api/notification/novu-dispatch` - internal Novu workflow dispatch protected by the notification outbox secret.
- `/api/requests*` - Clerk-authenticated human Customer Request surface implemented in `src/routes/api.requests*.ts`.
- `/api/v1/requests*` - Clerk API-key-authenticated external-agent Customer Request surface implemented in `src/routes/api.v1.requests*.ts`.
- `/api/sandbox/capability` - labelled acceptance provider in `src/routes/api.sandbox.capability.ts`; sandbox contract evidence is not real-supply or fulfilment evidence.
- Convex `/v1/*`, `/mcp`, and retired routing descriptor paths return retirement responses from `convex/http.ts`; do not route new product work through them.

**Outgoing:**
- OpenRouter chat-completion/model requests from answer and Customer Request transports.
- Convex HTTP calls from web/server source adapters.
- Clerk REST calls for owner lookup and temporary release credentials.
- Admitted HTTP JSON and MCP JSON-RPC capability preparation/readiness requests from Convex actions.
- Meilisearch search/index task calls when the configured backend mode enables them.
- Resend and Novu notification delivery/readback calls from admitted dispatch routes.
- Sentry and PostHog events only when observability configuration enables them.
- Vercel deployment API calls from exact-source release tooling.

---

*Integration audit: 2026-07-14*
