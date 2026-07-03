# External Integrations

**Analysis Date:** 2026-07-03

## APIs & External Services

**Application shell and full-stack runtime:**
- TanStack Start / Router - owns route handlers, server functions, middleware, router navigation, and route generation.
  - SDK/Client: `@tanstack/react-start`, `@tanstack/react-router`
  - Auth: none directly; auth is layered through Clerk middleware in `src/start.ts`
  - Implementation: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, and generated `src/routeTree.gen.ts`
  - Route-handler pattern: `createFileRoute(...).server.handlers` in `src/routes/api.answer.turn.ts`, `src/routes/api.businesses.ts`, `src/routes/api.notification.resend-dispatch.ts`, and `src/routes/api.billing.webhook.ts`
  - Server-function pattern: `createServerFn` in `src/modules/billing/billing.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/lib/server/require-operator-session.ts`, and `src/lib/server/claim-owner-session.ts`

**Source database/backend:**
- Convex - primary source-state database, backend query/mutation runtime, scheduled cleanup jobs, and auth-aware serverless functions.
  - SDK/Client: `convex`
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL` for client transport; Clerk JWT issuer via `CLERK_JWT_ISSUER_DOMAIN`; source-write HMAC through `AE_SOURCE_WRITE_SECRET`
  - Implementation: `src/lib/server/convex-source.ts`, `convex/schema.ts`, `convex/auth.config.ts`, `convex/sourceWriteAdmission.ts`, `convex/crons.ts`
  - Public source transport: `callPublicSourceQuery` and `callPublicSourceMutation` in `src/lib/server/convex-source.ts`
  - Authenticated source transport: `createAuthenticatedConvexClient` and `readRequiredConvexAuthToken` in `src/lib/server/convex-source.ts`
  - Domain runtime bridges: `convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/billing.ts`, `convex/businessActions.ts`, `convex/protectedActions.ts`, `convex/answerThreads.ts`, `convex/observability.ts`, and `convex/security.ts`

**Identity and protected routes:**
- Clerk - public sign-in/sign-up, root provider wrapping for protected route groups, request middleware, Convex auth issuer, and server-side owner/admin admission.
  - SDK/Client: `@clerk/tanstack-react-start`
  - Auth: publishable/runtime config from Clerk SDK; server-side owner delivery lookup uses `CLERK_SECRET_KEY`; Convex issuer uses `CLERK_JWT_ISSUER_DOMAIN`
  - Implementation: `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, `src/lib/server/require-operator-session.ts`, `src/lib/server/claim-owner-session.ts`, and `convex/auth.config.ts`
  - Backend API seam: owner email readback uses `https://api.clerk.com/v1/users/{id}` through `resolveClerkOwnerDeliveryAddress` in `src/lib/server/notification-provider.ts`
  - Local E2E bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is accepted only outside production in `src/start.ts` and `src/routes/__root.tsx`

**Answer LLM and model metadata:**
- OpenRouter - tool-use answer agent chat-completions endpoint and model-list endpoint.
  - SDK/Client: direct `fetch`; no provider SDK dependency
  - Auth: `OPENROUTER_API_KEY`
  - Optional model config: `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_SITE_URL`, `SITE_URL`
  - Eval/feature gates: `AE_ANSWER_EVAL_PASSED` and `AE_ALLOW_CHAT_API`
  - Chat completions: `src/modules/answer/internal/answer-tool-use-agent.ts` posts to `https://openrouter.ai/api/v1/chat/completions`
  - Follow-up chips: `src/modules/answer-thread/internal/llm-follow-up-chips.ts` posts to the same endpoint only when eval and key gates pass
  - Model selector: `src/modules/answer/internal/openrouter-models.ts` fetches `https://openrouter.ai/api/v1/models` with a two-minute in-memory cache
  - API surfaces: `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`, `src/routes/api.chat.models.ts`, `src/routes/api.answer.follow-up-chips.ts`, and `src/routes/api.answer.eval-status.ts`

**Agent-facing action/tools:**
- TanStack AI JSON Schema conversion - action schemas become agent/harness tool descriptors.
  - SDK/Client: `@tanstack/ai`
  - Auth: none directly; authorization is declared by harness policy and route context
  - Implementation: `src/modules/common/action.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/harness/strict-schema.ts`, and `src/modules/harness/harness.schema.ts`
  - Registered actions: `src/modules/actions/index.ts` exposes `registry.search`, `registry.detail`, `registry.list`, and `inquiry.submit`
  - Agent tools route: `src/routes/api.agent.tools.ts` lists and invokes quiet tools through `buildHarnessToolContracts` and `runHarnessTool`

