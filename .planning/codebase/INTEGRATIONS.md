# External Integrations

**Analysis Date:** 2026-07-01

## APIs & External Services

**AI / LLM:**
- OpenRouter - Primary answer tool-use agent, chat route, follow-up chips, and model discovery.
  - SDK/Client: Native `fetch` in `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/answer/internal/openrouter-models.ts`.
  - Endpoints: `https://openrouter.ai/api/v1/chat/completions` and `https://openrouter.ai/api/v1/models`.
  - Auth: `OPENROUTER_API_KEY`; optional controls `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_SITE_URL`, `SITE_URL`, `AE_ANSWER_EVAL_PASSED`, and `AE_ALLOW_CHAT_API`.
- TanStack AI local tool adapter - Defines AE registry tools for the OpenRouter loop.
  - SDK/Client: `@tanstack/ai` via `toolDefinition` in `src/modules/answer/tools/registry-search.tool.ts`.
  - Auth: Not applicable; local schema/tool adapter.

**Authentication & User Data:**
- Clerk - Owner/admin authentication, sign-in/sign-up UI, Convex auth token template, and owner email lookup for notification dispatch.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, `src/lib/server/claim-owner-session.ts`, and `src/lib/server/convex-source.ts`.
  - REST client: Native `fetch` to `https://api.clerk.com/v1/users/{clerkUserId}` in `src/lib/server/notification-provider.ts`.
  - Auth: `CLERK_JWT_ISSUER_DOMAIN` for Convex JWT validation in `convex/auth.config.ts`; `CLERK_SECRET_KEY` for server-side Clerk REST lookup in `src/lib/server/notification-provider.ts`.

**Billing & Payment Evidence:**
- Autumn Cloud - Paid activation checkout, customer portal, customer readback, billing provider events, and billing webhook normalization.
  - SDK/Client: `atmn` config helpers in `autumn.config.ts`; custom native `fetch` provider in `src/modules/billing/internal/provider-readback.ts`; verification in `src/lib/server/billing-provider.ts`.
  - Endpoints: `https://api.useautumn.com/v1/customers`, `/v1/billing.attach`, `/v1/billing.open_customer_portal`, and `/v1/customers.get` from `src/modules/billing/internal/provider-readback.ts`.
  - Auth: `AUTUMN_SECRET_KEY`; webhook auth `AUTUMN_WEBHOOK_SECRET`; optional `AUTUMN_API_BASE_URL` and `AUTUMN_API_VERSION`.
- Stripe webhook evidence - Business-action receipt evidence from Stripe webhook signatures; no Stripe SDK package is declared in `package.json`.
  - SDK/Client: Native HMAC verification with `node:crypto` in `src/routes/api.business-actions.stripe-webhook.ts`.
  - Auth: `STRIPE_WEBHOOK_SECRET`.
  - Note: Billing receipts may reference Stripe invoice IDs/URLs normalized from Autumn payloads in `src/lib/server/billing-provider.ts`.

**Email / Notifications:**
- Resend - Owner inquiry email dispatch and webhook status ingestion.
  - SDK/Client: Native `fetch` in `src/lib/server/notification-provider.ts` and route glue in `src/routes/api.notification.resend-dispatch.ts`.
  - Endpoints: `https://api.resend.com/emails` for sends; webhook handled by `src/routes/api.notification.resend-webhook.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, and `AE_NOTIFICATION_OUTBOX_SECRET`; optional `RESEND_API_BASE_URL`.
- Novu - Owner inquiry workflow trigger and message readback.
  - SDK/Client: Native `fetch` in `src/lib/server/notification-provider.ts` and route glue in `src/routes/api.notification.novu-dispatch.ts`.
  - Endpoints: `https://api.novu.co/v1/events/trigger` and `https://api.novu.co/v1/messages`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, and `AE_NOTIFICATION_OUTBOX_SECRET`; optional `NOVU_API_BASE_URL` and `NOVU_WORKFLOW_INQUIRY_CUSTOMER`.

