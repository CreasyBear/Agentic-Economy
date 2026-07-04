# External Integrations

**Analysis Date:** 2026-07-04

## APIs & External Services

**Data Platform:**
- Convex - primary source database, query/mutation/action runtime, scheduled jobs, and public catalog/search backing.
  - SDK/Client: `convex` package, `ConvexHttpClient` in `src/lib/server/convex-source.ts`, generated API under `convex/_generated/`, and schemas in `convex/schema.ts`.
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL`; Clerk Convex JWT provider uses `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.

**Authentication & Owner Identity:**
- Clerk - owner/admin authentication, protected route provider, server auth, Convex JWT token source, and owner email readback for notification delivery.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/claim-owner-session.ts`, and `src/lib/server/require-operator-session.ts`.
  - Auth: Clerk runtime configuration plus `CLERK_JWT_ISSUER_DOMAIN` for Convex and `CLERK_SECRET_KEY` for Backend API calls in `src/lib/server/notification-provider.ts`.

**Assistant & Agent Interfaces:**
- OpenRouter - LLM tool-use answer synthesis, model metadata, and follow-up chip generation.
  - SDK/Client: custom `fetch` calls in `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/openrouter-models.ts`, and `src/modules/answer-thread/internal/llm-follow-up-chips.ts`.
  - Auth: `OPENROUTER_API_KEY`; optional config through `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, `AE_LLM_MODELS`, `AE_ANSWER_EVAL_PASSED`, `AE_ALLOW_CHAT_API`, and site URL env vars in `src/modules/answer/internal/llm-config.ts`.
- Web Bot Auth / HTTP Message Signatures - verifies signed assistant requests to the quiet agent door before write consideration.
  - SDK/Client: `web-bot-auth` package and local verification in `src/modules/clearance/internal/web-bot-auth.ts`; used by `src/routes/api.agent.tools.ts`.
  - Auth: signature headers `Signature`, `Signature-Input`, and `Signature-Agent`; default trusted signature agent is `https://chatgpt.com`; dev smoke uses `AE_DEV_WBA_SMOKE_ENABLED`, `AE_DEV_WBA_SMOKE_SECRET`, and related smoke env in `convex/clearance.ts`.
- AE actions registry - one action definition fans out to UI, HTTP API, agent JSON payloads, and the quiet agent tools endpoint.
  - SDK/Client: local action contracts in `src/modules/common/action.ts`, registered in `src/modules/actions/index.ts`, exposed by `src/routes/api.agent.tools.ts`.
  - Auth: read actions can be unsigned; writes require source/write and policy admission. The quiet agent door invokes `runHarnessTool` with writes disabled in `src/routes/api.agent.tools.ts`.

**Search:**
- Meilisearch - optional external search backend or shadow backend for registry search.
  - SDK/Client: custom HTTP client in `src/modules/registry/internal/catalog-search-port.ts`.
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, and `AE_SEARCH_TIMEOUT_MS`.
- Convex Search - default registry search backend through Convex search index.
  - SDK/Client: `registrySearchDocuments` search index in `src/modules/registry/internal/schema.ts` and read path in `src/modules/registry/registry.functions.ts`.
  - Auth: Convex URL and optional Clerk token as above.

**Billing & Paid Activation Provider Readback:**
- Autumn - billing provider API and webhook source for paid activation state.
  - SDK/Client: custom HTTP client in `src/modules/billing/internal/provider-readback.ts`, provider config/signature helpers in `src/lib/server/billing-provider.ts`, and webhook route in `src/routes/api.billing.webhook.ts`.
  - Auth: `AUTUMN_SECRET_KEY`; optional `AUTUMN_API_BASE_URL` and `AUTUMN_API_VERSION`; webhook auth via `AUTUMN_WEBHOOK_SECRET`.
- Stripe - test-mode business-action evidence and webhook verification for source readbacks; this is not an AE public payment/charge surface.
  - SDK/Client: custom HTTP Checkout Session evidence creation in `src/modules/business-action/internal/stripe-checkout.ts` and webhook verification in `src/routes/api.business-actions.stripe-webhook.ts`.
  - Auth: `STRIPE_WEBHOOK_SECRET` for incoming webhook verification; checkout evidence accepts a server-supplied test-mode Stripe secret and rejects live-mode session evidence.

