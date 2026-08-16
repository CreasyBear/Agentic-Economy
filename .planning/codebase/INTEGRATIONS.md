# External Integrations

**Analysis Date:** 2026-08-15

## APIs & External Services

**Backend Platform:**
- Convex - primary database, reactive API, scheduled jobs, and durable workflow/workpool execution declared in `convex/schema.ts`, `convex/convex.config.ts`, and `convex/crons.ts`.
  - SDK/Client: `convex`, `@convex-dev/workflow`, `@convex-dev/workpool`, `@convex-dev/rate-limiter`, and `@convex-dev/aggregate` from `package.json`.
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `CLERK_JWT_ISSUER_DOMAIN`, and deployment credentials used by `.github/workflows/kernel-release-gate.yml`.

**Identity and Agent Access:**
- Clerk - browser/server user authentication, Convex JWT identity, server-side user lookup, and Clerk-issued API keys for agents in `src/start.ts`, `src/routes/__root.tsx`, `convex/auth.config.ts`, and `src/modules/agent-access/agent-access.functions.ts`.
  - SDK/Client: `@clerk/tanstack-react-start` and Clerk server APIs imported by `src/modules/agent-access/agent-access.functions.ts`.
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN` required by `src/lib/deployment/manifest.ts`.
- AE OAuth authorization server - dynamic public-client registration, PKCE authorization-code grants, device grants, consent, and bearer delivery implemented by `src/lib/server/agent-access-oauth-api.ts` and routes under `src/routes/oauth.*.ts`.
  - SDK/Client: custom OAuth 2.0 implementation backed by Clerk API keys and Convex state in `src/lib/server/agent-access-oauth-store.ts`.
  - Auth: owner Clerk session plus generated AE bearer credentials; canonical issuer comes from `AE_CANONICAL_BASE_URL` or request resolution in `src/lib/server/canonical-url.ts`.

**AI and Evaluation:**
- OpenRouter - sole production language-model gateway, model catalog, structured outputs, web-search plugin, and usage/cost metadata in `src/modules/model-gateway/public.ts` and `src/modules/answer/internal/openrouter-models.ts`.
  - SDK/Client: Vercel AI SDK `ai` with `@openrouter/ai-sdk-provider`.
  - Auth: `OPENROUTER_API_KEY`; optional `AE_OPENROUTER_API_BASE_URL`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, and `SITE_URL` are read in `src/modules/model-gateway/public.ts`.
- Braintrust - explicit reviewed-answer dataset export/snapshot and optional remote evaluation in `tools/ae/commands/eval.ts` and `eval/braintrust/answer.eval.ts`.
  - SDK/Client: `braintrust`.
  - Auth: `BRAINTRUST_API_KEY`; dataset/project/version selectors are read in `tools/ae/commands/eval.ts` and `eval/braintrust/answer.eval.ts`.
- Promptfoo - local answer prompt evaluation and validation configured in `eval/answer/promptfooconfig.yaml` and invoked by scripts in `package.json`.
  - SDK/Client: `promptfoo` CLI.
  - Auth: inherits `OPENROUTER_API_KEY` where live provider evaluation is enabled by `eval/answer/promptfooconfig.yaml`.

**Payments and Money:**
- Stripe - embedded Checkout credit top-ups, payment readback, Stripe Connect recipient onboarding, transfers, and signed webhook reconciliation in `src/lib/server/stripe-money-provider.ts`, `src/components/ae/console/AeCreditTopUpPanel.tsx`, and `src/routes/api.stripe.webhook.ts`.
  - SDK/Client: `stripe`, `@stripe/stripe-js`, and `@stripe/react-stripe-js`.
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `VITE_STRIPE_PUBLISHABLE_KEY` required by `src/lib/deployment/manifest.ts`.
- x402 / EVM - discovers paid operations, validates 402 challenges, signs exact EVM payment payloads, and verifies settlement evidence in `src/modules/capability-supply/internal/x402-payment-signer.ts`, `src/modules/capability-supply/internal/x402-settlement-verifier.ts`, and `src/modules/action-invocation/x402-payment-attempt.ts`.
  - SDK/Client: `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem`.
  - Auth: `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`, and `AE_X402_RPC_URLS_JSON` required by `src/lib/deployment/manifest.ts`.

**Notifications:**
- Resend - owner email dispatch and Svix-style webhook verification in `src/lib/server/notification-provider.ts`, `src/routes/api.notification.resend-dispatch.ts`, and `src/routes/api.notification.resend-webhook.ts`.
  - SDK/Client: bounded native `fetch` calls to the Resend REST API in `src/lib/server/notification-provider.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, and `AE_NOTIFICATION_OUTBOX_SECRET`; optional `RESEND_API_BASE_URL` is validated by `src/lib/deployment/manifest.ts`.
