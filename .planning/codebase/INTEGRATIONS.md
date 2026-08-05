<!-- refreshed: 2026-08-05 -->

# External Integrations

**Analysis Date:** 2026-08-05

## Data Storage & Backend

**Convex 1.42.0** - Durable backend database and server-function runtime; the source of truth for all domains. Functions live in `convex/` (e.g. `capabilitySupply.ts`, `capabilitySupplyOperations.ts`, `curatedProviders.ts`, `customerRequestRouteMandate.ts`, `devSeed.ts`, `moneyLedger.ts`); client/gateway call them via `convex/_generated/`.
- Components (mounted in `convex.config.ts`): `@convex-dev/workflow` (durable workflows), `@convex-dev/workpool`, `@convex-dev/rate-limiter`, and `@convex-dev/aggregate` under the name `ownerActivationByStage`.
- Deployment URL from `CONVEX_URL` / `VITE_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL`; the seed entrypoint is `npm run seed:dev` → `convex run devSeed:seedDevCatalog` (`convex/devSeed.ts`), which calls `internal.curatedProviders.seed`.
- Deterministic kernel principle: validation/persistence live in Convex (authority), while the model emits typed proposals — see `.planning/codebase/PROMPT-DATA-FLOW.md`.

## Identity & Authentication

**Clerk** - Sign-in/sign-up, TanStack server sessions, Convex JWT trust, and customer-request agent API-key lifecycle.
- SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx` / `sign-up.$.tsx`, and `src/lib/server/require-clerk-server-session.ts`.
- Convex trust: `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN` and validates Clerk JWTs; server ops use `CLERK_SECRET_KEY`.
- Agent/key operations: `src/lib/server/customer-request-agent-auth.ts` and `src/modules/customer-request/agent-access.functions.ts`; instance/subject via `AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID` / `AE_CUSTOMER_REQUEST_CLERK_SUBJECT`; local E2E bypass via `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`.

## AI & Model Providers

**OpenRouter** - Primary LLM provider via the Vercel AI SDK.
- SDK/Client: `ai` 7.0.44 + `@openrouter/ai-sdk-provider`, centralized by `src/modules/model-gateway/public.ts` (`openRouterGatewayConfig`, `openRouterModel`, `openRouterCostUsd`). Default model `deepseek/deepseek-v4-flash` (`DEFAULT_OPENROUTER_MODEL`).
- Consumers: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/customer-request/openrouter-transport.ts`, `src/modules/customer-request/application/interpret-compile/interpreter.ts`, `src/modules/answer/internal/answer-llm-prompts.ts`, `src/modules/storefront/internal/business-enrichment.ts`, `src/modules/answer-thread/internal/answer-response-planner.ts`.
- Model catalog: `src/modules/answer/internal/openrouter-models.ts` fetches `https://openrouter.ai/api/v1/models` (cached 2 min, 10 s timeout, bounded response) and filters out non-generation capabilities.
- Auth: `OPENROUTER_API_KEY`; controls: `AE_OPENROUTER_API_BASE_URL`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_CUSTOMER_REQUEST_MODEL` (Convex env), `SITE_URL` / `AE_SITE_URL`.

## External Capability Catalog (curated providers)

The engine exposes a curated capability catalog of real external APIs, admitted via the deterministic admission normalizer (`src/modules/capability-supply/internal/admit-provider-schema.ts`) and published from `src/modules/capability-supply/curated-{cluster-a,cluster-b,cluster-c}-publications.ts` + `curated-provider-publications.ts`. Credential refs are `none` (keyless), `env:<NAME>` (real env credential), matched by `src/modules/capability-supply/internal/transport-adapters.ts` and probed by `src/modules/capability-supply/internal/readiness-probe.ts`.

**Cluster A - Keyless public HTTP operations (`ae:public`, credential `none`):**
- Open-Meteo weather forecast - `open-meteo.forecast` (`https://api.open-meteo.com/v1/forecast`).
- Open-Meteo geocoding - `open-meteo.geocoding` (`https://geocoding-api.open-meteo.com/v1/search`).
- Wikipedia REST summary - `wikipedia-rest.page-summary` (`https://en.wikipedia.org/api/rest_v1/page/summary`).
- TheCatAPI image search - `thecatapi.image-search` (`https://api.thecatapi.com/v1/images/search`).
- CoinGecko simple price (keyless) - `coingecko.simple-price` (`https://api.coingecko.com/api/v3/simple/price`).
- ipify public IP - `ipify.public-ip` (`https://api.ipify.org`).

**Cluster B - Keyed HTTP operations (env credentials; readiness gated on credential + health probe):**
- OpenWeatherMap current weather - `openweathermap.current-weather` — `env:OPENWEATHER_API_KEY` (`https://api.openweathermap.org/data/2.5/weather`).
- Tavily search - `tavily.search` — `env:TAVILY_API_KEY` (`https://api.tavily.com/search`).
- SerpAPI Google search - `serpapi.google-search` — `env:SERPAPI_API_KEY` (`https://serpapi.com/search`).
- CoinGecko simple price (demo) - `coingecko.simple-price-demo` — `env:COINGECKO_DEMO_API_KEY` (`https://api.coingecko.com/api/v3/simple/price`, `x-cg-demo-api-key` header).

**Curated Agentic-Market (real Exa) + ECB rates** in `src/modules/capability-supply/curated-provider-publications.ts`:
- Exa web search - `exa.search` and Exa web contents - `exa.contents` under business `agentic-market-exa`; credential `env:EXA_API_KEY`, price `USD 1 minor unit`. Source evidence pinned to `https://api.exa.ai/search` and the Exa docs.
- Frankfurter ECB single-pair rate - `frankfurter.single-rate` under business `frankfurter-ecb-rates`; keyless (`credential: none`), daily ECB reference rates via `https://api.frankfurter.app`.

