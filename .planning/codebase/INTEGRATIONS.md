# External Integrations

**Analysis Date:** 2026-08-19

Bound to working tree at remap commit `7e067dfb`. Paid machine door: `POST /api/v1/operations/call` (`src/routes/api.v1.operations.call.ts`) — **not** deprecated. `/api/v1/operations/execute` is HTTP 410 (`src/routes/api.v1.operations.execute.ts`). Businesses/services HTTP URLs stay (`src/modules/product-frontier/business-services-policy.ts`). Customer Request TypeScript module is absent; `customerRequest.*` HTTP is 410 only (`src/lib/server/customer-request-gone.ts`).

## APIs & External Services

**Identity:**
- Clerk — human sessions, JWT for Convex, owner API, OAuth helpers.
  - SDK/Client: `@clerk/tanstack-react-start`, `@clerk/backend` (transitive; smokes use `createClerkClient` in `tools/release/operation-gateway-production-smoke.ts`)
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
  - Implementation: `clerkMiddleware()` in `src/start.ts`; `ClerkProvider` in `src/routes/__root.tsx`; sign-in/up `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`; Convex provider `convex/auth.config.ts` (`applicationID: 'convex'`). Server Convex calls use Clerk JWT template `convex` in `src/lib/server/convex-source.ts`.

**Language models:**
- OpenRouter — every product LLM call.
  - SDK/Client: `@openrouter/ai-sdk-provider` + `ai` via `src/modules/model-gateway/public.ts`
  - Auth: `OPENROUTER_API_KEY`
  - Optional: `AE_OPENROUTER_API_BASE_URL`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `SITE_URL`, Convex `AE_CUSTOMER_REQUEST_MODEL`

**Payments (fiat):**
- Stripe — credit Checkout, Connect onboarding, payout transfers, webhook idempotency.
  - SDK/Client: `stripe` (`src/lib/server/stripe-money-provider.ts`), `@stripe/stripe-js` + `@stripe/react-stripe-js` (`src/components/ae/console/AeCreditTopUpPanel.tsx`)
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`
  - Durable: listed tables `moneyStripeEvents`, `moneyTopupCommands`, `moneyPayoutAccounts`, `moneyPayouts`, `moneyPayoutAllocations` (`tests/unit/schema/convex-schema.test.ts`)
  - Live charges stay behind `src/modules/money/internal/live-money-gate.ts`.

**Payments (crypto / x402):**
- x402 exact-EVM + RPC — provider payment required/signature/settlement.
  - SDK/Client: `@x402/core`, `@x402/evm`, `@x402/extensions`, `viem` (`src/modules/capability-supply/internal/x402-payment-signer.ts`, `src/modules/capability-supply/internal/x402-evm-receipt-reader.ts`, `src/modules/capability-supply/internal/x402-settlement-verifier.ts`)
  - Auth / custody: `AE_X402_PAYMENT_CREDENTIAL_REF` (must equal `env:AE_X402_PAYMENT_PRIVATE_KEY`), `AE_X402_PAYMENT_PRIVATE_KEY`, `AE_X402_RPC_URLS_JSON`
  - Durable: listed table `moneyX402PaymentAttempts`. Dispatch uses `convex/marketDispatchWorkpool.ts`.

**Provider HTTP (Market Operations):**
- OpenAPI `fetch` through `openapi-fetch` in `src/modules/capability-supply/route-transport-runtime.ts`, SSRF-guarded by `src/modules/network-guard/public.ts`.
  - Auth: per-publication credential refs / provider connection leases (`capabilityProviderConnections`, `capabilityProviderConnectionLeases`).
  - Curated seeds: `convex/curatedProviders.ts` (Frankfurter, Exa, Open-Meteo, Wikipedia, and other admitted publications).

**Notifications:**
- Resend — owner email dispatch + delivery webhook.
  - SDK/Client: HTTPS `https://api.resend.com` in `src/lib/server/notification-provider.ts` (no Resend npm SDK)
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `AE_NOTIFICATION_OUTBOX_SECRET`; optional `RESEND_API_BASE_URL`
- Novu — inquiry owner/customer workflows.
  - SDK/Client: HTTPS `https://api.novu.co` in `src/lib/server/notification-provider.ts`
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, `AE_NOTIFICATION_OUTBOX_SECRET`; optional `NOVU_API_BASE_URL`

