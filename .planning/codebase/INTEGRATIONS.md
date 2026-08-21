# External Integrations

**Analysis Date:** 2026-08-21

Closed env catalog and readiness contract: `src/lib/deployment/manifest.ts`. Secrets live in Vercel / Convex / GitHub Environments — never in git. `.env` is not present. `.env.example` exists (do not read or quote). `.env.local` is present and gitignored. `.clerk/` and `.vercel/` directories may contain local credentials and are gitignored.

**Snapshot caveat:** the working tree was under active refactor during analysis (notification-outbox and inquiry families removed). This document reflects the verified 2026-08-21 state.

## APIs & External Services

**Language models (OpenRouter):**
- OpenRouter is the only LLM provider. Seam: `src/modules/model-gateway/public.ts` (`createOpenRouter` from `@openrouter/ai-sdk-provider`, wrapped with Vercel AI SDK `ai`). Default model `deepseek/deepseek-v4-flash` (`DEFAULT_OPENROUTER_MODEL`); override with `AE_LLM_MODEL`. Optional allowlist `AE_LLM_MODELS`. Optional base URL `AE_OPENROUTER_API_BASE_URL`. Site attribution `SITE_URL`.
- SDK/Client: `@openrouter/ai-sdk-provider` ^3.0.0, `ai` ^7.0.44, `@ai-sdk/provider-utils` ^5.0.16.
- Auth: `OPENROUTER_API_KEY` (required in production). Convex may also hold `OPENROUTER_API_KEY` (`convex/convex.config.ts`).
- Used by answer tool rounds (`src/modules/answer/internal/answer-tool-use-agent.ts`, `generateText` per round), query safety classification (`src/modules/answer/internal/answer-query-safety.ts`), storefront enrichment (`src/modules/storefront/internal/business-enrichment.ts`). Model catalog fetch: `https://openrouter.ai/api/v1/models` in `src/modules/answer/internal/openrouter-models.ts` (in-process cache).
- Streaming: `createUIMessageStream` / `createUIMessageStreamResponse` on `src/routes/api.answer.turn.ts`; chat may authenticate the paid gateway with `authenticateOperationGateway` (`src/lib/server/operation-invoke-api.ts`).

**Payments — Stripe:**
- Credit top-up Checkout, Connect account onboarding/payouts, webhook ingest. Implementation: `src/lib/server/stripe-money-provider.ts` (`stripe` ^22.5.0, API version `Stripe.API_VERSION`, `maxNetworkRetries: 0` in `src/lib/server/stripe-money-provider-config.ts`). Domain types in `src/modules/money/public.ts`. Ledger in `src/modules/money/internal/convex-schema.ts` (`moneyStripeEvents`, `moneyTopupCommands`, `moneyPayouts`, `moneyPayoutAllocations`). Convex money adapters: `convex/moneyCreditTopup.ts`, `convex/moneyConnect.ts`, `convex/moneyPayoutTransfer*.ts`, `convex/moneyStripeEvents.ts`, `convex/moneyCharge*.ts`.
- SDK/Client: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`.
- Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`. Mode (`test`/`live`) is derived from key prefixes and must match across secret + publishable keys (`src/lib/server/stripe-money-provider-config.ts`).
- Live money gate: `LIVE_MONEY_GATE_POLICY` in `src/modules/money/internal/live-money-gate.ts` is source-enabled (`enabled: true`, revision `2026-08-20`). There is no env flag for live money; do not add one.
- Webhook: `POST /api/stripe/webhook` (`src/routes/api.stripe.webhook.ts` → `handleStripeWebhookRequest` in `src/modules/money/server.ts`). Raw body bound to 256 KiB (`MAX_WEBHOOK_BODY_BYTES` in `src/lib/server/stripe-money-provider-config.ts`).

