---
last_mapped_commit: b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0
last_mapped_at: 2026-07-29
last_mapped_tree: e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf
worktree_dirty_files: 189
---

# External Integrations

**Analysis Date:** 2026-07-29

## APIs & External Services

**LLM and web-search gateway:**
- OpenRouter is called with raw `fetch`, not an SDK. The answer tool-use agent posts to the OpenRouter chat-completions endpoint in `src/modules/answer/internal/answer-tool-use-agent.ts` and model discovery reads the models endpoint in `src/modules/answer/internal/openrouter-models.ts`.
- Customer Request interpretation uses `src/modules/customer-request/openrouter-transport.ts`; answer follow-up chips use `src/modules/answer-thread/internal/llm-follow-up-chips.ts`.
- Storefront enrichment uses the OpenRouter web-search plugin from `src/modules/storefront/internal/business-enrichment.ts`. It produces an owner-reviewable draft and explicitly does not publish facts or fetch the business website.
- Configuration is read by `src/modules/answer/internal/llm-config.ts` and Convex declares the server-side names in `convex/convex.config.ts`: `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, and `AE_SITE_URL`; answer overrides also include `AE_LLM_MODEL` and `AE_OPENROUTER_API_BASE_URL`.
- The integration is optional. Without a configured key, the answer path returns its configured unavailable/error behavior and enrichment returns `llm_not_configured`; eval configuration in `eval/answer/promptfooconfig.yaml` evaluates a declared set rather than proving hosted model availability or customer value.
- Current discovery and qualified-inquiry surfaces are source-owned by `src/modules/registry/` and `src/modules/discovery/`; the authenticated Request entry points are `src/routes/api.v1.requests.ts` and `src/routes/api.v1.requests.schema.ts`. A listing or registered action is not itself proof of routeable supply or provider acceptance.

**Registered provider transports:**
- `src/modules/capability-supply/internal/transport-adapters.ts` registers `http-json:v1`, `mcp-jsonrpc:v1`, and `x402-fetch:v2`.
- `src/modules/capability-supply/route-transport-runtime.ts` validates public HTTPS endpoints, credential references, bounded configuration, response size, and typed success/refusal/partial/unknown outcomes.
- x402 EVM signing uses `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem` in `src/modules/capability-supply/internal/x402-payment-signer.ts`. Credential references are environment names such as `env:NAME`; raw credentials are not part of persisted transport configuration.
- `convex/capabilitySupplyReadiness.ts` runs a Node-isolated, guarded readiness probe with `undici` and the network guard from `src/modules/network-guard/public.ts`.
- Tests in `tests/unit/capability-supply/route-transport-runtime.test.ts`, `tests/unit/capability-supply/x402-payment-signer.test.ts`, and `tests/unit/capability-supply/transport-adapter-registry.test.ts` establish source/fixture behavior. They do not establish independent provider acceptance, customer payment, booking, fulfilment, settlement, or payouts.

**Shipping quote adapters:**
- `src/modules/provider-integrations/shipping/server.ts` contains raw-fetch quote adapters for Shippo (`https://api.goshippo.com`) and EasyPost (`https://api.easypost.com/v2`). They return signed, freshness-bounded quote observations and can refuse invalid, stale, or malformed provider responses.
- Adapter credentials and provider account/service identifiers are injected into `createShippoQuoteAdapter` and `createEasyPostQuoteAdapter`; there is no provider SDK dependency in `package.json`.
- `tests/integration/shipping-provider-quote-input.test.ts` is the verified integration coverage for the adapters. A current application caller wiring these adapters into a customer-facing purchase or fulfilment path was not found; these adapters therefore document quote behavior, not shipment purchase or delivery fulfilment.

**Notifications:**
- Resend email dispatch and webhook verification are implemented with raw `fetch` in `src/lib/server/notification-provider.ts`.
  - Dispatch route: `src/routes/api.notification.resend-dispatch.ts`.
  - Incoming event route: `src/routes/api.notification.resend-webhook.ts`.
  - Configuration: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, and `RESEND_WEBHOOK_SECRET`.
  - Webhook admission validates the raw body and signature headers; provider payloads are hashed/redacted before durable evidence is retained.
