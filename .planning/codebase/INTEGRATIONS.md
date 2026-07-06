# External Integrations

**Analysis Date:** 2026-07-04

## APIs & External Services

**Backend/Data:**
- Convex Cloud - Source-of-truth database and function runtime for catalog, registry, inquiries, billing, clearance, notification outbox, answer threads, and observability.
  - SDK/Client: `convex@1.42.0` via `src/lib/server/convex-source.ts`, `convex/schema.ts`, and `convex/*.ts`
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL`; Clerk JWT issuer in `convex/auth.config.ts`
- Meilisearch - Optional catalog search backend; Convex remains default and fallback.
  - SDK/Client: native `fetch` port in `src/modules/registry/internal/catalog-search-port.ts`
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, `AE_SEARCH_TIMEOUT_MS`

**Authentication & Agent Identity:**
- Clerk - Owner/admin authentication, Clerk provider/middleware, server auth, and owner delivery-address lookup.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/convex-source.ts`
  - Auth: `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`; `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`
- Web Bot Auth - HTTP message signature verification for the quiet agent-tools door.
  - SDK/Client: `web-bot-auth` in `src/modules/clearance/internal/web-bot-auth.ts`
  - Auth: signed requests with `Signature`, `Signature-Input`, `Signature-Agent`, and `Content-Digest`; default trusted signature agent is `https://chatgpt.com` in `src/modules/clearance/internal/web-bot-auth.ts`

**AI / Answer Generation:**
- OpenRouter - Tool-use answer synthesis, follow-up chips, and model listing.
  - SDK/Client: native `fetch` in `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/answer/internal/openrouter-models.ts`
  - Auth: `OPENROUTER_API_KEY`; optional `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, `AE_SITE_URL`, `SITE_URL`, `AE_ALLOW_CHAT_API`, `AE_ANSWER_EVAL_PASSED`
- Promptfoo - Offline answer quality evaluation in CI and local scripts.
  - SDK/Client: `promptfoo` CLI from `package.json` with config at `eval/answer/promptfooconfig.yaml`
  - Auth: no application runtime auth detected; CI env is set in `.github/workflows/eval-gate.yml`

**Billing / Paid Activation Evidence:**
- Autumn - Paid activation plan/provider integration and billing webhook verification.
  - SDK/Client: `atmn` plan config in `autumn.config.ts`; HTTP provider in `src/modules/billing/internal/provider-readback.ts`; server env adapter in `src/lib/server/billing-provider.ts`
  - Auth: `AUTUMN_SECRET_KEY`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, webhook `AUTUMN_WEBHOOK_SECRET`
- Stripe - Test-mode business-action evidence and webhook signature verification; code rejects live-mode checkout evidence.
  - SDK/Client: native `fetch` and HMAC verification in `src/modules/business-action/internal/stripe-checkout.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`, and `src/routes/api.business-actions.stripe-webhook.ts`
  - Auth: `STRIPE_WEBHOOK_SECRET` for webhook verification; checkout helper accepts a test secret programmatically and rejects non-`sk_test_` values in `src/modules/business-action/internal/stripe-checkout.ts`

**Notifications:**
- Resend - Owner inquiry email delivery and Resend webhook ingestion.
  - SDK/Client: native `fetch` and Svix-style HMAC verification in `src/lib/server/notification-provider.ts`
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, webhook `RESEND_WEBHOOK_SECRET`, system key `AE_NOTIFICATION_OUTBOX_SECRET`
- Novu - Owner inquiry workflow triggering and message readback.
  - SDK/Client: native `fetch` in `src/lib/server/notification-provider.ts` and route handler `src/routes/api.notification.novu-dispatch.ts`
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`, system key `AE_NOTIFICATION_OUTBOX_SECRET`

**Observability & Analytics:**
- Sentry - Client/server exception capture and optional source map upload.
  - SDK/Client: `@sentry/react`, `@sentry/node`, and `@sentry/vite-plugin` in `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and `vite.config.ts`
  - Auth: runtime `SENTRY_DSN` or `VITE_SENTRY_DSN`; build upload `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, optional `SENTRY_RELEASE`
- PostHog - Client/server funnel and product analytics.
  - SDK/Client: `posthog-js` and `posthog-node` in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/modules/observability/funnel.functions.ts`
  - Auth: `POSTHOG_KEY` or `VITE_POSTHOG_KEY`; optional `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`

**Discovery / Maps / Import:**
- Google Maps Embed - Optional map iframe rendering when an API key is configured.
  - SDK/Client: iframe URLs in `src/components/ae/artifacts/AeGenerativeMap.tsx`; CSP allowlist in `src/lib/http/security-headers.ts`
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`
- Public website import - Owner-authenticated draft import from public business websites with DNS/SSRF guardrails.
  - SDK/Client: native `fetch` plus `undici.Agent` in `src/modules/storefront/internal/import-draft.ts`
  - Auth: owner auth through `src/modules/storefront/storefront.functions.ts`; no provider API key detected

## Data Storage