**Notifications:**
- Resend - owner inquiry email dispatch and delivery webhook ingestion.
  - SDK/Client: custom HTTP client in `src/lib/server/notification-provider.ts`, dispatch route in `src/routes/api.notification.resend-dispatch.ts`, and webhook route in `src/routes/api.notification.resend-webhook.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, webhook auth via `RESEND_WEBHOOK_SECRET`, and system dispatch auth via `AE_NOTIFICATION_OUTBOX_SECRET`.
- Novu - owner/customer workflow trigger and readback for notification dispatches.
  - SDK/Client: custom HTTP client in `src/lib/server/notification-provider.ts` and dispatch route in `src/routes/api.notification.novu-dispatch.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`, and system dispatch auth via `AE_NOTIFICATION_OUTBOX_SECRET`.

**Observability:**
- Sentry - optional browser/server error tracking, tracing, and sourcemap upload.
  - SDK/Client: `@sentry/react` in `src/lib/observability/sentry.client.ts`, `@sentry/node` in `src/lib/observability/sentry.server.ts`, request isolation in `src/start.ts`, and `@sentry/vite-plugin` in `vite.config.ts`.
  - Auth: `SENTRY_DSN` or `VITE_SENTRY_DSN`; build upload uses `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`; release/env via `SENTRY_RELEASE`, `SENTRY_ENVIRONMENT`, and Vercel/GitHub env.
- PostHog - optional product analytics and funnel event capture.
  - SDK/Client: `posthog-js` in `src/lib/observability/posthog.client.ts`, `posthog-node` in `src/lib/observability/posthog.server.ts`, config in `src/lib/observability/config.ts`, and funnel route in `src/routes/api.observability.funnel.ts`.
  - Auth: `POSTHOG_KEY` or `VITE_POSTHOG_KEY`; optional `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, and `VITE_POSTHOG_APP_URL`.

**Maps & Embedded Media:**
- Google Maps Embed - optional generated map artifact rendering.
  - SDK/Client: iframe URL built in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.

## Data Storage

**Databases:**
- Convex
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
  - Client: `ConvexHttpClient`, `makeFunctionReference`, generated Convex APIs under `convex/_generated/`, and function refs in files such as `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/modules/billing/billing.functions.ts`.
  - Schema: `convex/schema.ts` composes tables from module schema files including `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/billing/internal/schema.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/modules/observability/internal/schema.ts`, `src/modules/security/internal/schema.ts`, and `src/modules/answer-thread/internal/convex-schema.ts`.
  - Key tables: `owners`, `businesses`, `businessContexts`, `claims`, `businessServices`, `serviceCapabilities`, `registryProjectionItems`, `registrySearchDocuments`, `inquiryThreads`, `inquiryMessages`, `billingOffers`, `billingProviderEvents`, `notificationDispatches`, `operationKeys`, `auditEvents`, `answerThreads`, and `answerToolCalls`.

**File Storage:**
- Not detected for application data. No application path uses Convex file storage APIs; Convex file-storage rules are documented in `convex/_generated/ai/guidelines.md`.

**Caching:**
- In-memory OpenRouter model cache with a short TTL in `src/modules/answer/internal/openrouter-models.ts`.
- PostHog server batching in `src/lib/observability/posthog.server.ts`.
- No Redis, Memcached, or external cache service detected in `package.json` or source imports.

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: `clerkMiddleware()` in `src/start.ts`, conditional `ClerkProvider` wrapping protected route families in `src/routes/__root.tsx`, and server auth helpers in `src/lib/server/claim-owner-session.ts` and `src/lib/server/require-operator-session.ts`.
  - Convex token bridge: `createAuthenticatedConvexClient` calls `auth().getToken({ template: 'convex' })` in `src/lib/server/convex-source.ts`; Convex accepts Clerk issuer configuration in `convex/auth.config.ts`.

**Agent Identity:**
- Web Bot Auth signatures verify agent request identity in `src/modules/clearance/internal/web-bot-auth.ts` and are used by `src/routes/api.agent.tools.ts`.
- The quiet agent door is at `GET /api/agent/tools` and `POST /api/agent/tools` in `src/routes/api.agent.tools.ts`; public copy must not label it with internal protocol wording.

**Source Write Admission:**
- Server-origin write admission uses HMAC-scoped source-write requests in `src/modules/security/source-write-admission.ts` and `src/lib/server/source-write-admission.ts`.
- Scopes include owner claim, catalog publish, public inquiry, owner inquiry, protected action, billing, admin operator, discovery repair, notification repair, harness session, and agent identity.

## Monitoring & Observability

**Error Tracking:**
- Sentry - optional and disabled when `AE_DISABLE_OBSERVABILITY` or `VITE_AE_DISABLE_OBSERVABILITY` is set in `src/lib/observability/config.ts`.
- Sentry client scrubs sensitive query parameters in `src/lib/observability/sentry.client.ts`; Sentry server scrubs request data in `src/lib/observability/sentry.server.ts`.

**Logs:**
- Server request failures are captured through Sentry isolation middleware and PostHog flushing in `src/start.ts`.
- Application audit and funnel state is persisted in Convex tables from `src/modules/observability/internal/schema.ts`.
- Security and admission events are persisted through Convex functions under `convex/security.ts`, `convex/observability.ts`, and related module schemas.

## CI/CD & Deployment

**Hosting:**
- Vercel - configured by Nitro preset `vercel` with Node runtime `nodejs20.x` in `vite.config.ts`.
- Convex deployment - required backend platform for database functions, cron jobs, and source writes under `convex/`.

**CI Pipeline:**
- GitHub Actions - `.github/workflows/eval-gate.yml` runs on push/PR to `main`.
- Pipeline steps include `npm ci`, `npm run typecheck`, `npm run check:convex-codegen`, unit/integration/type/copy/SEO/UI/import/source tests, promptfoo answer eval, artifact upload, and `npm run build`.