**Agent protocol:**
- MCP Streamable HTTP at `/mcp` (`src/routes/mcp.ts`, `src/lib/server/mcp-api.ts`).
  - SDK/Client: `@modelcontextprotocol/sdk`
  - Auth: anonymous read-only tools; authenticated tools via Clerk-issued agent keys / OAuth (`src/lib/server/agent-access-auth.ts`). Quarantine-family MCP tools 410 except `inquiry.readCustomerRecord`. Convex `convex/http.ts` `/mcp` is a routing-kernel 410, not the product MCP host.

**Maps (optional UI):**
- Google Maps JavaScript in `src/components/ae/artifacts/AeGenerativeMap.tsx`
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`

**Eval (non-runtime):**
- Promptfoo — `eval/answer/promptfooconfig.yaml`
- Braintrust — `BRAINTRUST_API_KEY`, `AE_BRAINTRUST_PROJECT`, `AE_BRAINTRUST_DATASET` (`tools/ae/commands/eval.ts`)

**Catalog names only (no active Autumn client in `src/`):** `AUTUMN_API_BASE_URL`, `AUTUMN_PORTAL_RETURN_BASE_URL` in `src/lib/deployment/manifest.ts`; `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET` appear as secret-name deny-list entries in `src/modules/security/source-write-admission.ts`.

## Data Storage

**Databases:**
- Convex (cloud) — application source of truth.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` (must match if both set). Deploy: `CONVEX_DEPLOY_KEY` (CI). Local admin bypass: `CONVEX_SELF_HOSTED_ADMIN_KEY` (forbidden in production).
  - Client: `ConvexHttpClient` in `src/lib/server/convex-source.ts` (no `ConvexProvider` React client). Functions via generated `convex/_generated/api`.
  - Listed schema: **60** tables in `durableTables` (`tests/unit/schema/convex-schema.test.ts`). Inquiry **12** stay (`INQUIRY_EXPORT_TABLES` in `src/modules/product-frontier/table-export-tables.ts`). `marketDispatchWorkpool` stays (`convex/marketDispatchWorkpool.ts`); Workpool component tables remain.
  - Components mounted in `convex/convex.config.ts`: `workflow`, `workpool`, `rateLimiter`, `aggregate` (`ownerActivationByStage`).
  - Crons in `convex/crons.ts`: readiness probes, inquiry abuse cleanup, source-write nonce cleanup, OAuth grant cleanup, daily supplier settlement.

**File Storage:**
- Local filesystem only for CLI/session scratch (`.ae-cli` via `AE_CLI_STATE_DIR` in `tools/ae/commands/ask.ts`). Convex `_storage` / `ctx.storage` is not used in `convex/`.

**Caching:**
- None as a separate cache product. Convex query cache + `@convex-dev/rate-limiter` token buckets (`convex/lib/rateLimit.ts`). HTTP admission names in `src/lib/server/rate-limit.ts`.

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: TanStack Start middleware + React Clerk components. Convex validates Clerk JWTs (`convex/auth.config.ts`). Owners keyed `by_clerkUserId` on listed table `owners`. Agent access: Clerk-issued bearer keys plus AE grants (`agentAccessPrincipals`, `agentAccessGrants`, `operationKeys` in the keep-60 set). OAuth 2.1 / device-code for agents: `src/routes/oauth.authorize.ts`, `src/routes/oauth.register.ts`, `src/routes/oauth.token.ts`, `src/routes/oauth.device_authorization.ts`, metadata `src/routes/[.]well-known/oauth-authorization-server.ts`, `src/routes/[.]well-known/oauth-protected-resource.ts`. Server-to-Convex service assertion uses `AE_CONVEX_SERVER_FUNCTION_TOKEN` (`src/lib/server/convex-source.ts`). Source-write HMAC families: `AE_SOURCE_WRITE_KEY_{INQUIRY,BILLING,PROTECTED,CLAIM,OPERATOR,REPAIR,SESSION}` (`src/lib/deployment/manifest.ts`).

## Monitoring & Observability