- Novu - owner/customer workflow triggering and message delivery readback in `src/lib/server/notification-provider.ts` and `src/routes/api.notification.novu-dispatch.ts`.
  - SDK/Client: bounded native `fetch` calls to the Novu REST API in `src/lib/server/notification-provider.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and `AE_NOTIFICATION_OUTBOX_SECRET` in `src/lib/deployment/manifest.ts`.

**Observability and Maps:**
- Sentry - server/client error capture, tracing, sanitized telemetry, and optional source-map upload in `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, and `vite.config.ts`.
  - SDK/Client: `@sentry/node`, `@sentry/react`, and `@sentry/vite-plugin`.
  - Auth: runtime `SENTRY_DSN`/`VITE_SENTRY_DSN`; source-map upload uses `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` as configured in `vite.config.ts`.
- PostHog - pseudonymous client/server product and funnel analytics in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/modules/observability/`.
  - SDK/Client: `posthog-js` and `posthog-node`.
  - Auth: `POSTHOG_KEY`/`VITE_POSTHOG_KEY`; hosts and app URLs are configured through variables read by `src/lib/observability/config.ts`.
- Google Maps Embed - optional place and office maps rendered by `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - SDK/Client: sandboxed Maps Embed iframe; no JavaScript SDK wrapper.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY` read in `src/components/ae/artifacts/AeGenerativeMap.tsx`.

**Capability and Provider Network:**
- MCP and OpenAPI providers - hosts an AE Streamable HTTP MCP endpoint and invokes registered remote MCP/OpenAPI operations through `src/lib/server/mcp-api.ts`, `src/lib/mcp-protocol.ts`, `src/modules/capability-supply/internal/transport-adapters.ts`, and `src/modules/capability-execution/operation-execute.server.ts`.
  - SDK/Client: `@modelcontextprotocol/sdk`, `openapi-fetch`, `@apidevtools/json-schema-ref-parser`, and guarded `undici`.
  - Auth: per-provider credential references are resolved server-side; publication UI explicitly avoids raw credential entry in `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx`.
- Curated data providers - Open-Meteo, Wikipedia, Mockster, CoinGecko, ipify, Exa, Frankfurter, OpenWeatherMap, Tavily, SerpAPI, WolframAlpha, CoinMarketCap, FlightAware, and other x402 resources are represented as executable publications in `src/modules/capability-supply/curated-cluster-a-publications.ts`, `src/modules/capability-supply/curated-cluster-b-publications.ts`, `src/modules/capability-supply/curated-cluster-c-publications.ts`, and `src/modules/capability-supply/curated-provider-publications.ts`.
  - SDK/Client: normalized OpenAPI/MCP/x402 transports under `src/modules/capability-supply/internal/` and `src/modules/capability-execution/`.
  - Auth: keyless sources require none; keyed sources use registered provider credential references rather than global raw keys, as enforced by `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx`.
- Shippo / EasyPost shipping quote adapters — **retired 2026-08-15** (Product-Frontier Cleanup Batch 2). Market operations use capability-supply + `operation.invoke`; see `.planning/evidence/product-frontier-baseline/PARKED-CAPABILITY-DECISIONS.md`.

## Data Storage

**Databases:**
- Convex managed document database - canonical application records and indexes are assembled in `convex/schema.ts` from module schemas under `src/modules/*/internal/convex-schema.ts`.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL`, validated in `src/lib/deployment/manifest.ts`.
  - Client: generated Convex function references in `convex/_generated/` and server access through `src/lib/server/convex-source.ts`.

**File Storage:**
- No application Convex file-storage calls are detected; durable state is document-based through `convex/schema.ts`. Release/evaluation artifacts are local or GitHub Actions outputs under paths configured by `.github/workflows/kernel-release-gate.yml`.

**Caching:**
- No external cache service is configured. Process-local caches cover OpenRouter provider/model metadata in `src/modules/model-gateway/public.ts` and `src/modules/answer/internal/openrouter-models.ts`; authoritative state remains in Convex via `convex/schema.ts`.

## Authentication & Identity

**Auth Provider:**
- Clerk for human sessions and Convex JWT identity; AE-owned OAuth issues scoped Clerk API-key bearer credentials to assistants. Implementation spans `src/start.ts`, `convex/auth.config.ts`, `src/lib/server/agent-access-auth.ts`, and `src/lib/server/agent-access-oauth-api.ts`.
  - Implementation: derive human identity server-side from Clerk, map Convex identity through `CLERK_JWT_ISSUER_DOMAIN`, and authorize MCP/API actions by registered principal, scope, authority mode, policy, grant, and revocation records in `src/modules/agent-access/`.

## Monitoring & Observability

**Error Tracking:**
- Sentry is optional and fail-open; server and browser events are sanitized before export in `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, and `src/lib/observability/private-route-safety.ts`.

**Logs:**
- Structured server diagnostics use `console` plus correlation IDs in `src/lib/server/request-correlation.ts`; product/funnel events go to PostHog through `src/lib/observability/posthog.server.ts`, while durable operational evidence is stored through `src/modules/observability/` and `convex/observability.ts`.

## CI/CD & Deployment

**Hosting:**
- Vercel Node 22 serverless hosts TanStack Start/Nitro output configured by `vite.config.ts`; Convex separately hosts database functions, HTTP routes, crons, and mounted components from `convex/`.

**CI Pipeline:**
- GitHub Actions runs the source release gate, exact-revision Vercel/Convex deployment, hosted smoke checks, and opt-in paid gateway proof in `.github/workflows/kernel-release-gate.yml`; React Doctor advisory analysis runs from `.github/workflows/react-doctor.yml`.

## Environment Configuration

**Required env vars:**
- Production web/backend identity: `AE_CANONICAL_BASE_URL` or `AE_CANONICAL_HOST_ALLOWLIST`, `CONVEX_URL` or `VITE_CONVEX_URL`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN` in `src/lib/deployment/manifest.ts`.
- Model and money services: `OPENROUTER_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`, `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`, and `AE_X402_RPC_URLS_JSON` in `src/lib/deployment/manifest.ts`.
- Source-write admission: family-specific `AE_SOURCE_WRITE_KEY_*` values for inquiry, billing, protected, claim, operator, repair, and session scopes in `src/lib/deployment/manifest.ts`.
- Conditional services: Resend, Novu, Sentry, PostHog, Google Maps, Braintrust, routing-signature, and notification variables are declared or validated in `src/lib/deployment/manifest.ts`, `src/lib/observability/config.ts`, and `src/lib/server/notification-provider.ts`.

**Secrets location:**
- GitHub Actions production secrets are referenced without inline values in `.github/workflows/kernel-release-gate.yml`; Convex action secrets are deployment environment variables declared in `convex/convex.config.ts`; Vercel supplies web runtime variables checked by `src/lib/deployment/manifest.ts`.
- `.env.example` is present for environment configuration and was not read; secret-bearing environment files must remain outside committed source according to `AGENTS.md`.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/stripe/webhook` receives and verifies Stripe Checkout, Connect account, and payout-related event evidence through `src/routes/api.stripe.webhook.ts` and `src/lib/server/stripe-money-provider.ts`.
- `POST /api/notification/resend-webhook` receives bounded Resend events and verifies Svix signature headers through `src/routes/api.notification.resend-webhook.ts` and `src/lib/server/notification-provider.ts`.
- `POST /mcp` accepts Streamable HTTP MCP JSON-RPC requests through `src/routes/mcp.ts` and `src/lib/server/mcp-api.ts`; anonymous access remains read-only and protected tools require AE bearer credentials.
- OAuth registration, authorization, device authorization, token exchange, and PKCE redirect callbacks are served by `src/routes/oauth.register.ts`, `src/routes/oauth.authorize.ts`, `src/routes/oauth.device_authorization.ts`, and `src/routes/oauth.token.ts`.

**Outgoing:**
- Model requests and model-catalog reads go to OpenRouter through `src/modules/model-gateway/public.ts` and `src/modules/answer/internal/openrouter-models.ts`.
- Payment operations go to Stripe and x402/EVM provider or RPC endpoints through `src/lib/server/stripe-money-provider.ts`, `src/modules/capability-supply/internal/x402-payment-signer.ts`, and `src/modules/capability-supply/internal/x402-settlement-verifier.ts`.
- Notification dispatch/readback goes to Resend, Novu, and Clerk APIs through `src/lib/server/notification-provider.ts`.
- Registered provider operations are invoked over HTTPS OpenAPI, MCP, or x402 transports through `src/modules/capability-supply/internal/transport-adapters.ts` and `src/modules/capability-execution/operation-execute.server.ts`; OAuth authorization redirects only to exact registered URIs validated in `src/lib/server/agent-access-oauth-api.ts`.

---

*Integration audit: 2026-08-15*
