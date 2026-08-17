# External Integrations

**Analysis Date:** 2026-08-17

## APIs & External Services

**LLM / Model Gateway:**
- OpenRouter — Structured answer turns, customer-request model calls, and eval harnesses
  - SDK/Client: `@openrouter/ai-sdk-provider` via Vercel AI SDK (`ai`) in `src/modules/model-gateway/public.ts`
  - Auth: `OPENROUTER_API_KEY` (server-only); optional base URL override `AE_OPENROUTER_API_BASE_URL`
  - Default model: `AE_LLM_MODEL` (default `deepseek/deepseek-v4-flash`); selector whitelist `AE_LLM_MODELS`

**Payments — Fiat (Stripe):**
- Stripe — Organization credit top-up (Checkout), Connect account onboarding, payout transfers, account webhooks
  - SDK/Client: `stripe` npm package in `src/lib/server/stripe-money-provider.ts`; browser Elements via `@stripe/react-stripe-js` in `src/components/ae/console/AeCreditTopUpPanel.tsx`
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (server-only); `VITE_STRIPE_PUBLISHABLE_KEY` (client)
  - Production host allowlist: `api.stripe.com` enforced per `.env.example` commentary and `src/modules/security/source-write-admission.ts`

**Payments — Crypto (x402 / EVM):**
- x402 protocol — Paid provider route transport (`x402-fetch:v2` adapter) for capability supply execution
  - SDK/Client: `@x402/core`, `@x402/evm`, `@x402/extensions` in `src/modules/capability-supply/internal/x402-payment-signer.ts`, `transport-adapters.ts`
  - Auth/custody: `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`, `AE_X402_RPC_URLS_JSON` (server-only JSON map of EVM network → RPC URL)
  - Chain reads: `viem` public client in `src/modules/capability-supply/internal/x402-evm-receipt-reader.ts`

**Billing (Autumn — configured, not wired in application code):**
- Autumn (`api.useautumn.com`) — Env vars present for future/alternate billing portal integration
  - SDK/Client: Not detected in `src/` or `convex/`; only env names in `.env.example` and deployment manifest field rules
  - Auth: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `AUTUMN_PROJECT_ID`, `AUTUMN_ENVIRONMENT`, `AUTUMN_API_BASE_URL`, `AUTUMN_PORTAL_RETURN_BASE_URL`

**Email / Notifications:**
- Resend — Owner inquiry notification email dispatch
  - SDK/Client: REST via `fetch` in `src/lib/server/notification-provider.ts`; dispatch route `src/routes/api.notification.resend-dispatch.ts`
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`; base URL `RESEND_API_BASE_URL` (default `https://api.resend.com`)
- Novu — Workflow-based inquiry notifications (owner and customer recipients)
  - SDK/Client: REST via `fetch` in `src/lib/server/notification-provider.ts`; dispatch route `src/routes/api.notification.novu-dispatch.ts`
  - Auth: `NOVU_SECRET_KEY`; workflows `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`; base URL `NOVU_API_BASE_URL` (default `https://api.novu.co`)
- Clerk (email lookup) — Resolves owner delivery addresses via Clerk user API during notification dispatch (`readClerkSecretKey`, `resolveClerkOwnerDeliveryAddress` in `src/lib/server/notification-provider.ts`)

**Agent Protocol Surfaces:**
- Model Context Protocol (MCP) — Streamable HTTP tools gateway for registered actions
  - SDK/Client: `@modelcontextprotocol/sdk` in `src/lib/server/mcp-api.ts`
  - Endpoint: `GET|POST /mcp` at `src/routes/mcp.ts`; public docs in `src/routes/for-agents.tsx`
  - Auth: Bearer agent-access keys via `src/lib/server/agent-access-auth.ts` (Clerk-issued API keys)
- AE CLI — External agent parity client exercising HTTP/MCP surfaces
  - Entry: `tools/ae/cli.ts` (`npm run ae -- <command>`); uses `AE_CLI_BASE_URL`, `AE_API_KEY`

**Provider HTTP (Capability Supply):**
- External provider operations — OpenAPI-described HTTP endpoints invoked at route-execution time
  - Integration method: `openapi-fetch` body serialization and custom transport adapters in `src/modules/capability-supply/route-transport-runtime.ts`
  - Auth: Per-publication provider connection credentials stored in Convex (`convex/capabilityProviderConnections.ts`); x402 or API-key transports per adapter
- Curated fixtures — Frankfurter ECB rates, Exa search (seeded in release CI via `convex/curatedProviders` functions referenced in `.github/workflows/kernel-release-gate.yml`)

**Routing Edge (external reference):**
- Cloudflare Workers routing edge — Public routing base URL for discovery fixtures
  - Configuration: `AE_ROUTING_PUBLIC_BASE_URL` in `.env.example` (example host `ae-routing-edge.example.workers.dev`)
  - Usage: Test helpers in `tests/helpers/discovery-fixture-routes.ts`; no worker source in this repository