**Error Tracking:**
- Sentry (`src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`). DSN: `SENTRY_DSN` / `VITE_SENTRY_DSN`. Build upload: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE` (fallback `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA` in `vite.config.ts`). Disable: `AE_DISABLE_OBSERVABILITY` / `VITE_AE_DISABLE_OBSERVABILITY`.

**Logs:**
- Request correlation middleware in `src/start.ts` (`src/lib/server/request-correlation.ts`). Sentry tags `ae.path` / `ae.request_id`. PostHog funnel + measured legacy registry traffic (`src/lib/observability/posthog.server.ts` `captureLegacyRegistryApiRequest`). Client errors POST `src/routes/api.observability.client-error.ts`. Funnel: `src/routes/api.observability.funnel.ts` (`AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`). Platform logs: Vercel + Convex dashboards. Diagnostic routes covered by `tests/unit/server/diagnostic-routes.test.ts`.

**Product analytics:**
- PostHog — `VITE_POSTHOG_KEY` / `POSTHOG_KEY`, `VITE_POSTHOG_HOST` / `POSTHOG_HOST` (default `https://us.i.posthog.com` in `src/lib/observability/config.ts`), `VITE_POSTHOG_APP_URL` / `POSTHOG_APP_URL`.

## CI/CD & Deployment

**Hosting:**
- Vercel (web, Node 22) — Nitro preset in `vite.config.ts`. CI uses `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET`. Deploy helper `tools/release/deploy-customer-request-git-source.ts`.
- Convex (functions, schema, crons, Workpool) — `npx convex deploy` in `.github/workflows/kernel-release-gate.yml`.

**CI Pipeline:**
- GitHub Actions `.github/workflows/kernel-release-gate.yml` — source-proof on PR/push; hosted curated-fixture smoke on `main`; opt-in live-gateway spend on `workflow_dispatch`.
- GitHub Actions `.github/workflows/react-doctor.yml` — advisory React Doctor.

## Environment Configuration

**Required env vars:**

Production-required groups from `src/lib/deployment/manifest.ts` `requiredProduction` (names only):

- Canonical origin: `AE_CANONICAL_BASE_URL` **or** `AE_CANONICAL_HOST_ALLOWLIST`
- Convex: `CONVEX_URL` **or** `VITE_CONVEX_URL`; `AE_CONVEX_SERVER_FUNCTION_TOKEN`
- Clerk: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
- Model gateway: `OPENROUTER_API_KEY`
- Source-write: `AE_SOURCE_WRITE_KEY_INQUIRY`, `AE_SOURCE_WRITE_KEY_BILLING`, `AE_SOURCE_WRITE_KEY_PROTECTED`, `AE_SOURCE_WRITE_KEY_CLAIM`, `AE_SOURCE_WRITE_KEY_OPERATOR`, `AE_SOURCE_WRITE_KEY_REPAIR`, `AE_SOURCE_WRITE_KEY_SESSION` (plus optional rotation `AE_SOURCE_WRITE_PREVIOUS_KEYS_*`, `AE_SOURCE_WRITE_DERIVED_KEY_ID_*`, `AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_*`)
- x402: `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`, `AE_X402_RPC_URLS_JSON`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`

Convex-declared (optional unless set on the deployment) in `convex/convex.config.ts`: `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `AE_RELEASE_SOURCE_REVISION`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_X402_RPC_URLS_JSON`. Hosted job also requires those three route/site keys present in Convex prod env (`.github/workflows/kernel-release-gate.yml`).

Conditional (required when any trigger name is set): Resend/Novu groups; `AE_SANDBOX_PROVIDER_KEY` and sandbox origins; `AE_ROUTE_CALL_SIGNING_SECRET` + `AE_ROUTE_CALL_SIGNING_KEY_ID`; `AE_ANSWER_THREAD_SHARE_SECRET` + `AE_ANSWER_THREAD_SHARE_KEY_ID`; `AE_INQUIRY_ACCESS_SECRET` + `AE_INQUIRY_ACCESS_KEY_ID`; `AE_GOVERNED_SEND_INTEGRITY_SECRET` + `AE_GOVERNED_SEND_INTEGRITY_KEY_ID` (+ `AE_GOVERNED_SEND_INTEGRITY_VERIFICATION_KEYS`); `AE_INQUIRY_RECEIPT_KEK` + `AE_INQUIRY_RECEIPT_KEK_ID`; `AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY`; Sentry build trio; live-gateway smoke names (`AE_GATEWAY_SMOKE_*`, `AE_RELEASE_*`, `CLERK_SECRET_KEY`).

Optional runtime: `AE_ANSWER_EVAL_PASSED`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `VITE_AE_ANSWER_MODE`, `AE_CSP_REPORT_ONLY`, `AE_COOKIE_SECURE`, `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`, `AE_DISABLE_OBSERVABILITY`, `VITE_AE_DISABLE_OBSERVABILITY`, `AE_ROUTING_PUBLIC_BASE_URL`, `AE_SITE_URL`, `SITE_URL`, `VITE_GOOGLE_MAPS_API_KEY`, Sentry/PostHog DSN/key/host vars, `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`, `AE_CLI_BASE_URL`, `AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID`, `AE_CUSTOMER_REQUEST_CLERK_SUBJECT`.

CLI / agent key (local, forbidden in production): `AE_API_KEY`, `AE_API_KEY_ORIGIN`.

Forbidden in production: `AE_SOURCE_WRITE_SECRET`, `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, `AE_ANSWER_EVAL_REGISTRY_SEED`, `AE_DEV_WBA_SMOKE_ENABLED`, `AE_DEV_WBA_SMOKE_SECRET`, `AE_DEV_WBA_SIGNATURE_AGENT`, `AE_LOCAL_DEV_VITE_ARGS`, `CONVEX_SELF_HOSTED_ADMIN_KEY`, `AE_API_KEY`.

