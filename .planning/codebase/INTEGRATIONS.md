# External Integrations

**Analysis Date:** 2026-08-08

**Evidence classes:** `Implemented` means current source performs or handles the exchange; `Runtime-capable` means the current adapter can execute a registered target when its admission/readiness/credential gates pass; `Registered contract` means the source describes an external API for catalog/admission; `Provenance-only` means a URL is retained as evidence but AE does not call it; `Declared-only` means an environment/config entry exists without a current client path. Secrets are named but never copied here.

## APIs & External Services

**Payment Processing:**
- x402 provider endpoints - `Implemented` for admitted paid external operations. The Convex route worker sends the initial HTTP request, validates a `402 Payment Required` challenge, checks scheme/network/asset/pay-to/amount/expiry, signs an EVM payment, and retries with `Payment-Signature`; the full transport is in `src/modules/capability-supply/route-transport-runtime.ts` and the worker is `convex/customerRequestRouteTransportWorker.ts`.
  - SDK/Client: `@x402/core` 2.18.0, `@x402/evm` 2.18.0, `@x402/extensions` 2.18.0, and `viem` 2.55.2; signing is isolated in `src/modules/capability-supply/internal/x402-payment-signer.ts`.
  - Auth: A server-held credential referenced by a registered `env:NAME` binding; `convex/customerRequestRouteTransportWorker.ts` resolves that name from the Convex environment and the signer accepts a validated EVM private-key shape. AE's internal money-ledger charge is deliberately separate from the external provider payment in that worker.
  - Endpoints used: Dynamic admitted provider URLs; request/response headers include `Payment-Required`, `Payment-Signature`, `Payment-Response`, and optional `provider-receipt`. Payment attempts and reconciliation evidence are persisted through the Convex customer-request execution tables.
- Stripe - `Boundary-only` in the current tree. The application owns the webhook contract, money state, and provider ports, but the default route has no concrete Stripe verifier/applier and the manifest contains no `stripe` SDK import; see `src/routes/api.stripe.webhook.ts`, `src/modules/money/internal/stripe-webhook.ts`, `src/modules/money/ports.ts`, and `package.json`.
  - SDK/Client: No current Stripe client package; `StripeWebhookVerifier` and `StripeWebhookApplier` are injected seams in `src/modules/money/internal/stripe-webhook.ts`.
  - Auth: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are documented in `.env.example`; the webhook requires the `stripe-signature` header, but a missing/default verifier returns `stripe_setup_required` in `src/routes/api.stripe.webhook.ts`.
  - Endpoints used: Incoming `POST /api/stripe/webhook`; outbound checkout, Connect, and transfer calls are not implemented in the current source boundary.
- Autumn - `Declared-only` billing configuration, not a current runtime client. `AUTUMN_*` names and the sandbox base URL are documented in `.env.example` and present as local configuration names in `.env.local`, while the current payment source uses the Stripe/x402 seams under `src/modules/money/` and `src/modules/capability-supply/`.
  - SDK/Client: None declared in `package.json` and no current Autumn route/client module is present under `src/` or `convex/`.
  - Auth: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, and project/environment variables are names only in `.env.example`; no values are reproduced.
  - Endpoints used: No current Autumn endpoint call.

**Email/SMS:**
- Resend - `Implemented` transactional email dispatch for owner inquiry notifications and incoming delivery-status webhook ingestion.
  - SDK/Client: Direct bounded `fetch` in `src/lib/server/notification-provider.ts`; no separate Resend SDK is declared in `package.json`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, and `RESEND_WEBHOOK_SECRET` from `.env.example`; outbound requests use a Bearer API key and an `Idempotency-Key`.
  - Templates: Email text is assembled by `sendOwnerInquiryResendEmail` in `src/lib/server/notification-provider.ts`; no dashboard template IDs are used in current source.
  - Endpoints used: `POST https://api.resend.com/emails` (or `RESEND_API_BASE_URL` override) from `src/lib/server/notification-provider.ts`; incoming `POST /api/notification/resend-webhook` in `src/routes/api.notification.resend-webhook.ts`.
