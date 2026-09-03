# INTEGRATIONS.md

**Analysis Date:** 2026-09-01

## Summary Table

|Service|Version|Purpose|Primary integration points|
|---|---|---|---|
|Clerk|`@clerk/tanstack-react-start 1.5.9`, `@clerk/shared 4.30.2`|Auth: sessions, reverification (step-up), webhooks, JWT issuer for Convex|`src/routes/__root.tsx:2`, `src/lib/server/agent-access-auth.ts:1`, `src/lib/server/clerk-security-webhook.ts:1`, `src/lib/server/require-clerk-server-session.ts:1`, `src/lib/server/clerk-consequence-proof.ts:1`, `src/modules/agent-access/agent-access.functions.ts:1`|
|Convex|`convex 1.45.0` + components|Backend authority (all data/mutations)|`convex/convex.config.ts`, `convex/schema.ts`, `src/lib/server/convex-source.ts`|
|Stripe|`stripe ^22.5.0`, `@stripe/stripe-js ^9.13.0`, `@stripe/react-stripe-js ^6.8.1`|Money rail: checkout/top-ups, Connect payouts, webhook evidence|`src/lib/server/stripe-money-provider-config.ts:43-48`, `src/lib/server/stripe-money-webhook.ts:1`, `src/lib/server/stripe-checkout-evidence.ts:1`, `src/lib/server/stripe-connect-evidence.ts:1`, `src/lib/server/stripe-transfer-evidence.ts:1`, `src/components/ae/console/AeCreditTopUpPanel.tsx:75-78`|
|Autumn|no SDK dep|Secondary billing provider behind provider-host allowlist|`.env.example` (AUTUMN_*), `src/modules/security/source-write-admission.ts:575`|
|OpenRouter|`@openrouter/ai-sdk-provider ^3.0.0`, `ai ^7.0.44`|The ONLY model gateway|`src/modules/model-gateway/public.ts`|
|Coinbase CDP / x402|`@coinbase/cdp-sdk 1.55.0`, `@x402/* 2.23.0`, `viem 2.55.2`|Managed x402 payer custody (Server Wallet signing)|`src/modules/capability-supply/internal/cdp-x402-payment-signer.ts:1-3`, `src/lib/deployment/manifest.ts:61`|
|MCP|`@modelcontextprotocol/sdk 1.30.0`|External agent MCP server + supplier MCP invocation client|server: `src/lib/server/mcp-api.ts:6-17`; client: `src/modules/capability-execution/route-transport-mcp.ts:1-12`, `src/modules/capability-supply/internal/readiness-probe-mcp.ts:1-11`; proto: `src/lib/mcp-protocol.ts:1-3`|
|Sentry|`@sentry/node`/`@sentry/react ^10.63.0`, `@sentry/vite-plugin ^5.3.0`|Errors (client+server) + build release/sourcemaps|`src/lib/observability/sentry.client.ts:1`, `sentry.server.ts:1`, `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx:1`, `vite.config.ts:5-9,28-43,50`|
|PostHog|`posthog-node ^5.39.0`, `posthog-js ^1.398.2`|Funnel analytics (client+server)|`src/lib/observability/posthog.client.ts:2`, `posthog.server.ts:1`, shared `funnel-event-props`|
|Infisical|via `@vercel/oidc 3.2.0` (no SDK dep)|Production secret plane, OIDC-identity-backed|`src/modules/secrets/public.ts:24-32`, `runtime.ts:1`, `vercel-oidc.ts:3`|
|Svix|NOT a dependency|Only Clerk webhook `svix-id` delivery header|`src/lib/server/clerk-security-webhook.ts:56`|
|Vercel/Nitro|nitro-nightly 3.0.1-20260628|Deploy preset `vercel`, nodejs22.x|`vite.config.ts:37-50`|

## Service Details