**Analytics:**
- PostHog - product/funnel analytics on client and server.
  - SDK/Client: `posthog-js`, `posthog-node`
  - Auth: `VITE_POSTHOG_KEY` for browser, `POSTHOG_KEY` or `VITE_POSTHOG_KEY` for server; optional `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`
  - Implementation: `src/lib/observability/config.ts`, `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, `src/lib/observability/boot-client-observability.ts`, `src/lib/observability/funnel-client.ts`, and `src/routes/api.observability.funnel.ts`
  - Default host: `https://us.i.posthog.com` in `src/lib/observability/config.ts`
  - Server flush: `src/start.ts` flushes the PostHog server client after observed requests

**Error tracking and release observability:**
- Sentry - server/client error tracking, React error boundary integration, TanStack Router browser tracing, replay-on-error, and optional sourcemap upload.
  - SDK/Client: `@sentry/node`, `@sentry/react`, `@sentry/vite-plugin`
  - Auth/config: runtime DSNs from `SENTRY_DSN` / `VITE_SENTRY_DSN`; build upload requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`; release from `SENTRY_RELEASE`, `VERCEL_GIT_COMMIT_SHA`, or `GITHUB_SHA`
  - Implementation: `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`, `src/lib/observability/boot-client-observability.ts`, `src/start.ts`, and `vite.config.ts`
  - Scrubbing: client and server Sentry `beforeSend` drop request URLs containing token/secret/password/email/phone query keys in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`

**Billing and paid activation provider seam:**
- Autumn Cloud - billing/product-ops authority over paid activation plans and provider readbacks; Stripe is represented as PSP evidence underneath provider state where source readback records it.
  - SDK/Client: `atmn` for checked-in product config; runtime calls use direct `fetch` in `src/modules/billing/internal/provider-readback.ts`
  - Auth: `AUTUMN_SECRET_KEY`; optional `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`; webhook verification uses `AUTUMN_WEBHOOK_SECRET`
  - Product config: `autumn.config.ts` defines the `paid_activation` feature and `paid_activation_monthly` plan
  - Provider client: `src/lib/server/billing-provider.ts` and `src/modules/billing/internal/provider-readback.ts`
  - Route/server-function seam: `src/modules/billing/billing.functions.ts`, `src/routes/owner.billing.activate.tsx`, `src/routes/owner.billing.tsx`, `src/routes/admin.monetization.tsx`, and `src/routes/api.billing.webhook.ts`
  - Source persistence: `convex/billing.ts` and `convex/billingStore.ts`
  - Evidence rule: deployed proof is source-owned provider/readback evidence, not return URL, dashboard, or env-var presence; see `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`

**Business-action payment evidence:**
- Stripe - bounded test-mode Checkout Session evidence and signed webhook evidence for the business-action flow.
  - SDK/Client: direct `fetch` to Stripe API; no `stripe` package dependency in `package.json`
  - Auth: `STRIPE_WEBHOOK_SECRET` for `/api/business-actions/stripe-webhook`; Checkout helper requires an injected server-side test-mode secret and rejects non-`sk_test_` secrets in `src/modules/business-action/internal/stripe-checkout.ts`
  - Checkout endpoint: `https://api.stripe.com/v1/checkout/sessions` built in `src/modules/business-action/internal/stripe-checkout.ts`
  - Webhook route: `src/routes/api.business-actions.stripe-webhook.ts`
  - Domain admission: `src/modules/business-action/internal/stripe-webhook-source.ts`, `src/modules/business-action/internal/stripe-checkout.ts`, `src/modules/business-action/business-action.functions.ts`, and `convex/businessActions.ts`
  - Evidence rule: route and admin/owner UI must show source-owned request, checkpoint, Action Receipt, Stripe evidence, support, kill-rule, and redacted next-action refs; see `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`

**Notification providers:**
- Resend - owner inquiry email dispatch and delivery webhook ingestion.
  - SDK/Client: direct `fetch`; no `resend` package dependency in `package.json`
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, webhook secret `RESEND_WEBHOOK_SECRET`
  - Dispatch route: `src/routes/api.notification.resend-dispatch.ts`
  - Webhook route: `src/routes/api.notification.resend-webhook.ts`
  - Provider seam: `src/lib/server/notification-provider.ts`
  - Source persistence: `convex/notificationOutbox.ts` and `src/modules/notification-outbox/internal/commands.ts`
  - Provider smoke: `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`
