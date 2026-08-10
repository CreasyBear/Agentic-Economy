# External Integrations

**Analysis Date:** 2026-08-09

## APIs & External Services

- OpenRouter is the sole model-provider seam. `src/modules/model-gateway/public.ts` uses the Vercel AI SDK and reads `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, and `SITE_URL`; answer execution consumes this gateway rather than opening a model HTTP client.
- Curated capability supply is declared in `src/modules/capability-supply/curated-provider-publications.ts` and cluster files. Cluster A contains keyless Open-Meteo forecast/geocoding, Wikipedia summary, TheCatAPI image search, CoinGecko simple price, and ipify; Frankfurter is the keyless ECB rate publication.
- Cluster B contains credentialed OpenWeatherMap, Tavily, SerpAPI, and CoinGecko Demo operations. `convex/curatedProviders.ts` maps provider connections to `env:` credential references and persists their authority/readiness separately from catalog projection.
- Cluster C contains observed Agentic Market x402 listings. `src/modules/capability-supply/curated-cluster-c-publications.ts` marks them discovery-only; AE does not execute or pay those observed listings.
- Generic HTTP JSON, MCP JSON-RPC, and x402 transport are validated by `src/modules/capability-supply/internal/transport-adapters.ts` and `src/modules/capability-supply/route-transport-runtime.ts`. `undici` plus `src/modules/network-guard/public.ts` enforce public-target DNS checks, bounded responses, timeouts, and no implicit redirect trust.
- `/api/v1/operations/execute` and the recovery routes use `src/lib/server/operation-invoke-api.ts` and the durable Convex invocation service. Keyless descriptors are read from `capabilitySupplyOperations` by `src/modules/capability-execution/operation-execute.actions.ts`.
- `/mcp` exposes the registered action surface through `src/lib/server/mcp-api.ts` and `@modelcontextprotocol/sdk`; anonymous requests are read-only, while authenticated actions require Clerk/AE agent access scopes and reuse the operation gateway.
- Storefront import is an authenticated POST at `src/routes/api.storefront.import-draft.ts`; `src/modules/storefront/server.ts` fetches only bounded public HTTP(S) pages, follows capped manual redirects, and extracts a draft.
- Shipping has injectable Shippo and EasyPost quote adapters at `src/modules/provider-integrations/shipping/server.ts`; provider URLs, credentials, quote freshness, HMAC quote references, and test/production provider mode remain adapter inputs rather than compiled account configuration.

## Data Storage

- Convex is the authoritative durable store and function boundary. `convex/schema.ts` composes business/catalog, capability supply/contracts, registry, customer requests, agent access/OAuth, answer threads, invocation, routing, money, notification, observability, work-tree, study, and external-run tables.
- Convex components are registered in `convex/convex.config.ts`: workflow, workpool, rate limiter, and the `ownerActivationByStage` aggregate. `convex/crons.ts` refreshes capability readiness and cleans inquiry abuse buckets, source-write nonces, and OAuth grants.
- `src/lib/server/convex-source.ts` uses `ConvexHttpClient`; public calls are unauthenticated, authenticated calls obtain the Clerk `convex` token, and local E2E may use the self-hosted admin path. URLs are selected from `CONVEX_URL` or `VITE_CONVEX_URL`.
- Notification dispatch, provider-response hashes, webhook receipts, idempotency keys, and readback state are persisted in Convex (`convex/schema.ts`, `src/routes/api.notification.*.ts`); local Convex metadata under `.convex/` is runtime state, not application data.

## Authentication & Identity

- Clerk supplies TanStack Start identity (`src/start.ts`, `src/routes/__root.tsx`) and Convex JWT verification (`convex/auth.config.ts`, application ID `convex`). Protected owner, operator, claim, and admin routes require the Clerk session.
- Agent access uses Clerk API keys plus AE-owned principal, policy, scope, revocation, and environment readback (`src/lib/server/agent-access-auth.ts`, `src/modules/agent-access/`). OAuth registration, device grants, authorization-code flow, consent, and token delivery are implemented by `src/lib/server/agent-access-oauth-api.ts` and `src/routes/oauth.*.ts`.
- `src/lib/server/source-write-admission.ts` and `src/modules/security/source-write-admission.ts` authenticate scoped HMAC envelopes. Production requires the inquiry, billing, protected, claim, operator, repair, and session key families; local non-production can derive family keys from the root source-write setting.
- Operation gateway calls use agent access scope and canonical route signing (`AE_ROUTE_CALL_SIGNING_SECRET` and `AE_ROUTE_CALL_SIGNING_KEY_ID`). x402 payer custody is separate and uses an opaque credential reference plus server-only signing material.
- Local E2E auth bypass is explicit and fail-closed in production (`tools/dev/local-dev.mjs`, `src/lib/server/local-e2e-bypass.ts`); there is no equivalent production bypass.

## Monitoring & Observability

- Sentry captures server/browser exceptions and PostHog records client/server funnel analytics (`src/lib/observability/config.ts`, `src/lib/observability/sentry.server.ts`, `src/lib/observability/posthog.server.ts`). Both can be disabled for local E2E through the documented disable flags.
- `src/start.ts` lazily initializes request observability, tags Sentry with sanitized route/correlation fields, captures failures, and flushes PostHog; `/api/health` and `/api/ready` intentionally bypass that request instrumentation.
- Gateway outcomes are projected into the existing bounded action timing sink by `src/lib/server/gateway-telemetry.ts`; no separate gateway telemetry store or provider payload is emitted.

## CI/CD & Deployment

- `.github/workflows/kernel-release-gate.yml` runs on main pushes, pull requests, merge groups, and manual dispatch. Source proof installs `.nvmrc` Node with npm 11.5.1, runs Convex codegen/conformance/source gates, and uploads sanitized evidence.
- Main-branch hosted proof targets the GitHub revision in Vercel's production environment, deploys through `tools/release/deploy-customer-request-git-source.ts`, deploys Convex functions, seeds curated production supply, probes readiness, and runs hosted Request, gateway, and WorkTree readback.
- `src/lib/deployment/manifest.ts` and `src/lib/server/readiness.ts` classify `production`, Vercel `preview`, `development`, and `test`. Production/preview validate the deployment manifest; local development selects self-hosted/local Convex. No separately configured staging service is present.
- Vercel metadata identifies the Nitro project but currently reports Node 24.x (`.vercel/project.json`) while `vite.config.ts` and the repository require Node 22; this is a deployment-setting mismatch, not a second supported runtime.

## Environment Configuration

- Convex/identity names include `CONVEX_URL`, `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `CONVEX_SELF_HOSTED_ADMIN_KEY`, and `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` (`.env.example`, `convex/convex.config.ts`).
- Model and answer names include `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_OPENROUTER_API_BASE_URL`, `SITE_URL`, `AE_SITE_URL`, `VITE_AE_ANSWER_MODE`, and `AE_ANSWER_EVAL_PASSED`.
- Curated provider names include `EXA_API_KEY`, `OPENWEATHER_API_KEY`, `TAVILY_API_KEY`, `SERPAPI_API_KEY`, and `COINGECKO_DEMO_API_KEY`; x402 uses `AE_X402_PAYMENT_CREDENTIAL_REF` and `AE_X402_PAYMENT_PRIVATE_KEY`.
- Trust/routing names include the seven `AE_SOURCE_WRITE_KEY_*` families, their previous/derived key-id families, `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, and `AE_ROUTING_PUBLIC_BASE_URL`.
- Provider/billing names include `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and `AE_NOTIFICATION_OUTBOX_SECRET`. Autumn names remain manifest/security declarations; no active Autumn client is present in current source.
- Observability names include `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `VITE_POSTHOG_KEY`, `POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `POSTHOG_HOST`, `VITE_POSTHOG_APP_URL`, `POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, and `VITE_AE_DISABLE_OBSERVABILITY`.
- Hosted/release tooling receives names such as `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `CONVEX_DEPLOY_KEY`, `AE_RELEASE_SOURCE_REVISION`, `AE_RELEASE_DEPLOYMENT_ID`, `AE_GATEWAY_SMOKE_BASE_URL`, and `AE_GATEWAY_SMOKE_CONVEX_URL`; values are supplied by CI/deployment configuration, never committed to this map.

## Webhooks & Callbacks

- `POST /api/stripe/webhook` accepts bounded raw bodies and the `stripe-signature` header, then delegates verification/application to injectable money adapters. The default route adapters return `stripe_setup_required`, so the route contract does not imply a configured Stripe account (`src/routes/api.stripe.webhook.ts`, `src/modules/money/internal/stripe-webhook.ts`).
- `POST /api/notification/resend-webhook` verifies Resend signature/timestamp headers and ingests an idempotent event into Convex; `POST /api/notification/novu-dispatch` is an internally authorized outbox dispatch/readback callback (`src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.novu-dispatch.ts`).
- OAuth metadata is served from `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`; OAuth callbacks use the routes under `src/routes/oauth.*.ts` and no-store responses.
- `GET /.well-known/http-message-signatures-directory` publishes validated public JWK material for Web Bot Auth from `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`; missing/invalid configuration returns a problem response (`src/routes/[.]well-known/http-message-signatures-directory.ts`).

_Integration refresh: 2026-08-09; evidence was inspected from current routes, provider adapters, Convex seams, deployment files, and environment-name declarations only._
