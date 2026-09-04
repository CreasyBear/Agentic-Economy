# External Integrations

**Analysis Date:** 2026-09-04

## APIs & External Services

**Primary application platform:**
- Convex - Primary product database, actions, scheduled work, realtime subscriptions, HTTP actions, and generated-document file storage.
  - SDK/Client: `convex` 1.45.0 with `ConvexHttpClient`, `ConvexReactClient`, and generated bindings under `convex/_generated/`.
  - Auth: Clerk JWTs via `CLERK_JWT_ISSUER_DOMAIN`; trusted Vercel-to-Convex calls also use `AE_CONVEX_SERVER_FUNCTION_TOKEN` in `src/lib/server/convex-source.ts`.
  - Configuration: `convex.json`, `convex/convex.config.ts`, `convex/auth.config.ts`, `convex/http.ts`, and `convex/crons.ts`.
  - Installed components: agent, aggregates, rate limiter, workflow, general workpool, and a separate Stripe-webhook workpool in `convex/convex.config.ts`.

**Human identity:**
- Clerk - Browser sign-in/sign-up, server sessions, TanStack Start request middleware, Convex JWT issuance, API-key administration, and security lifecycle webhooks.
  - SDK/Client: `@clerk/tanstack-react-start`, `@clerk/shared`, and server-side Clerk client imports in `src/lib/server/`.
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`.
  - Webhook verification: `CLERK_WEBHOOK_SIGNING_SECRET` through `verifyWebhook` in `src/lib/server/clerk-security-webhook.ts`.
  - Integration points: `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, and `src/routes/api.clerk.webhook.ts`.

**Payments and payouts:**
- Stripe - Hosted AUD credit purchase, asynchronous settlement evidence, refund readback, Connect Provider onboarding, account lifecycle, and transfers/payout evidence.
  - SDK/Client: `stripe` 22.5.x behind `src/lib/server/stripe-money-provider.ts` and focused adapters in `src/lib/server/stripe-*-evidence.ts`.
  - Auth: `STRIPE_SECRET_KEY` for commands, `STRIPE_READBACK_KEY` for restricted readback, `STRIPE_WEBHOOK_SECRET` for snapshot events, and `STRIPE_V2_WEBHOOK_SECRET` for Accounts v2 events.
  - Business configuration: `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID` and optional `STRIPE_CHECKOUT_HOST`, validated in `src/lib/server/stripe-money-provider-config.ts`.
  - Webhook ingestion: bounded raw-body signature verification in `src/lib/server/stripe-money-webhook.ts`, durable inbox/workpool processing in `convex/moneyStripeWebhookInbox.ts`, `convex/moneyStripeWebhookWorker.ts`, and `convex/stripeWebhookWorkpool.ts`.

**Money subledger:**
- Formance Community - Double-entry ledger for AUD buyer credit, treasury/capacity, managed-Call reservations, buyer Charges, separate Provider obligations, settlement, reversal, and statement readback.
  - SDK/Client: vendored `@formance/formance-sdk` 7.0.0 in `package.json`; the only application adapter is `src/modules/money/formance.ts`.
  - Auth: Cloudflare Access service-token pair supplied through `AE_FORMANCE_ACCESS_CLIENT_ID` and `AE_FORMANCE_ACCESS_CLIENT_SECRET`.
  - Connection: `AE_FORMANCE_GATEWAY_URL`, `AE_FORMANCE_LEDGER`, `AE_FORMANCE_ENVIRONMENT`, and `AE_FORMANCE_REQUEST_TIMEOUT_MS`.
  - Hosting: Formance Gateway/Ledger on private k3s/EC2 with PostgreSQL RDS, provisioned by `infra/package4/modules/release-environment/` and reached through `infra/package4/modules/release-environment/cloudflare.tf`.