- Novu - owner inquiry workflow orchestration and message readback.
  - SDK/Client: direct `fetch`; no `novu` package dependency in `package.json`
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`
  - Dispatch/readback route: `src/routes/api.notification.novu-dispatch.ts`
  - Provider seam: `src/lib/server/notification-provider.ts`
  - Source persistence: `convex/notificationOutbox.ts` and `src/modules/notification-outbox/internal/schema.ts`
  - Provider smoke: `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`

**Maps and public embedded media:**
- Google Maps Embed - optional iframe maps in generated answer artifacts and office maps.
  - SDK/Client: iframe URL, no npm SDK
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`
  - Implementation: `src/components/ae/artifacts/AeGenerativeMap.tsx`

**Evaluation and browser automation services:**
- Playwright - local E2E and deployed smoke automation.
  - SDK/Client: `@playwright/test`
  - Auth: storage-state files and smoke env are local operator artifacts; do not commit them
  - Implementation: `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `tests/e2e/`, and `tests/deploy-smoke/`
- Promptfoo - deterministic answer eval gate.
  - SDK/Client: `promptfoo` CLI configured by YAML
  - Auth: no live provider auth in the default config; `eval/answer/promptfooconfig.yaml` uses `file://providers/gate.mjs`
  - Implementation: `eval/answer/promptfooconfig.yaml`, `eval/answer/README.md`, `eval/answer/lib/cases.ts`, `eval/answer/assertions/`, and `.github/workflows/eval-gate.yml`

## Data Storage

**Databases:**
- Convex source state - primary database for public catalog, claims, inquiries, notifications, answer threads, billing, business actions, protected actions, observability, security, and harness runs.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`
  - Client: `ConvexHttpClient` from `convex/browser` in `src/lib/server/convex-source.ts`
  - Schema: domain table maps are composed in `convex/schema.ts` from module-local schemas such as `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/modules/billing/internal/schema.ts`, and `src/modules/answer-thread/internal/convex-schema.ts`
  - Runtime bridge: function files under `convex/`, especially `convex/registry.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/billing.ts`, `convex/businessActions.ts`, and `convex/answerThreads.ts`

**File Storage:**
- Application file storage: Not detected. No S3/R2/GCS/local upload storage provider is wired in package manifests or runtime source.
- Local artifacts: eval reports and Playwright traces/screenshots are written under `output/` by scripts/tests; `eval/answer/README.md` identifies `output/eval/answer-suite-report.json` as the answer eval report artifact.
- Browser storage-state artifacts: deployed smoke tests consume local storage-state paths such as `SMOKE_P5_OWNER_STORAGE_STATE` and `SMOKE_P6_OWNER_STORAGE_STATE` in `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts` and `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`; those files are operator artifacts, not app storage.

**Caching:**
- OpenRouter model list cache: two-minute in-memory cache in `src/modules/answer/internal/openrouter-models.ts`.
- PostHog server client singleton: module-level client in `src/lib/observability/posthog.server.ts`, flushed per observed request by `src/start.ts`.
- PostHog browser client singleton: module-level client/promise in `src/lib/observability/posthog.client.ts`.
- Sentry client/server initialized flags: module-level initialized state in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`.
- Redis/Memcached/external cache: Not detected.

## Authentication & Identity

**Auth Provider:**
- Clerk.
  - Implementation: request middleware in `src/start.ts`; route/root provider in `src/routes/__root.tsx`; auth UI in `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`; shared operator guard in `src/lib/operator/route-options.ts` and `src/lib/server/require-operator-session.ts`; claim owner guard in `src/lib/server/claim-owner-session.ts`
  - Protected surfaces: `/owner/*`, `/admin/*`, and `/developers/*` use `operatorRouteOptions` from `src/lib/operator/route-options.ts`
  - Convex auth: `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN` and uses Clerk JWTs with `applicationID: 'convex'`
  - Convex token acquisition: `readRequiredConvexAuthToken` requests the `convex` token template in `src/lib/server/convex-source.ts`
  - Server owner contact lookup: `src/lib/server/notification-provider.ts` uses `CLERK_SECRET_KEY` to read owner email through Clerk's Backend API

