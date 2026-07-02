# External Integrations

**Analysis Date:** 2026-07-02

## APIs & External Services

**Agentic Economy Public & Agent Surfaces:**
- Public business catalog API - human and assistant-readable catalog data.
  - SDK/Client: TanStack Start route handlers in `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, and `src/routes/api.businesses.$slug.ts`.
  - Auth: public read-only endpoints; no API key.
- Quiet agent-tools door - lists and invokes assistant-callable actions without using public human-surface protocol language.
  - SDK/Client: route handler in `src/routes/api.agent.tools.ts`; action registry in `src/modules/actions/index.ts`.
  - Auth: action-specific; `registry.search` and `registry.detail` are read-only, `inquiry.submit` is source-write admission gated.
- Assistant discovery files - `llms.txt`, sitemap, robots, UCP fallback, and discovery schema/example/fixture JSON.
  - SDK/Client: `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/$slug.ucp.ts`, and `src/routes/api.discovery.*.ts`.
  - Auth: public read-only endpoints.

**Backend & Database:**
- Convex - source-of-truth database and function backend.
  - SDK/Client: `convex` package; HTTP client wrapper in `src/lib/server/convex-source.ts`; functions under `convex/`.
  - Auth: Clerk JWT issuer through `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`; owner/authenticated server calls request a Clerk token template named `convex`.

**Authentication:**
- Clerk - owner/admin identity provider and server-side owner lookup for notifications.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, and `src/lib/server/convex-source.ts`.
  - Auth: Clerk frontend env is handled by the Clerk SDK; server lookups use `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`; Convex JWT issuer uses `CLERK_JWT_ISSUER_DOMAIN`.

**AI & Answer Generation:**
- OpenRouter - OpenAI-compatible chat completions and model catalog.
  - SDK/Client: direct `fetch` calls in `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/answer/internal/openrouter-models.ts`.
  - Auth: `OPENROUTER_API_KEY`; optional `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_SITE_URL`, and `SITE_URL`.
- Promptfoo - offline answer evaluation gate.
  - SDK/Client: `promptfoo` CLI configured by `eval/answer/promptfooconfig.yaml`; custom assertions/providers in `eval/answer/`.
  - Auth: not detected for the checked-in eval config; runtime controlled by `PROMPTFOO_CONFIG_DIR` and `PROMPTFOO_DISABLE_WAL_MODE`.

**Search:**
- Meilisearch - optional catalog search backend beside Convex search.
  - SDK/Client: direct HTTP port in `src/modules/registry/internal/catalog-search-port.ts`.
  - Auth: `MEILISEARCH_ADMIN_KEY`; host/index controlled by `MEILISEARCH_HOST`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, and `AE_SEARCH_TIMEOUT_MS`.

**Billing & Payment Evidence:**
- Autumn Cloud - paid activation billing provider and hosted billing portal.
  - SDK/Client: direct HTTP provider in `src/modules/billing/internal/provider-readback.ts`; server config and webhook verification in `src/lib/server/billing-provider.ts`; plan config in `autumn.config.ts`.
  - Auth: `AUTUMN_SECRET_KEY`; optional `AUTUMN_API_BASE_URL` and `AUTUMN_API_VERSION`; webhook signing secret `AUTUMN_WEBHOOK_SECRET`.
- Stripe - test-mode business-action Checkout evidence and webhook admission.
  - SDK/Client: direct HTTP helper in `src/modules/business-action/internal/stripe-checkout.ts`; webhook route in `src/routes/api.business-actions.stripe-webhook.ts`; source admission in `src/modules/business-action/internal/stripe-webhook-source.ts`.
  - Auth: webhook signing secret `STRIPE_WEBHOOK_SECRET`; checkout helper accepts a test-mode secret key as a server option and rejects live-mode keys.

**Notifications:**
- Resend - owner inquiry email delivery and provider webhook readback.
  - SDK/Client: direct HTTP provider in `src/lib/server/notification-provider.ts`; dispatch route in `src/routes/api.notification.resend-dispatch.ts`; webhook route in `src/routes/api.notification.resend-webhook.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, webhook secret `RESEND_WEBHOOK_SECRET`, and outbox gate `AE_NOTIFICATION_OUTBOX_SECRET`.
- Novu - owner inquiry workflow notifications and transaction message readback.
  - SDK/Client: direct HTTP provider in `src/lib/server/notification-provider.ts`; dispatch route in `src/routes/api.notification.novu-dispatch.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`, and outbox gate `AE_NOTIFICATION_OUTBOX_SECRET`.