**Payments — x402 (EVM, Coinbase CDP custody):**
- Paid provider transport: `@x402/core` / `@x402/evm` Exact scheme (EIP-3009 only; Permit2 rejected) + `@x402/extensions` payment-identifier. Production signer: `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` — `CdpClient` from `@coinbase/cdp-sdk` 1.53.0, `cdp.evm.getOrCreateAccount({ name })`, x402 signing via `fromCdpEvmAccount` (`@coinbase/cdp-sdk/x402`). Network pinned to Base `eip155:8453`, asset pinned to USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; per-request spend capped by `AE_X402_CUSTODY_MAX_ATOMIC` and bound to a request fingerprint (`cdpX402RequestFingerprint`).
- Dev/local raw-key signer: `src/modules/capability-supply/internal/x402-payment-signer.ts` (`viem/accounts` `privateKeyToAccount`). Its env names (`AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`) are **forbidden in production** by `src/lib/deployment/manifest.ts`.
- Custody configuration reader: `cdpX402CustodyConfigurationFromEnvironment` in `src/modules/capability-supply/internal/server-credential.ts` (requires `AE_X402_CUSTODY_ENABLED=true` plus the four CDP names).
- Auth: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AE_X402_CDP_ACCOUNT_NAME`, `AE_X402_CUSTODY_ENABLED`, `AE_X402_CUSTODY_MAX_ATOMIC`, `AE_X402_RPC_URLS_JSON` (JSON object of `eip155:<chainId>` → up to 2 RPC URLs, max 32 networks). All seven are required in production; Convex also declares them in `convex/convex.config.ts`.
- Attempts persisted in `moneyX402PaymentAttempts` via `convex/moneyX402PaymentAttempts.ts`; reservations in `moneyExternalSpendReservations` via `convex/moneyExternalSpend.ts`. Settlement observation uses `viem` `createPublicClient` (`src/modules/capability-supply/internal/x402-evm-receipt-reader.ts`, `x402-settlement-verifier.ts`).
- `@x402/svm` 2.18.0 is installed with no `src/` import yet (future Solana scheme support).

**Agent protocol (MCP):**
- Inbound host: `POST`/`DELETE /mcp` (`src/routes/mcp.ts` → `src/lib/server/mcp-api.ts`, `@modelcontextprotocol/sdk` 1.30.0, Streamable HTTP, server `agentic-economy` `1.0.0`). Anonymous = read-only registry/search/execute-keyless; authenticated Clerk API-key principals may invoke `operation.invoke` / supply actions. Body cap 320 KiB (`MAX_MCP_REQUEST_BODY_BYTES`). Rate limit name `public-read`.
- Outbound: MCP JSON-RPC clients in `src/modules/capability-supply/internal/route-transport-mcp.ts` and `readiness-probe-mcp.ts` (`Client`, `StreamableHTTPClientTransport`) when a publication's transport is MCP.
- Convex HTTP `/mcp` is retired (`convex/http.ts` returns `routingV1RetiredResponse`). Do not add new Convex HTTP MCP.

**Facilitator discovery ingest (x402 catalog sources):**
- `src/modules/capability-supply/internal/facilitator-discovery-client.ts` fetches `https://facilitator.payai.network/discovery/resources` and `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` (page size 20, max 100; max 20 pages, 2 MiB body cap, 10 s per request, 120 s job cap).
- Scheduled by the `refresh facilitator discovery` cron every 10 minutes: `convex/facilitatorDiscoveryAction.ts` (`"use node"`) → `convex/facilitatorDiscovery.ts` admission. This is the catalog fill path; there is no curated provider seed family anymore.

**Provider operation transports (published bindings, not fixed vendor SDKs):**
- Runtime: `src/modules/capability-supply/internal/route-transport-http-json.ts` (OpenAPI parameter serialization via `openapi-fetch`), `route-transport-mcp.ts`, `route-transport-x402.ts`, `route-transport-invoke.ts`, `route-transport-cancel.ts`, `route-transport-observation.ts`, orchestrated by `src/modules/capability-supply/route-transport-runtime.ts`. Readiness probes: `readiness-probe-http-json.ts`, `readiness-probe-mcp.ts`, `readiness-probe-x402.ts`.
- Optional HMAC route-call signing via `AE_ROUTE_CALL_SIGNING_SECRET` / `AE_ROUTE_CALL_SIGNING_KEY_ID` (`src/modules/capability-supply/internal/route-call-signing.ts`, `@noble/hashes` HMAC-SHA256).
- Keyless public fixture used by tests and conformance: Frankfurter FX endpoint (`https://api.frankfurter.app/latest`) appears in `tests/unit/capability-supply/http-credential-readiness.test.ts` and `tests/unit/capability-execution/operation-execute.test.ts` as a fixture binding — not a hardcoded production integration.
- Provider credentials resolve through opaque `env:` credential refs (`credentialFromEnvironment` in `src/modules/capability-supply/internal/server-credential.ts`); there is no fixed list of provider API keys in the closed env catalog.

