# External Integrations

**Analysis Date:** 2026-07-07

## APIs & External Services

**Backend / Database:**
- Convex Cloud - durable state, queries, mutations, actions, auth config, and generated API contracts.
  - SDK/Client: `convex` (`convex/`, `src/lib/server/convex-source.ts`, `src/modules/inquiries/customer-record-client.tsx`)
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL`; Clerk JWT issuer via `CLERK_JWT_ISSUER_DOMAIN` (`src/lib/server/convex-source.ts`, `convex/auth.config.ts`)

**Authentication & Identity:**
- Clerk - owner/admin sign-in, route middleware, Convex auth token minting, and owner delivery-address lookup.
  - SDK/Client: `@clerk/tanstack-react-start` plus direct Clerk REST fetch for owner email lookup (`src/start.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/notification-provider.ts`)
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN` (`.env.example`, `docs/ONBOARDING.md`, `convex/auth.config.ts`)
- Web Bot Auth - assistant-origin request identity on `/api/agent/tools`.
  - SDK/Client: `web-bot-auth`, `web-bot-auth/crypto` (`src/modules/clearance/internal/web-bot-auth.ts`)
  - Auth: request `Signature`, `Signature-Input`, `Signature-Agent`, and `Content-Digest`; default trusted signature agent is `https://chatgpt.com` (`src/modules/clearance/internal/web-bot-auth.ts`)

**LLM / Answer Generation:**
- OpenRouter - tool-use answer agent and model list.
  - SDK/Client: direct `fetch` to `https://openrouter.ai/api/v1/chat/completions` and `https://openrouter.ai/api/v1/models`; no AI SDK client on this path (`src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/openrouter-models.ts`)
  - Auth: `OPENROUTER_API_KEY`; model selection via `AE_LLM_MODEL`, `AE_LLM_MODELS`; optional base URL override `AE_OPENROUTER_API_BASE_URL` for tests (`src/modules/answer/internal/llm-config.ts`, `.env.example`, `tests/helpers/openrouter-contract-server.ts`)
- TanStack AI - dependency present for AI UI/app integration.
  - SDK/Client: `@tanstack/ai` (`package.json`)
  - Auth: Not detected