### Clerk
- Provider wraps app root: `ClerkProvider` in `src/routes/__root.tsx:2`; Convex binds via `ConvexProviderWithClerk` (`convex/react-clerk`) + `ConvexReactClient`.
- Server sessions: `auth, clerkClient` from `@clerk/tanstack-react-start/server` (`src/lib/server/agent-access-auth.ts:1`, `src/modules/agent-access/agent-access.functions.ts:1`); route guards in `src/lib/server/require-clerk-server-session.ts`.
- Step-up auth: `useReverification` + `isReverificationCancelledError` on owner surfaces (e.g. `src/components/ae/supply/AeSupplyEarningsCard.tsx:2-3`); server `reverificationError` from `@clerk/shared/authorization-errors` (`src/lib/server/clerk-consequence-proof.ts:2`).
- Security webhooks: `verifyWebhook` from `@clerk/tanstack-react-start/webhooks`; delivery ref from `svix-id`; issuer from `CLERK_JWT_ISSUER_DOMAIN` (`src/lib/server/clerk-security-webhook.ts:1,56-57`).
- Convex JWT issuer: `clerkUserProviderIdentifier(CLERK_JWT_ISSUER_DOMAIN, userId)` (`src/modules/agent-access/agent-access.functions.ts:398-401`).
- Local e2e bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` (fails closed in production; `src/lib/server/convex-source.ts:2`).
- Env: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `CLERK_JWT_ISSUER_DOMAIN`. Required family at `src/lib/deployment/manifest.ts:57`.

### Stripe
- Server config resolution reads `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`; incomplete config returns a typed refusal (`src/lib/server/stripe-money-provider-config.ts`).
- Webhook: `src/lib/server/stripe-money-webhook.ts`; destination URL `${AE_CANONICAL_BASE_URL}/api/stripe/webhook` (per `.env.example`).
- Evidence/digest modules: `stripe-checkout-evidence.ts`, `stripe-connect-evidence.ts`, `stripe-transfer-evidence.ts` — each computes `canonicalDigest` over Stripe objects for Convex-side verification.
- Account funding redirects to Stripe-hosted Checkout. AE ships no embedded Stripe payment form or browser Stripe SDK.
- Production validation: live keys only (`sk_live_`/`pk_live_`/`whsec_` patterns) — `src/lib/deployment/manifest.ts:363-375`.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`; Autumn family: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `AUTUMN_ENVIRONMENT`, `AUTUMN_PROJECT_ID`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AUTUMN_PORTAL_RETURN_BASE_URL`.

### OpenRouter — single model-gateway seam
`src/modules/model-gateway/` contains exactly one file, `public.ts`, and is the project's only seam onto a language-model provider:
- "Every AE model call goes through the Vercel AI SDK (`ai`) with this provider. Modules must not open their own HTTP transport to a model provider" (public.ts:8-11).
- `openRouterGatewayConfig(environment?)` resolves `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, `SITE_URL`. Convex callers pass Convex's typed `env`; Node hosts fall back to `process.env` (public.ts:39-58). Convex declares these in `convex/convex.config.ts:9-10`.
- `DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash'` (public.ts:24).
- `openRouterModel(config, modelId, options)` builds a `LanguageModelV4` with AE standing options: `usage: { include: true }` always; structured outputs, JSON/JSON-schema response modes, reasoning effort/suppression/surfacing, web plugin `max_results`; wraps with `addToolInputExamplesMiddleware()` (public.ts:107-176).
- `openRouterCostUsd(metadata)` extracts settled request cost; absence means "cost unavailable", never zero (public.ts:180-189).
- Provider instances cached per credential set; caller-supplied `fetch` is a test seam, never cached (public.ts:70-92).

### Coinbase CDP / x402
- Signer: `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` imports `CdpClient` from `@coinbase/cdp-sdk` and `x402Client` from `@x402/core/client` — the managed payer custody seam for x402-paid operations.
- Custody policy: CDP account + project policy IDs with canonical `AE_X402_CDP_POLICY_RULES_DIGEST` preflight; `.env.example` documents exact 10,000 per-call / 50,000 daily caps. Raw private keys are development-only and rejected by the production gate.
- RPC: `AE_X402_RPC_URLS_JSON` maps admitted EVM networks to HTTPS JSON-RPC endpoints, e.g. `{"eip155:8453":[...]}`.
- Env: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AE_X402_CDP_ACCOUNT_NAME`, `AE_X402_CDP_EXPECTED_EVM_ADDRESS`, `AE_X402_CDP_ACCOUNT_POLICY_ID`, `AE_X402_CDP_PROJECT_POLICY_ID`, `AE_X402_CDP_POLICY_RULES_DIGEST`, `AE_X402_CDP_CREDENTIAL_GENERATION`, `AE_X402_CUSTODY_ENABLED`, `AE_X402_CUSTODY_MAX_ATOMIC`, `AE_X402_CUSTODY_DAILY_MAX_ATOMIC`, `AE_X402_RPC_URLS_JSON`. The `x402-payment` scope requires ALL (`src/lib/deployment/manifest.ts:61`).

### MCP (Model Context Protocol)
- Server surface: `McpServer`/`Server` + `WebStandardStreamableHTTPServerTransport` with bearer/OAuth challenges (`src/lib/server/mcp-api.ts:6-17`) — external agents reach AE's catalog over Streamable HTTP.
- Client side: supplier operation invocation over MCP Streamable HTTP (`src/modules/capability-execution/route-transport-mcp.ts`, `route-transport-invoke.ts`) and readiness probing (`src/modules/capability-supply/internal/readiness-probe-mcp.ts`) with JSON-Schema validation via `@/modules/capability-contract/public`.
- Protocol version pinned to SDK `LATEST_PROTOCOL_VERSION` (`src/lib/mcp-protocol.ts`).

### Sentry
- Client init `@sentry/react` (`src/lib/observability/sentry.client.ts`), server init `@sentry/node` (`src/lib/observability/sentry.server.ts`), error boundary `ErrorBoundary` from `@sentry/react` (`src/components/ae/feedback/AeObservabilityErrorBoundary.tsx:1`).
- Build: `sentryVitePlugin` enabled only when `SENTRY_AUTH_TOKEN`+`SENTRY_ORG`+`SENTRY_PROJECT` set; release name falls back `SENTRY_RELEASE → VERCEL_GIT_COMMIT_SHA → GITHUB_SHA`; sourcemaps enabled when the plugin runs (`vite.config.ts:5-9,28-43,50`).
- Env: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.

### PostHog
- Client (`posthog-js`) and server (`posthog-node`) wrappers share a config reader and funnel-event property builder (`src/lib/observability/posthog.client.ts`, `posthog.server.ts`, `funnel-event-props`).
- Env: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` (default `https://us.i.posthog.com`), `POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_APP_URL`, `POSTHOG_APP_URL`.