**Maps:**
- Google Maps JavaScript API in `src/components/ae/artifacts/AeGenerativeMap.tsx`. Auth: `VITE_GOOGLE_MAPS_API_KEY` (optional). CSP allowlists `maps.googleapis.com` / `maps.gstatic.com` in `src/lib/http/security-headers.ts`.

**Eval / quality (dev and CI, not production request path):**
- Promptfoo (`eval/answer/promptfooconfig.yaml`, `npm run test:eval`).
- Braintrust (`eval/braintrust/answer.eval.ts`; optional `AE_BRAINTRUST_PROJECT`, `AE_BRAINTRUST_DATASET`, Braintrust API key via the Braintrust SDK — not in the production required group).
- React Doctor GitHub Action (advisory).

**Named but unused as an SDK:**
- `AUTUMN_API_BASE_URL`, `AUTUMN_PORTAL_RETURN_BASE_URL` appear in `src/lib/deployment/manifest.ts` field rules. `AUTUMN_SECRET_KEY` and `AUTUMN_WEBHOOK_SECRET` appear in the `src/modules/security/source-write-admission.ts` provider-secret denylist. No Autumn package in `package.json` and no Autumn client in `src/`. Treat as catalog leftovers, not an active integration.

**Removed families (do not re-add without re-mapping):**
- Resend / Novu notification providers, `RESEND_*` / `NOVU_*` / `AE_NOTIFICATION_OUTBOX_SECRET` env names, and the notification dispatch/webhook routes were deleted with the notification-outbox family (module code removed; empty marker `notificationOutboxTables` remains in `src/modules/notification-outbox/internal/schema.ts`).
- The `inquiry` source-write family was removed; `SOURCE_WRITE_FAMILIES` in `src/lib/deployment/manifest.ts` is now six families (billing, protected, claim, operator, repair, session), while `SourceWriteAdmissionScopeValues` in `src/modules/security/source-write-admission.ts` still lists legacy scope names (including `notification_repair`, `study`) that map onto the surviving families.
- The `AE_CUSTOMER_REQUEST_*` CI fixture names survive only in `tools/release/vercel-protection-bypass.ts` (alias for `VERCEL_AUTOMATION_BYPASS_SECRET`) and tests; they are not in the closed catalog and must not be reintroduced as app env.

## Data Storage

**Databases:**
- Convex (cloud) is the sole application database. Schema composed in `convex/schema.ts` from module table maps (51 `defineTable` entries). Connection: `CONVEX_URL` / `VITE_CONVEX_URL`. Clients: generated `convex/_generated/*`, `ConvexHttpClient` in `src/lib/server/convex-source.ts`, `convex-test` in tests. Auth to Convex: Clerk JWT (`applicationID: 'convex'` in `convex/auth.config.ts`) or hashed server-function assertion (`AE_CONVEX_SERVER_FUNCTION_TOKEN`, also used by `src/lib/server/browser-guest-assertion.ts`).
- Convex components (not extra databases): workpool, rate-limiter, aggregate `ownerActivationByStage` (`convex/convex.config.ts`). The deployment manifest still lists `workflow` in the component set; no `@convex-dev/workflow` dependency exists.
- Unlisted / empty table maps (module code remains or marker only, no Convex tables): discovery, settings, routing-kernel, notification-outbox, agent-access OAuth (`src/modules/*/internal/*schema.ts` exporting `{}`).

**File Storage:**
- Local filesystem only for build artifacts, eval output (`output/`, gitignored), Playwright reports, and CLI session state `/.ae-cli/` (gitignored). No S3/GCS/Blob store in `package.json`.

**Caching:**
- No Redis or external cache service.
- In-process caches: OpenRouter model list (`src/modules/answer/internal/openrouter-models.ts`), OpenRouter provider instance (`src/modules/model-gateway/public.ts`).
- Vite `optimizeDeps` prebundles Clerk/TanStack for the browser.
- Convex query cache is the hosted platform's.

## Authentication & Identity