**Secrets location:**
- Template `.env.example` present (names only in this map; contents not read).
- Local `.env.local` present (contents not read).
- GitHub Actions `secrets.*` / `vars.*` in `.github/workflows/kernel-release-gate.yml`.
- Convex deployment env (`npx convex env set` / `get`).
- Vercel project environment for the Node host.
- Do not commit `.env.local` or other secret files.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/stripe/webhook` — `src/routes/api.stripe.webhook.ts` → `src/modules/money/server.ts`. Auth: `STRIPE_WEBHOOK_SECRET`.
- `POST /api/notification/resend-webhook` — `src/routes/api.notification.resend-webhook.ts`. Auth: `RESEND_WEBHOOK_SECRET`.
- Clerk hosted callbacks for sign-in/up (`src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`).
- OAuth token/device endpoints under `/oauth/*` (`src/routes/oauth.*.ts`).

**Outgoing:**
- Stripe API (Checkout, Transfers, Connect) from `src/lib/server/stripe-money-provider.ts`.
- x402 payment + EVM RPC from `src/modules/capability-supply/internal/x402-payment-signer.ts` / `x402-evm-receipt-reader.ts`.
- OpenRouter chat/completions from `src/modules/model-gateway/public.ts`.
- Admitted provider HTTP (OpenAPI) from `src/modules/capability-supply/route-transport-runtime.ts`.
- Resend `POST /emails` and Novu trigger/readback from `src/lib/server/notification-provider.ts`; internal dispatch doors `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts` (gated by `AE_NOTIFICATION_OUTBOX_SECRET`).
- PostHog capture and Sentry ingest from `src/lib/observability/*`.
- Convex HTTP client from the Vercel host (`src/lib/server/convex-source.ts`).

**Machine discovery (outbound docs, inbound reads):**
- `/.well-known/ucp` — `src/routes/[.]well-known/ucp.ts`
- `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`
- `/.well-known/http-message-signatures-directory`
- `/llms.txt` (`src/routes/llms[.]txt.ts`), `/SKILL.md` (`src/routes/SKILL[.]md.ts`)
- MCP `/mcp` (`src/routes/mcp.ts`)
- Market HTTP: `/api/v1/market-operations/{search,detail,compare,inspect-plan}`; paid invoke `/api/v1/operations/call`; retained businesses/services URLs as listed in `src/modules/product-frontier/business-services-policy.ts`

**Tombstones (incoming, HTTP 410):**
- `customerRequest.*` family HTTP (`src/lib/server/customer-request-gone.ts` and `src/routes/api.v1.requests*.ts` / `src/routes/api.requests*.ts`)
- `POST /api/v1/operations/execute`
- Routing-kernel Convex HTTP paths in `convex/http.ts` (`/v1/route`, `/v1/authorize`, `/v1/execute`, `/v1/reconcile`, `/v1/inspect`, `/v1/cancel`, Convex `/mcp`, `/.well-known/ae-routing.json`)

---

*Integration audit: 2026-08-19*