**Search:**
- Meilisearch - Optional catalog search backend with Convex hydration and fallback.
  - SDK/Client: Native `fetch` wrapper in `src/modules/registry/internal/catalog-search-port.ts`; no Meilisearch npm package is declared in `package.json`.
  - Endpoints: Configured by `MEILISEARCH_HOST`; uses `/indexes/{indexUid}/search`, `/documents`, `/documents/delete-batch`, `/settings`, and `/tasks/{taskUid}`.
  - Auth: `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, optional `AE_SEARCH_BACKEND` (`convex`, `dual`, `meilisearch`) and `AE_SEARCH_TIMEOUT_MS`.
  - Fallback: `src/modules/registry/registry.functions.ts` defaults to Convex search and falls back to Convex if Meilisearch is missing or fails.

**Maps:**
- Google Maps Embed - Optional map iframes for generated answer/place artifacts.
  - SDK/Client: Browser iframe URL construction in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Endpoint: `https://www.google.com/maps/embed/v1/place`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.

**Observability & Analytics:**
- Sentry - Client/server error capture, router tracing, replay-on-error, and optional build sourcemap upload.
  - SDK/Client: `@sentry/react` in `src/lib/observability/sentry.client.ts`, `@sentry/node` in `src/lib/observability/sentry.server.ts`, and `@sentry/vite-plugin` in `vite.config.ts`.
  - Auth: Runtime DSNs `SENTRY_DSN` and `VITE_SENTRY_DSN`; build upload `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`; optional `SENTRY_RELEASE`, `SENTRY_ENVIRONMENT`, `VERCEL_GIT_COMMIT_SHA`, and `GITHUB_SHA`.
- PostHog - Client/server product and funnel analytics.
  - SDK/Client: `posthog-js` in `src/lib/observability/posthog.client.ts` and `posthog-node` in `src/lib/observability/posthog.server.ts`.
  - Auth: `POSTHOG_KEY` and `VITE_POSTHOG_KEY`; optional `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`.
  - Default host: `https://us.i.posthog.com` in `src/lib/observability/config.ts`.

**Deployment / CI:**
- GitHub Actions - CI eval gate for typecheck, Convex codegen, tests, Promptfoo eval, artifact upload, and build.
  - Config: `.github/workflows/eval-gate.yml`.
  - Auth: Repository secrets/env for dependency install and any CI-provided provider secrets; workflow explicitly sets `PROMPTFOO_CONFIG_DIR`, `PROMPTFOO_DISABLE_WAL_MODE`, `AE_SCAN_MODE`, and `AE_ANSWER_EVAL_PASSED`.
- Vercel-like deployment - Deployment smoke tests and runtime URL fallbacks reference Vercel environment variables.
  - Config/Usage: `.vercel/` generated files are present; `src/modules/billing/billing.functions.ts` uses `VERCEL_URL`; `vite.config.ts` uses `VERCEL_GIT_COMMIT_SHA`; `tests/deploy-smoke/vercel-bypass.ts` uses `VERCEL_AUTOMATION_BYPASS_SECRET`.
  - Auth: `VERCEL_AUTOMATION_BYPASS_SECRET` for deploy smoke bypass when needed.

## Data Storage

**Databases:**
- Convex - Primary durable source for businesses, catalog, registry, discovery, inquiries, notification outbox, billing, protected actions, business actions, answer threads/tool calls, observability, and security state.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
  - Client: `ConvexHttpClient` from `convex/browser` in `src/lib/server/convex-source.ts`.
  - Schema: `convex/schema.ts` composes table modules from `src/modules/*/internal/schema*.ts`, `src/modules/*/internal/convex-schema.ts`, and `convex/businessActionStore.ts`.
  - Function files: `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/billing.ts`, `convex/protectedActions.ts`, `convex/businessActions.ts`, `convex/answerThreads.ts`, `convex/observability.ts`, `convex/security.ts`, and related store files.
- Local fixture/default state - Used for tests, local E2E bypass, and non-production fallback.
  - Implementation: `createDefaultRegistrySourceState` in `src/modules/registry/public.ts`, legacy handlers in `src/modules/registry/registry.functions.ts`, and eval seed state in `eval/answer/lib/registry-seed.ts`.

**File Storage:**
- Local/repo static assets - Public images and favicon in `public/`; styles in `src/styles/`.
- Generated reports/artifacts - Eval and test outputs under `output/eval/`, `playwright-report/`, and `test-results/`; these are generated directories, not runtime object storage.
- Convex file storage: Not detected. No `ctx.storage` use appears in non-generated `convex/*.ts` files.