**Auth Provider:**
- Clerk (`@clerk/tanstack-react-start` 1.4.9).
- Human UI: `ClerkProvider` in `src/routes/__root.tsx` (skipped when `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`). Sign-in/up catch-all routes `src/routes/sign-in.$.tsx` / `src/routes/sign-up.$.tsx`.
- Server sessions: `auth()` from `@clerk/tanstack-react-start/server`; helpers `src/lib/server/require-clerk-server-session.ts`, `src/lib/server/require-operator-session.ts`, `src/lib/server/claim-owner-session.ts`. Middleware: `clerkMiddleware()` in `src/start.ts`.
- Convex identity: `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN`.
- Agent access: Clerk API keys (`auth({ acceptsToken: 'api_key' })` in `src/lib/server/agent-access-auth.ts`). AE owns principal/grant/policy tables (`src/modules/agent-access/`). Scope for paid invoke: `MARKET_OPERATIONS_INVOKE_SCOPE` = `market_operations:invoke` (`src/modules/agent-access/contract.ts`). Authority modes: `inspect_only`, `approve_each`, `bounded_mandate`, `full_yolo` (`src/modules/agent-access/internal/convex-schema.ts`). Per-credential rate policy enforced via `assertAgentAccessRateAdmission` (`convex/lib/rateLimit.ts`).
- OAuth for agents (`AGENT_ACCESS_OAUTH_GRANT_TYPES` in `src/modules/agent-access/oauth-state.ts`): `src/routes/oauth.authorize.ts`, `src/routes/oauth.token.ts`, `src/routes/oauth.register.ts`, `src/routes/oauth.device_authorization.ts`, device verification UI `src/routes/_operator/agent-access.authorize.tsx`, discovery `src/routes/[.]well-known/oauth-authorization-server.ts` and `src/routes/[.]well-known/oauth-protected-resource.ts`. Grant types: `authorization_code` and `urn:ietf:params:oauth:grant-type:device_code`. Store: `src/lib/server/agent-access-oauth-store.ts`. API: `src/lib/server/agent-access-oauth-api.ts`. Rate limit `oauth-issuance`. Cleanup mutation `internal.agentAccessOAuth.cleanupExpiredOAuthGrants` in `convex/agentAccessOAuth.ts` is not cron-scheduled.
- Web Bot Auth / HTTP Message Signatures: public directory `src/routes/[.]well-known/http-message-signatures-directory.ts` (serves `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`; 404 `wba_directory_unconfigured` when unset). Source-write admission uses `http-message-sig` (`src/modules/security/source-write-admission.ts`) with per-family HMAC keys `AE_SOURCE_WRITE_KEY_*` (six families) and rotation names `AE_SOURCE_WRITE_PREVIOUS_KEYS_*` / `AE_SOURCE_WRITE_DERIVED_KEY_ID_*`.
- CSRF: `createCsrfMiddleware` in `src/start.ts` (server functions only).
- Local e2e bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` (`src/lib/server/local-e2e-bypass.ts`) — forbidden in production.

## Monitoring & Observability

**Error Tracking:**
- Sentry Node + React (`src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`). Optional. DSN: `SENTRY_DSN` / `VITE_SENTRY_DSN`. Environment: `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` / `VERCEL_ENV`. Release: `SENTRY_RELEASE` or `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`. Build upload: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (conditional; enables Vite sourcemaps). Client errors POST `src/routes/api.observability.client-error.ts`. Telemetry events are sanitized (`src/lib/observability/private-route-safety.ts`). Sentry capture is fail-open and must not change domain responses. Production `tracesSampleRate` is 0.1.

**Product analytics:**
- PostHog (`posthog-js` / `posthog-node`). Keys `VITE_POSTHOG_KEY` / `POSTHOG_KEY`; host `VITE_POSTHOG_HOST` / `POSTHOG_HOST` (default `https://us.i.posthog.com` in `src/lib/observability/config.ts`); app URL `VITE_POSTHOG_APP_URL` / `POSTHOG_APP_URL`. Funnel: `src/routes/api.observability.funnel.ts`. Boot: `src/lib/observability/boot-client-observability.ts`.

