# External Integrations

**Analysis Date:** 2026-08-19

Closed env catalog and readiness contract: `src/lib/deployment/manifest.ts`. Secrets live in Vercel / Convex / GitHub Environments — never in git. `.env` and `.env.*` are gitignored; `.env.example` exists (do not read or quote). `.clerk/` and `.vercel/` directories may contain local credentials and are gitignored.

## APIs & External Services

**Language models (OpenRouter):**
- OpenRouter is the only LLM provider. Seam: `src/modules/model-gateway/public.ts` (`createOpenRouter` from `@openrouter/ai-sdk-provider`, wrapped with Vercel AI SDK `ai`). Default model `deepseek/deepseek-v4-flash` (`DEFAULT_OPENROUTER_MODEL`); override with `AE_LLM_MODEL`. Optional allowlist `AE_LLM_MODELS`. Optional base URL `AE_OPENROUTER_API_BASE_URL`. Site attribution `SITE_URL`.
- SDK/Client: `@openrouter/ai-sdk-provider` ^3.0.0, `ai` ^7.0.44, `@ai-sdk/provider-utils` ^5.0.16.
- Auth: `OPENROUTER_API_KEY` (required in production). Convex may also hold `OPENROUTER_API_KEY` / `AE_CUSTOMER_REQUEST_MODEL` (`convex/convex.config.ts`).
- Used by answer tool-use (`src/modules/answer/internal/answer-tool-use-agent.ts`), query safety (`src/modules/answer/internal/answer-query-safety.ts`), storefront enrichment (`src/modules/storefront/internal/business-enrichment.ts`). Model catalog fetch: `https://openrouter.ai/api/v1/models` in `src/modules/answer/internal/openrouter-models.ts` (in-process 2-minute cache).
- Streaming: `createUIMessageStream` on `src/routes/api.answer.turn.ts`.

**Payments — Stripe:**
- Credit top-up Checkout, Connect account onboarding/payouts, webhook ingest. Implementation: `src/lib/server/stripe-money-provider.ts` (`stripe` ^22.5.0, API version `Stripe.API_VERSION`, `maxNetworkRetries: 0`). Domain types in `src/modules/money/public.ts`. Ledger in `src/modules/money/internal/convex-schema.ts` (`moneyStripeEvents`, `moneyTopupCommands`, `moneyPayouts`, …).
- SDK/Client: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`.
- Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`.
- Live first-dollar spend is fail-closed: `LIVE_MONEY_GATE_POLICY` in `src/modules/money/internal/live-money-gate.ts` (`stripe.mode: 'test'`, `readiness: 'unavailable'`, all six AU counsel decisions `open`). Opening live money requires source-owned counsel signoffs, not an env flag.
- Webhook: `POST /api/stripe/webhook` (`src/routes/api.stripe.webhook.ts` → `src/modules/money/server.ts`). Raw body bound to 256 KiB.

**Payments — x402 (EVM):**
- Paid provider transport: `@x402/core` / `@x402/evm` Exact scheme + `@x402/extensions` payment-identifier. Signer/settlement: `src/modules/capability-supply/internal/x402-payment-signer.ts` (`viem` `privateKeyToAccount`). Attempts persisted in `moneyX402PaymentAttempts`.
- Auth: `AE_X402_PAYMENT_CREDENTIAL_REF` (must be `env:AE_X402_PAYMENT_PRIVATE_KEY`), `AE_X402_PAYMENT_PRIVATE_KEY`, `AE_X402_RPC_URLS_JSON` (JSON object of `eip155:<chainId>` → RPC URL).
- Curated x402 listing includes Tavily (`src/modules/dev/internal/curated-cluster-c-publications.ts`, resource `https://x402.tavily.com/search`).

