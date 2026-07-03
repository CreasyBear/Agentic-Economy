# External Integrations

**Analysis Date:** 2026-07-03

## APIs & External Services

**Source Database / Backend:**
- Convex - primary source-state database, backend query/mutation runtime, and scheduled cleanup jobs.
  - SDK/Client: `convex`
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL`; Clerk JWT issuer via `CLERK_JWT_ISSUER_DOMAIN`; source writes use `AE_SOURCE_WRITE_SECRET`
  - Implementation: `src/lib/server/convex-source.ts`, `convex/schema.ts`, `convex/auth.config.ts`, `convex/sourceWriteAdmission.ts`, and `convex/crons.ts`
  - Runtime modules: `convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/billing.ts`, `convex/businessActions.ts`, `convex/protectedActions.ts`, `convex/answerThreads.ts`, `convex/observability.ts`, and `convex/security.ts`

**Authentication & Owner Identity:**
- Clerk - public sign-in/sign-up, protected owner/admin routes, request middleware, Convex JWT issuer, and owner delivery address lookup.
  - SDK/Client: `@clerk/tanstack-react-start`
  - Auth: Clerk SDK runtime config; `CLERK_JWT_ISSUER_DOMAIN`; `CLERK_SECRET_KEY` for server-side owner email lookup
  - Implementation: `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, `src/lib/server/require-operator-session.ts`, `src/lib/server/claim-owner-session.ts`, `src/lib/server/convex-source.ts`, and `convex/auth.config.ts`
  - Backend API call: `src/lib/server/notification-provider.ts` reads `https://api.clerk.com/v1/users/{id}` to resolve an owner delivery email for notification dispatch

**LLM Answer Runtime:**
- OpenRouter - tool-use answer agent, follow-up chip generation, and model-list API.
  - SDK/Client: direct `fetch`; no provider SDK dependency in `package.json`
  - Auth: `OPENROUTER_API_KEY`
  - Config: `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_SITE_URL`, `SITE_URL`, `AE_ANSWER_EVAL_PASSED`, `AE_ALLOW_CHAT_API`
  - Chat completions: `src/modules/answer/internal/answer-tool-use-agent.ts` posts to `https://openrouter.ai/api/v1/chat/completions`
  - Follow-up chips: `src/modules/answer-thread/internal/llm-follow-up-chips.ts` posts to the same endpoint after eval/key gates pass
  - Model selector: `src/modules/answer/internal/openrouter-models.ts` fetches `https://openrouter.ai/api/v1/models` with a two-minute in-memory cache
  - API surfaces: `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`, `src/routes/api.chat.models.ts`, `src/routes/api.answer.follow-up-chips.ts`, and `src/routes/api.answer.eval-status.ts`

**Agent-Facing Action Surface:**
- AE action registry and quiet agent tools route - exposes bounded actions to machine clients without changing the public human copy.
  - SDK/Client: internal action/harness layer plus `@tanstack/ai` JSON Schema conversion
  - Auth: route context plus action policy; source writes still require `AE_SOURCE_WRITE_SECRET`
  - Registered actions: `src/modules/actions/index.ts`
  - Read actions: `registry.list`, `registry.search`, and `registry.detail` in `src/modules/registry/registry.actions.ts`
  - Write action: `inquiry.submit` in `src/modules/inquiries/inquiry.actions.ts`
  - Route: `GET /api/agent/tools` and `POST /api/agent/tools` in `src/routes/api.agent.tools.ts`
  - Boundary: registry actions are read-only; `inquiry.submit` records a human first-contact inquiry for owner review. AE does not book, charge, dispatch, or auto-fulfil.