**Logs:**
- Request correlation middleware in `src/start.ts` (`src/lib/server/request-correlation.ts`) stamps responses. Gateway telemetry `src/lib/server/gateway-telemetry.ts`. Convex `operationKeys` table (`src/modules/observability/internal/schema.ts`) for idempotent operation admission; `auditEvents` table for admin/audit trails. No dedicated log vendor.

**Disable switch:** `AE_DISABLE_OBSERVABILITY` or `VITE_AE_DISABLE_OBSERVABILITY` = `true` turns both Sentry and PostHog off (`src/lib/observability/config.ts`).

## CI/CD & Deployment

**Hosting:**
- Vercel Node.js 22 serverless (Nitro `preset: 'vercel'`, `entryFormat: 'node'`). Production canonical host in CI: `agentic-economy-phi.vercel.app`.
- Convex cloud for data + scheduled jobs + workpools; functions deploy via the Convex CLI/dashboard (`CONVEX_DEPLOY_KEY`), not from CI. Node 22 is required for `"use node"` actions (`convex/capabilityOperationInvocationWorker.ts`, `convex/capabilitySupplyReadiness.ts`, `convex/capabilitySupplyOwnerSupply.ts`, `convex/facilitatorDiscoveryAction.ts`).
- Vercel protection bypass helper `tools/release/vercel-protection-bypass.ts` (`VERCEL_AUTOMATION_BYPASS_SECRET`, legacy alias `AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET`).

**CI Pipeline:**
- `.github/workflows/kernel-release-gate.yml` — `source-proof` on push/PR/merge_group (deployment-manifest validation for development, conformance, lint, typecheck, unit/integration, eval report, build) without production credentials; `live-gateway-proof` only on `workflow_dispatch` against GitHub Environment `production` with explicit spend confirmation (prepare creates a run-scoped Checkout; complete observes the same run and emits a validated receipt; USD 6.00 cap). There is no automatic deploy job.
- `.github/workflows/react-doctor.yml` — advisory React Doctor (`millionco/react-doctor@v2`) on PRs and `main`.
- Node setup uses `.nvmrc`; npm pinned to 11.5.1; frozen `npm ci`. The live-gateway job uses `npm ci --ignore-scripts`.

**Readiness / release identity:**
- `/api/health`, `/api/ready`, `/api/v1/release`. Manifest fingerprint from `deploymentConfigFingerprint()` in `src/lib/deployment/manifest.ts`. `AE_RELEASE_SOURCE_REVISION` binds the deployed revision (CI sets it to the git SHA for the live smoke; Convex-side binding via `npx convex env set`).

## Environment Configuration

**Required env vars (production, all groups):**
- `AE_CANONICAL_BASE_URL` or `AE_CANONICAL_HOST_ALLOWLIST`
- `CONVEX_URL` or `VITE_CONVEX_URL`
- `AE_CONVEX_SERVER_FUNCTION_TOKEN`
- `VITE_CLERK_PUBLISHABLE_KEY` (`pk_live_`), `CLERK_SECRET_KEY` (`sk_live_`), `CLERK_JWT_ISSUER_DOMAIN`
- `OPENROUTER_API_KEY`
- `AE_SOURCE_WRITE_KEY_BILLING`, `AE_SOURCE_WRITE_KEY_PROTECTED`, `AE_SOURCE_WRITE_KEY_CLAIM`, `AE_SOURCE_WRITE_KEY_OPERATOR`, `AE_SOURCE_WRITE_KEY_REPAIR`, `AE_SOURCE_WRITE_KEY_SESSION` (six families; `inquiry` removed)
- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AE_X402_CDP_ACCOUNT_NAME`, `AE_X402_CUSTODY_ENABLED` (= `true`), `AE_X402_CUSTODY_MAX_ATOMIC`, `AE_X402_RPC_URLS_JSON`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`

**Conditional (required if any trigger name is set):**
- Route signing: `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`
- Answer-share keyring: `AE_ANSWER_THREAD_SHARE_SECRET`, `AE_ANSWER_THREAD_SHARE_KEY_ID` (used by `src/routes/api.answer.threads.$threadId.share.ts` and `src/modules/answer-thread/internal/share-token.ts`)
- Sentry build: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- Live gateway smoke: the `liveGatewaySmokeNames` list in `src/lib/deployment/manifest.ts` (`AE_GATEWAY_SMOKE_*`, `AE_RELEASE_*`, `CLERK_SECRET_KEY`)