**Monitoring & Analytics:**
- Sentry - client/server error tracking and optional sourcemap upload.
  - SDK/Client: `@sentry/react` in `src/lib/observability/sentry.client.ts`; `@sentry/node` in `src/lib/observability/sentry.server.ts`; Vite plugin in `vite.config.ts`.
  - Auth: runtime DSNs via `SENTRY_DSN` / `VITE_SENTRY_DSN`; sourcemap upload via `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.
- PostHog - product/funnel analytics.
  - SDK/Client: `posthog-js` in `src/lib/observability/posthog.client.ts`; `posthog-node` in `src/lib/observability/posthog.server.ts`.
  - Auth: `POSTHOG_KEY` / `VITE_POSTHOG_KEY`; hosts and app links through `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, and `VITE_POSTHOG_APP_URL`.

**Maps & UI Media:**
- Google Maps Embed - optional embedded maps in answer artifacts and office/location displays.
  - SDK/Client: iframe URL builder in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.

## Data Storage

**Databases:**
- Convex
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
  - Client: `ConvexHttpClient` from `convex/browser` in `src/lib/server/convex-source.ts`; Convex functions under `convex/`.
  - Schema: `convex/schema.ts` composes module tables from `src/modules/*/internal/schema.ts`, `src/modules/*/internal/convex-schema.ts`, and `convex/businessActionStore.ts`.
  - Table groups: answer threads (`src/modules/answer-thread/internal/convex-schema.ts`), billing (`src/modules/billing/internal/schema.ts`), business actions (`convex/businessActionStore.ts`), business/catalog/registry/discovery (`src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/discovery/internal/schema.ts`), inquiries (`src/modules/inquiries/internal/convex-schema.ts`), notifications (`src/modules/notification-outbox/internal/schema.ts`), observability (`src/modules/observability/internal/schema.ts`), protected actions (`src/modules/protected-action/internal/schema.ts`), and security (`src/modules/security/internal/schema.ts`).

**File Storage:**
- Convex file storage: not detected; searches for `ctx.storage`, `generateUploadUrl`, and `getUrl` found no application use.
- Local filesystem outputs only: build/test/eval artifacts under `.output/`, `dist/`, `output/`, `playwright-report/`, `test-results/`, and `graphify-out/`.

**Caching:**
- External cache: none detected; no Redis or cache service dependency in `package.json`.
- In-memory cache: OpenRouter model list cache in `src/modules/answer/internal/openrouter-models.ts`.
- Browser/session storage: PostHog persistence and pseudonymous session IDs in `src/lib/observability/posthog.client.ts` and `src/lib/observability/funnel-attribution.ts`; selected answer model in `src/modules/answer/model-selection-storage.ts`.
- Cookie state: answer thread session cookie in `src/modules/answer-thread/internal/session-cookie.ts`.

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: TanStack Start middleware in `src/start.ts`, conditional `ClerkProvider` in `src/routes/__root.tsx`, hosted Clerk components in `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`, and server `auth()` calls in `src/lib/server/convex-source.ts` and `src/lib/server/claim-owner-session.ts`.
  - Convex auth: `convex/auth.config.ts` maps `CLERK_JWT_ISSUER_DOMAIN` to Convex application ID `convex`.
  - Owner notification lookup: `src/lib/server/notification-provider.ts` calls Clerk's user API with `CLERK_SECRET_KEY` to resolve owner delivery addresses, then stores only hashes/redacted address metadata in provider readbacks.

## Monitoring & Observability

**Error Tracking:**
- Sentry
  - Client init: `src/lib/observability/sentry.client.ts`, booted from `src/lib/observability/boot-client-observability.ts` and `src/components/ae/layout/AeObservabilityBoot.tsx`.
  - Server init: `src/lib/observability/sentry.server.ts`, wrapped around requests in `src/start.ts`.
  - Config: `src/lib/observability/config.ts`; disable with `AE_DISABLE_OBSERVABILITY` or `VITE_AE_DISABLE_OBSERVABILITY`.

**Logs:**
- Application audit/operation records are persisted in Convex observability tables from `src/modules/observability/internal/schema.ts` and module-specific Convex stores such as `convex/billingStore.ts` and `convex/notificationOutbox.ts`.
- Server exceptions are sent to Sentry when configured; PostHog server events are flushed in the `src/start.ts` request middleware.
- Tests and eval reports write local artifacts under `output/`, `playwright-report/`, and `test-results/`.

## CI/CD & Deployment

**Hosting:**
- Vercel-oriented TanStack Start/Nitro deployment.
  - Evidence: `.vercel/` exists; `src/modules/billing/billing.functions.ts` uses `VERCEL_URL`; `src/lib/observability/config.ts` reads `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA`; `tests/deploy-smoke/vercel-bypass.ts` implements Vercel protection bypass helpers.
  - No `vercel.json` detected at repo root.