**Billing:**
- Autumn Cloud - paid activation plan config, billing attach flow, customer portal, customer readback, and signed webhook ingestion.
  - SDK/Client: `atmn` for checked-in config; runtime calls use direct `fetch`
  - Auth: `AUTUMN_SECRET_KEY`; optional `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`; webhook verification uses `AUTUMN_WEBHOOK_SECRET`
  - Product config: `autumn.config.ts`
  - Provider adapter: `src/lib/server/billing-provider.ts` and `src/modules/billing/internal/provider-readback.ts`
  - Routes/functions: `src/modules/billing/billing.functions.ts`, `src/routes/owner.billing.activate.tsx`, `src/routes/owner.billing.tsx`, `src/routes/admin.monetization.tsx`, and `src/routes/api.billing.webhook.ts`
  - Source persistence: `convex/billing.ts` and `convex/billingStore.ts`

**Payment Evidence:**
- Stripe - bounded test-mode Checkout Session evidence and signed webhook evidence for business-action receipts.
  - SDK/Client: direct `fetch`; no `stripe` package dependency in `package.json`
  - Auth: `STRIPE_WEBHOOK_SECRET` for webhook verification; checkout helper requires an injected server-side test-mode secret and rejects non-`sk_test_` secrets
  - Checkout endpoint: `https://api.stripe.com/v1/checkout/sessions` in `src/modules/business-action/internal/stripe-checkout.ts`
  - Webhook route: `src/routes/api.business-actions.stripe-webhook.ts`
  - Source admission: `src/modules/business-action/business-action.functions.ts` and `src/modules/business-action/internal/stripe-webhook-source.ts`
  - Test/smoke coverage: `tests/unit/business-action/stripe-checkout-evidence.test.ts` and `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`

**Notifications:**
- Resend - owner inquiry email delivery and signed webhook ingestion.
  - SDK/Client: direct `fetch`; no Resend package dependency in `package.json`
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, webhook `RESEND_WEBHOOK_SECRET`, and dispatch/system key `AE_NOTIFICATION_OUTBOX_SECRET`
  - Provider adapter: `src/lib/server/notification-provider.ts`
  - Dispatch route: `src/routes/api.notification.resend-dispatch.ts`
  - Webhook route: `src/routes/api.notification.resend-webhook.ts`
  - Source persistence: `convex/notificationOutbox.ts`

- Novu - owner inquiry workflow trigger and message readback.
  - SDK/Client: direct `fetch`; no Novu package dependency in `package.json`
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`, and dispatch/system key `AE_NOTIFICATION_OUTBOX_SECRET`
  - Provider adapter: `src/lib/server/notification-provider.ts`
  - Dispatch/readback route: `src/routes/api.notification.novu-dispatch.ts`
  - Source persistence: `convex/notificationOutbox.ts`

**Observability:**
- Sentry - server/client error tracking, React error boundary integration, TanStack Router browser tracing, replay-on-error, and optional sourcemap upload.
  - SDK/Client: `@sentry/node`, `@sentry/react`, `@sentry/vite-plugin`
  - Auth/config: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`; build upload uses `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
  - Implementation: `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `src/lib/observability/config.ts`, `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`, `src/lib/observability/boot-client-observability.ts`, `src/start.ts`, and `vite.config.ts`

- PostHog - browser and server product/funnel analytics.
  - SDK/Client: `posthog-js`, `posthog-node`
  - Auth/config: `VITE_POSTHOG_KEY`, `POSTHOG_KEY`, optional `VITE_POSTHOG_HOST`, `POSTHOG_HOST`, `VITE_POSTHOG_APP_URL`, `POSTHOG_APP_URL`
  - Implementation: `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, `src/lib/observability/config.ts`, `src/lib/observability/funnel-client.ts`, `src/modules/observability/funnel.capture.server.ts`, and `src/routes/api.observability.funnel.ts`

**Maps:**
- Google Maps Embed - optional embedded place maps for generated/place panels.
  - SDK/Client: iframe embed URL; no Google SDK dependency
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`
  - Implementation: `src/components/ae/artifacts/AeGenerativeMap.tsx`

## Data Storage