- Novu - `Implemented` workflow dispatch and message readback for owner/customer inquiry notifications.
  - SDK/Client: Direct bounded `fetch` in `src/lib/server/notification-provider.ts`; no separate Novu SDK is declared in `package.json`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_OWNER`, and optional customer workflow name from `.env.example`; requests use `Authorization: ApiKey ...` and an idempotency key.
  - Templates: Workflow IDs are environment-provided; subscriber payloads and owner/customer links are built in `src/lib/server/notification-provider.ts`.
  - Endpoints used: `POST https://api.novu.co/v1/events/trigger` and `GET https://api.novu.co/v1/messages?transactionId=...` (or `NOVU_API_BASE_URL` override), invoked through `src/routes/api.notification.novu-dispatch.ts`.

**External APIs:**
- OpenRouter - `Implemented` model gateway for answer/tool loops, customer-request interpretation, follow-up chips, storefront enrichment, and web-search-backed enrichment. The provider seam is `src/modules/model-gateway/public.ts`; model calls use the `ai` SDK rather than hand-written chat HTTP.
  - Integration method: `@openrouter/ai-sdk-provider` through Vercel AI SDK `generateText`/structured output; model discovery additionally uses direct `GET https://openrouter.ai/api/v1/models` in `src/modules/answer/internal/openrouter-models.ts`.
  - Auth: `OPENROUTER_API_KEY`; model/base URL/site metadata are read from `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, and `SITE_URL` in `src/modules/model-gateway/public.ts` and documented in `.env.example`.
  - Rate limits: The current source bounds request/response bytes and timeouts; selected flows set explicit retry limits, for example `src/modules/storefront/internal/business-enrichment.ts`.
- AE-curated keyless HTTP providers - `Registered contract` and `Runtime-capable` through the generic OpenAPI HTTP transport; credential reference is `none` in `src/modules/capability-supply/curated-cluster-a-publications.ts`.
  - Integration method: Public HTTPS GET operations described in `src/modules/capability-supply/curated-cluster-a-publications.ts`: Open-Meteo forecast (`https://api.open-meteo.com/v1/forecast`), Open-Meteo geocoding (`https://geocoding-api.open-meteo.com/v1/search`), Wikipedia summaries (`https://en.wikipedia.org/api/rest_v1/page/summary`), The Cat API image search (`https://api.thecatapi.com/v1/images/search`), CoinGecko simple price (`https://api.coingecko.com/api/v3/simple/price`), and IPify (`https://api.ipify.org`).
  - Auth: No provider credential is attached by the curated publication (`KEYLESS_CREDENTIAL_REF = 'none'`); public provider rate limits still apply.
  - Rate limits: Readiness and public-target checks are enforced by `src/modules/capability-supply/internal/readiness-probe.ts` and `convex/capabilitySupplyReadiness.ts`; provider-specific rate-limit guarantees are not asserted by AE.
- AE-curated keyed HTTP providers - `Registered contract` and `Runtime-capable` only after a credential and readiness probe succeed. The current source explicitly names OpenWeatherMap, Tavily, SerpAPI, and CoinGecko demo in `src/modules/capability-supply/curated-cluster-b-publications.ts`.
  - Integration method: OpenWeatherMap `https://api.openweathermap.org/data/2.5`, Tavily `https://api.tavily.com`, SerpAPI `https://serpapi.com`, and CoinGecko `https://api.coingecko.com/api/v3` are normalized OpenAPI HTTP targets.
  - Auth: `env:OPENWEATHER_API_KEY`, `env:TAVILY_API_KEY`, `env:SERPAPI_API_KEY`, and `env:COINGECKO_DEMO_API_KEY` are the publication credential references; the cluster comment requires a real credential plus a health probe before readiness.
  - Rate limits: Only the admitted request timeout and readiness state are bounded by AE; upstream provider quotas are external.