**CI Pipeline:**
- GitHub Actions
  - Workflow: `.github/workflows/eval-gate.yml`.
  - Checks: `npm ci`, `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:unit`, `npm run test:integration`, copy/UI/import scans, `npm run test:eval`, and `npm run build`.
  - Eval artifact: uploaded from `output/eval/`.

## Environment Configuration

**Required env vars:**
- Core app/source: `CONVEX_URL` or `VITE_CONVEX_URL`, `AE_SOURCE_WRITE_SECRET`, `AE_APP_BASE_URL` or `VITE_AE_APP_BASE_URL`, optional `VERCEL_URL`.
- Auth: `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, Clerk frontend variables handled by the Clerk SDK.
- AI answer path: `OPENROUTER_API_KEY`, optional `AE_LLM_MODEL`, optional `AE_LLM_MODELS`, optional `AE_ALLOW_CHAT_API`, optional `AE_SITE_URL` / `SITE_URL`.
- Observability: `SENTRY_DSN` / `VITE_SENTRY_DSN`, `POSTHOG_KEY` / `VITE_POSTHOG_KEY`, optional host/app/release/environment variables in `src/lib/observability/config.ts`.
- Billing: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`.
- Notifications: `AE_NOTIFICATION_OUTBOX_SECRET`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional provider base URLs.
- Search: optional `AE_SEARCH_BACKEND`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_TIMEOUT_MS`.
- Maps: optional `VITE_GOOGLE_MAPS_API_KEY`.
- Deploy smoke: `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`, and `SMOKE_*` identifiers referenced from `tests/deploy-smoke/`.

**Secrets location:**
- Local secret/config files are present as `.env`, `.env.local`, and `.env.example`; do not read or quote them.
- Deployment secrets are expected as environment variables in the hosting platform and CI settings.
- Provider dashboards own webhook secrets for Autumn, Resend, and Stripe; source code only references the env var names.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/billing/webhook` - Autumn signed webhook, verified in `src/lib/server/billing-provider.ts` and routed by `src/routes/api.billing.webhook.ts`.
- `POST /api/notification/resend-webhook` - Resend signed webhook, verified in `src/lib/server/notification-provider.ts` and routed by `src/routes/api.notification.resend-webhook.ts`.
- `POST /api/business-actions/stripe-webhook` - Stripe signed webhook for business-action evidence, verified in `src/routes/api.business-actions.stripe-webhook.ts` and admitted through `src/modules/business-action/business-action.functions.ts`.
- `POST /api/agent/tools` - assistant action invocation in `src/routes/api.agent.tools.ts`; only actions with `surfaces` including `agentTools` are callable.
- `POST /api/observability/funnel` - client funnel event capture in `src/routes/api.observability.funnel.ts`.
- `POST /api/answer/turn`, `POST /api/answer/threads`, `POST /api/answer/follow-up-chips`, and `POST /api/chat` - internal answer/chat flows in `src/routes/api.answer.turn.ts`, `src/routes/api.answer.threads.ts`, `src/routes/api.answer.follow-up-chips.ts`, and `src/routes/api.chat.ts`.

**Outgoing:**
- Convex HTTP API - `src/lib/server/convex-source.ts` sends authenticated or public queries/mutations/actions to `CONVEX_URL` / `VITE_CONVEX_URL`.
- Clerk API - `src/lib/server/notification-provider.ts` reads owner delivery address data from `https://api.clerk.com/v1/users/{id}`.
- OpenRouter API - chat completions to `https://openrouter.ai/api/v1/chat/completions` and model catalog reads from `https://openrouter.ai/api/v1/models`.
- Autumn API - customer, attach, portal, and customer readback calls to `https://api.useautumn.com` or `AUTUMN_API_BASE_URL`.
- Stripe API - test-mode checkout session helper posts to `https://api.stripe.com/v1/checkout/sessions` in `src/modules/business-action/internal/stripe-checkout.ts`.
- Resend API - email sends to `https://api.resend.com/emails` or `RESEND_API_BASE_URL` in `src/lib/server/notification-provider.ts`.
- Novu API - workflow triggers to `/v1/events/trigger` and message readbacks from `/v1/messages` under `https://api.novu.co` or `NOVU_API_BASE_URL`.
- Meilisearch API - index search, documents, delete-batch, settings, and task reads under `MEILISEARCH_HOST` in `src/modules/registry/internal/catalog-search-port.ts`.
- Sentry and PostHog - telemetry through `src/lib/observability/sentry.*.ts`, `src/lib/observability/posthog.*.ts`, and optional sourcemap upload in `vite.config.ts`.
- Google Maps Embed - browser iframe requests to `https://www.google.com/maps/embed/v1/place` from `src/components/ae/artifacts/AeGenerativeMap.tsx`.

---

*Integration audit: 2026-07-02*