**Caching:**
- OpenRouter model list in-memory cache - 2-minute module-level cache in `src/modules/answer/internal/openrouter-models.ts`.
- PostHog server client singleton - Module-level client reused and flushed in `src/lib/observability/posthog.server.ts` and `src/start.ts`.
- HTTP response cache headers - Discovery schema responses use `public, max-age=60, stale-while-revalidate=300` in `src/routes/api.discovery.schema.ts`; API/business and webhook responses generally set `Cache-Control: no-store` in `src/routes/api.businesses.ts`, `src/routes/api.billing.webhook.ts`, and notification routes.
- Browser storage - PostHog session persistence uses `sessionStorage` in `src/lib/observability/posthog.client.ts`; selected answer model uses local storage key `ae.selectedModel` in `src/modules/answer/model-selection-storage.ts`.
- External cache service: Not detected. No Redis, Upstash, Memcached, or KV dependency appears in `package.json`.

## Authentication & Identity

**Auth Provider:**
- Clerk with TanStack Start.
  - Implementation: `clerkMiddleware()` is registered in `src/start.ts`; `ClerkProvider` wraps sign-in/sign-up/owner/admin routes in `src/routes/__root.tsx`; Clerk UI routes are `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`.
  - Server auth: `auth()` from `@clerk/tanstack-react-start/server` in `src/lib/server/claim-owner-session.ts` and `src/lib/server/convex-source.ts`.
  - Convex JWT validation: `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN` and uses `applicationID: "convex"`.
  - Convex token template: `src/lib/server/convex-source.ts` requests Clerk token template `convex` by default.
  - Local E2E bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` disables Clerk middleware/provider outside production in `src/start.ts` and `src/routes/__root.tsx`.

**Authorization & Admission:**
- Source-write admission - Server-side write guard over method/origin/path/scope/operation/correlation in `src/lib/server/source-write-admission.ts` and `src/modules/security/source-write-admission.ts`.
  - Auth: `AE_SOURCE_WRITE_SECRET`; client-exposed `VITE_AE_SOURCE_WRITE_SECRET` is rejected.
  - Scopes: `owner_claim`, `catalog_publish`, `removal_dispute`, `public_inquiry`, `owner_inquiry`, `protected_action`, `billing`, `admin_operator`, `discovery_repair`, and `notification_repair` in `src/modules/security/source-write-admission.ts`.
- Admin authorization - Convex reads active admin membership in `convex/authz.ts` and module operations under `convex/security.ts`.
  - Bootstrap env: `ADMIN_BOOTSTRAP_PRINCIPAL_IDS` is referenced by tests and admin bootstrap code paths in `convex/security.ts`.
- Agent actions - Actions are declared centrally in `src/modules/actions/index.ts` and `src/modules/common/action.ts`.
  - Assistant-exposed tools: `inquiry.submit`, `registry.search`, and `registry.detail` have `agentTools` surfaces in `src/modules/inquiries/inquiry.actions.ts` and `src/modules/registry/registry.actions.ts`.
  - Quiet endpoint: `GET/POST /api/agent/tools` in `src/routes/api.agent.tools.ts`.

## Monitoring & Observability

**Error Tracking:**
- Sentry is initialized on the client in `src/lib/observability/sentry.client.ts` and on the server in `src/lib/observability/sentry.server.ts`.
- TanStack Start request middleware in `src/start.ts` sets an `ae.path` Sentry tag and captures server exceptions.
- Sensitive query-string keys (`token`, `secret`, `password`, `email`, `phone`) cause events to be dropped in Sentry `beforeSend` hooks in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`.