**Maps (optional):**
- Google Maps Embed API — Generative map artifacts in chat UI
  - Client: iframe embed in `src/components/ae/artifacts/AeGenerativeMap.tsx`
  - Auth: `VITE_GOOGLE_MAPS_API_KEY` (public client key)

**Evaluation Platforms:**
- Braintrust — Answer eval dataset export and remote scoring
  - SDK/Client: `braintrust` in `eval/braintrust/answer.eval.ts`; CLI integration in `tools/ae/commands/eval.ts`
  - Auth: `BRAINTRUST_API_KEY`; project/dataset via `AE_BRAINTRUST_PROJECT`, `AE_BRAINTRUST_DATASET`
- promptfoo — Local prompt regression suite for answer pipeline
  - Config: `eval/answer/promptfooconfig.yaml`; run via `npm run test:eval`

## Data Storage

**Databases:**
- Convex — Primary transactional store for all domain tables (business, catalog, capability supply, customer requests, money ledger, inquiries, answer threads, notification outbox, registry, work trees, etc.)
  - Connection: `VITE_CONVEX_URL` (client) and `CONVEX_URL` (server); must agree in production per `src/lib/deployment/manifest.ts`
  - Client: `convex` npm package; server bridge in `src/lib/server/convex-source.ts`
  - Schema: Modular table definitions imported into `convex/schema.ts` from `src/modules/*/internal/*schema*`
  - Migrations: `convex/migrations.ts`

**File Storage:**
- Local filesystem only for build artifacts, eval output, and release evidence (`output/release/`, `output/eval/`)
- No S3/Supabase Storage SDK detected; provider artifacts and contracts live in Convex documents

**Caching:**
- None (no Redis or in-memory cache service)
- Convex indexes and aggregate component (`ownerActivationByStage`) provide query-side aggregation in `convex/convex.config.ts`

## Authentication & Identity

**Auth Provider:**
- Clerk — Human operator and owner authentication; API keys for agent access
  - Implementation: `@clerk/tanstack-react-start` middleware in `src/start.ts`; `ClerkProvider` in `src/routes/__root.tsx`
  - Convex auth: JWT from Clerk issuer (`CLERK_JWT_ISSUER_DOMAIN`) validated per `convex/auth.config.ts`
  - Token storage: Clerk session cookies managed by Clerk SDK; Convex client uses Clerk-issued JWT
  - Agent API keys: Created/revoked via `src/modules/agent-access/agent-access.functions.ts` using `clerkClient().apiKeys`
  - Local E2E bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` (forbidden in production per deployment manifest)

**OAuth Integrations:**
- Agent-access device OAuth — Convex-backed OAuth grant flow for CLI `connect` command
  - Implementation: `convex/agentAccessOAuth.ts`, routes under agent-access module
  - Credentials: Clerk-issued; no third-party social OAuth beyond Clerk's built-in providers

**Web Bot Auth (WBA):**
- HTTP Message Signatures — Agent principal admission for public inquiry submission
  - Implementation: `http-message-sig` in `src/modules/security/source-write-admission.ts`
  - Public key directory: `GET /.well-known/http-message-signatures-directory` at `src/routes/[.]well-known/http-message-signatures-directory.ts`
  - Configuration: `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`

**Source-Write Trust Envelope:**
- Scoped HMAC signing for Convex source mutations (inquiry, billing, protected, claim, operator, repair, session families)
  - Implementation: `src/modules/security/source-write-admission.ts`, Convex admission in `convex/sourceWriteAdmission.ts`
  - Keys: `AE_SOURCE_WRITE_KEY_*` per family (production); dev may derive from `AE_SOURCE_WRITE_SECRET` via HKDF

## Monitoring & Observability

**Error Tracking:**
- Sentry — Server and client unhandled exceptions
  - DSN: `VITE_SENTRY_DSN` (client), `SENTRY_DSN` (server)
  - Release tracking: `SENTRY_RELEASE` or `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`
  - Build upload: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` enable `@sentry/vite-plugin` in `vite.config.ts`
  - Implementation: `src/lib/observability/sentry.server.ts`, middleware in `src/start.ts`

**Analytics:**
- PostHog — Funnel events, gateway telemetry, legacy registry API capture
  - Token: `VITE_POSTHOG_KEY` (client), `POSTHOG_KEY` (server)
  - Host: `VITE_POSTHOG_HOST` / `POSTHOG_HOST` (default `https://us.i.posthog.com`)
  - Implementation: `src/lib/observability/posthog.server.ts`, client config in `src/lib/observability/config.ts`
  - Public funnel sync endpoint: `src/routes/api.observability.funnel.ts` (disable via `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`)

