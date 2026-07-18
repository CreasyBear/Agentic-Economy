# External Integrations

**Analysis Date:** 2026-07-18
**last_mapped_commit:** `5ea44454`

## APIs & External Services

**Identity / Auth:**
- Clerk — human sessions, JWT issuer for Convex, API keys for customer-request agents, owner email lookup
  - SDK/Client: `@clerk/tanstack-react-start` (`clerkMiddleware` in `src/start.ts`, `ClerkProvider` in `src/routes/__root.tsx`, `auth` / `clerkClient` server APIs)
  - Direct HTTP: `https://api.clerk.com/v1` for owner delivery address (`src/lib/server/notification-provider.ts`)
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN` (Convex `convex/auth.config.ts`)

**Backend / Data plane:**
- Convex — source-owned catalog, inquiries, customer requests, route execution, notification outbox, observability funnel rows, sandbox supply
  - SDK/Client: `convex` package; server access via `ConvexHttpClient` in `src/lib/server/convex-source.ts`
  - Auth: Clerk JWT provider domain; server function token / route-call signing secrets in Convex env (`AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_*`)
  - HTTP surface: `convex/http.ts` (sandbox provider routes + retired v1 routing stubs)

**LLM / Answer:**
- OpenRouter — chat completions for customer-request interpretation and gated answer features
  - SDK/Client: raw `fetch` to `https://openrouter.ai/api/v1/chat/completions` (`src/modules/customer-request/openrouter-transport.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`)
  - Auth: `OPENROUTER_API_KEY` (also optional Convex env); model via `AE_LLM_MODEL` / `AE_CUSTOMER_REQUEST_MODEL`
  - Related: `@tanstack/ai` for tool/JSON-schema contracts (not the transport)

**Search mirror:**
- Meilisearch — generated registry search index; Convex remains source of truth
  - SDK/Client: raw HTTP in `src/modules/registry/internal/catalog-search-port.ts`
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`
  - Rollout: `AE_SEARCH_BACKEND` = `convex` | `dual` | `meilisearch`; index `AE_SEARCH_INDEX_UID` (default `registry-search-documents`)

**Notifications:**
- Resend — transactional email dispatch + delivery webhooks
  - SDK/Client: raw `fetch` to `https://api.resend.com` (`src/lib/server/notification-provider.ts`)
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`
  - Routes: `POST /api/notification/resend-dispatch` (`src/routes/api.notification.resend-dispatch.ts`), `POST /api/notification/resend-webhook` (`src/routes/api.notification.resend-webhook.ts`)
- Novu — workflow-triggered inquiry notifications (owner/customer)
  - SDK/Client: raw `fetch` to `https://api.novu.co` (same notification-provider module)
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`
  - Route: `POST /api/notification/novu-dispatch` (`src/routes/api.notification.novu-dispatch.ts`)
- Shared: `AE_NOTIFICATION_OUTBOX_SECRET` for Convex outbox system writes

**Billing / Payments (configured; evidence-gated):**
- Stripe — secrets and host allowlist declared for PSP calls; no `stripe` npm SDK in `package.json`
  - Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; production host allowlist documented as `api.stripe.com` in `.env.example`
  - Admission name checks in `src/modules/security/source-write-admission.ts`
  - Provider smoke: `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`
  - Public paid-activation claims remain copy-gated (`src/lib/ui/contract-scans.ts`); do not imply live wallet/checkout in public surfaces
- Autumn (useautumn) — billing product-ops layer secrets
  - Env: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `AUTUMN_ENVIRONMENT`, `AUTUMN_PROJECT_ID`, `AUTUMN_API_BASE_URL` (default `https://api.useautumn.com`), `AUTUMN_API_VERSION`, `AUTUMN_PORTAL_RETURN_BASE_URL`
  - Same source-write secret name allowlist as Stripe

**Agentic payment rails (capability transport):**
- x402 (HTTP 402) + EVM exact scheme — payment signature for admitted route transport adapters
  - Packages: `@x402/core`, `@x402/evm`, `@x402/extensions`, `viem`
  - Implementation: `src/modules/capability-supply/internal/x402-payment-signer.ts`, runtime in `src/modules/capability-supply/route-transport-runtime.ts`
  - Not a public customer checkout; used when a binding adapter is `x402-fetch:v2`

**Maps:**
- Google Maps Embed — generative location-map artifacts
  - Client: iframe/embed via `VITE_GOOGLE_MAPS_API_KEY` (`src/components/ae/artifacts/AeGenerativeMap.tsx`)
  - CSP allows `maps.googleapis.com` / `maps.google.com` (`src/lib/http/security-headers.ts`)

**Agent identity (Web Bot Auth):**
- web-bot-auth verification + JWKS directory fetch from Signature-Agent origins
  - Packages: `web-bot-auth`, `@noble/hashes`
  - Code: `src/modules/routing-kernel/caller-identity.ts`
  - Public JWKS: `GET /.well-known/http-message-signatures-directory` (`src/routes/[.]well-known/http-message-signatures-directory.ts`)
  - Env: `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`, optional dev smoke keys

**Edge / routing example:**
- Cloudflare Workers — HMAC-gated edge proxy to Convex HTTP origin
  - Config: `examples/routing-edge/wrangler.jsonc`
  - Secret: `AE_EDGE_ORIGIN_HMAC_KEY`; vars `AE_ROUTING_ORIGIN`, `AE_EDGE_ENVIRONMENT`
  - App pointer: `AE_ROUTING_PUBLIC_BASE_URL` in `.env.example`