## Environment Configuration

**Required env vars:**
- Core Convex/source: `CONVEX_URL`, `VITE_CONVEX_URL`, `AE_SOURCE_WRITE_SECRET`.
- Auth: `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`.
- Canonical/base URLs: `AE_APP_BASE_URL`, `VITE_AE_APP_BASE_URL`, `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_SITE_URL`, `SITE_URL`, `VITE_SITE_URL`, `VERCEL_URL`.
- Assistant/LLM: `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, `AE_LLM_MODELS`, `AE_ANSWER_EVAL_PASSED`, `AE_ALLOW_CHAT_API`.
- Search: `AE_SEARCH_BACKEND`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_TIMEOUT_MS`.
- Billing: `AUTUMN_SECRET_KEY`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AUTUMN_WEBHOOK_SECRET`.
- Business-action evidence: `STRIPE_WEBHOOK_SECRET`.
- Notifications: `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, `NOVU_API_BASE_URL`.
- Observability: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE`, `SENTRY_ENVIRONMENT`, `VITE_SENTRY_ENVIRONMENT`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, `VITE_AE_DISABLE_OBSERVABILITY`.
- Maps: `VITE_GOOGLE_MAPS_API_KEY`.
- Local/deploy tests: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, `PLAYWRIGHT_BASE_URL`, `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `AE_DEV_WBA_SMOKE_ENABLED`, `AE_DEV_WBA_SMOKE_SECRET`, and smoke-specific `SMOKE_*` variables used under `tests/deploy-smoke/` and `tests/dev-smoke/`.
- Clearance signing: `AE_CLEARANCE_SIGNING_SECRET` and `AE_CLEARANCE_SIGNING_KEY_ID` in `src/modules/clearance/internal/signing.ts`.

**Secrets location:**
- `.env`, `.env.local`, and `.env.example` exist at the repository root; contents were not read.
- CI secrets are consumed by `.github/workflows/eval-gate.yml`.
- Convex deployment env is configured through Convex environment variables referenced by `convex/` functions and smoke instructions in `tests/dev-smoke/agent-door-wba-source-smoke.test.ts`.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/billing/webhook` - Autumn webhook verified with Svix headers and `AUTUMN_WEBHOOK_SECRET` in `src/routes/api.billing.webhook.ts` and `src/lib/server/billing-provider.ts`.
- `POST /api/notification/resend-webhook` - Resend webhook verified with Svix headers and `RESEND_WEBHOOK_SECRET` in `src/routes/api.notification.resend-webhook.ts` and `src/lib/server/notification-provider.ts`.
- `POST /api/business-actions/stripe-webhook` - Stripe webhook verified with `stripe-signature` and `STRIPE_WEBHOOK_SECRET` in `src/routes/api.business-actions.stripe-webhook.ts`.
- `POST /api/notification/resend-dispatch` - system-triggered dispatch endpoint authorized with `AE_NOTIFICATION_OUTBOX_SECRET` in `src/routes/api.notification.resend-dispatch.ts`.
- `POST /api/notification/novu-dispatch` - system-triggered workflow dispatch endpoint authorized with `AE_NOTIFICATION_OUTBOX_SECRET` in `src/routes/api.notification.novu-dispatch.ts`.
- `POST /api/agent/tools` - quiet agent tool invocation endpoint in `src/routes/api.agent.tools.ts`; exposed tools are action contracts from `src/modules/actions/index.ts`.
- `POST /api/chat` - non-production or explicitly enabled chat endpoint in `src/routes/api.chat.ts`; disabled in production unless `AE_ALLOW_CHAT_API=1`.
- `POST /api/answer/turn` - answer-thread streaming endpoint in `src/routes/api.answer.turn.ts`.
- `POST /api/observability/funnel` - funnel event ingestion in `src/routes/api.observability.funnel.ts`.

**Outgoing:**
- Convex queries, mutations, and actions through `src/lib/server/convex-source.ts`.
- Clerk Backend API user lookup at `https://api.clerk.com/v1/users/:id` in `src/lib/server/notification-provider.ts`.
- OpenRouter chat completions and model list through `src/modules/answer/internal/answer-tool-use-agent.ts` and `src/modules/answer/internal/openrouter-models.ts`.
- Meilisearch index/search/settings/task HTTP calls through `src/modules/registry/internal/catalog-search-port.ts`.
- Autumn customer, billing attach, customer portal, and readback API calls through `src/modules/billing/internal/provider-readback.ts`.
- Resend email send calls through `src/lib/server/notification-provider.ts`.
- Novu workflow trigger and message readback calls through `src/lib/server/notification-provider.ts`.
- Stripe test-mode Checkout Session evidence calls through `src/modules/business-action/internal/stripe-checkout.ts`.
- Sentry client/server event transport through `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and sourcemap upload in `vite.config.ts`.
- PostHog client/server analytics through `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
- Google Maps embed iframe URLs through `src/components/ae/artifacts/AeGenerativeMap.tsx`.

---

*Integration audit: 2026-07-04*