**x402 custody and settlement:**
- Coinbase Developer Platform - Corporate EVM custody account, policy readback, typed-data signing, and treasury token-balance observation for managed x402 payments.
  - SDK/Client: `@coinbase/cdp-sdk` 1.55.0 in `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`.
  - Auth: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, and `CDP_WALLET_SECRET`.
  - Control configuration: `AE_X402_CDP_ACCOUNT_NAME`, expected EVM address, account/project policy identifiers, rules digest, credential generation, custody enablement, per-Call/daily atomic limits, and RPC URL set; validation begins in `src/lib/deployment/manifest.ts` and `src/modules/capability-supply/internal/server-credential.ts`.
- x402 protocol - Discovers paid Operations, validates payment requirements, signs EIP-3009-style EVM authorization, submits Provider requests, and verifies settlement receipts.
  - SDK/Client: `@x402/core`, `@x402/evm`, and `@x402/extensions` 2.23.0 under `src/modules/capability-supply/internal/`.
  - Networks/assets: source profiles include Base mainnet USDC and Base Sepolia USDC in `src/modules/capability-supply/internal/x402-payment-profile.ts`; production effects remain gated.
  - RPC: bounded, allowlisted endpoints supplied by `AE_X402_RPC_URLS_JSON` and used by `src/modules/capability-supply/internal/x402-evm-receipt-reader.ts`.

**AI/model provider:**
- OpenRouter - Language-model access for chat and web-assisted storefront discovery.
  - SDK/Client: Vercel AI SDK `ai` 7.0.x through `@openrouter/ai-sdk-provider` 3.0.x.
  - Auth: `OPENROUTER_API_KEY`; model selection is `AE_LLM_MODEL`; optional override is `AE_OPENROUTER_API_BASE_URL`.
  - Implementation: all model creation, structured-output options, usage capture, and cost extraction stay behind `src/modules/model-gateway/public.ts`.

**Canonical supply discovery:**
- Agentic Market - External metadata source for potential x402 supply and ecosystem display data.
  - Client: guarded `fetch` plus Zod validation in `src/modules/market/registry-source-adapters.ts` and `src/modules/market/agentic-market-source.ts`.
  - Auth: none detected for the public read endpoints.
  - Boundary: imported entries remain external-registry metadata until admission and publication; `PRODUCT.md` and `src/modules/market/registry-source-adapters.ts` enforce that distinction.
- TREG - External platform/endpoint catalogue used as a second metadata source.
  - Client: guarded `fetch` and Zod validation in `src/modules/market/registry-source-adapters.ts`.
  - Auth: none detected for the public read endpoint.
- Coinbase CDP facilitator discovery and PayAI facilitator discovery - Periodic x402 Bazaar/resource discovery sources.
  - Client: bounded fetch and deterministic admission in `src/modules/capability-supply/internal/facilitator-discovery-client.ts` and `src/modules/capability-supply/internal/facilitator-discovery-ingest.ts`.
  - Auth: public discovery reads; paid execution uses the separate x402 custody configuration.
- Official MCP Registry - Resolves active Streamable HTTP remotes for Provider connections.
  - Client: guarded fetch to `registry.modelcontextprotocol.io` in `src/modules/capability-supply/internal/mcp-source-discovery.ts`, then MCP protocol inspection using `@modelcontextprotocol/sdk`.
  - Auth: registry read is public; Provider remotes may advertise OAuth or other connection requirements handled by the supply connection flow.

**Provider execution:**
- HTTP JSON, MCP Streamable HTTP, and x402 Provider endpoints - The Operation adapter set invokes admitted Provider endpoints and captures bounded evidence.
  - Client: guarded HTTP transport, `@modelcontextprotocol/sdk`, and x402 libraries in `src/modules/capability-supply/internal/transport-adapters.ts`, `route-transport-http-json.ts`, `route-transport-mcp.ts`, and `route-transport-invoke.ts`.
  - Auth: per-Provider secret references are leased through the secret plane; caller credentials are not stored in catalogue records.
  - Safety: URL validation, network guard, bounded bodies, idempotency, and effect journals are implemented under `src/modules/network-guard/`, `src/modules/capability-supply/internal/`, and `convex/capabilityProviderConsequenceJournal.ts`.