**Billing / Payments:**
- Autumn - billing product-ops layer, checkout/portal provider, webhook verification, and provider readbacks.
  - SDK/Client: local HTTP provider via `createAutumnHttpProvider`; `atmn` exists as a dev dependency/CLI, not the runtime client (`src/lib/server/billing-provider.ts`, `src/modules/billing/server.ts`, `package.json`)
  - Auth: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `AUTUMN_ENVIRONMENT`, `AUTUMN_PROJECT_ID`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AUTUMN_PORTAL_RETURN_BASE_URL` (`.env.example`, `src/lib/server/billing-provider.ts`)
- Stripe - test-mode checkout-session evidence and signed webhook admission for business-action flows.
  - SDK/Client: direct `fetch` against `https://api.stripe.com`; no `stripe` npm SDK in `package.json` (`src/modules/business-action/internal/stripe-checkout.ts`, `package.json`)
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; live keys are explicitly rejected by the checkout evidence path today (`src/modules/business-action/internal/stripe-checkout.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `.env.example`)

**Notifications:**
- Resend - owner inquiry email dispatch and signed webhook verification.
  - SDK/Client: direct provider fetch to `https://api.resend.com` by default (`src/lib/server/notification-provider.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.resend-webhook.ts`)
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET` (`.env.example`, `src/lib/server/notification-provider.ts`)
- Novu - inquiry notification workflow trigger and message readback.
  - SDK/Client: direct provider fetch to `https://api.novu.co` by default (`src/lib/server/notification-provider.ts`, `src/routes/api.notification.novu-dispatch.ts`)
  - Auth: `NOVU_SECRET_KEY`, `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER` (`.env.example`, `src/lib/server/notification-provider.ts`)

**Search:**
- MeiliSearch - optional generated registry search mirror; Convex remains source of truth.
  - SDK/Client: direct `fetch` through `CatalogSearchPort` (`src/modules/registry/internal/catalog-search-port.ts`)
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`; rollout config `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, `AE_SEARCH_TIMEOUT_MS` (`.env.example`, `src/modules/registry/internal/catalog-search-port.ts`)

**Observability:**
- Sentry - browser/server error tracking and optional build sourcemaps.
  - SDK/Client: `@sentry/react`, `@sentry/node`, `@sentry/vite-plugin` (`src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, `vite.config.ts`)
  - Auth: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (`.env.example`, `src/lib/observability/config.ts`, `vite.config.ts`)
- PostHog - browser/server funnel analytics.
  - SDK/Client: `posthog-js`, `posthog-node` (`src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`)
  - Auth: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_APP_URL`, `POSTHOG_APP_URL` (`.env.example`, `src/lib/observability/config.ts`)

**Maps / Embeds:**
- Google Maps - optional map embeds for generated location-map artifacts and office maps.
  - SDK/Client: browser key consumed through Vite env where UI uses map embeds (`.env.example`)
  - Auth: `VITE_GOOGLE_MAPS_API_KEY` (`.env.example`)

**Deployment / Hosting:**
- Vercel - Nitro production output target and deployed smoke target.
  - SDK/Client: Nitro Vercel preset (`vite.config.ts`)
  - Auth: deployment URL supplied to smoke tests/config externally; Sentry release can derive from `VERCEL_GIT_COMMIT_SHA` and env from `VERCEL_ENV` (`vite.config.ts`, `src/lib/observability/config.ts`, `playwright.deploy-smoke.config.ts`)

## Data Storage

**Databases:**
- Convex Cloud
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` (`src/lib/server/convex-source.ts`)
  - Client: `ConvexHttpClient`, `ConvexReactClient`, generated Convex API files (`src/lib/server/convex-source.ts`, `src/modules/inquiries/customer-record-client.tsx`, `convex/_generated/`)
  - Schema: composition root `convex/schema.ts` spreads module-owned fragments from `src/modules/*/internal/schema.ts` and Convex-local store files such as `convex/businessActionStore.ts`.

**File Storage:**
- Local filesystem / repo files only. No S3/R2/GCS/blob-storage runtime integration detected in `package.json`, `src/`, or `convex/`.

**Caching:**
- In-memory model-list cache for OpenRouter models (`src/modules/answer/internal/openrouter-models.ts`).
- No Redis/Memcached/Upstash dependency detected in `package.json`.

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: TanStack Start middleware in `src/start.ts`, conditional Clerk provider in `src/routes/__root.tsx`, server auth token retrieval for Convex in `src/lib/server/convex-source.ts`, and Convex JWT issuer config in `convex/auth.config.ts`.

**Source-Write Admission:**
- AE signs and verifies mutating requests that cross public/assistant/server boundaries.
  - Implementation: source-write helpers in `src/lib/server/source-write-admission.ts` and `src/modules/security/source-write-admission.ts`, Convex admission functions in `convex/sourceWriteAdmission.ts`, and quiet-agent write admission in `src/routes/api.agent.tools.ts`.
  - Auth: non-production `AE_SOURCE_WRITE_SECRET`; production scoped `AE_SOURCE_WRITE_KEY_<SCOPE>` and previous-key rotation env families (`.env.example`, `docs/ONBOARDING.md`).

**Assistant Identity:**
- Web Bot Auth verifies signed assistant requests before any public write tool can proceed.
  - Implementation: `verifyAgentIdentity` in `src/modules/clearance/internal/web-bot-auth.ts`, called by `src/routes/api.agent.tools.ts`.
  - Default trusted signer: `https://chatgpt.com`; dev-only smoke signer can be supplied with `AE_DEV_WBA_SIGNATURE_AGENT` (`src/modules/clearance/internal/web-bot-auth.ts`, `src/routes/api.agent.tools.ts`, `.env.example`).

## Monitoring & Observability

**Error Tracking:**
- Sentry initializes client and server only when DSN config exists; server scrubs sensitive query-bearing events (`src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, `src/lib/observability/config.ts`).

**Logs / Analytics:**
- PostHog captures funnel events on client/server when keys exist (`src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, `src/modules/observability/funnel.capture.server.ts`).
- Convex stores source-owned audit/funnel/operator events through observability module tables and functions (`src/modules/observability/internal/schema.ts`, `convex/observability.ts`).
- `VITE_AE_DISABLE_OBSERVABILITY` / `AE_DISABLE_OBSERVABILITY` disable third-party observability, and `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC` is a server-side brake for public funnel writes (`src/lib/observability/config.ts`, `.env.example`).

## CI/CD & Deployment

**Hosting:**
- Vercel Node serverless via Nitro `preset: 'vercel'`, `entryFormat: 'node'`, `runtime: 'nodejs20.x'` (`vite.config.ts`).

**CI Pipeline:**
- `.github/workflows/eval-gate.yml` runs typecheck, Convex codegen, unit/integration/type tests, copy/SEO/import/source/TS scans, answer eval, and build. It also still calls `npm run test:ui-contract`, which `package.json` does not define; `docs/ONBOARDING.md` and `.agents/skills/ae-verification-gates/SKILL.md` both record that as known CI drift.

**Deploy Smoke:**
- Playwright deploy/provider smoke tests use `playwright.deploy-smoke.config.ts` and scripts in `package.json`; they require real deployed/provider inputs and are not proof when skipped locally (`tests/deploy-smoke/`, `docs/ONBOARDING.md`).

## Environment Configuration

**Required env vars:**
- Local app/data baseline: `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_SOURCE_WRITE_SECRET` (`docs/ONBOARDING.md`, `.env.example`).
- Server Convex calls accept `CONVEX_URL` or `VITE_CONVEX_URL` (`src/lib/server/convex-source.ts`).
- Convex auth config requires `CLERK_JWT_ISSUER_DOMAIN` (`convex/auth.config.ts`).

**Feature/provider env vars:**
- Source-write scoped keys: `AE_SOURCE_WRITE_KEY_INQUIRY`, `AE_SOURCE_WRITE_KEY_BILLING`, `AE_SOURCE_WRITE_KEY_PROTECTED`, `AE_SOURCE_WRITE_KEY_CLAIM`, `AE_SOURCE_WRITE_KEY_OPERATOR`, `AE_SOURCE_WRITE_KEY_REPAIR`, `AE_SOURCE_WRITE_KEY_SESSION` plus previous and derived key-id variants (`.env.example`).
- Billing: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `AUTUMN_ENVIRONMENT`, `AUTUMN_PROJECT_ID`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AUTUMN_PORTAL_RETURN_BASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (`.env.example`, `src/lib/server/billing-provider.ts`, `src/modules/business-action/internal/stripe-checkout.ts`).
- Notifications: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `AE_NOTIFICATION_OUTBOX_SECRET`, `NOVU_SECRET_KEY`, `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER` (`.env.example`, `src/lib/server/notification-provider.ts`, `convex/notificationOutbox.ts`).
- LLM: `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, `AE_ANSWER_EVAL_PASSED`, `AE_ALLOW_CHAT_API`, `VITE_AE_ANSWER_MODE` (`.env.example`, `src/modules/answer/internal/llm-config.ts`, `src/modules/answer/internal/openrouter-models.ts`).
- Search: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, `AE_SEARCH_TIMEOUT_MS` (`.env.example`, `src/modules/registry/internal/catalog-search-port.ts`).
- Observability: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_APP_URL`, `POSTHOG_APP_URL`, `VITE_AE_DISABLE_OBSERVABILITY`, `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC` (`.env.example`, `src/lib/observability/config.ts`, `vite.config.ts`).
- Canonical/security: `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_CSP_REPORT_ONLY` (`.env.example`, `src/lib/server/canonical-url.ts`, `src/lib/http/security-headers.ts`).
- Dev/test: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, `AE_DEV_WBA_SMOKE_ENABLED`, `AE_DEV_WBA_SMOKE_SECRET`, `AE_DEV_WBA_SIGNATURE_AGENT`, `PLAYWRIGHT_BASE_URL`, deploy-smoke env inputs, and agent-experience audit env in `examples/agent-experience/.env.example`.

**Secrets location:**
- `.env.example` lists names only and is tracked.
- `.env.local` exists and is ignored; do not read or quote it.
- Convex environment variables are set in Convex for deployed/dev functions (`docs/ONBOARDING.md`, `tests/dev-smoke/agent-door-wba-source-smoke.test.ts`).
- Vercel/hosting environment supplies production provider secrets, Vercel metadata, and Sentry build env (`vite.config.ts`, `src/lib/observability/config.ts`).

## Webhooks & Callbacks

**Incoming:**
- `POST /api/billing/webhook` - Autumn billing webhook; verifies Svix headers and ingests provider event through billing source functions (`src/routes/api.billing.webhook.ts`, `src/lib/server/billing-provider.ts`, `convex/billing.ts`).
- `POST /api/business-actions/stripe-webhook` - Stripe webhook; verifies `Stripe-Signature`, admits checkout evidence, rejects stale/invalid payloads, and records source-bound evidence (`src/routes/api.business-actions.stripe-webhook.ts`, `src/modules/business-action/internal/stripe-checkout.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`).
- `POST /api/notification/resend-webhook` - Resend webhook; verifies Resend signature headers and records delivery readback (`src/routes/api.notification.resend-webhook.ts`, `src/lib/server/notification-provider.ts`).
- `POST /api/notification/resend-dispatch` and `POST /api/notification/novu-dispatch` - provider dispatch routes guarded by notification outbox/system secret flow (`src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/lib/server/notification-provider.ts`).
- `GET/POST /api/agent/tools` - quiet assistant-facing action surface; write tools require Web Bot Auth identity plus source-write admission (`src/routes/api.agent.tools.ts`).

**Outgoing:**
- Convex HTTP client calls from server routes/functions to Convex deployment (`src/lib/server/convex-source.ts`).
- OpenRouter chat completions and model list fetches (`src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/openrouter-models.ts`).
- Autumn API provider calls and webhook verification (`src/modules/billing/server.ts`, `src/lib/server/billing-provider.ts`).
- Stripe Checkout Session creation and webhook signature verification (`src/modules/business-action/internal/stripe-checkout.ts`).
- Clerk user lookup for owner delivery email (`src/lib/server/notification-provider.ts`).
- Resend email sends and webhook verification (`src/lib/server/notification-provider.ts`).
- Novu workflow triggers and transaction readbacks (`src/lib/server/notification-provider.ts`).
- MeiliSearch search/index/task API calls (`src/modules/registry/internal/catalog-search-port.ts`).
- Sentry event capture and optional source-map upload (`src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `vite.config.ts`).
- PostHog browser/server funnel capture (`src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`).

## Source-Owned Proof Surfaces

**Machine-readable public surfaces:**
- `/api/businesses`, `/api/businesses/search`, `/api/businesses/$slug` expose read-only public catalog JSON (`src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/modules/registry/internal/search.ts`).
- `/llms.txt` exposes assistant index text from durable discovery state (`src/routes/llms[.]txt.ts`, `src/modules/discovery/discovery.functions.ts`).
- `/$slug/ucp` exposes a public discovery manifest when a catalog is public; hidden catalogs return 404 (`src/routes/$slug.ucp.ts`, `src/modules/discovery/discovery.functions.ts`).
- `/api/agent/tools` lists and invokes allowlisted assistant tools only (`src/routes/api.agent.tools.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/actions/index.ts`).

**Provider proof/readback surfaces:**
- Billing provider readbacks and Autumn/Stripe evidence live in billing/business-action modules and Convex tables (`src/modules/billing/internal/provider-readback.ts`, `src/modules/billing/internal/authority.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`, `convex/billing.ts`, `convex/businessActions.ts`).
- Notification dispatch/webhook readbacks live in notification outbox and observability/state modules (`src/modules/notification-outbox/`, `convex/notificationOutbox.ts`, `src/lib/server/notification-provider.ts`).
- WBA dev source smoke reads back Convex principal state and fails loudly without real dev Convex env (`tests/dev-smoke/agent-door-wba-source-smoke.test.ts`).

---

*Integration audit: 2026-07-07*