### Secrets plane (Infisical via Vercel OIDC)
- `src/modules/secrets/` exports `InfisicalCloudSecretStore`, `createInfisicalCloudSecretRuntime`, `createProductionSecretRuntime` (`src/modules/secrets/public.ts:24-32`). Identity from a Vercel OIDC token provider (`src/modules/secrets/vercel-oidc.ts`, using `@vercel/oidc`) with minimum-remaining-TTL handling. No Infisical SDK in package.json — the store is implemented in-repo. No Infisical env vars in `.env.example` (values flow through the runtime, not env).

### Svix
- Not a dependency; only the `svix-id` delivery header of Clerk's Standard Webhooks is read (`src/lib/server/clerk-security-webhook.ts:56`).

## Cross-Cutting Env Layers (names only, from `.env.example`)
- Source-write trust envelope (server-only, per-family HKDF keys): `AE_SOURCE_WRITE_SECRET`, `AE_SOURCE_WRITE_KEY_*` / `AE_SOURCE_WRITE_PREVIOUS_KEYS_*` and derived-key IDs for families BILLING, PROTECTED, CATALOG, OPERATOR, REPAIR, SESSION.
- Server authorities: `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`.
- Chat/model: `OPENROUTER_API_KEY`, `AE_LLM_MODEL` (default `deepseek/deepseek-v4-flash`), `AE_CHAT_PROXY_SECRET`, `AE_CHAT_SHARE_SECRET`, `AE_CHAT_SHARE_KEY_ID`.
- URLs/routing: `VITE_CONVEX_URL`, `SITE_URL`, `AE_SITE_URL`, `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_CSP_REPORT_ONLY`, `AE_ROUTING_PUBLIC_BASE_URL`.
- External agent/CLI: `AE_CLI_BASE_URL`, `AE_API_KEY`.
- WBA (Web Bot Auth): `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_DEV_WBA_*` (dev-only smoke), plus integrity/inquiry secrets (`AE_INQUIRY_ACCESS_SECRET`, `AE_INQUIRY_ACCESS_KEY_ID`, `AE_GOVERNED_SEND_INTEGRITY_*`, `AE_INQUIRY_RECEIPT_KEK*`, `AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY`, `AE_CUSTOMER_REQUEST_JOURNEY_PREVIOUS_PUBLIC_KEYS`).
- Observability brakes: `AE_DISABLE_OBSERVABILITY`, `VITE_AE_DISABLE_OBSERVABILITY`, `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`.
- Release/gateway smoke: `AE_RELEASE_*`, `AE_GATEWAY_SMOKE_*` (opt-in live-spend smoke, `AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND=false`).
- E2E: `AE_E2E_OWNER_EMAIL`, `AE_AUTHENTICATED_E2E_BASE_URL`, `AE_REQUIRE_AUTHENTICATED_E2E`.
- Convex-resident env (declared in `convex/convex.config.ts:8-35`): the OpenRouter, chat-share, Clerk-issuer, route-call-signing, and x402/CDP custody families above — Convex functions read them from the typed `env` object rather than `process.env`.
