---
last_mapped_commit: 19e988f5
---

# External Integrations

**Analysis Date:** 2026-07-18

## APIs & External Services

**Auth / Identity:**
- Clerk — human sessions, operator UI, Customer Request agent API keys
  - SDK/Client: `@clerk/tanstack-react-start` (`src/start.ts` middleware, `src/routes/__root.tsx` `ClerkProvider`, `src/lib/server/customer-request-agent-auth.ts`)
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
  - Convex JWT provider wired in `convex/auth.config.ts`

**Backend / Data plane:**
- Convex — source-of-truth database and server functions
  - SDK/Client: `convex` package; server bridge `ConvexHttpClient` in `src/lib/server/convex-source.ts`
  - Auth: `VITE_CONVEX_URL`; Clerk JWT to Convex via issuer domain
  - HTTP router: `convex/http.ts` (sandbox provider routes; retired v1 routing/MCP stubs)

**LLM / Answer:**
- OpenRouter — chat completions for answer tool-use agent and customer-request transport
  - Client: raw `fetch` to `https://openrouter.ai/api/v1/chat/completions` (`src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/customer-request/openrouter-transport.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`)
  - Model list: `https://openrouter.ai/api/v1/models` (`src/modules/answer/internal/openrouter-models.ts`)
  - Auth: `OPENROUTER_API_KEY`; model `AE_LLM_MODEL` (default `deepseek/deepseek-v4-flash` in `src/modules/answer/internal/llm-config.ts`)
  - Convex-side env: `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL` (`convex/convex.config.ts`)

**Search mirror:**
- Meilisearch — optional generated search index (Convex remains source of truth)
  - Client: raw `fetch` port in `src/modules/registry/internal/catalog-search-port.ts`
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`
  - Config: `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND` (`convex` | `dual` | `meilisearch`), `AE_SEARCH_TIMEOUT_MS`

**Notifications:**
- Resend — email dispatch + webhook delivery readback
  - Client: raw `fetch` to `https://api.resend.com` (`src/lib/server/notification-provider.ts`)
  - Routes: `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.resend-webhook.ts`
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, optional `RESEND_API_BASE_URL`
- Novu — primary inquiry notification workflows
  - Client: raw `fetch` to `https://api.novu.co` (`src/lib/server/notification-provider.ts`)
  - Route: `src/routes/api.notification.novu-dispatch.ts`
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`
- Notification outbox HMAC — `AE_NOTIFICATION_OUTBOX_SECRET` (dispatch admission)

**Maps (optional client embed):**
- Google Maps — generative location-map artifacts
  - Client: `VITE_GOOGLE_MAPS_API_KEY` in `src/components/ae/artifacts/AeGenerativeMap.tsx`

**Agent identity / HTTP signatures:**
- Web Bot Auth — verify agent HTTP message signatures
  - Libraries: `web-bot-auth`, `http-message-sig`, `@noble/hashes`
  - Implementation: `src/modules/routing-kernel/caller-identity.ts`
  - Public JWKS directory: `src/routes/[.]well-known/http-message-signatures-directory.ts`
  - Auth/config: `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`

**Capability-supply transport payments (route runtime):**
- x402 (EVM exact scheme) — payment signature headers for protected route calls
  - Libraries: `@x402/core`, `@x402/evm`, `@x402/extensions`, `viem`
  - Implementation: `src/modules/capability-supply/internal/x402-payment-signer.ts`
  - Note: used for capability-supply transport signing; not a public checkout/wallet product surface

**Shipping quote adapters (provider integrations module):**
- Shippo — `https://api.goshippo.com` via `createShippoQuoteAdapter` in `src/modules/provider-integrations/shipping/server.ts`
- EasyPost — `https://api.easypost.com/v2` via `createEasyPostQuoteAdapter` in same file
  - Auth: API keys passed into adapters (not listed as top-level `.env.example` names)

**Routing edge:**
- Cloudflare Workers — public routing edge example
  - Code: `examples/routing-edge/` (`wrangler.jsonc`, Worker entry `examples/routing-edge/src/index.ts`)
  - Public base URL env: `AE_ROUTING_PUBLIC_BASE_URL`
  - Secrets: `AE_EDGE_ORIGIN_HMAC_KEY` (Worker secret)