- Exa and Frankfurter - `Registered contract` and the current curated seed's principal real-provider supply. `src/modules/capability-supply/curated-provider-publications.ts` describes Exa search/contents at `https://api.exa.ai/search` and `https://api.exa.ai/contents` with `env:EXA_API_KEY`, and Frankfurter ECB rates at `https://api.frankfurter.dev/v2/rates` with credential reference `none`.
  - Integration method: OpenAPI HTTP registrations with bounded schemas, fixed query `providers=ECB` for Frankfurter, and 30-second Exa/10-second Frankfurter request timeouts in `src/modules/capability-supply/curated-provider-publications.ts`.
  - Auth: Exa uses a server-held `EXA_API_KEY` credential reference; Frankfurter is keyless. The hosted release workflow seeds/probes Frankfurter and checks Exa operation discovery in `.github/workflows/kernel-release-gate.yml`.
  - Rate limits: Provider limits are external; AE applies the publication request timeouts and credential/readiness gates.
- Observed Agentic Market x402 listings - `Provenance-only`, not an active provider integration. `src/modules/capability-supply/curated-cluster-c-publications.ts` explicitly says AE does not execute or pay these entries and marks them unavailable for discovery: Exa, timezone conversion, Wolfram|Alpha, CoinMarketCap, FlightAware, Bizintel forex, and Tavily x402 listings.
  - Integration method: Static observed endpoint contracts and listing evidence; no AE credential is attached (`credentialRef: 'none'`).
  - Auth: No credential or payment authorization is admitted for this cluster.
  - Rate limits: No live-call guarantee; the entries remain catalog evidence only.
- Generic external HTTP/MCP operation targets - `Runtime-capable` after admission, target validation, authorization, and credential gates. `src/modules/capability-supply/route-transport-runtime.ts` supports HTTP, streamable MCP JSON-RPC initialization plus `tools/call`, and x402 transports; the application also exposes its own MCP host at `src/routes/mcp.ts` and `src/lib/server/mcp-api.ts`.
  - Integration method: Bounded `fetch` with public-target/DNS protections; MCP calls use `initialize`, `notifications/initialized`, and `tools/call` over the registered endpoint.
  - Auth: Binding credentials are resolved server-side from `env:NAME`; MCP additionally carries the operation call headers and protocol version from the admitted binding.
  - Rate limits: Per-operation request timeouts, bounded response bytes, and route-level HTTP rate limits are enforced in `src/modules/capability-supply/route-transport-runtime.ts`, `convex/customerRequestRouteTransportWorker.ts`, and `src/routes/mcp.ts`.
- Owner-supplied business websites - `Implemented` bounded HTTPS import for owner-reviewed storefront drafts. `src/modules/storefront/internal/import-draft.ts` follows limited redirects, requires HTML, caps response bytes, and uses guarded network dispatch; the route entrypoints are `src/routes/api.storefront.import-draft.ts` and `src/routes/api.storefront.enrich.ts`.
  - Integration method: Direct `fetch`/`undici` request to the submitted `http`/`https` URL, with HTML metadata extraction and source attribution.
  - Auth: No provider credential; owner authentication is enforced by the route unless the guarded local E2E bypass is active.
  - Rate limits: Redirect count, response byte cap, timeout, and public-target/SSRF protections are enforced in the storefront and network-guard modules.
- Google Maps Embed API - `Implemented` optional browser embed for generative location and office-map artifacts in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Integration method: An iframe URL is built as `https://www.google.com/maps/embed/v1/place` with the place query and API key.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY` from `.env.example`, exposed to the browser only when configured; the component renders nothing when absent.
  - Rate limits: Google quota/rate limits are external; the iframe is lazy-loaded and sandboxed by the component.

## Data Storage

**Databases:**
- Convex hosted database - `Implemented` system of record for businesses, catalogs, admitted capability supply, customer requests, answer threads, notification outbox, money state, observability, and execution evidence. `convex/schema.ts` composes the module table bundles, and `src/lib/server/convex-source.ts` uses `ConvexHttpClient` for authenticated/public queries, mutations, and actions.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` is required by `src/lib/server/convex-source.ts`; Convex auth tokens come from Clerk's `convex` token template.
  - Client: `convex` 1.42.0 plus `@convex-dev/aggregate`, `@convex-dev/rate-limiter`, `@convex-dev/workflow`, and `@convex-dev/workpool`; components are registered in `convex/convex.config.ts`.
  - Migrations: No separate SQL/Prisma migration directory is configured; schema ownership is the Convex module composition in `convex/schema.ts` and module `internal/*schema.ts` files.

