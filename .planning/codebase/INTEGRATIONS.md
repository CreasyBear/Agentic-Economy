# External Integrations

**Analysis Date:** 2026-07-06

## APIs & External Services

**Backend/Data:**
- Convex Cloud - Source-of-truth database and function runtime for catalog, registry, discovery, inquiries, notification outbox, billing, business actions, observability, clearance, settings, and dev seed data.
  - SDK/Client: `convex@1.42.0`; server transport wrappers in `src/lib/server/convex-source.ts`; schema composition in `convex/schema.ts`; functions in `convex/*.ts`.
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL`; Clerk JWT issuer in `convex/auth.config.ts` through `CLERK_JWT_ISSUER_DOMAIN`.
- Meilisearch - Optional catalog search backend; Convex remains the default search backend unless env selects `dual` or `meilisearch`.
  - SDK/Client: native `fetch` port in `src/modules/registry/internal/catalog-search-port.ts`.
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, optional `AE_SEARCH_BACKEND`, optional `AE_SEARCH_TIMEOUT_MS`.

**Authentication & Agent Identity:**
- Clerk - Owner/admin authentication, Clerk provider/middleware, Convex token acquisition, and server-side owner email lookup.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/convex-source.ts`, `src/lib/server/claim-owner-session.ts`, and `src/lib/server/require-operator-session.ts`.
  - Auth: `CLERK_JWT_ISSUER_DOMAIN` for Convex auth; `CLERK_SECRET_KEY` for server-side owner delivery lookup in `src/lib/server/notification-provider.ts`.
- Web Bot Auth - HTTP message signature verification for the quiet agent tools endpoint.
  - SDK/Client: `web-bot-auth` and `web-bot-auth/crypto` in `src/modules/clearance/internal/web-bot-auth.ts`; route boundary in `src/routes/api.agent.tools.ts`.
  - Auth: signed requests with `Signature`, `Signature-Input`, `Signature-Agent`, and `Content-Digest`; default trusted signature agent is `https://chatgpt.com`; non-production smoke can use `AE_DEV_WBA_SMOKE_ENABLED` and `AE_DEV_WBA_SIGNATURE_AGENT`.
- Source-write admission - Internal HMAC/HKDF write-admission signature layer for source-owned mutations.
  - SDK/Client: `@noble/hashes` in `src/modules/security/source-write-admission.ts`; server middleware in `src/lib/server/source-write-admission.ts`; Convex verification in `convex/sourceWriteAdmission.ts`.
  - Auth: production scoped key envs `AE_SOURCE_WRITE_KEY_INQUIRY`, `AE_SOURCE_WRITE_KEY_BILLING`, `AE_SOURCE_WRITE_KEY_PROTECTED`, `AE_SOURCE_WRITE_KEY_CLAIM`, `AE_SOURCE_WRITE_KEY_OPERATOR`, `AE_SOURCE_WRITE_KEY_REPAIR`, and `AE_SOURCE_WRITE_KEY_SESSION`; non-production fallback `AE_SOURCE_WRITE_SECRET`; source forbids `VITE_AE_SOURCE_WRITE_*` secrets.

**AI / Answer Generation:**
- OpenRouter - Tool-use answer synthesis, chat model listing, answer-turn follow-up chips, and model usage/cost readback.
  - SDK/Client: native `fetch` in `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/openrouter-models.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, `src/routes/api.chat.ts`, and `src/routes/api.chat.models.ts`.
  - Auth: `OPENROUTER_API_KEY`; optional `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, `AE_SITE_URL`, `SITE_URL`, `AE_ALLOW_CHAT_API`, and `AE_ANSWER_EVAL_PASSED`.
  - Posture: `src/modules/answer/internal/llm-config.ts` makes the tool-use agent the primary answer path; `/api/chat` is disabled in production unless `AE_ALLOW_CHAT_API=1`.
- Promptfoo - Offline answer quality evaluation in local/CI scripts.
  - SDK/Client: `promptfoo` CLI from `package.json`; config at `eval/answer/promptfooconfig.yaml`; CI gate in `.github/workflows/eval-gate.yml`.
  - Auth: no application runtime auth detected; eval scripts set Promptfoo local state env such as `PROMPTFOO_CONFIG_DIR` and `PROMPTFOO_DISABLE_WAL_MODE`.