**Databases:**
- Convex
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL`
  - Client: `ConvexHttpClient` in `src/lib/server/convex-source.ts`
  - Schema root: `convex/schema.ts`
  - Tables are composed from `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/discovery/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/modules/billing/internal/schema.ts`, `src/modules/business-action/internal/schema.ts`, `src/modules/protected-action/internal/schema.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `src/modules/harness/internal/convex-schema.ts`, `src/modules/observability/internal/schema.ts`, and `src/modules/security/internal/schema.ts`

**File Storage:**
- Local/static assets and route-generated text only. No Convex file-storage API usage was detected; `rg` found no `ctx.storage`, `_storage`, or storage upload code in `src/` or `convex/`.

**Caching:**
- No external cache service detected.
- In-memory OpenRouter model cache exists in `src/modules/answer/internal/openrouter-models.ts`.
- PostHog server client batches with `flushAt` and `flushInterval` in `src/lib/observability/posthog.server.ts`.

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: root provider in `src/routes/__root.tsx`, request middleware in `src/start.ts`, protected session helpers in `src/lib/server/require-operator-session.ts` and `src/lib/server/claim-owner-session.ts`, Convex auth issuer in `convex/auth.config.ts`
  - Convex token template: `src/lib/server/convex-source.ts` calls Clerk `getToken({ template: 'convex' })`
  - Local bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in `src/start.ts` and `src/routes/__root.tsx`, blocked in production

**Write Admission:**
- Source-write admission uses server-only `AE_SOURCE_WRITE_SECRET` in `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`, and `src/modules/business-action/business-action.functions.ts`.
- `src/lib/server/source-write-admission.ts` explicitly rejects a client-exposed `VITE_AE_SOURCE_WRITE_SECRET` configuration.

## Monitoring & Observability

**Error Tracking:**
- Sentry configured by `src/lib/observability/config.ts`, initialized client-side in `src/lib/observability/sentry.client.ts`, initialized server-side in `src/lib/observability/sentry.server.ts`, and wired into request middleware in `src/start.ts`.

**Logs:**
- Application code uses targeted `console` behavior sparingly; structured runtime records are persisted through Convex observability tables composed by `src/modules/observability/internal/schema.ts` and `convex/observability.ts`.
- Funnel events go through PostHog and Convex source writes in `src/modules/observability/funnel.capture.server.ts` and `src/modules/observability/funnel.functions.ts`.

## CI/CD & Deployment

**Hosting:**
- Vercel-compatible deployment is inferred from `.vercel/`, `VERCEL_URL` handling in `src/modules/billing/billing.functions.ts`, `VERCEL_GIT_COMMIT_SHA` handling in `vite.config.ts` and `src/lib/observability/config.ts`, and deployed smoke tests under `tests/deploy-smoke/`.
- No checked-in `vercel.json`, `netlify.toml`, `wrangler.toml`, or Dockerfile was detected.

**CI Pipeline:**
- GitHub Actions workflow: `.github/workflows/eval-gate.yml`
- CI steps: `npm ci`, `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:unit`, `npm run test:integration`, `npm run test:copy`, `npm run test:ui-contract`, `npm run test:imports`, `npm run test:eval`, and `npm run build`
- CI env: `.github/workflows/eval-gate.yml` sets `AE_ANSWER_EVAL_PASSED`, `PROMPTFOO_CONFIG_DIR`, and `PROMPTFOO_DISABLE_WAL_MODE`

## Environment Configuration

**Required env vars:**
- Core/backend: `CONVEX_URL` or `VITE_CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_SOURCE_WRITE_SECRET`
- Clerk provider/owner lookup: Clerk SDK runtime config plus `CLERK_SECRET_KEY` when Resend owner delivery lookup is enabled
- OpenRouter answer path: `OPENROUTER_API_KEY`; optional `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_SITE_URL`, `SITE_URL`
- Billing: `AUTUMN_SECRET_KEY`; optional `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`; webhook `AUTUMN_WEBHOOK_SECRET`
- Business-action Stripe evidence: `STRIPE_WEBHOOK_SECRET`; checkout helper expects a server-side test-mode Stripe secret injected by caller code in `src/modules/business-action/internal/stripe-checkout.ts`
- Notifications: `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`
- Observability: `SENTRY_DSN` / `VITE_SENTRY_DSN`, `POSTHOG_KEY` / `VITE_POSTHOG_KEY`
- Optional browser maps: `VITE_GOOGLE_MAPS_API_KEY`
- Local/test controls: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, `AE_ALLOW_CHAT_API`, `AE_ANSWER_EVAL_PASSED`, `AE_DISABLE_OBSERVABILITY`, `VITE_AE_DISABLE_OBSERVABILITY`, `PLAYWRIGHT_BASE_URL`