**File Storage:**
- No active external object-storage client - Current runtime source has no S3/R2 SDK or file-upload path; browser drafts/session pointers use Web Storage in `src/components/ae/`.
  - SDK/Client: None in `package.json` for R2/S3.
  - Auth: `R2_*` names appear in local environment material, but no current `src/` or `convex/` consumer is mapped as an active integration; do not treat the names as proof of runtime use.
  - Buckets: None declared in current source/config.

**Caching:**
- In-process cache - OpenRouter model discovery keeps a two-minute memory cache in `src/modules/answer/internal/openrouter-models.ts`; there is no Redis client in the current dependency manifest.
  - Connection: Process memory only.
  - Client: Native `Map`/module state in `src/modules/answer/internal/openrouter-models.ts`; PostHog/Sentry also keep process/client instances in `src/lib/observability/`.
- Browser Web Storage - Recent thread IDs, drafts, and private-record access pointers use `sessionStorage`/`localStorage` in `src/components/ae/` and `src/lib/observability/funnel-attribution.ts`; it is optional continuity state, not the durable database.

## Authentication & Identity

**Auth Provider:**
- Clerk - `Implemented` identity provider for TanStack Start request middleware, sign-in/sign-up UI, owner sessions, server auth, Convex JWT issuance, and Clerk API-key lifecycle. Integration points are `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/require-clerk-server-session.ts`, and `src/lib/server/customer-request-agent-auth.ts`.
  - Implementation: `@clerk/tanstack-react-start` server/client APIs; server owner delivery lookup also calls `GET https://api.clerk.com/v1/users/{userId}` in `src/lib/server/notification-provider.ts`.
  - Token storage: Clerk owns browser sessions; `src/lib/server/convex-source.ts` requests a Clerk token using the `convex` template and passes it to `ConvexHttpClient`. Agent key/principal records are persisted in Convex by `src/modules/customer-request/agent-access.functions.ts` and `convex/customerRequestPrincipals.ts`.
  - Session management: Clerk middleware is active except for the fail-closed, non-production local-E2E bypass controlled by `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`; Convex validates the Clerk issuer in `convex/auth.config.ts`.

**OAuth Integrations:**
- Agent customer-request OAuth - `Implemented` custom OAuth 2 authorization-code and device-code flow backed by Convex state plus Clerk API keys; it is not Google/GitHub social login. Handlers are `src/lib/server/customer-request-agent-oauth-api.ts` and routes are `src/routes/oauth.register.ts`, `src/routes/oauth.authorize.ts`, `src/routes/oauth.device_authorization.ts`, and `src/routes/oauth.token.ts`.
  - Credentials: Public clients register without a client secret; approved grants issue a short-lived Clerk API key through `clerkClient().apiKeys` and bind its principal/scopes in Convex.
  - Scopes: Customer-request authority scopes are defined in `src/modules/customer-request/agent-contract.ts`; metadata is advertised by `src/routes/[.]well-known/oauth-authorization-server.ts` and `src/routes/[.]well-known/oauth-protected-resource.ts`.
- Web Bot Auth key directory - `Implemented` public-key publication/configuration for AE-owned HTTP Message Signature agents at `GET /.well-known/http-message-signatures-directory`; source is `src/routes/[.]well-known/http-message-signatures-directory.ts` and the public JWK input is `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON` in `.env.example`.
  - Credentials: Only public JWK material is served; the route rejects private `d` key material.
  - Scopes: Admission principals and allowlists are configured with `AE_WBA_SIGNATURE_AGENT_ALLOWLIST` and `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS` in `.env.example`.

## Monitoring & Observability

**Error Tracking:**
- Sentry - `Implemented` optional browser and Node error tracking with route-safe sanitization. Client/server initialization is in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`; request middleware wires server capture in `src/start.ts`.
  - DSN: `VITE_SENTRY_DSN` for browser and `SENTRY_DSN`/fallback names for server, documented in `.env.example` and read by `src/lib/observability/config.ts`.
  - Release tracking: `SENTRY_RELEASE`, Vercel commit SHA, or GitHub SHA; source-map upload is conditional on `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in `vite.config.ts`.