**Provider host policy:**
- Shared resolver: `src/modules/security/provider-api-base-url.ts` — production HTTPS + allowlisted hosts only; non-prod may use localhost overrides

## Data Storage

**Databases:**
- Convex (document/reactive backend)
  - Connection: `VITE_CONVEX_URL` (client); deploy key `CONVEX_DEPLOY_KEY` (CI/release)
  - Client: Convex generated API under `convex/_generated/`; schema composed in `convex/schema.ts` from module table fragments
  - No traditional SQL ORM

**File Storage:**
- Local filesystem / Vercel static assets for brand and built output
- No dedicated object-store SDK (S3/R2/Blob) detected in application source

**Caching:**
- Meilisearch as search mirror (not a general cache)
- No Redis/Upstash client detected

## Authentication & Identity

**Auth Provider:**
- Clerk (primary human auth)
  - Implementation: request middleware in `src/start.ts`; Convex JWT validation via `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`
  - Customer Request agents: Clerk API keys via `clerkClient().apiKeys` (`src/lib/server/customer-request-agent-auth.ts`, `src/modules/customer-request/agent-access.functions.ts`)
  - Local e2e bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` / related helpers in `src/lib/server/local-e2e-bypass.ts`

**Machine / write admission:**
- Source-write HMAC envelopes (`AE_SOURCE_WRITE_SECRET` + per-family keys) — `src/modules/security/source-write-admission.ts`, middleware in `src/start.ts`
- Web Bot Auth for signed agent attribution (identity ≠ write authority)

## Monitoring & Observability

**Error Tracking:**
- Sentry — `@sentry/react` client (`src/lib/observability/sentry.client.ts`), `@sentry/node` server (`src/lib/observability/sentry.server.ts`), bootstrapped from `src/start.ts` middleware
  - Env: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

**Product analytics:**
- PostHog — `posthog-js` client (`src/lib/observability/posthog.client.ts`), `posthog-node` server (`src/lib/observability/posthog.server.ts`)
  - Env: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `POSTHOG_KEY`, `POSTHOG_HOST`, optional app URLs
  - Kill switch: `VITE_AE_DISABLE_OBSERVABILITY` / `AE_DISABLE_OBSERVABILITY`
  - Funnel sync brake: `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`
  - HTTP: `src/routes/api.observability.funnel.ts`

**Logs:**
- Cloudflare Worker observability (logs/traces) enabled in `examples/routing-edge/wrangler.jsonc`
- Application logging primarily via structured results + Sentry exceptions (no Datadog/LogDrain SDK detected)

## CI/CD & Deployment

**Hosting:**
- Vercel — production app (`agentic-economy-phi.vercel.app`); Nitro `vercel` preset with Node serverless entry
- Convex Cloud — schema/functions deploy in release gate
- Cloudflare — optional routing-edge Worker

**CI Pipeline:**
- GitHub Actions
  - `.github/workflows/kernel-release-gate.yml` — `npm run test:release:source` on PR/main; on main: Vercel git-source deploy + Convex deploy + customer-request lifecycle readback
  - `.github/workflows/react-doctor.yml` — React health checks
- Release tooling: `tools/release/deploy-customer-request-git-source.ts` (Vercel API `https://api.vercel.com/v13/deployments`), smoke scripts under `tools/release/`, `tools/dev/`

## Environment Configuration

**Required env vars (critical families — see `.env.example` for full list):**
- Clerk: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
- Convex: `VITE_CONVEX_URL` (+ Convex dashboard secrets for deploy/signing)
- Source-write: `AE_SOURCE_WRITE_SECRET` and/or per-family `AE_SOURCE_WRITE_KEY_*`
- Canonical URL: `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`
- Notifications (when enabled): Resend/Novu/outbox secrets above
- Observability (when enabled): Sentry/PostHog keys
- Optional: OpenRouter, Meilisearch, Stripe/Autumn, Google Maps, WBA allowlist/JWKS

**Secrets location:**
- Local: `.env.local` / `.env.development.local` (gitignored)
- Template only: `.env.example`
- CI/production: GitHub Actions secrets / environments; Vercel project env; Convex production env (`npx convex env get/set`)
- Never commit credential files or quote secret values in docs

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` — Resend delivery events; HMAC verify then Convex `notificationOutbox:ingestNotificationWebhookEvent` (`src/routes/api.notification.resend-webhook.ts`)
- Stripe/Autumn webhook secrets are configured in env for admission readiness; dedicated live webhook route modules for billing are not present as active `src/routes/api.*.ts` files in this revision (prefer notification + source-write patterns; do not invent endpoints)

**Outgoing:**
- Resend send API / Novu trigger + transaction message readback (`src/lib/server/notification-provider.ts`)
- OpenRouter chat completions
- Meilisearch index/search/task APIs
- Clerk user/API-key APIs
- Capability route transport HTTP/MCP/x402 calls to provider endpoints (runtime in `src/modules/capability-supply/route-transport-runtime.ts`)
- Vercel Deploy API from release tooling (`tools/release/deploy-customer-request-git-source.ts`)
- Optional Cloudflare edge → Convex HTTP origin

**Machine-readable AE surfaces (not third-party, but integration-facing):**
- `GET /llms.txt`, `GET /SKILL.md`, `GET /api/businesses*`, Customer Request HTTP under `/api/requests*` and `/api/v1/requests*`
- Note: historical `/api/agent/tools` door is documented in planning/AGENTS material; no `src/routes/api.agent.tools.ts` in this mapped revision — use live routes above and `src/modules/actions/index.ts` action registry

---

*Integration audit: 2026-07-18*
*last_mapped_commit: 5ea44454*