**Logs:**
- stdout/stderr — Vercel function logs in production; Convex dashboard logs for backend functions
- Request correlation IDs — `src/lib/server/request-correlation.ts` tags Sentry scope and response headers
- No Datadog/CloudWatch SDK detected

## CI/CD & Deployment

**Hosting:**
- Vercel — TanStack Start app with Nitro Node serverless (`nodejs22.x`)
  - Deployment: Automatic via Vercel on git push; explicit deploy script `tools/release/deploy-customer-request-git-source.ts` in release gate
  - Environment vars: Vercel project dashboard + `VERCEL_TOKEN` in GitHub secrets
  - Protection bypass: `VERCEL_AUTOMATION_BYPASS_SECRET` for hosted smokes
- Convex Cloud — Backend deploy via `npx convex deploy`; `CONVEX_DEPLOY_KEY` in GitHub secrets

**CI Pipeline:**
- GitHub Actions
  - `.github/workflows/kernel-release-gate.yml` — Source proof (lint, typecheck, conformance, unit/integration tests, build) on PRs; hosted production smoke on `main`; opt-in live paid gateway smoke via `workflow_dispatch`
  - `.github/workflows/react-doctor.yml` — Advisory React health scans on PRs and `main`
  - Secrets: Clerk, Convex, Stripe, OpenRouter, x402, Vercel, gateway smoke fixtures stored in GitHub repo/environment secrets (names visible in workflow env blocks; values never in repo)

## Environment Configuration

**Development:**
- Required for full local loop: `VITE_CONVEX_URL` (from `npx convex dev`), Clerk test keys, `OPENROUTER_API_KEY` for live LLM turns
- Secrets location: `.env` / `.env.local` (gitignored); template in `.env.example`
- Mock/stub services: Stripe test mode, optional provider base URL overrides (`RESEND_API_BASE_URL`, `NOVU_API_BASE_URL`, `AE_OPENROUTER_API_BASE_URL`), local Convex deployment
- Local orchestration: `npm run dev:local` (`tools/dev/local-dev.mjs`) starts Convex + Vite together

**Staging:**
- Vercel preview deployments inherit preview env; deployment manifest classifies `preview` separately in `src/lib/deployment/manifest.ts`
- Convex preview deployments possible via Convex CLI; no separate staging project name hardcoded in repo

**Production:**
- Secrets management: Vercel environment variables + Convex production env (`npx convex env set --prod`)
- Required production config validated by `validateDeploymentManifest()` in `src/lib/deployment/manifest.ts`: Clerk, Convex, OpenRouter, Stripe, x402 custody, all `AE_SOURCE_WRITE_KEY_*` families, canonical URL
- Forbidden in production: `AE_SOURCE_WRITE_SECRET`, `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, dev WBA smoke vars, `AE_API_KEY` fixture keys
- Release identity: `AE_RELEASE_SOURCE_REVISION`, `AE_RELEASE_DEPLOYMENT_ID`, `AE_RELEASE_CONVEX_URL` bound during hosted proof

## Webhooks & Callbacks

**Incoming:**
- Stripe — `POST /api/stripe/webhook` (`src/routes/api.stripe.webhook.ts`)
  - Verification: `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET` in `src/lib/server/stripe-money-provider.ts`
  - Events: Credit payment completion, Connect account updates, payout-related ledger reconciliation (handled in `src/modules/money/server.ts`)
- Resend — `POST /api/notification/resend-webhook` (`src/routes/api.notification.resend-webhook.ts`)
  - Verification: HMAC signature via `verifyResendWebhook` in `src/lib/server/notification-provider.ts` with `RESEND_WEBHOOK_SECRET`
  - Events: Email delivery lifecycle ingested into Convex notification outbox via `convex/notificationOutbox.ts`
- Autumn — Not detected (no webhook route; `AUTUMN_WEBHOOK_SECRET` env only)

**Outgoing:**
- Resend send API — Triggered by `POST /api/notification/resend-dispatch` (`src/routes/api.notification.resend-dispatch.ts`) on behalf of Convex notification outbox worker
- Novu trigger API — Triggered by `POST /api/notification/novu-dispatch` (`src/routes/api.notification.novu-dispatch.ts`)
- Provider operation HTTP — Outbound calls during route execution dispatch (`convex/customerRequestRouteExecution.ts`, transport runtime in `src/modules/capability-supply/route-transport-runtime.ts`); may include x402 payment headers
- Stripe API — Checkout session creation, Connect onboarding links, transfer listing (`src/lib/server/stripe-money-provider.ts`)
- OpenRouter API — LLM inference requests from answer and customer-request paths
- Convex HTTP router — Retired v1 routing paths return structured retirement responses in `convex/http.ts` (`/v1/route`, `/v1/execute`, etc.); active MCP lives on TanStack Start `/mcp`, not Convex HTTP

---

*Integration audit: 2026-08-17*
*Update when adding/removing external services*