**Logs:**
- Application-level audit and operation records persist in Convex tables from `src/modules/observability/internal/schema.ts` and functions in `convex/observability.ts`.
- Console logging is minimal; provider and route errors are generally normalized into typed JSON responses and Convex records in `src/routes/api.notification.*.ts`, `src/routes/api.billing.webhook.ts`, and `src/routes/api.business-actions.stripe-webhook.ts`.
- PostHog captures funnel/product events in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/modules/observability/funnel.functions.ts`.

## CI/CD & Deployment

**Hosting:**
- Vercel-like deployment is implied by `.vercel/`, `VERCEL_URL`, `VERCEL_ENV`, and `VERCEL_GIT_COMMIT_SHA` references in `src/modules/billing/billing.functions.ts`, `src/lib/observability/config.ts`, and `vite.config.ts`.
- TanStack Start/Nitro build path is configured by `vite.config.ts`.
- Deploy smoke tests are configured under `tests/deploy-smoke/` and `playwright.deploy-smoke.config.ts`.

**CI Pipeline:**
- GitHub Actions workflow `.github/workflows/eval-gate.yml` runs on `main` pushes and PRs.
- CI uses Node 20, `npm ci`, `npm run typecheck`, `npm run check:convex-codegen`, unit/integration tests, copy/UI/import scans, Promptfoo answer eval, artifact upload from `output/eval/`, and `npm run build`.
- Release/test command aggregate lives in `package.json` scripts `test:release` and `test:all`.

## Environment Configuration

**Required env vars:**
- Core source/auth: `CONVEX_URL` or `VITE_CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_SOURCE_WRITE_SECRET`.
- Clerk owner lookup/notifications: `CLERK_SECRET_KEY`.
- Answer AI: `OPENROUTER_API_KEY`; optional `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_SITE_URL`, `SITE_URL`, `AE_ANSWER_EVAL_PASSED`, `AE_ALLOW_CHAT_API`.
- Observability: `SENTRY_DSN` or `VITE_SENTRY_DSN`; `POSTHOG_KEY` or `VITE_POSTHOG_KEY`; optional `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, `VITE_AE_DISABLE_OBSERVABILITY`.
- Sentry build upload: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
- Resend: `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`; optional `RESEND_API_BASE_URL`.
- Novu: `AE_NOTIFICATION_OUTBOX_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`; optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, `NOVU_API_BASE_URL`.
- Autumn: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`; optional `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`.
- Stripe webhook evidence: `STRIPE_WEBHOOK_SECRET`.
- Optional Meilisearch: `AE_SEARCH_BACKEND`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_TIMEOUT_MS`.
- Optional maps/UI/deploy: `VITE_GOOGLE_MAPS_API_KEY`, `AE_APP_BASE_URL`, `VITE_AE_APP_BASE_URL`, `SITE_URL`, `VITE_SITE_URL`, `AE_CANONICAL_BASE_URL`, `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`.
- Test/deploy smoke: `PLAYWRIGHT_BASE_URL`, `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `SMOKE_*` variables referenced in `tests/deploy-smoke/`.

**Secrets location:**
- `.env`, `.env.local`, and `.env.example` exist in the repo root; contents were not read.
- CI/CD secrets are expected through GitHub Actions and deployment provider env configuration; `.github/workflows/eval-gate.yml` references env names but does not contain secret values.
- No `.npmrc`, credential, certificate, private-key, or service-account credential files were found at the scan depth used for this map.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/billing/webhook` - Autumn billing webhook in `src/routes/api.billing.webhook.ts`; verifies Svix headers and `AUTUMN_WEBHOOK_SECRET` through `src/lib/server/billing-provider.ts`, then persists through `admitAutumnBillingWebhookThroughSource` in `src/modules/billing/billing.functions.ts`.
- `POST /api/notification/resend-webhook` - Resend webhook in `src/routes/api.notification.resend-webhook.ts`; verifies Svix headers with `RESEND_WEBHOOK_SECRET` and ingests into Convex notification outbox.
- `POST /api/business-actions/stripe-webhook` - Stripe webhook evidence route in `src/routes/api.business-actions.stripe-webhook.ts`; verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET` and writes redacted evidence through `admitBusinessActionStripeWebhookThroughSource`.
- `POST /api/agent/tools` - Quiet assistant action invocation in `src/routes/api.agent.tools.ts`; validates action id/input and runs actions from `src/modules/actions/index.ts`.
- `POST /api/answer/turn`, `POST /api/chat`, `POST /api/observability/funnel`, `POST /api/notification/resend-dispatch`, and `POST /api/notification/novu-dispatch` are server API endpoints in `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`, `src/routes/api.observability.funnel.ts`, `src/routes/api.notification.resend-dispatch.ts`, and `src/routes/api.notification.novu-dispatch.ts`.

**Outgoing:**
- OpenRouter chat/model requests from `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/answer/internal/openrouter-models.ts`.
- Clerk owner user lookup from `src/lib/server/notification-provider.ts`.
- Resend email send from `src/lib/server/notification-provider.ts`.
- Novu workflow trigger and message readback from `src/lib/server/notification-provider.ts`.
- Autumn customer, checkout, portal, and customer readback requests from `src/modules/billing/internal/provider-readback.ts`.
- Meilisearch search/index/task requests from `src/modules/registry/internal/catalog-search-port.ts` when configured.
- Google Maps embed iframe requests from `src/components/ae/artifacts/AeGenerativeMap.tsx`.
- Sentry event and sourcemap upload traffic through `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and `vite.config.ts`.
- PostHog event traffic through `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.

---

*Integration audit: 2026-07-01*