**Agent protocol (MCP):**
- Inbound host: `POST`/`DELETE /mcp` (`src/routes/mcp.ts` → `src/lib/server/mcp-api.ts`, `@modelcontextprotocol/sdk` 1.30.0, Streamable HTTP). Anonymous = read-only registry/search/execute-keyless; authenticated Clerk API-key principals may invoke `operation.invoke` / supply actions. Body cap 320 KiB. Rate limit name `public-read`.
- Outbound: MCP JSON-RPC client in `src/modules/capability-supply/route-transport-runtime.ts` (`Client`, `StreamableHTTPClientTransport`) when a publication's transport is MCP.
- Convex HTTP `/mcp` is retired (`convex/http.ts` returns routing-v1 retired responses). Do not add new Convex HTTP MCP.

**HTTP JSON / OpenAPI providers:**
- Runtime: `src/modules/capability-supply/route-transport-runtime.ts` (`openapi-fetch` serializers, bounded fetch, optional HMAC route-call signing via `AE_ROUTE_CALL_SIGNING_SECRET` / `AE_ROUTE_CALL_SIGNING_KEY_ID` in `src/modules/capability-supply/internal/route-call-signing.ts`).
- Keyless public fixture: Frankfurter ECB rates `https://api.frankfurter.dev/v2` (`src/modules/dev/internal/curated-provider-publications.ts`, publication `offering:frankfurter-ecb-rates:single-rate:v1`). Production hosted proof probes this fixture (`convex/curatedProviders.ts`, `.github/workflows/kernel-release-gate.yml`).
- Keyed curated providers (credential refs in `convex/curatedProviders.ts`): Exa (`env:EXA_API_KEY`), OpenWeatherMap (`env:OPENWEATHER_API_KEY`), Tavily (`env:TAVILY_API_KEY`), SerpAPI (`env:SERPAPI_API_KEY`), CoinGecko (`env:COINGECKO_DEMO_API_KEY`). These names are provider-connection refs, not the closed `AE_*` catalog — they are injected as publication credentials, not app env validation.
- Production hosted job verifies Exa `exa.search` / `exa.contents` appear in operation search without requiring those provider credentials on the GitHub runner.

**Notifications:**
- Resend email: `src/lib/server/notification-provider.ts` (direct `fetch` to Resend API; optional `RESEND_API_BASE_URL`). Dispatch route `src/routes/api.notification.resend-dispatch.ts`; webhook `src/routes/api.notification.resend-webhook.ts`. Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, plus `AE_NOTIFICATION_OUTBOX_SECRET` when the family is enabled. Conditional in the deployment manifest (`trigger` any of the Resend names).
- Novu workflows: same `notification-provider.ts` (`NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`). Dispatch `src/routes/api.notification.novu-dispatch.ts`. Owner email lookup uses Clerk (`CLERK_SECRET_KEY`).
- Outbox persistence: `convex/notificationOutbox.ts` and related files; inquiry notification rows in `src/modules/inquiries/internal/convex-schema.ts`.

**Maps:**
- Google Maps JavaScript API in `src/components/ae/artifacts/AeGenerativeMap.tsx`. Auth: `VITE_GOOGLE_MAPS_API_KEY` (optional). CSP allowlists `maps.googleapis.com` / `maps.gstatic.com` in `src/lib/http/security-headers.ts`.

**Eval / quality (dev and CI, not production request path):**
- Promptfoo (`eval/answer/promptfooconfig.yaml`, `npm run test:eval`).
- Braintrust (`eval/braintrust/answer.eval.ts`; optional `AE_BRAINTRUST_PROJECT`, `AE_BRAINTRUST_DATASET`, Braintrust API key via the Braintrust SDK — not in the production required group).
- React Doctor GitHub Action (advisory).

**Named but unused as an SDK:**
- `AUTUMN_API_BASE_URL`, `AUTUMN_PORTAL_RETURN_BASE_URL`, `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET` appear in `src/lib/deployment/manifest.ts` field rules / `src/modules/security/source-write-admission.ts` denylist. No Autumn package in `package.json` and no Autumn client in `src/`. Treat as catalog leftovers, not an active integration.

**Sandbox provider (conditional):**
- `AE_SANDBOX_PROVIDER_KEY` plus origins `AE_SANDBOX_PROVIDER_ORIGIN`, `AE_SANDBOX_ROUTE_RESOLVER_ORIGIN`, `AE_SANDBOX_ROUTE_QUOTER_ORIGIN`, `AE_SANDBOX_WORKFLOW_ORIGIN`. Required only when any sandbox env is present.