**Databases:**
- Convex document database
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`
  - Client: `ConvexHttpClient` in `src/lib/server/convex-source.ts`; Convex functions and schema in `convex/`
  - Schema: module tables are composed in `convex/schema.ts` from `src/modules/*/internal/*schema.ts` and `convex/businessActionStore.ts`
- Meilisearch optional search index
  - Connection: `MEILISEARCH_HOST`, `AE_SEARCH_INDEX_UID`, and `AE_SEARCH_BACKEND` in `src/modules/registry/internal/catalog-search-port.ts`
  - Client: native `fetch` search/index/task port in `src/modules/registry/internal/catalog-search-port.ts`

**File Storage:**
- Static/public assets - `public/`, `public/images/`, and `public/ae-landing/` are committed static assets.
- Convex file storage - Not detected in active Convex code; no `ctx.storage` usage found under `convex/`.
- Local/generated artifacts - build, test, eval, report, and graph outputs are ignored/generated (`dist/`, `.output/`, `output/`, `test-results/`, `playwright-report/`, `graphify-out/`) and should be regenerated from scripts when needed, not preserved as source.

**Caching:**
- OpenRouter model cache - In-memory two-minute cache in `src/modules/answer/internal/openrouter-models.ts`.
- PostHog client persistence - Browser `sessionStorage` persistence in `src/lib/observability/posthog.client.ts`.
- Discovery schema response cache headers - `public, max-age=60, stale-while-revalidate=300` in `src/routes/api.discovery.schema.ts`.
- No Redis, Memcached, or external cache service detected in `package.json` or `src/`.

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: request middleware in `src/start.ts`, conditional `<ClerkProvider>` in `src/routes/__root.tsx`, server `auth()` token flow in `src/lib/server/convex-source.ts`, Convex JWT config in `convex/auth.config.ts`, and admin/owner authority checks in `convex/authz.ts`.
  - Convex identity rule: code prefers `identity.tokenIdentifier` for admin membership lookup in `convex/authz.ts`, matching `convex/_generated/ai/guidelines.md`.

**Machine Identity:**
- Web Bot Auth signatures
  - Implementation: `src/modules/clearance/internal/web-bot-auth.ts` verifies HTTP message signatures, fetches `/.well-known/http-message-signatures-directory`, and returns `Accept-Signature` requirements from `src/routes/api.agent.tools.ts`.
  - Write boundary: `src/routes/api.agent.tools.ts` allows unsigned reads but requires signed identity and clearance mandate for write-tier tools; `src/modules/clearance/clearance.functions.ts` admits only `inquiry.submit` for `public_inquiry`.

**Source-Write Admission:**
- HMAC/HKDF source-write admission
  - Implementation: `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, and Convex verification in `convex/sourceWriteAdmission.ts`
  - Auth: production uses scoped `AE_SOURCE_WRITE_KEY_INQUIRY`, `AE_SOURCE_WRITE_KEY_BILLING`, `AE_SOURCE_WRITE_KEY_PROTECTED`, `AE_SOURCE_WRITE_KEY_CLAIM`, `AE_SOURCE_WRITE_KEY_OPERATOR`, `AE_SOURCE_WRITE_KEY_REPAIR`, and `AE_SOURCE_WRITE_KEY_SESSION`; non-production may derive from `AE_SOURCE_WRITE_SECRET`

## Monitoring & Observability

**Error Tracking:**
- Sentry - `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts` initialize only when DSNs exist; `vite.config.ts` uploads source maps only when Sentry build env is present.

**Logs:**
- Server exception capture flows through `src/start.ts` request middleware and `src/lib/observability/sentry.server.ts`.
- Product/funnel analytics flow through `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/routes/api.observability.funnel.ts`.
- Convex observability/audit tables are composed in `convex/schema.ts` from `src/modules/observability/internal/schema.ts`.
- Console logging framework beyond Sentry/PostHog/Convex was not detected in `package.json`.

## CI/CD & Deployment

**Hosting:**
- Vercel Node serverless - Nitro `preset: 'vercel'` and `nodejs20.x` runtime are configured in `vite.config.ts`.
- Vercel project artifacts - `.vercel/output/` is generated by local/build tooling; it is not required for application source mapping and should not be preserved as source.

**CI Pipeline:**
- GitHub Actions - `.github/workflows/eval-gate.yml` runs `npm ci`, typecheck, Convex codegen dry run, unit/integration/type/import/source/copy/SEO/UI-contract tests, Promptfoo answer evals, report upload, and build on Node 20.

## Environment Configuration

**Required env vars:**
- Convex runtime: `CONVEX_URL` or `VITE_CONVEX_URL` from `src/lib/server/convex-source.ts`; `CLERK_JWT_ISSUER_DOMAIN` from `convex/auth.config.ts`
- Clerk server lookup: `CLERK_SECRET_KEY` from `src/lib/server/notification-provider.ts`
- Source-write admission: scoped `AE_SOURCE_WRITE_KEY_*` values in production or non-production `AE_SOURCE_WRITE_SECRET` from `src/modules/security/source-write-admission.ts`
- Agent write admission dev bypass: `AE_DEV_AGENT_TOOL_WRITE_ADMISSION`, `AE_DEV_WBA_SMOKE_ENABLED`, and `AE_DEV_WBA_SIGNATURE_AGENT` are non-production controls in `src/modules/clearance/clearance.functions.ts` and `src/routes/api.agent.tools.ts`
- Notification outbox: `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, and `NOVU_WORKFLOW_INQUIRY_OWNER` from `src/lib/server/notification-provider.ts`
- Billing: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, and app URL env `AE_APP_BASE_URL` / `VITE_AE_APP_BASE_URL` / `VERCEL_URL` from `src/lib/server/billing-provider.ts` and `src/modules/billing/billing.functions.ts`
- Stripe evidence webhook: `STRIPE_WEBHOOK_SECRET` from `src/routes/api.business-actions.stripe-webhook.ts`
- Answer AI: `OPENROUTER_API_KEY`, optional `AE_LLM_MODEL`, optional `AE_LLM_MODELS`, optional `AE_OPENROUTER_API_BASE_URL`, `AE_ANSWER_EVAL_PASSED`, and `AE_ALLOW_CHAT_API` from `src/modules/answer/internal/llm-config.ts`
- Observability: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, and related host/app/release env from `src/lib/observability/config.ts` and `vite.config.ts`
- Discovery/canonical URL: `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `SITE_URL`, and `VITE_SITE_URL` from `src/lib/server/canonical-url.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/modules/catalog/owner-claim.functions.ts`
- Optional integrations: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, and `VITE_GOOGLE_MAPS_API_KEY` from `src/modules/registry/internal/catalog-search-port.ts` and `src/components/ae/artifacts/AeGenerativeMap.tsx`

**Secrets location:**
- Local env files are present but not inspected: `.env`, `.env.local`, `.env.example`, and `examples/agent-experience/.env.example`.
- Runtime secrets are expected in local process env, Vercel env, and Convex env; deploy-smoke tests refer to Vercel and Convex env setup in `tests/deploy-smoke/` and `tests/dev-smoke/agent-door-wba-source-smoke.test.ts`.
- Source-write code rejects client-exposed `VITE_AE_SOURCE_WRITE_*` secrets and provider-secret reuse in `src/modules/security/source-write-admission.ts`.

## Webhooks & Callbacks

**Incoming:**
- `GET /api/agent/tools` and `POST /api/agent/tools` - quiet agent tool listing and invocation in `src/routes/api.agent.tools.ts`; write calls require signed identity and source-write admission.
- `POST /api/billing/webhook` - Autumn billing webhook in `src/routes/api.billing.webhook.ts`; verifies Svix headers through `src/lib/server/billing-provider.ts`.
- `POST /api/business-actions/stripe-webhook` - Stripe test-mode business-action evidence webhook in `src/routes/api.business-actions.stripe-webhook.ts`.
- `POST /api/notification/resend-webhook` - Resend notification webhook in `src/routes/api.notification.resend-webhook.ts`; verifies Svix headers through `src/lib/server/notification-provider.ts`.
- `POST /api/notification/resend-dispatch` - Internal/system owner notification email delivery endpoint in `src/routes/api.notification.resend-dispatch.ts`.
- `POST /api/notification/novu-dispatch` - Internal/system Novu workflow trigger endpoint in `src/routes/api.notification.novu-dispatch.ts`.
- `GET /api/businesses`, `GET /api/businesses/search`, `GET /api/businesses/$slug`, `GET /llms.txt`, `GET /sitemap.xml`, and `GET /robots.txt` - public read-only discovery surfaces in `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, and `src/routes/robots[.]txt.ts`.

**Outgoing:**
- Convex HTTP client calls from `src/lib/server/convex-source.ts` to public/authenticated Convex functions.
- Clerk user lookup from `src/lib/server/notification-provider.ts` to `https://api.clerk.com/v1`.
- Resend email sends from `src/lib/server/notification-provider.ts` to `https://api.resend.com`.
- Novu event trigger and readback from `src/lib/server/notification-provider.ts` to `https://api.novu.co`.
- Autumn billing calls from `src/modules/billing/internal/provider-readback.ts` to `https://api.useautumn.com`.
- Stripe checkout session creation from `src/modules/business-action/internal/stripe-checkout.ts` to `https://api.stripe.com`.
- OpenRouter chat/model calls from `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/answer/internal/openrouter-models.ts`.
- Meilisearch search/index calls from `src/modules/registry/internal/catalog-search-port.ts` when optional env is configured.
- Google Maps iframe embed calls from `src/components/ae/artifacts/AeGenerativeMap.tsx` when `VITE_GOOGLE_MAPS_API_KEY` is configured.
- Public website fetches for owner-reviewed draft import from `src/modules/storefront/internal/import-draft.ts`.
- PostHog and Sentry network egress is enabled by env and CSP in `src/lib/observability/` and `src/lib/http/security-headers.ts`.

---

*Integration audit: 2026-07-04*