**Session and CSRF controls:**
- TanStack Start CSRF middleware is created in `src/start.ts` through `createCsrfMiddleware`, filtered to server functions.
- Source-write admission middleware is created in `src/start.ts` through `createSourceWriteAdmissionMiddleware` from `src/lib/server/source-write-admission.ts`.
- Convex source-write verification happens in `convex/sourceWriteAdmission.ts`, which maps invalid source-write signatures to foreign-origin rejection and missing admission to missing-CSRF rejection.
- Answer thread sessions are pseudonymous and cookie-backed through `src/modules/answer-thread/internal/session-cookie.ts` and route helpers in `src/routes/api.answer.turn.ts`, `src/routes/api.answer.threads.ts`, and `src/routes/api.answer.threads.$threadId.ts`.

## Monitoring & Observability

**Error Tracking:**
- Sentry is configured but optional. Runtime starts only when DSN config is present in `src/lib/observability/config.ts`.
- Server Sentry isolation wraps observed requests in `src/start.ts` and captures exceptions with tags through `src/lib/observability/sentry.server.ts`.
- Client Sentry is lazily imported by `src/lib/observability/boot-client-observability.ts` and renders a Sentry `ErrorBoundary` through `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`.
- Sourcemap upload is conditional in `vite.config.ts` and disabled unless Sentry org/project/auth token are configured.

**Logs:**
- Structured application telemetry is source-owned through Convex tables and domain audit events, not a logging SaaS. Audit event literals live in `src/modules/common/audit-events.ts` and observability projections live in `src/modules/observability/public.ts`.
- Product/funnel telemetry goes to PostHog from `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/routes/api.observability.funnel.ts`.
- Provider dispatch/webhook readbacks are persisted through Convex source state instead of relying on provider dashboards: notification state in `convex/notificationOutbox.ts`, billing state in `convex/billing.ts`, and business-action evidence in `convex/businessActions.ts`.

## CI/CD & Deployment