**Optional (names only):** `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, `AE_SITE_URL`, `SITE_URL`, `AE_CLI_BASE_URL`, `VITE_AE_ANSWER_MODE`, `AE_CSP_REPORT_ONLY`, `AE_COOKIE_SECURE`, `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`, `AE_ROUTING_PUBLIC_BASE_URL`, observability keys, `VITE_GOOGLE_MAPS_API_KEY`, `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `VITE_AE_OPERATOR_ADVANCED_NAV`, `AE_KERNEL_PROOF_MANIFEST_JSON` / `_PATH`, `AE_BRAINTRUST_PROJECT` / `AE_BRAINTRUST_DATASET`.

**Platform-injected:** `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `CI`, `PLAYWRIGHT_BASE_URL`.

**Secrets location:**
- Local: `.env.example` present as a template only; `.env.local` present and gitignored. `.env` is not present.
- Hosted web: Vercel project env.
- Convex functions: Convex dashboard / `npx convex env set` (names declared in `convex/convex.config.ts`; CI live smoke requires Convex-side `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_SITE_URL`).
- CI: GitHub Environment `production` secrets and vars (see `.github/workflows/kernel-release-gate.yml`). Do not log or copy secret values.

**Prescriptive:** add new `AE_*` names to `src/lib/deployment/manifest.ts` (`fieldRules` / `knownNames` / groups). Never expose signing secrets with a `VITE_` prefix. Never gate live money with an env flag — the gate is `LIVE_MONEY_GATE_POLICY` in source.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/stripe/webhook` — Stripe money events (`src/routes/api.stripe.webhook.ts`). Signature: `STRIPE_WEBHOOK_SECRET`; body cap 256 KiB.
- `POST /mcp` — MCP JSON-RPC (not a vendor webhook; agent protocol).
- `POST /oauth/token`, `GET /oauth/authorize`, `POST /oauth/register`, `POST /oauth/device_authorization` — OAuth callbacks for agent clients.
- Notification (Resend/Novu) webhook routes are removed; do not recreate without re-mapping.
- Convex HTTP retired paths (`/v1/route`, `/v1/authorize`, `/v1/execute`, `/v1/reconcile`, `/v1/inspect`, `/v1/cancel`, `/mcp`, `/.well-known/ae-routing.json`) in `convex/http.ts` — always return retired responses; do not revive.

**Outgoing:**
- OpenRouter chat/completions and `/api/v1/models`.
- Stripe Checkout, Accounts (Connect), Transfers, Webhook verification (SDK).
- Coinbase CDP API for x402 payer custody (`CdpClient.evm.getOrCreateAccount`, message signing); EVM RPC URLs from `AE_X402_RPC_URLS_JSON` for settlement readback.
- x402 `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` headers to provider origins (`src/modules/capability-supply/internal/route-transport-x402.ts`).
- Provider OpenAPI/HTTP-JSON and MCP transports from `src/modules/capability-supply/internal/route-transport-*.ts` (published bindings; endpoints live in `capabilityTransportBindings`, not code).
- Facilitator discovery pulls: `facilitator.payai.network` and `api.cdp.coinbase.com` (10-minute cron).
- Clerk Backend API for owner email lookup (`src/lib/server/notification-provider-clerk.ts`) and API-key verification (`src/lib/server/agent-access-auth.ts`).
- Sentry ingest; PostHog ingest (`https://us.i.posthog.com` default).
- Google Maps JS (browser).
- Resend/Novu outbound sends are removed.

**Thin adapters over the paid door (not separate vendor APIs):**
- HTTP `POST /api/v1/operations/call` (`src/routes/api.v1.operations.call.ts` → `src/lib/server/operation-invoke-api.ts`) plus status/cancel/reconcile routes.
- MCP tools `ae_operation_invoke` / `ae_operation_status` / `ae_operation_cancel` / `ae_operation_reconcile`.
- CLI `npm run ae -- invoke|status|recover|cancel` (`tools/ae/cli.ts`).
- Chat answer turn may authenticate the same gateway (`authenticateOperationGateway` in `src/routes/api.answer.turn.ts`).

---

*Integration audit: 2026-08-21*