**Secret storage:**
- Infisical Cloud - Platform/customer secret generations and ephemeral leases for Provider credentials.
  - SDK/Client: direct bounded REST adapter `InfisicalCloudSecretStore` in `src/modules/secrets/infisical-cloud.ts`.
  - Auth: short-lived Vercel OIDC exchanged for Infisical machine-identity access by `src/modules/secrets/vercel-oidc.ts`.
  - Configuration: `AE_INFISICAL_BASE_URL`, scope-specific project/environment/path/machine-identity variables, optional organisation slug, and `AE_SECRET_LIFECYCLE_RPC_TOKEN` in `src/routes/api.internal.secret-lifecycle.ts` and `src/routes/api.internal.provider-consequence.ts`.
- AWS Secrets Manager - Stores Cloudflare Tunnel and Cloudflare Access credentials for the private Formance environment.
  - Client: EC2 instance role and AWS CLI bootstrap generated by `infra/package4/modules/release-environment/compute.tf`.
  - Auth: workload IAM; secret resources and KMS keys are defined in `infra/package4/modules/release-environment/cloudflare.tf`.

## Data Storage

**Databases:**
- Convex managed database - Canonical application records for Operations, authority, Invocation, evidence, chat, money projections, webhook inboxes, and recovery.
  - Connection: `CONVEX_URL` server-side and `VITE_CONVEX_URL` browser-side.
  - Client: Convex generated API plus `ConvexHttpClient`/`ConvexReactClient`; schema is assembled in `convex/schema.ts` from module-owned validators under `src/modules/**/convex-schema.ts`.
- PostgreSQL 16 RDS - Private persistence for the Formance community ledger in the package-4 infrastructure.
  - Connection: injected into the private k3s Formance deployment from an RDS-managed master secret; application traffic reaches Formance Gateway, not PostgreSQL directly.
  - Client: Formance SDK in `src/modules/money/formance.ts`; infrastructure is in `infra/package4/modules/release-environment/database.tf`.
  - Protection: Multi-AZ, KMS encryption, deletion protection, seven-day retention, Performance Insights, CloudWatch logs, AWS Backup, and a cross-region copy are declared in `infra/package4/modules/release-environment/database.tf` and `backup.tf`.

**File Storage:**
- Convex file storage - Rendered HTML and CSV money documents are stored and retrieved in `convex/moneyDocumentRender.ts` and `convex/moneyDocuments.ts`.
- AWS S3 - Encrypted audit/flow-log retention and OpenTofu remote state, not customer application file serving; resources are in `infra/package4/account-baseline/main.tf`.
- Local filesystem - Development fixtures, CLI state, test artifacts, and release receipts only; local and generated paths are excluded by `.gitignore`.

**Caching:**
- No external Redis or dedicated cache service detected.
- Convex query caching/realtime invalidation supplies application read caching; public HTTP endpoints set explicit cache headers in `src/routes/api.v1.registry.ts`, `src/routes/api.v1.market-metrics.ts`, and discovery routes, while private and money routes use `no-store`.
- Small process-local caches exist for model provider instances and syntax highlighting in `src/modules/model-gateway/public.ts` and `src/components/ai-elements/code-block.tsx`.

## Authentication & Identity

**Auth Provider:**
- Clerk for Business Principal/human sessions.
  - Implementation: TanStack Start middleware in `src/start.ts`, `ClerkProvider` plus Convex bridge in `src/routes/__root.tsx`, Convex JWT provider in `convex/auth.config.ts`, and signed lifecycle webhook handling in `src/lib/server/clerk-security-webhook.ts`.
- Agentic Economy OAuth 2.0-style device authorization for machine/CLI access.
  - Implementation: registration, device authorization, browser authorization, token, and revocation routes in `src/routes/oauth.*.ts`; durable grant/token state in `convex/agentAccessOAuth.ts`; CLI connection in `tools/ae/commands/connect.ts`.
  - Discovery: authorization-server and protected-resource metadata routes live under `src/routes/[.]well-known/`.