## Data Storage

**Databases:**
- Convex (cloud) is the sole application database. Schema composed in `convex/schema.ts` from module table maps (60 `defineTable` entries). Connection: `CONVEX_URL` / `VITE_CONVEX_URL`. Clients: generated `convex/_generated/*`, `ConvexHttpClient` in `src/lib/server/convex-source.ts`, `convex-test` in unit/integration tests. Auth to Convex: Clerk JWT (`applicationID: 'convex'`) or hashed server-function assertion (`AE_CONVEX_SERVER_FUNCTION_TOKEN`, min 32 chars).
- Convex components (not extra databases): workflow, workpool, rate-limiter, aggregate `ownerActivationByStage` (`convex/convex.config.ts`).
- Unlisted / empty table maps (module code remains, no Convex tables): demand, discovery, settings, project-spine, work-tree, study, routing-kernel, agent-access OAuth (`src/modules/*/internal/*schema.ts` exporting `{}`).

**File Storage:**
- Local filesystem only for build artifacts, eval output (`output/`, gitignored), Playwright reports, and CLI session state `/.ae-cli/` (gitignored). No S3/GCS/Blob store in `package.json`. React Email renders HTML in-process (`src/modules/work-tree/internal/memo.tsx`).

**Caching:**
- No Redis or external cache service.
- In-process caches: OpenRouter model list (`src/modules/answer/internal/openrouter-models.ts`), OpenRouter provider instance (`src/modules/model-gateway/public.ts`).
- Vite `optimizeDeps` prebundles Clerk/TanStack/graphology for the browser.
- Convex query cache is the hosted platform's.

## Authentication & Identity

**Auth Provider:**
- Clerk (`@clerk/tanstack-react-start` 1.4.9).
- Human UI: `ClerkProvider` in `src/routes/__root.tsx` (skipped on public paths and when `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`). Sign-in/up catch-all routes. Owner settings embed `UserProfile` (`src/components/ae/settings/OwnerSettingsSections.tsx`).
- Server sessions: `auth()` from `@clerk/tanstack-react-start/server`; helpers `src/lib/server/require-clerk-server-session.ts`, `src/lib/server/require-operator-session.ts`, `src/lib/server/claim-owner-session.ts`. Middleware: `clerkMiddleware()` in `src/start.ts`.
- Convex identity: `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN`.
- Agent access: Clerk API keys (`auth({ acceptsToken: 'api_key' })` in `src/lib/server/agent-access-auth.ts`). Subject must be `user_*`. AE owns principal/grant/policy tables (`src/modules/agent-access/`). Scope for paid invoke: `MARKET_OPERATIONS_INVOKE_SCOPE` (`src/modules/agent-access/contract.ts`).
- OAuth for agents: `src/routes/oauth.authorize.ts`, `src/routes/oauth.token.ts`, `src/routes/oauth.register.ts`, discovery `src/routes/[.]well-known/oauth-authorization-server.ts` and `src/routes/[.]well-known/oauth-protected-resource.ts`. Store: `src/lib/server/agent-access-oauth-store.ts`. Rate limit `oauth-issuance`. Cron cleanup `internal.agentAccessOAuth.cleanupExpiredOAuthGrants`.
- Web Bot Auth / HTTP Message Signatures: directory `src/routes/[.]well-known/http-message-signatures-directory.ts` (`AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`). Source-write admission uses `http-message-sig` (`src/modules/security/source-write-admission.ts`) with per-family HMAC keys `AE_SOURCE_WRITE_KEY_*`.
- CSRF: `createCsrfMiddleware` in `src/start.ts` (server functions only).
- Local e2e bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` (`src/lib/server/local-e2e-bypass.ts`) — forbidden in production.

## Monitoring & Observability

**Error Tracking:**
- Sentry Node + React (`src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`). Optional. DSN: `SENTRY_DSN` / `VITE_SENTRY_DSN`. Environment: `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` / `VERCEL_ENV`. Release: `SENTRY_RELEASE` or `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`. Build upload: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (conditional; enables Vite sourcemaps). Client errors POST `src/routes/api.observability.client-error.ts`. Telemetry events are sanitized (`src/lib/observability/private-route-safety.ts`). Sentry capture is fail-open and must not change domain responses.

**Product analytics:**
- PostHog (`posthog-js` / `posthog-node`). Keys `VITE_POSTHOG_KEY` / `POSTHOG_KEY`; host `VITE_POSTHOG_HOST` / `POSTHOG_HOST` (default `https://us.i.posthog.com`); app URL `VITE_POSTHOG_APP_URL` / `POSTHOG_APP_URL`. Funnel: `src/routes/api.observability.funnel.ts`, `src/lib/observability/funnel-client.ts`. Boot: `src/lib/observability/boot-client-observability.ts` (skipped on private routes).