**Cluster C - Observed Agentic-Market x402 listings (discovery only, NOT executed or paid):** registered for discovery and marked `not_available_yet` / "Not verified by AE" with `credentialRef: 'none'`:
- `exa-search-x402` (Exa search via Agentic Market), `timezone-convert-x402`, `wolframalpha-query-x402`, `coinmarketcap-quotes-x402`, `flightaware-nearby-x402`, `bizintel-forex-rate-x402`, `tavily-search-x402`.
- All observed 2026-08-05 via the Agentic Market public services search endpoint (`https://api.agentic.market/v1/services/search`); none carry an AE credential or trigger any payment. x402 protocol types come from `@x402/core`, `@x402/evm`, `@x402/extensions` (2.18.0); see `src/modules/capability-supply/internal/x402-payment-signer.ts` and `src/modules/action-invocation/x402-payment-attempt.ts`.

## Notifications & Messaging

**Resend** - Owner/customer email delivery and signed delivery-event ingestion.
- SDK/Client: bounded server `fetch` adapter in `src/lib/server/notification-provider.ts` (`https://api.resend.com`); dispatch/webhook routes `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.resend-webhook.ts`; email rendering via `@react-email/*`.
- Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `RESEND_API_BASE_URL`; outbox signing secret `AE_NOTIFICATION_OUTBOX_SECRET`.

**Novu** - Push/notification workflow trigger with readback.
- SDK/Client: bounded server adapter in `src/lib/server/notification-provider.ts` (`https://api.novu.co`); dispatch route `src/routes/api.notification.novu-dispatch.ts`.
- Auth: `NOVU_SECRET_KEY`; workflow ids `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`; `NOVU_API_BASE_URL`.

## Observability & Analytics

**Sentry** - Error monitoring; `@sentry/node`/`@sentry/react` + `@sentry/vite-plugin` (sourcemaps gated on `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`).
- Env: `SENTRY_DSN`/`VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`/`VITE_SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`.

**PostHog** - Product analytics; `posthog-js` (client, `src/lib/observability/posthog.client.ts`) and `posthog-node` (server, `src/lib/observability/posthog.server.ts`).
- Env: `POSTHOG_KEY`/`VITE_POSTHOG_KEY`, `POSTHOG_HOST`/`VITE_POSTHOG_HOST` (default `https://us.i.posthog.com`), `POSTHOG_APP_URL`/`VITE_POSTHOG_APP_URL`; disable via `AE_DISABLE_OBSERVABILITY` / `VITE_AE_DISABLE_OBSERVABILITY`.

## Deployment & Platform

- **Vercel** - Hosted routing/webhooks via Nitro `vercel` preset (Node 22 serverless, `nodejs22.x`) in `vite.config.ts`; release tagging via `VERCEL_GIT_COMMIT_SHA`.
- **Convex cloud** - Backend deployment.
- **Sandbox/staging providers** - Route quoter/resolver/workflow origins under `AE_SANDBOX_*` envs; provider key `AE_SANDBOX_PROVIDER_KEY`; workflow origin `AE_SANDBOX_WORKFLOW_ORIGIN`.
- Web Browser Assertion directory JWK (`AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`) and site/routing URLs (`SITE_URL`, `AE_SITE_URL`, `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_ROUTING_PUBLIC_BASE_URL`, `AE_CLI_BASE_URL`).

## Environment Variables (names only; values are secret-scoped)

- **AI/OpenRouter:** `OPENROUTER_API_KEY`, `AE_OPENROUTER_API_BASE_URL`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_CUSTOMER_REQUEST_MODEL`.
- **Convex:** `CONVEX_URL`, `VITE_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOYMENT_ID`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_SOURCE_WRITE_SECRET`.
- **Auth (Clerk):** `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID`, `AE_CUSTOMER_REQUEST_CLERK_SUBJECT`, `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`.
- **Notifications:** `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `AE_NOTIFICATION_OUTBOX_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, `NOVU_API_BASE_URL`.
- **Observability (Sentry/PostHog):** `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `VITE_SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, `VITE_AE_DISABLE_OBSERVABILITY`.
- **Curated capability credentials:** `EXA_API_KEY`, `OPENWEATHER_API_KEY`, `TAVILY_API_KEY`, `SERPAPI_API_KEY`, `COINGECKO_DEMO_API_KEY`.
- **Site/routing/signing:** `SITE_URL`, `AE_SITE_URL`, `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_ROUTING_PUBLIC_BASE_URL`, `AE_CLI_BASE_URL`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`.
- **Sandbox:** `AE_SANDBOX_PROVIDER_KEY`, `AE_SANDBOX_PROVIDER_ORIGIN`, `AE_SANDBOX_ROUTE_QUOTER_ORIGIN`, `AE_SANDBOX_ROUTE_QUOTER_V4_ORIGIN`, `AE_SANDBOX_ROUTE_RESOLVER_ORIGIN`, `AE_SANDBOX_ROUTE_RESOLVER_V4_ORIGIN`, `AE_SANDBOX_WORKFLOW_ORIGIN`.
- **CI/eval/misc:** `AE_ANSWER_EVAL_PASSED`, `AE_ANSWER_EVAL_REGISTRY_SEED`, `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `NODE_ENV`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`.

*INTEGRATIONS analysis: 2026-08-05*