- Vercel workload identity for secret-plane access.
  - Implementation: `@vercel/oidc` token acquisition and JWT lifetime validation in `src/modules/secrets/vercel-oidc.ts`, exchanged by `src/modules/secrets/infisical-cloud.ts`.

## Monitoring & Observability

**Error Tracking:**
- Sentry - Optional browser and server exception/tracing capture using `@sentry/react` and `@sentry/node` in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`.
- Sentry source-map upload - Enabled only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` form a complete build configuration in `vite.config.ts`.
- Telemetry boundaries sanitize payloads and block private-record routes before capture in `src/lib/observability/private-route-safety.ts`.

**Logs:**
- PostHog - Optional pseudonymous funnel and product analytics from browser and server clients in `src/lib/observability/posthog.client.ts` and `posthog.server.ts`; browser persistence is session-only and session recording is disabled.
- Convex platform logs - Server actions and scheduled workers log within Convex; request correlation is established by `src/start.ts` and `src/lib/server/request-correlation.ts`.
- AWS CloudWatch - EC2/k3s/cloudflared and RDS logs, host metrics, alarms, and SNS email notifications are defined in `infra/package4/modules/release-environment/observability.tf`.
- AWS CloudTrail, GuardDuty, Access Analyzer, S3 flow logs, and AWS Backup event alarms - Account/recovery telemetry is defined in `infra/package4/account-baseline/main.tf` and `infra/package4/modules/release-environment/backup.tf`.

## CI/CD & Deployment

**Hosting:**
- Vercel - Public React/TanStack Start UI and HTTP/MCP/API surface; Nitro emits Node serverless output from `vite.config.ts`.
- Convex Cloud - Stateful backend deployment connected independently from Vercel; the synthetic release deployment is identified in `docs/operations/deployment-registry.yaml`.
- AWS + Cloudflare - Private Formance subsystem: EC2/k3s and RDS in Sydney, Cloudflare Tunnel/Access/DNS at the edge, and recovery backups copied to Melbourne; OpenTofu definitions are under `infra/package4/`.
- Current boundary: `docs/operations/deployment-registry.yaml` records the synthetic package-4 release as deployed but non-production, and the `infra/package4/environments/production/` foundation as declared, locked, and not applied.

**CI Pipeline:**
- GitHub Actions - `.github/workflows/kernel-release-gate.yml` runs frozen npm installs, codegen checks, source release gates, authenticated E2E, and explicitly opt-in paid gateway smoke stages with retained evidence artifacts.
- GitHub Actions - `.github/workflows/react-doctor.yml` runs advisory React Doctor analysis on pull requests and `main` pushes.
- Release gates - `package.json` composes lint, typecheck, Vitest suites, import/architecture contracts, Playwright E2E/accessibility, CLI package tests, Convex generated-code verification, deployment-manifest validation, and Vite build.
- Infrastructure delivery - OpenTofu uses S3 state and exact AWS/Cloudflare provider pins in `infra/**/versions.tf`; production resources are guarded by an explicit foundation gate in `infra/package4/environments/production/main.tf`.

## Environment Configuration