- Novu workflow triggering and bounded message readback are also implemented in `src/lib/server/notification-provider.ts`.
  - Dispatch route: `src/routes/api.notification.novu-dispatch.ts`.
  - Configuration: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL`.
- `src/modules/notification-outbox/` and `convex/notificationOutbox.ts` own dispatch/outbox state; `AE_NOTIFICATION_OUTBOX_SECRET` protects server-side outbox operations.
- `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts` and `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts` are provider-smoke harnesses. Their presence is not a current hosted pass.

**Search and maps:**
- Meilisearch is an optional raw-HTTP search backend in `src/modules/registry/internal/catalog-search-port.ts`. It supports search, document replacement/deletion, index configuration, task readback, bounded timeouts, and post-response registry filtering.
- Configuration is `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, and `AE_SEARCH_TIMEOUT_MS`. `AE_SEARCH_BACKEND` defaults to Convex when unset; Convex remains the durable catalog source.
- Google Maps embed output is optional in `src/components/ae/artifacts/AeGenerativeMap.tsx` and uses `VITE_GOOGLE_MAPS_API_KEY`. Allowed Maps hosts are declared in `src/lib/http/security-headers.ts`.

**Payment-adjacent guards and absent rails:**
- x402 is the only current payment transport implementation identified in `src/modules/capability-supply/` and is bounded to an admitted provider adapter and exact route-step authority.
- `src/modules/inquiries/internal/policy.ts`, `src/lib/ui/contract-scans.ts`, and `tests/imports/paid-operation-development-surface-exclusion.test.ts` treat payment, checkout, wallet, and future-provider terms as refusal/copy/import boundaries where they are not supported by the intended surface.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `AUTUMN_SECRET_KEY`, and `AUTUMN_WEBHOOK_SECRET` are recognized names in source-write admission and `.env.example`, but no Stripe/Autumn SDK dependency or current checkout/webhook route is identified in `package.json` or `src/routes/`. These names are not evidence of payment, wallet, settlement, custody, or payout capability.

## Data Storage

**Databases:**
- Convex is the configured backend document/function runtime. `convex/schema.ts` composes module-owned schema fragments, including `src/modules/action-invocation/internal/convex-schema.ts` and the Customer Request fragments under `src/modules/customer-request/internal/`.
- `src/lib/server/convex-source.ts` creates authenticated and public `ConvexHttpClient` transports. It reads `CONVEX_URL` or `VITE_CONVEX_URL`; authenticated calls require a Clerk token from the `convex` token template.
- Convex auth is configured by `convex/auth.config.ts` with `CLERK_JWT_ISSUER_DOMAIN` and application ID `convex`.

**File Storage:**
- No product object-storage client is declared in `package.json` or identified in the verified current integration sources.
- Local output/evidence directories and development fixtures are repository tooling rather than a customer file-storage integration; the map does not treat them as production storage.

**Caching:**
- OpenRouter model discovery has an in-process TTL cache in `src/modules/answer/internal/openrouter-models.ts`.
- Meilisearch requests use bounded timeout control in `src/modules/registry/internal/catalog-search-port.ts`.
- No Redis or Memcached dependency is declared in `package.json`.

## Authentication & Identity

**Auth Provider:**
- Clerk is the primary hosted identity integration. `src/start.ts` installs `clerkMiddleware()` unless the local E2E bypass is enabled.
- Server-side Convex calls use Clerk-authenticated `ConvexHttpClient` creation in `src/lib/server/convex-source.ts`; Convex verifies the issuer configured in `convex/auth.config.ts`.
- Customer Request agent access has its own scoped key and principal seam in `src/modules/customer-request/agent-access.ts` and `src/modules/customer-request/agent-access.functions.ts`; the Request HTTP entry points are `src/routes/api.v1.requests.ts` and `src/routes/api.v1.requests.schema.ts`.
- Short-lived internal service authentication is defined in `src/modules/customer-request/service-auth-envelope.ts`. Preparation and route authority are separate source-owned objects in `src/modules/customer-request/preparation-authority.ts`, `src/modules/customer-request/route-mandate.ts`, and `src/modules/customer-request/route-mandate-admission.ts`.
- `src/modules/routing-kernel/caller-identity.ts` contains Web Bot Auth/signature verification code. Identity attributes a caller; it does not itself authorize a consequential action.

## Monitoring & Observability

**Error Tracking:**
- Sentry client/server integration is implemented in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts` using `@sentry/react` and `@sentry/node`.
- `src/lib/observability/config.ts` enables clients only when a DSN or PostHog key exists and the AE observability kill-switch is not set. Build upload is conditional in `vite.config.ts` on `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.