**Analytics:**
- PostHog - `Implemented` optional pseudonymous client/server funnel and product-event capture. Client initialization is `src/lib/observability/posthog.client.ts` and server capture/flush is `src/lib/observability/posthog.server.ts`.
  - Token: `VITE_POSTHOG_KEY`/`POSTHOG_KEY`; host defaults to `https://us.i.posthog.com` and can be overridden with `VITE_POSTHOG_HOST`/`POSTHOG_HOST`, as configured in `src/lib/observability/config.ts`.
  - Events tracked: Funnel/product events, pageviews, and owner-activation readbacks; private-route safety blocks sensitive-record telemetry in `src/lib/observability/private-route-safety.ts`.

**Logs:**
- No separate log aggregation service is configured in the current tree. Server errors are sent to Sentry when a DSN is configured, analytics events to PostHog when a key is configured, and local/provider diagnostics otherwise use process stdout/stderr (for example, notification configuration errors in `src/lib/server/notification-provider.ts`).
  - Integration: Vercel/Node runtime logs and GitHub Actions output are the operational fallback; `.github/workflows/kernel-release-gate.yml` uploads sanitized release evidence artifacts rather than shipping a log stream.

## CI/CD & Deployment

**Hosting:**
- Vercel - `Configured` application hosting for the Nitro output. `vite.config.ts` selects the Vercel preset and `nodejs22.x` functions; `.vercel/project.json` identifies project `agentic-economy` and records its deployment metadata.
  - Deployment: `tools/release/deploy-customer-request-git-source.ts` calls `https://api.vercel.com/v13/deployments` and polls the deployment read endpoint; hosted smoke tooling uses `https://agentic-economy-phi.vercel.app` as the current production evidence URL.
  - Environment vars: Vercel/GitHub deployment secrets include `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, deployment protection bypass, and application/provider secrets referenced by `.github/workflows/kernel-release-gate.yml`.
- Convex Cloud - `Configured` separate backend deployment. The release workflow runs `npx convex deploy`, `npx convex env get`, and `npx convex run` against the selected deployment in `.github/workflows/kernel-release-gate.yml`.
  - Deployment: Convex functions/schema are deployed independently of the Vercel web bundle; `convex/auth.config.ts` and `convex/convex.config.ts` define the hosted backend auth/env contract.
  - Environment vars: Convex deployment secrets include Clerk issuer, Convex service token, route-call signing, OpenRouter, site URL, and provider credential names as declared in `convex/convex.config.ts` and workflow secrets.

**CI Pipeline:**
- GitHub Actions - `.github/workflows/kernel-release-gate.yml` runs Node 22/npm 11.5.1 source gates, Convex codegen/deploy, seeded provider readiness, and hosted release readbacks; `.github/workflows/react-doctor.yml` runs advisory React Doctor checks.
  - Workflows: `kernel-release-gate.yml` and `react-doctor.yml` are the current workflow files under `.github/workflows/`.
  - Secrets: GitHub environment/repository secrets are referenced by name in the workflow; values are not part of this map.

## Environment Configuration

**Development:**
- Required env vars: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `CONVEX_URL`/`VITE_CONVEX_URL`, and any provider-specific credential needed by the chosen flow; names and comments are in `.env.example`.
- Secrets location: Local values are kept in `.env.local`; hosted local/preview values are supplied through Convex/Vercel environment configuration. No secret values are reproduced here.
- Mock/stub services: Unit tests inject fetchers/verifiers/ports; local E2E may use the guarded Clerk bypass and local registry fixtures in `src/lib/server/local-e2e-bypass.ts` and `src/modules/registry/registry.functions.ts`. External provider publication readiness is not inferred from a fixture alone.

**Staging:**
- Environment-specific differences: No separate staging deployment manifest is present in the current tree. `.env.example` labels Autumn as sandbox and documents provider test/smoke variables, but Autumn remains `Declared-only`; test-mode provider credentials must not be read as production readiness.
- Data: Convex deployment selection and Vercel environment selection are external to source; release workflows explicitly distinguish source proof from hosted production proof in `.github/workflows/kernel-release-gate.yml`.

**Production:**
- Secrets management: Vercel/GitHub Actions/Convex deployment environments provide the secrets named in `.env.example`, `convex/convex.config.ts`, and `.github/workflows/kernel-release-gate.yml`; provider credentials are resolved server-side and never sent to the browser.
- Failover/redundancy: No multi-region database or provider failover service is configured in the current tree. Request timeouts, bounded responses, idempotency, unknown/reconciliation states, and provider readiness/refusal states are the observed resilience mechanisms in `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/action-invocation/`, and `src/lib/server/notification-provider.ts`.

## Webhooks & Callbacks

**Incoming:**
- Resend - `POST /api/notification/resend-webhook` in `src/routes/api.notification.resend-webhook.ts`.
  - Verification: Bounded raw body plus `svix-id`, `svix-timestamp`, and `svix-signature` HMAC verification using `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`.
  - Events: Payload type/event and `email_id`/`id` are normalized into provider event, logical object, payload digest, and outbox readback fields by `src/lib/server/notification-provider.ts`.
- Stripe - `POST /api/stripe/webhook` in `src/routes/api.stripe.webhook.ts`.
  - Verification: Requires `stripe-signature` and delegates verification/applier behavior to injected ports; the default path refuses with `stripe_setup_required` rather than claiming a live provider connection in `src/modules/money/internal/stripe-webhook.ts`.
  - Events: The pure money contract currently admits `payment_intent.succeeded` for credit top-up application in `src/modules/money/internal/stripe-webhook.ts`.
- Agent OAuth consent/device callback - Browser/device clients call the custom OAuth registration, authorization, device-authorization, and token routes under `src/routes/oauth.*.ts`; grant state and resulting principal/key bindings are persisted through Convex source functions in `src/lib/server/customer-request-agent-oauth-api.ts`.
  - Verification: CSRF, owner authentication, bounded form/JSON bodies, scope validation, and rate limiting are enforced by the OAuth handler and route files.
  - Events: Authorization-code approval, device-code polling, denial, and access-key issuance transitions are represented in `src/modules/customer-request/oauth-state.ts`.

**Outgoing:**
- Resend/Novu/Clerk - Inquiry dispatch triggers the notification provider calls and Clerk owner-email lookup described above; routes are `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.novu-dispatch.ts`.
  - Endpoint: Resend `/emails`, Novu `/v1/events/trigger` plus `/v1/messages`, and Clerk `/v1/users/{userId}`.
  - Retry logic: Idempotency keys, bounded request timeouts, outbox dispatch-attempt/readback rows, and redacted provider failure states are implemented in `src/lib/server/notification-provider.ts` and `src/modules/notification-outbox/`.
- OpenRouter - Answer, interpretation, follow-up, and storefront enrichment requests are triggered by the relevant user/owner flow through `src/modules/model-gateway/public.ts` and the AI modules.
  - Endpoint: Provider SDK transport for model calls plus direct `/api/v1/models` discovery in `src/modules/answer/internal/openrouter-models.ts`.
  - Retry logic: AI SDK/provider calls carry abort/timeout and per-flow retry limits; enrichment's explicit retry policy is in `src/modules/storefront/internal/business-enrichment.ts`.
- Admitted capability providers - Authorized customer-request execution sends HTTP, MCP JSON-RPC, or x402 requests to the registered endpoint through `convex/customerRequestRouteTransportWorker.ts`.
  - Endpoint: Per-publication `servers` URL/path or the admitted binding endpoint; provider calls are target-validated and bounded by `src/modules/network-guard/` and `src/modules/capability-supply/route-transport-runtime.ts`.
  - Retry logic: A 402 x402 call may issue one signed follow-up; uncertain network outcomes are recorded as unknown/reconciliation-required rather than blindly retried, and HTTP/MCP timeouts are surfaced by the runtime observation contract.
- Owner website import and Google Maps - Owner-triggered storefront import calls the submitted public site from `src/modules/storefront/internal/import-draft.ts`; map artifacts cause the browser to load the Google Maps Embed URL from `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Endpoint: Submitted HTTPS website URL or `https://www.google.com/maps/embed/v1/place`.
  - Retry logic: Website redirect/byte/time limits and map lazy loading are bounded; no provider-specific retry loop is implemented.

---

*Integration audit: 2026-08-08*
*Update when adding/removing external services*