**Required env vars:**
- Base/runtime: `AE_CANONICAL_BASE_URL`, `CONVEX_URL` or `VITE_CONVEX_URL`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_SITE_URL`, and release identity variables defined in `src/lib/deployment/manifest.ts`.
- Clerk: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SIGNING_SECRET`.
- Models/chat: `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_CHAT_PROXY_SECRET`; `AE_OPENROUTER_API_BASE_URL` and `SITE_URL` are optional model-gateway settings.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_READBACK_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_V2_WEBHOOK_SECRET`, `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`; `STRIPE_CHECKOUT_HOST` is optional.
- Formance: `AE_FORMANCE_ENVIRONMENT`, `AE_FORMANCE_GATEWAY_URL`, `AE_FORMANCE_LEDGER`, `AE_FORMANCE_REQUEST_TIMEOUT_MS`, `AE_FORMANCE_ACCESS_CLIENT_ID`, `AE_FORMANCE_ACCESS_CLIENT_SECRET`.
- x402/CDP: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, the `AE_X402_CDP_*` identity/policy/generation set, `AE_X402_CUSTODY_ENABLED`, `AE_X402_CUSTODY_MAX_ATOMIC`, `AE_X402_CUSTODY_DAILY_MAX_ATOMIC`, and `AE_X402_RPC_URLS_JSON`.
- Source-write and internal RPC: the six `AE_SOURCE_WRITE_KEY_*` families, `AE_SECRET_LIFECYCLE_RPC_TOKEN`, `AE_PROVIDER_CONSEQUENCE_ORIGIN`, and route-signing configuration when the corresponding path is enabled; `src/lib/deployment/manifest.ts` is authoritative for production completeness.
- Infisical: `AE_INFISICAL_BASE_URL`, `AE_INFISICAL_PLATFORM_*`, and `AE_INFISICAL_CUSTOMER_*` scope configuration in `src/routes/api.internal.provider-consequence.ts` and `src/routes/api.internal.secret-lifecycle.ts`.
- Observability: optional `SENTRY_*`, `POSTHOG_*`, browser-safe `VITE_SENTRY_*` / `VITE_POSTHOG_*`, and explicit disable flags read in `src/lib/observability/config.ts`.

**Secrets location:**
- Vercel and Convex environment configuration hold application runtime secrets, as recorded in `docs/operations/deployment-registry.yaml` and validated by `src/lib/deployment/manifest.ts`.
- GitHub Actions secrets/variables supply release-gate and live-smoke configuration in `.github/workflows/kernel-release-gate.yml`; workflow installation uses `npm ci --ignore-scripts` when job-level secrets are present.
- Infisical Cloud holds Provider/platform secret generations reached through Vercel OIDC by `src/modules/secrets/`.
- AWS Secrets Manager plus KMS hold Cloudflare Tunnel/Access credentials and the RDS-managed master credential defined in `infra/package4/modules/release-environment/`.
- `.env.example`, `.env.local`, `.vercel/.env.production.local`, and `.vercel/prod-debug.env` exist locally. Their contents are not read or reproduced; `.gitignore` excludes local secret-bearing configuration.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/stripe/webhook` - Stripe Checkout/refund snapshot events; route in `src/routes/api.stripe.webhook.ts`, verified in `src/lib/server/stripe-money-webhook.ts`, and durably ingested through `convex/moneyStripeWebhookInbox.ts`.
- `POST /api/stripe/webhook/accounts-v2` - Stripe Accounts v2/Connect account lifecycle destination in `src/routes/api.stripe.webhook.accounts-v2.ts`; signature verification selects the v2 secret in `src/lib/server/stripe-money-webhook.ts`.
- `POST /api/clerk/webhook` - Clerk user/session/organisation security lifecycle events in `src/routes/api.clerk.webhook.ts` and `src/lib/server/clerk-security-webhook.ts`.
- `POST /api/internal/provider-consequence` - Internal, authenticated bridge for Provider effect journaling and x402 signing/execution in `src/routes/api.internal.provider-consequence.ts`.
- `POST /api/internal/secret-lifecycle` and Convex `/internal/secret-lifecycle` - Internal authenticated secret lifecycle RPC implemented by `src/routes/api.internal.secret-lifecycle.ts`, `convex/secretLifecycleHttp.ts`, and `convex/http.ts`.
- `/_operator/owner/supply/connections/oauth/callback` - OAuth callback for Provider-account connection flows in `src/routes/_operator/owner.supply.connections.oauth.callback.tsx`.

**Outgoing:**
- No generic outgoing webhook publisher is detected.
- Outbound service calls go directly through owned adapters: Stripe in `src/lib/server/stripe-money-provider.ts`, Formance in `src/modules/money/formance.ts`, Coinbase/x402 in `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`, OpenRouter in `src/modules/model-gateway/public.ts`, Infisical in `src/modules/secrets/infisical-cloud.ts`, external registries in `src/modules/market/registry-source-adapters.ts`, and admitted Provider transports under `src/modules/capability-supply/internal/`.

---

*Integration audit: 2026-09-04*