**Secrets location:**
- `.env`, `.env.local`, and `.env.example` are present; contents were not read.
- `.gitignore` excludes `.env` and `.env.*`, allows `.env.example`, excludes `.vercel/`, excludes `.convex/`, and excludes `.clerk/` because it can include secrets.
- Do not expose server-only secrets through `VITE_` prefixes; `src/lib/server/source-write-admission.ts` and `tests/unit/server/server-seams.test.ts` guard against client-exposed source-write secrets.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/billing/webhook` - Autumn/Svix signed billing webhook in `src/routes/api.billing.webhook.ts`, verified by `src/lib/server/billing-provider.ts`, admitted through `src/modules/billing/billing.functions.ts`, persisted by `convex/billing.ts`.
- `POST /api/business-actions/stripe-webhook` - Stripe signed webhook for business-action evidence in `src/routes/api.business-actions.stripe-webhook.ts`, verified by HMAC in that route, admitted through `src/modules/business-action/business-action.functions.ts`, persisted by `convex/businessActions.ts`.
- `POST /api/notification/resend-webhook` - Resend/Svix signed email event webhook in `src/routes/api.notification.resend-webhook.ts`, verified by `src/lib/server/notification-provider.ts`, persisted by `convex/notificationOutbox.ts`.
- `POST /api/notification/resend-dispatch` - authorized notification outbox dispatch endpoint in `src/routes/api.notification.resend-dispatch.ts`; requires `Authorization: Bearer <AE_NOTIFICATION_OUTBOX_SECRET>`.
- `POST /api/notification/novu-dispatch` - authorized Novu dispatch/readback endpoint in `src/routes/api.notification.novu-dispatch.ts`; requires `Authorization: Bearer <AE_NOTIFICATION_OUTBOX_SECRET>`.
- `GET /api/agent/tools` and `POST /api/agent/tools` - quiet action list/invoke endpoint in `src/routes/api.agent.tools.ts`; exposes read actions and the bounded qualified-inquiry write described in `src/modules/inquiries/inquiry.actions.ts`.

**Outgoing:**
- Convex HTTP client calls from `src/lib/server/convex-source.ts` to the configured `CONVEX_URL` or `VITE_CONVEX_URL`.
- Clerk Backend API owner lookup from `src/lib/server/notification-provider.ts` to `https://api.clerk.com/v1/users/{id}`.
- OpenRouter chat and model-list calls from `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/answer/internal/openrouter-models.ts`.
- Autumn provider calls from `src/modules/billing/internal/provider-readback.ts` to `/v1/customers`, `/v1/billing.attach`, `/v1/billing.open_customer_portal`, and `/v1/customers.get`.
- Stripe Checkout call from `src/modules/business-action/internal/stripe-checkout.ts` to `/v1/checkout/sessions`.
- Resend email call from `src/lib/server/notification-provider.ts` to `/emails`.
- Novu trigger/readback calls from `src/lib/server/notification-provider.ts` to `/v1/events/trigger` and `/v1/messages`.
- Sentry and PostHog SDK traffic from `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, `src/lib/observability/posthog.client.ts`, and `src/lib/observability/posthog.server.ts`.
- Google Maps Embed iframe URLs from `src/components/ae/artifacts/AeGenerativeMap.tsx`.

---

*Integration audit: 2026-07-03*