**Billing / Paid Activation Evidence:**
- Autumn - Paid activation plan/provider integration, customer attach/portal/readback, and billing webhook verification.
  - SDK/Client: `atmn` plan declarations in `autumn.config.ts`; native HTTP provider in `src/modules/billing/internal/provider-readback.ts`; server env + Svix-style webhook verifier in `src/lib/server/billing-provider.ts`; route `src/routes/api.billing.webhook.ts`.
  - Auth: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`; app URLs use `AE_APP_BASE_URL`, `VITE_AE_APP_BASE_URL`, or `VERCEL_URL` in billing source code.
- Stripe - Business-action checkout/webhook evidence is direct HTTP + signature verification, not the Stripe SDK.
  - SDK/Client: native `fetch` and Node HMAC verification in `src/modules/business-action/internal/stripe-checkout.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`, and `src/routes/api.business-actions.stripe-webhook.ts`.
  - Auth: `STRIPE_WEBHOOK_SECRET` for webhook signature verification; checkout evidence helper accepts a server-provided secret and rejects non-`sk_test_` keys in `src/modules/business-action/internal/stripe-checkout.ts`.
  - Posture: Stripe code is test-mode/source-local business-action evidence only; `.planning/STATE.md` keeps Phase 6 production/deployed claims blocked until real deployed source-owned evidence exists.

**Notifications:**
- Resend - Owner inquiry email delivery plus provider webhook ingestion into the AE-owned notification outbox.
  - SDK/Client: native `fetch` and HMAC/Svix-style verification in `src/lib/server/notification-provider.ts`; guarded dispatch route `src/routes/api.notification.resend-dispatch.ts`; webhook route `src/routes/api.notification.resend-webhook.ts`.
  - Auth: `AE_NOTIFICATION_OUTBOX_SECRET`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, and `RESEND_WEBHOOK_SECRET`.
- Novu - Owner/customer inquiry workflow trigger and transaction-message readback through guarded server dispatch.
  - SDK/Client: native `fetch` in `src/lib/server/notification-provider.ts`; dispatch route `src/routes/api.notification.novu-dispatch.ts`.
  - Auth: `AE_NOTIFICATION_OUTBOX_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`, and Clerk delivery lookup through `CLERK_SECRET_KEY`.
  - Posture: no `@novu/*` SDK dependency is declared in `package.json`; provider proof remains behind deploy-smoke envs in `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts` and `.planning/STATE.md`.

**Observability & Analytics:**
- Sentry - Optional client/server exception capture, router tracing, replay-on-error, and source map upload.
  - SDK/Client: `@sentry/react`, `@sentry/node`, and `@sentry/vite-plugin`; config in `src/lib/observability/config.ts`, `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and `vite.config.ts`.
  - Auth: runtime `SENTRY_DSN` or `VITE_SENTRY_DSN`; build upload `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, optional `SENTRY_RELEASE`; environment/release fallback uses `SENTRY_ENVIRONMENT`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, and `GITHUB_SHA`.
- PostHog - Optional client/server funnel and product analytics.
  - SDK/Client: `posthog-js` and `posthog-node` in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and funnel source code under `src/modules/observability/`.
  - Auth: `POSTHOG_KEY` or `VITE_POSTHOG_KEY`; optional `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, and `VITE_POSTHOG_APP_URL`.

**Discovery / Maps / Import:**
- AE-hosted public discovery APIs - Public catalog, search, detail, UCP fallback, `llms.txt`, sitemap, robots, and developer discovery schema are served by TanStack route handlers.
  - SDK/Client: internal route handlers in `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/$slug.ucp.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, and `src/routes/robots[.]txt.ts`.
  - Auth: public read-only routes; write/owner surfaces use Clerk/source-write layers.
- Google Maps Embed - Optional iframe map rendering.
  - SDK/Client: iframe URL construction in `src/components/ae/artifacts/AeGenerativeMap.tsx`; CSP allowlist in `src/lib/http/security-headers.ts`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.
- Public website import - Owner-authenticated import of public business website facts into unconfirmed storefront drafts.
  - SDK/Client: native `fetch` plus `undici.Agent` in `src/modules/storefront/internal/import-draft.ts`; DNS/IP SSRF guard in `src/modules/storefront/internal/network-guard.ts`; route `src/routes/api.storefront.import-draft.ts`.
  - Auth: Clerk owner session or local E2E bypass in `src/routes/api.storefront.import-draft.ts`; no external provider API key detected.

**Protocol / Kernel Spikes:**
- Handshake protocol kernel - Installed dependency for a Convex runtime spike only.
  - SDK/Client: `handshake-protocol-kernel` and `handshake-protocol-kernel/adapter-sdk` in `convex/spikeHandshakeRuntime.ts`.
  - Auth: no public runtime auth surface; import guardrails in `src/lib/ui/contract-scans.ts` block broader Handshake/x402/MCP/cloud-adapter/customer-edge imports outside the allowed spike/quarantine paths.

## Data Storage

**Databases:**
- Convex document database
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
  - Client: `ConvexHttpClient` in `src/lib/server/convex-source.ts`; generated Convex references in `convex/_generated/`; source functions in `convex/*.ts`.
  - Schema: `convex/schema.ts` composes module-owned table fragments from `src/modules/**/internal/*schema.ts`, `convex/businessActionStore.ts`, and related Convex store files.
- Meilisearch optional search index
  - Connection: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, and `AE_SEARCH_BACKEND` in `src/modules/registry/internal/catalog-search-port.ts`.
  - Client: native `fetch` search/index/task port in `src/modules/registry/internal/catalog-search-port.ts`.

**File Storage:**
- Static/public assets - committed assets live under `public/`.
- Local/generated artifacts - build, eval, graph, coverage, and browser-test outputs are ignored in `.gitignore` (`dist/`, `.output/`, `.vercel/`, `output/`, `coverage/`, `test-results/`, `playwright-report/`, `graphify-out/`) and should be regenerated instead of treated as source.
- Convex file storage - not identified in the focused stack/integration seams; active storage authority in inspected code is Convex document tables rather than `ctx.storage` files.

**Caching:**
- OpenRouter model cache - in-memory two-minute cache in `src/modules/answer/internal/openrouter-models.ts`.
- Legacy stateless answer cache - in-memory 30-second cache in `src/routes/api.answer.ts`; route now returns safe unavailable responses for uncached live use.
- Discovery schema HTTP cache - `public, max-age=60, stale-while-revalidate=300` in `src/routes/api.discovery.schema.ts`.
- PostHog client persistence - browser `sessionStorage` persistence in `src/lib/observability/posthog.client.ts`.
- No Redis, Memcached, or external cache package is declared in `package.json`.

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: request middleware in `src/start.ts`, conditional `<ClerkProvider>` in `src/routes/__root.tsx`, server `auth()` token flow in `src/lib/server/convex-source.ts`, owner/operator server sessions in `src/lib/server/claim-owner-session.ts` and `src/lib/server/require-operator-session.ts`, and Convex JWT config in `convex/auth.config.ts`.
  - Local bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is command/test scoped through `playwright.config.ts` and fails if enabled in production in `src/lib/server/local-e2e-bypass.ts` and `src/routes/__root.tsx`.

**Machine Identity:**
- Web Bot Auth signatures
  - Implementation: `src/modules/clearance/internal/web-bot-auth.ts` verifies HTTP message signatures and `src/routes/api.agent.tools.ts` returns `Accept-Signature` when write-tier tools require signed identity.
  - Write boundary: `src/routes/api.agent.tools.ts` lists read tools publicly but requires signed identity plus source/clearance admission for write-tier tools such as `inquiry.submit` and `businessAction.requestCapability`.

**Source-Write Admission:**
- HMAC/HKDF scoped source-write admission
  - Implementation: `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, and source modules that call admission before writing.
  - Rotation: active keys use `AE_SOURCE_WRITE_KEY_*` `keyId:secret` format; accepted previous keys use `AE_SOURCE_WRITE_PREVIOUS_KEYS_*`; non-production derived keys can use `AE_SOURCE_WRITE_SECRET` with derived key IDs.
  - Guardrails: provider secrets such as Stripe/Autumn secrets are rejected for source-write reuse in `src/modules/security/source-write-admission.ts`.

## Monitoring & Observability

**Error Tracking:**
- Sentry initializes only when DSN env exists; client setup is `src/lib/observability/sentry.client.ts`, server setup is `src/lib/observability/sentry.server.ts`, and request wrapping is in `src/start.ts`.

**Logs / Analytics:**
- PostHog captures client/server funnel events when configured through `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/routes/api.observability.funnel.ts`.
- Convex observability/audit tables are composed through `src/modules/observability/internal/schema.ts` and `convex/schema.ts`.
- Public funnel source sync can be disabled by `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC` in `src/routes/api.observability.funnel.ts`.
- Security headers and CSP allowlists for Clerk, Convex, Sentry, PostHog, and Google Maps are centralized in `src/lib/http/security-headers.ts`.

## CI/CD & Deployment

**Hosting:**
- Vercel Node serverless - Nitro `preset: 'vercel'`, `entryFormat: 'node'`, and `nodejs20.x` runtime are configured in `vite.config.ts`.
- Vercel protection bypass for deployed smokes is supported by `VERCEL_AUTOMATION_BYPASS_SECRET` in `tests/deploy-smoke/vercel-bypass.ts`.

**CI Pipeline:**
- GitHub Actions - `.github/workflows/eval-gate.yml` runs checkout, Node 20 setup, `npm ci`, typecheck, Convex codegen, unit/integration/type/copy/SEO/import/source/TS-standard/eval checks, and build.
- Toolchain caveat: `.github/workflows/eval-gate.yml` references `npm run test:ui-contract`, but no `test:ui-contract` script is declared in `package.json` in this checkout.

**Proof / Deployment Caveats:**
- `.planning/STATE.md` is explicit that Phase 6 is source/local proof only and that production/deployed claims require real provider-smoke evidence.
- Active deployed/provider smoke harnesses are present in `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, and `tests/deploy-smoke/scope2-capability-check-smoke.spec.ts`.
- The current public-readiness gate is the active 14-day bootstrap gate in `.planning/STATE.md`; do not infer public launch readiness from source-local tests or generated route files alone.

## Environment Configuration

**Required env vars:**
- Convex runtime: `CONVEX_URL` or `VITE_CONVEX_URL`; Convex auth issuer `CLERK_JWT_ISSUER_DOMAIN`.
- Clerk server lookup: `CLERK_SECRET_KEY` for owner delivery address lookup.
- Source-write admission: production `AE_SOURCE_WRITE_KEY_*` scoped values or non-production `AE_SOURCE_WRITE_SECRET`; previous/derived rotation vars are handled in `src/modules/security/source-write-admission.ts`.
- Agent write admission local/dev controls: `AE_DEV_AGENT_TOOL_WRITE_ADMISSION`, `AE_DEV_WBA_SMOKE_ENABLED`, and `AE_DEV_WBA_SIGNATURE_AGENT`.
- Notification outbox/provider bridge: `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, and `NOVU_WORKFLOW_INQUIRY_OWNER`; optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`.
- Billing and paid activation: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, `AE_APP_BASE_URL`, `VITE_AE_APP_BASE_URL`, and `VERCEL_URL`.
- Stripe business-action evidence: `STRIPE_WEBHOOK_SECRET`; checkout helper requires a server-owned Stripe test secret and rejects live-mode keys.
- Answer AI: `OPENROUTER_API_KEY`, optional `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, `AE_SITE_URL`, `SITE_URL`, `AE_ANSWER_EVAL_PASSED`, and `AE_ALLOW_CHAT_API`.
- Observability: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, and related host/app/release/env vars from `src/lib/observability/config.ts` and `vite.config.ts`.
- Discovery/canonical URL: `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `SITE_URL`, and `VITE_SITE_URL`.
- Optional integrations: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, `AE_SEARCH_TIMEOUT_MS`, and `VITE_GOOGLE_MAPS_API_KEY`.
- Deployed smokes: `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, storage-state paths, smoke business/action/provider IDs, and `VERCEL_AUTOMATION_BYPASS_SECRET` are read by `tests/deploy-smoke/`.

**Secrets location:**
- Local env files are present but not inspected: `.env.local`; examples are present at `.env.example` and `examples/agent-experience/.env.example`.
- Runtime secrets are expected in process env, Vercel env, and Convex env depending on runtime path.
- `.gitignore` ignores `.env`, `.env.*`, `.convex/`, `.vercel/`, and generated outputs; only `.env.example` is explicitly unignored.

## Webhooks & Callbacks

**Incoming:**
- `GET /api/agent/tools` and `POST /api/agent/tools` - quiet agent tool listing/invocation in `src/routes/api.agent.tools.ts`; write-tier calls require signed identity and source/clearance admission.
- `POST /api/billing/webhook` - Autumn billing webhook in `src/routes/api.billing.webhook.ts`; signature verification is in `src/lib/server/billing-provider.ts`.
- `POST /api/business-actions/stripe-webhook` - Stripe test-mode business-action evidence webhook in `src/routes/api.business-actions.stripe-webhook.ts`.
- `POST /api/notification/resend-webhook` - Resend notification webhook in `src/routes/api.notification.resend-webhook.ts`; signature verification is in `src/lib/server/notification-provider.ts`.
- `POST /api/notification/resend-dispatch` - internal/system Resend dispatch bridge in `src/routes/api.notification.resend-dispatch.ts`.
- `POST /api/notification/novu-dispatch` - internal/system Novu workflow trigger/readback bridge in `src/routes/api.notification.novu-dispatch.ts`.
- `POST /api/storefront/import-draft` - owner-authenticated public website import route in `src/routes/api.storefront.import-draft.ts`.
- `GET /api/businesses`, `GET /api/businesses/search`, `GET /api/businesses/$slug`, `GET /{slug}/ucp`, `GET /api/discovery/schema`, `GET /llms.txt`, `GET /sitemap.xml`, and `GET /robots.txt` - public discovery/read-only routes in `src/routes/`.
- `GET/POST /api/chat`, `GET /api/chat/models`, `GET /api/answer`, and answer-thread routes under `src/routes/api.answer*.ts` - answer/chat surfaces gated by OpenRouter config and production flags.

**Outgoing:**
- Convex HTTP client calls from `src/lib/server/convex-source.ts` to Convex Cloud.
- Clerk user lookup from `src/lib/server/notification-provider.ts` to `https://api.clerk.com/v1`.
- Resend email sends from `src/lib/server/notification-provider.ts` to `https://api.resend.com` or `RESEND_API_BASE_URL`.
- Novu workflow trigger/readback from `src/lib/server/notification-provider.ts` to `https://api.novu.co` or `NOVU_API_BASE_URL`.
- Autumn billing calls from `src/modules/billing/internal/provider-readback.ts` to `https://api.useautumn.com` or a guarded non-production override.
- Stripe Checkout Session creation from `src/modules/business-action/internal/stripe-checkout.ts` to `https://api.stripe.com` or a guarded non-production override.
- OpenRouter chat/model calls from `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/answer/internal/openrouter-models.ts`.
- Meilisearch search/index/task calls from `src/modules/registry/internal/catalog-search-port.ts` when optional search env is configured.
- Google Maps iframe embed calls from `src/components/ae/artifacts/AeGenerativeMap.tsx` when `VITE_GOOGLE_MAPS_API_KEY` is configured.
- Public website fetches for owner-reviewed draft import from `src/modules/storefront/internal/import-draft.ts`, guarded by `src/modules/storefront/internal/network-guard.ts`.
- Sentry and PostHog network egress when observability env is configured; CSP allowlists are in `src/lib/http/security-headers.ts`.

---

*Integration audit: 2026-07-06*