**Logs:**
- Request correlation middleware in `src/start.ts` (`src/lib/server/request-correlation.ts`) stamps responses. Gateway telemetry `src/lib/server/gateway-telemetry.ts`. Convex `operationKeys` table (`src/modules/observability/internal/schema.ts`) for idempotent operation admission. No dedicated log vendor (Datadog/Logflare not present).

**Disable switch:** `AE_DISABLE_OBSERVABILITY` or `VITE_AE_DISABLE_OBSERVABILITY` = `true` turns both Sentry and PostHog off (`src/lib/observability/config.ts`).

## CI/CD & Deployment

**Hosting:**
- Vercel Node.js 22 serverless (Nitro `preset: 'vercel'`, `entryFormat: 'node'`). Production canonical host in CI: `agentic-economy-phi.vercel.app`.
- Convex cloud for data + scheduled jobs + workpools. Deploy: `npx convex deploy` with `CONVEX_DEPLOY_KEY`.
- Dual-compatible git-source deploy: `tools/release/deploy-customer-request-git-source.ts` (uses `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

**CI Pipeline:**
- `.github/workflows/kernel-release-gate.yml` — `source-proof` on PR/push (conformance, lint, typecheck, unit/integration, eval report, build) without production credentials; `hosted-proof` on `main` against GitHub Environment `production` (deploy + Convex + Frankfurter/Exa fixture smokes + Playwright customer-request lifecycle); `live-gateway-proof` only on `workflow_dispatch` with explicit live-spend confirmation.
- `.github/workflows/react-doctor.yml` — advisory React Doctor on PRs and `main`.
- Node setup uses `.nvmrc`; npm pinned to 11.5.1; frozen `npm ci`.

**Readiness / release identity:**
- `/api/health`, `/api/ready`, `/api/v1/release`. Manifest fingerprint from `deploymentConfigFingerprint()` in `src/lib/deployment/manifest.ts`.

## Environment Configuration

**Required env vars (production):**
- `AE_CANONICAL_BASE_URL` or `AE_CANONICAL_HOST_ALLOWLIST`
- `CONVEX_URL` or `VITE_CONVEX_URL`
- `AE_CONVEX_SERVER_FUNCTION_TOKEN`
- `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
- `OPENROUTER_API_KEY`
- `AE_SOURCE_WRITE_KEY_INQUIRY`, `AE_SOURCE_WRITE_KEY_BILLING`, `AE_SOURCE_WRITE_KEY_PROTECTED`, `AE_SOURCE_WRITE_KEY_CLAIM`, `AE_SOURCE_WRITE_KEY_OPERATOR`, `AE_SOURCE_WRITE_KEY_REPAIR`, `AE_SOURCE_WRITE_KEY_SESSION`
- `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`, `AE_X402_RPC_URLS_JSON`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`

**Conditional (required if any trigger name is set):**
- Resend: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `AE_NOTIFICATION_OUTBOX_SECRET`
- Novu: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `AE_NOTIFICATION_OUTBOX_SECRET` (customer workflow optional in trigger)
- Sandbox: `AE_SANDBOX_PROVIDER_KEY` (+ origins)
- Route signing: `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`
- Share/access/receipt/journey keyrings: `AE_ANSWER_THREAD_SHARE_SECRET`, `AE_INQUIRY_ACCESS_SECRET`, `AE_GOVERNED_SEND_INTEGRITY_SECRET`, `AE_INQUIRY_RECEIPT_KEK`, `AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY` (each with matching key-id companions)
- Sentry build: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- Live gateway smoke: the `liveGatewaySmokeNames` list in `src/lib/deployment/manifest.ts`

**Optional (names only):** `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, `AE_SITE_URL`, `SITE_URL`, `AE_CLI_BASE_URL`, `VITE_AE_ANSWER_MODE`, `AE_CSP_REPORT_ONLY`, `AE_COOKIE_SECURE`, observability keys, `VITE_GOOGLE_MAPS_API_KEY`, WBA allowlist/JWK, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`, Clerk customer-request fixture ids.

**Platform-injected:** `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `CI`, `PLAYWRIGHT_BASE_URL`.

**Secrets location:**
- Local: `.env` / `.env.*` (gitignored; `.env.example` present as a template only).
- Hosted web: Vercel project env.
- Convex functions: Convex dashboard / `npx convex env set` (CI sets `AE_RELEASE_SOURCE_REVISION` on prod; hosted proof also requires Convex-side `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_SITE_URL`).
- CI: GitHub Environment `production` secrets and vars (see `.github/workflows/kernel-release-gate.yml`). Do not log or copy secret values.

**Prescriptive:** add new `AE_*` names to `src/lib/deployment/manifest.ts` `knownNames` / groups / field rules. Never expose signing secrets with a `VITE_` prefix. Never open live money with an env flag.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/stripe/webhook` — Stripe money events (`src/routes/api.stripe.webhook.ts`). Signature: `STRIPE_WEBHOOK_SECRET`.
- `POST /api/notification/resend-webhook` — Resend delivery events (`src/routes/api.notification.resend-webhook.ts`). Signature: `RESEND_WEBHOOK_SECRET`.
- `POST /mcp` — MCP JSON-RPC (not a vendor webhook; agent protocol).
- `POST /oauth/token`, `GET /oauth/authorize`, `POST /oauth.register` — OAuth callbacks for agent clients.
- Convex HTTP retired paths (`/v1/route`, `/v1/authorize`, `/v1/execute`, `/v1/reconcile`, `/v1/inspect`, `/v1/cancel`, `/mcp`, `/.well-known/ae-routing.json`) in `convex/http.ts` — always return retired responses; do not revive.

**Outgoing:**
- OpenRouter chat/completions and `/api/v1/models`.
- Stripe Checkout, Accounts, Transfers, Webhook verification (SDK).
- x402 `PAYMENT-REQUIRED` / `PAYMENT-RESPONSE` headers to provider origins; EVM RPC URLs from `AE_X402_RPC_URLS_JSON`.
- Provider OpenAPI/MCP transports (Frankfurter, Exa, and other published bindings) from `src/modules/capability-supply/route-transport-runtime.ts`.
- Resend send API; Novu trigger + transaction readback (`src/lib/server/notification-provider.ts`).
- Clerk Backend API for owner email lookup and API-key verification.
- Sentry ingest; PostHog ingest (`https://us.i.posthog.com` default).
- Google Maps JS (browser).
- Optional sandbox origins when sandbox env is configured.

**Thin adapters over the paid door (not separate vendor APIs):**
- HTTP `POST /api/v1/operations/call` (`src/routes/api.v1.operations.call.ts` → `src/lib/server/operation-invoke-api.ts`).
- MCP tools `ae_operation_invoke` / `ae_operation_status` / `ae_operation_cancel` / `ae_operation_reconcile`.
- CLI `npm run ae -- invoke|status|recover|advanced cancel` (`tools/ae/cli.ts`).
- Chat answer turn may authenticate the same gateway (`authenticateOperationGateway` in `src/routes/api.answer.turn.ts`).

---

*Integration audit: 2026-08-19*