**Logs and analytics:**
- PostHog browser/server integration is in `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`; the default host and key/host configuration are read by `src/lib/observability/config.ts`.
- Private-route and payload protections are implemented in `src/lib/observability/private-route-safety.ts`.
- Convex platform logging is the backend runtime logging mechanism; no separate log-shipping SDK is declared in `package.json`.

**Evidence tooling:**
- Action, Customer Request, provider, and release evidence tools are under `tools/dev/` and `tools/release/`, with commands declared in `package.json`.
- Local or labelled provider fixtures and test reports establish only their declared source/dev contract. They do not establish hosted deployment, independent supply, provider fulfilment, or customer value.

## CI/CD & Deployment

**Hosting:**
- Vercel is the primary application target. `vite.config.ts` configures Nitro's Vercel preset with Node 20 functions.
- Convex schema/functions are a separately deployed backend from `convex/`.
- Cloudflare Worker examples are configured in `examples/routing-edge/wrangler.jsonc` and `examples/routing-agent-directory/wrangler.jsonc`; the conformance provider example has `examples/routing-provider/vercel.json`.

**CI Pipeline:**
- `.github/workflows/kernel-release-gate.yml` checks out a clean revision, installs Node 22 and npm 11.5.1, runs `npm ci`, and executes `npm run test:release:source`.
- Its main-branch hosted-proof job refuses a revision or dirty checkout mismatch, deploys the exact source revision to Vercel, deploys Convex, checks required execution settings, and runs the configured Customer Request release readback commands.
- The workflow definition is release automation; its presence does not prove that a hosted run succeeded for this map's dirty worktree.
- `doctor` and the advisory React workflow are separate health tooling; the package command is declared in `package.json` and configuration is in `doctor.config.ts`.

## Environment Configuration

**Required env vars:**
- Host/data and identity: `CONVEX_URL` or `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN`.
- Convex-declared optional names: `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, and `AE_ROUTE_CALL_SIGNING_KEY_ID` in `convex/convex.config.ts`.
- LLM: `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, and the key consumed by `src/modules/answer/internal/llm-config.ts`.
- Notifications: `AE_NOTIFICATION_OUTBOX_SECRET`, Resend names, and Novu names consumed by `src/lib/server/notification-provider.ts`.
- Search/maps: Meilisearch names consumed by `src/modules/registry/internal/catalog-search-port.ts` and `VITE_GOOGLE_MAPS_API_KEY` consumed by `src/components/ae/artifacts/AeGenerativeMap.tsx`.
- Observability: Sentry/PostHog key, host, environment, release, and disable-switch families consumed by `src/lib/observability/config.ts`.

**Secrets location:**
- `.env.example` documents names only. Secret values must remain in ignored local environments, Vercel/Convex environment configuration, or GitHub Actions secrets; no values belong in planning documents.
- Dynamic provider credential references are validated as `env:NAME` by `src/modules/capability-supply/internal/transport-adapters.ts` and resolved at runtime by the owning server action.
- Source-write admission in `src/modules/security/source-write-admission.ts` rejects reuse of provider secrets as source-admission secrets; this is a guard, not a provider integration.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` is the current third-party webhook route, implemented by `src/routes/api.notification.resend-webhook.ts` and verified by `src/lib/server/notification-provider.ts`.
- `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.novu-dispatch.ts` are AE-owned dispatch endpoints, not third-party webhook callbacks.
- No current Stripe or Autumn webhook route is identified in the verified route tree; their secret names remain guarded configuration names only.

**Outgoing:**
- TanStack server code calls Convex queries, mutations, and actions through `src/lib/server/convex-source.ts`.
- OpenRouter requests originate in `src/modules/answer/`, `src/modules/answer-thread/`, `src/modules/customer-request/openrouter-transport.ts`, and `src/modules/storefront/internal/business-enrichment.ts`.
- Resend and Novu calls originate in `src/lib/server/notification-provider.ts`; Clerk Backend API lookup is also owned there for notification delivery addresses.
- Registered HTTP/MCP/x402 provider calls originate in `src/modules/capability-supply/route-transport-runtime.ts`; guarded Convex readiness calls use `convex/capabilitySupplyReadiness.ts`.
- Shippo and EasyPost quote calls originate in `src/modules/provider-integrations/shipping/server.ts`; current verified tests exercise the adapters without establishing a live shipment effect.
- Optional Meilisearch requests originate in `src/modules/registry/internal/catalog-search-port.ts`; Sentry/PostHog telemetry originates in `src/lib/observability/` only when configured and enabled.

---

*Integration audit: 2026-07-29*