**Hosting:**
- [INFERENCE] Vercel-compatible deployment is implied by code paths reading `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, and the Vercel automation bypass helper in `tests/deploy-smoke/vercel-bypass.ts`.
- Explicit hosting config file: Not detected (`vercel.json`, `netlify.toml`, and `wrangler.toml` are absent).
- Build/runtime adapter: TanStack Start + Nitro are configured in `vite.config.ts`.

**CI Pipeline:**
- GitHub Actions - `.github/workflows/eval-gate.yml` runs on pushes and PRs to `main`.
- CI installs with `npm ci`, uses Node 20, runs typecheck, Convex codegen dry run, unit/integration tests, copy/UI/import scans, Promptfoo eval, answer eval artifact upload, eval flag confirmation, and build.
- Release and all-test scripts are declared in `package.json`; this mapping did not run them.
- Deployed smoke tests are local/operator-triggered Playwright specs under `tests/deploy-smoke/` and use `playwright.deploy-smoke.config.ts`.

## Environment Configuration

**Required env vars:**
- Core source state: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- Convex auth: `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Source-write admission: `AE_SOURCE_WRITE_SECRET` in `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.
- Clerk protected routes: Clerk SDK runtime env is required by `@clerk/tanstack-react-start`; server notification address lookup specifically requires `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`.
- Answer LLM: `OPENROUTER_API_KEY` is required for search-intent answer turns through `src/modules/answer/internal/llm-config.ts`; boundary/unsupported intents can return safe prose without a model key.
- Resend dispatch: `AE_NOTIFICATION_OUTBOX_SECRET`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, and `RESEND_FROM` in `src/routes/api.notification.resend-dispatch.ts` and `src/lib/server/notification-provider.ts`.
- Resend webhook: `RESEND_WEBHOOK_SECRET` and `AE_NOTIFICATION_OUTBOX_SECRET` in `src/routes/api.notification.resend-webhook.ts` and `src/lib/server/notification-provider.ts`.
- Novu dispatch: `AE_NOTIFICATION_OUTBOX_SECRET`, `NOVU_SECRET_KEY`, and `NOVU_WORKFLOW_INQUIRY_OWNER` in `src/routes/api.notification.novu-dispatch.ts` and `src/lib/server/notification-provider.ts`.
- Autumn billing provider calls: `AUTUMN_SECRET_KEY` in `src/lib/server/billing-provider.ts`.
- Autumn billing webhook: `AUTUMN_WEBHOOK_SECRET` in `src/lib/server/billing-provider.ts` and `src/routes/api.billing.webhook.ts`.
- Stripe business-action webhook: `STRIPE_WEBHOOK_SECRET` in `src/routes/api.business-actions.stripe-webhook.ts`.
- Deployed Playwright smokes: `DEPLOY_BASE_URL` plus spec-specific `SMOKE_*` inputs in `tests/deploy-smoke/`.

**Optional env vars:**
- Observability disable flags: `AE_DISABLE_OBSERVABILITY`, `VITE_AE_DISABLE_OBSERVABILITY`.
- Sentry runtime/build: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `VITE_SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `GITHUB_SHA`, `VERCEL_GIT_COMMIT_SHA`.
- PostHog runtime: `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`.
- OpenRouter model UX: `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_ANSWER_EVAL_PASSED`, `AE_ALLOW_CHAT_API`, `AE_SITE_URL`, `SITE_URL`.
- Maps: `VITE_GOOGLE_MAPS_API_KEY`.
- Billing routes: `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AE_APP_BASE_URL`, `VITE_AE_APP_BASE_URL`, `VERCEL_URL`.
- Notification providers: `RESEND_API_BASE_URL`, `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`.
- Local test bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`; production code rejects this flag in `src/start.ts` and `src/routes/__root.tsx`.
- Playwright: `PLAYWRIGHT_BASE_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`, storage-state and source-evidence `SMOKE_*` variables used by deploy-smoke specs.

**Secrets location:**
- `.env`, `.env.local`, and `.env.example` are present; their contents were intentionally not read.
- CI secret values are expected through GitHub Actions and deployment environment variables; `.github/workflows/eval-gate.yml` only contains non-secret workflow env defaults.
- Deployed smoke storage-state files are local operator artifacts referenced by env in `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, and `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` - verifies Resend Svix signatures, redacts provider metadata, and persists notification webhook events through Convex; implementation in `src/routes/api.notification.resend-webhook.ts` and `src/lib/server/notification-provider.ts`.
- `POST /api/billing/webhook` - verifies Autumn Svix signatures, normalizes provider events/receipts, and admits events through source-write admission; implementation in `src/routes/api.billing.webhook.ts`, `src/lib/server/billing-provider.ts`, and `src/modules/billing/billing.functions.ts`.
- `POST /api/business-actions/stripe-webhook` - verifies Stripe signatures, hashes raw body, and admits signed test-mode business-action evidence; implementation in `src/routes/api.business-actions.stripe-webhook.ts`, `src/modules/business-action/internal/stripe-checkout.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`, and `src/modules/business-action/business-action.functions.ts`.
- `POST /api/observability/funnel` - browser-to-server funnel event sink that validates JSON and records owner activation through source state; implementation in `src/routes/api.observability.funnel.ts` and `src/modules/observability/funnel.capture.server.ts`.
- `POST /api/answer/turn` - server-sent-events answer turn endpoint for the human chat surface; implementation in `src/routes/api.answer.turn.ts` and `src/modules/answer-thread/public.ts`.
- `POST /api/agent/tools` - quiet agent tool invocation endpoint; implementation in `src/routes/api.agent.tools.ts` and `src/modules/harness/public.ts`.

**Outgoing:**
- Clerk Backend API - owner delivery address lookup in `src/lib/server/notification-provider.ts`.
- Convex HTTP API - source queries/mutations/actions through `src/lib/server/convex-source.ts`.
- OpenRouter chat completions - answer tool-use loop in `src/modules/answer/internal/answer-tool-use-agent.ts` and LLM follow-up chips in `src/modules/answer-thread/internal/llm-follow-up-chips.ts`.
- OpenRouter models - model selector cache in `src/modules/answer/internal/openrouter-models.ts`.
- PostHog ingest - client/server capture in `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
- Sentry ingest - client/server `Sentry.init` in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`; sourcemap upload via `vite.config.ts`.
- Autumn API - attach/customer/portal readbacks through `src/modules/billing/internal/provider-readback.ts`.
- Stripe API - test-mode Checkout Session creation through `src/modules/business-action/internal/stripe-checkout.ts`.
- Resend API - owner inquiry email send through `src/lib/server/notification-provider.ts` and `src/routes/api.notification.resend-dispatch.ts`.
- Novu API - workflow trigger and transaction message readback through `src/lib/server/notification-provider.ts` and `src/routes/api.notification.novu-dispatch.ts`.
- Google Maps Embed - iframe URLs in `src/components/ae/artifacts/AeGenerativeMap.tsx`.

---

*Integration audit: 2026-07-03*