**Billing placeholders (env reserved; no active Stripe/Autumn module under `src/modules/` at this commit):**
- Stripe / Autumn secret names appear in `.env.example` and are treated as forbidden reuse targets in `src/modules/security/source-write-admission.ts` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`)
- Deploy-smoke specs under `tests/deploy-smoke/` reference historical Stripe evidence IDs; do not treat as a live SDK integration (no `stripe` npm package)

## Data Storage

**Databases:**
- Convex
  - Connection: `VITE_CONVEX_URL`
  - Client: Convex React/HTTP clients; schema composed in `convex/schema.ts` from module fragments
  - Tables owned per module under `src/modules/*/internal/*schema*.ts` and Convex stores

**File Storage:**
- Local filesystem only for build artifacts, eval output (`output/`), Playwright reports — no S3/GCS SDK detected

**Caching:**
- None as a dedicated external cache service
- Meilisearch acts as a search mirror, not a general cache
- In-process / Convex document state for application data

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: request middleware `clerkMiddleware()` in `src/start.ts`; UI `ClerkProvider` in `src/routes/__root.tsx`
  - Operator/owner sessions via Clerk; Convex authenticated calls use Clerk JWT template through `src/lib/server/convex-source.ts`
  - Customer Request agent API: Clerk API keys with scope check in `src/lib/server/customer-request-agent-auth.ts` (`acceptsToken: 'api_key'`)
  - Local e2e bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` (`src/lib/server/local-e2e-bypass.ts`, Playwright webServer env)

**Additional admission:**
- Source-write admission middleware — HMAC/HKDF keyed families (`AE_SOURCE_WRITE_*`) in `src/modules/security/source-write-admission.ts`, wired in `src/start.ts`
- CSRF middleware for server functions (`createCsrfMiddleware` in `src/start.ts`)

## Monitoring & Observability

**Error Tracking:**
- Sentry
  - Client: `src/lib/observability/sentry.client.ts` (`@sentry/react`)
  - Server: `src/lib/observability/sentry.server.ts` (`@sentry/node`), initialized from `src/start.ts`
  - Auth/config: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, upload via `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`

**Product analytics:**
- PostHog
  - Client: `src/lib/observability/posthog.client.ts` (`posthog-js`)
  - Server: `src/lib/observability/posthog.server.ts` (`posthog-node`)
  - Funnel API: `src/routes/api.observability.funnel.ts`, `src/modules/observability/`
  - Auth/config: `VITE_POSTHOG_KEY`, `POSTHOG_KEY`, `VITE_POSTHOG_HOST` / `POSTHOG_HOST` (default `https://us.i.posthog.com`), optional app URLs
  - Kill switches: `VITE_AE_DISABLE_OBSERVABILITY`, `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`

**Logs:**
- Server exceptions captured via Sentry isolation scope in `src/start.ts`
- Cloudflare Worker observability enabled in `examples/routing-edge/wrangler.jsonc` (logs + sampled traces)
- No dedicated log aggregation SDK (Datadog/etc.) detected

## CI/CD & Deployment

**Hosting:**
- Vercel — primary app deploy (Nitro `preset: 'vercel'`, Node `nodejs20.x` in `vite.config.ts`)
- Convex Cloud — backend deploy in release workflow
- Cloudflare Workers — optional routing edge (`examples/routing-edge/`)

**CI Pipeline:**
- GitHub Actions — `.github/workflows/kernel-release-gate.yml`
  - `source-proof`: Node 22, `npm ci`, `npm run test:release:source`
  - `hosted-proof` (main only): Vercel deploy + Convex deploy + production Customer Request smoke/readback
- GitHub Actions — `.github/workflows/react-doctor.yml` (React Doctor)

## Environment Configuration

**Required env vars (critical families — names only; see `.env.example`):**
- Clerk: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
- Convex: `VITE_CONVEX_URL`
- Canonical URL: `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`
- Source-write: `AE_SOURCE_WRITE_SECRET` and/or per-family `AE_SOURCE_WRITE_KEY_*`
- Notifications (when dispatch enabled): `RESEND_*`, `NOVU_*`, `AE_NOTIFICATION_OUTBOX_SECRET`
- LLM (answer tool-use): `OPENROUTER_API_KEY`, optional `AE_LLM_MODEL`, `AE_ANSWER_EVAL_PASSED`
- Search mirror (when not convex-only): `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_BACKEND`
- Observability (optional): `VITE_SENTRY_DSN` / `SENTRY_DSN`, `VITE_POSTHOG_KEY` / `POSTHOG_KEY`
- WBA (production agent admission): `AE_WBA_*`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`

**Secrets location:**
- Local: `.env.local`, `.env.development.local` (gitignored; never commit)
- Template: `.env.example`
- CI/production: GitHub Actions `secrets.*` and Vercel/Convex project env (see `kernel-release-gate.yml`)
- Cloudflare Worker secrets via Wrangler (`AE_EDGE_ORIGIN_HMAC_KEY`)

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` — Resend delivery events (`src/routes/api.notification.resend-webhook.ts`); verifies signature via `verifyResendWebhook` in `src/lib/server/notification-provider.ts`, then Convex ingest mutation
- Stripe/Autumn webhook routes — not present as TanStack routes at this commit; secrets reserved in env/admission only

**Outgoing:**
- Resend send API — `src/routes/api.notification.resend-dispatch.ts`
- Novu workflow trigger + message readback — `src/routes/api.notification.novu-dispatch.ts`
- OpenRouter chat/completions — answer and customer-request paths
- Meilisearch index/search/task APIs — `src/modules/registry/internal/catalog-search-port.ts`
- Clerk Backend API — owner delivery address lookup and API key verification (`src/lib/server/notification-provider.ts`, `src/lib/server/customer-request-agent-auth.ts`)
- Shippo / EasyPost quote APIs — `src/modules/provider-integrations/shipping/server.ts`
- PostHog / Sentry — telemetry from client and server observability modules
- Convex HTTP sandbox providers — mirrored on app routes under `/api/sandbox/providers/*` and Convex `http.ts`

**Public machine surfaces (app, not third-party):**
- Customer Request agent API under `/api/v1/requests*` (`src/routes/api.v1.requests*.ts`, handlers in `src/lib/server/customer-request-agent-api`)
- Registry HTTP: `/api/businesses`, `/api/businesses/search`, `/api/businesses/$slug`
- Discovery/docs: `/llms.txt`, `/SKILL.md`, `/.well-known/http-message-signatures-directory`
- Note: `GET/POST /api/agent/tools` is documented in product/AGENTS guidance and ADRs but has no matching route file under `src/routes/` at commit `19e988f5`; current assistant-facing write path is action/`agentJson` surfaces plus Customer Request API

---

*Integration audit: 2026-07-18*
